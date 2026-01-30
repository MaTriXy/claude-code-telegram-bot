import { EventEmitter } from 'events';

/**
 * Forum topic information from Telegram API
 */
export interface ForumTopic {
  /** Unique identifier for the forum topic */
  message_thread_id: number;
  /** Name of the forum topic */
  name: string;
  /** Color of the topic icon (RGB) */
  icon_color: number;
  /** Custom emoji ID for the topic icon (optional) */
  icon_custom_emoji_id?: string;
}

/**
 * Result of creating a forum topic
 */
export interface CreateTopicResult {
  ok: true;
  result: ForumTopic;
}

/**
 * Result of listing forum topics - using getChat result which includes topics
 */
export interface ChatInfo {
  id: number;
  type: string;
  is_forum?: boolean;
  active_usernames?: string[];
}

/**
 * Telegram API error response
 */
export interface TelegramApiError {
  ok: false;
  error_code: number;
  description: string;
  parameters?: {
    retry_after?: number;
    migrate_to_chat_id?: number;
  };
}

/**
 * Events emitted by TopicHandler
 */
export interface TopicHandlerEvents {
  topic_created: (chatId: number | string, topic: ForumTopic) => void;
  topic_deleted: (chatId: number | string, threadId: number) => void;
  error: (error: Error, chatId: number | string) => void;
  rate_limited: (retryAfter: number, chatId: number | string) => void;
}

/**
 * Options for creating a forum topic
 */
export interface CreateTopicOptions {
  /** Name of the topic */
  name: string;
  /** Icon color (integer RGB value). Defaults to a random color from preset list */
  icon_color?: number;
  /** Custom emoji ID for the icon (optional, premium feature) */
  icon_custom_emoji_id?: string;
}

/**
 * Configuration for TopicHandler
 */
export interface TopicHandlerConfig {
  /** Maximum number of topics to cache per chat */
  maxCachedTopicsPerChat?: number;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

/**
 * Default configuration
 */
export const DEFAULT_TOPIC_HANDLER_CONFIG: TopicHandlerConfig = {
  maxCachedTopicsPerChat: 100,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
};

/**
 * Preset icon colors available for forum topics
 * These are the only colors accepted by Telegram API
 */
export const TOPIC_ICON_COLORS = [
  0x6FB9F0, // Light Blue
  0xFFD67E, // Light Yellow
  0xCB86DB, // Light Purple
  0x8EEE98, // Light Green
  0xFF93B2, // Light Pink
  0xFB6F5F, // Light Red
] as const;

/**
 * Cached topic data
 */
interface CachedTopics {
  topics: ForumTopic[];
  fetchedAt: number;
}

/**
 * TopicHandler manages forum topics via the Telegram API.
 *
 * It provides:
 * - Creating new topics (createForumTopic)
 * - Listing active topics for a chat
 * - Deleting topics (closeForumTopic)
 * - Checking if forum mode is enabled for a chat
 *
 * Uses direct HTTP API calls since Telegraf may not support all forum topic methods.
 */
export class TopicHandler extends EventEmitter {
  private botToken: string;
  private apiBaseUrl: string;
  private config: TopicHandlerConfig;
  private topicCache: Map<string, CachedTopics> = new Map();
  private forumStatusCache: Map<string, { isForum: boolean; checkedAt: number }> = new Map();
  private isShuttingDown = false;

  constructor(botToken: string, config?: Partial<TopicHandlerConfig>) {
    super();
    this.botToken = botToken;
    this.apiBaseUrl = `https://api.telegram.org/bot${botToken}`;
    this.config = { ...DEFAULT_TOPIC_HANDLER_CONFIG, ...config };
  }

  /**
   * Generate a cache key for a chat
   */
  private getChatKey(chatId: number | string): string {
    return `${chatId}`;
  }

  /**
   * Get a random icon color from the preset list
   */
  private getRandomIconColor(): number {
    const index = Math.floor(Math.random() * TOPIC_ICON_COLORS.length);
    return TOPIC_ICON_COLORS[index];
  }

  /**
   * Make a Telegram API request
   */
  private async apiRequest<T extends object>(
    method: string,
    params: Record<string, unknown>,
    chatId: number | string
  ): Promise<T> {
    if (this.isShuttingDown) {
      throw new Error('TopicHandler is shutting down');
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/${method}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      const result = await response.json() as { ok: boolean; result?: unknown; error_code?: number; description?: string; parameters?: { retry_after?: number } };

      if (!result.ok) {
        const error = result as TelegramApiError;

        // Handle rate limiting
        if (error.error_code === 429 && error.parameters?.retry_after) {
          const retryAfter = error.parameters.retry_after;
          this.emit('rate_limited', retryAfter, chatId);
        }

        const apiError = new Error(`Telegram API error: ${error.description} (${error.error_code})`);
        this.emit('error', apiError, chatId);
        throw apiError;
      }

      return result as T;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Telegram API error:')) {
        throw error;
      }

      const networkError = error instanceof Error
        ? new Error(`Network error: ${error.message}`)
        : new Error('Unknown network error');

      this.emit('error', networkError, chatId);
      throw networkError;
    }
  }

  /**
   * Check if a chat has forum topics enabled
   *
   * @param chatId - The chat ID to check
   * @returns true if the chat is a forum (has topics enabled)
   */
  async checkForumEnabled(chatId: number | string): Promise<boolean> {
    const cacheKey = this.getChatKey(chatId);

    // Check cache first
    const cached = this.forumStatusCache.get(cacheKey);
    if (cached && Date.now() - cached.checkedAt < this.config.cacheTtlMs!) {
      return cached.isForum;
    }

    try {
      const result = await this.apiRequest<{ ok: true; result: ChatInfo }>(
        'getChat',
        { chat_id: chatId },
        chatId
      );

      const isForumEnabled = result.result.is_forum === true;

      // Cache the result
      this.forumStatusCache.set(cacheKey, {
        isForum: isForumEnabled,
        checkedAt: Date.now(),
      });

      return isForumEnabled;
    } catch {
      // If we can't check, assume not a forum
      return false;
    }
  }

  /**
   * Create a new forum topic in a chat
   *
   * @param chatId - The chat ID (must be a supergroup with forum topics enabled)
   * @param options - Topic creation options
   * @returns The created topic
   */
  async createTopic(chatId: number | string, options: CreateTopicOptions): Promise<ForumTopic> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      name: options.name,
      icon_color: options.icon_color ?? this.getRandomIconColor(),
    };

    if (options.icon_custom_emoji_id) {
      params.icon_custom_emoji_id = options.icon_custom_emoji_id;
    }

    const result = await this.apiRequest<CreateTopicResult>(
      'createForumTopic',
      params,
      chatId
    );

    const topic = result.result;

    // Update cache
    this.addTopicToCache(chatId, topic);

    this.emit('topic_created', chatId, topic);

    return topic;
  }

  /**
   * List active topics for a chat
   *
   * Note: The Telegram Bot API doesn't have a direct method to list all forum topics.
   * This method returns cached topics that were created through this handler.
   * For a complete list, you would need to use Telegram's MTProto API.
   *
   * @param chatId - The chat ID
   * @returns Array of cached forum topics
   */
  listTopics(chatId: number | string): ForumTopic[] {
    const cacheKey = this.getChatKey(chatId);
    const cached = this.topicCache.get(cacheKey);

    if (!cached) {
      return [];
    }

    // Check if cache is still valid
    if (Date.now() - cached.fetchedAt > this.config.cacheTtlMs!) {
      this.topicCache.delete(cacheKey);
      return [];
    }

    return [...cached.topics];
  }

  /**
   * Delete (close) a forum topic
   *
   * @param chatId - The chat ID
   * @param messageThreadId - The topic's thread ID
   */
  async deleteTopic(chatId: number | string, messageThreadId: number): Promise<void> {
    await this.apiRequest<{ ok: true; result: boolean }>(
      'closeForumTopic',
      {
        chat_id: chatId,
        message_thread_id: messageThreadId,
      },
      chatId
    );

    // Remove from cache
    this.removeTopicFromCache(chatId, messageThreadId);

    this.emit('topic_deleted', chatId, messageThreadId);
  }

  /**
   * Reopen a closed forum topic
   *
   * @param chatId - The chat ID
   * @param messageThreadId - The topic's thread ID
   */
  async reopenTopic(chatId: number | string, messageThreadId: number): Promise<void> {
    await this.apiRequest<{ ok: true; result: boolean }>(
      'reopenForumTopic',
      {
        chat_id: chatId,
        message_thread_id: messageThreadId,
      },
      chatId
    );
  }

  /**
   * Edit a forum topic's name and/or icon
   *
   * @param chatId - The chat ID
   * @param messageThreadId - The topic's thread ID
   * @param options - Partial options to update
   */
  async editTopic(
    chatId: number | string,
    messageThreadId: number,
    options: Partial<Pick<CreateTopicOptions, 'name' | 'icon_custom_emoji_id'>>
  ): Promise<void> {
    const params: Record<string, unknown> = {
      chat_id: chatId,
      message_thread_id: messageThreadId,
    };

    if (options.name !== undefined) {
      params.name = options.name;
    }

    if (options.icon_custom_emoji_id !== undefined) {
      params.icon_custom_emoji_id = options.icon_custom_emoji_id;
    }

    await this.apiRequest<{ ok: true; result: boolean }>(
      'editForumTopic',
      params,
      chatId
    );

    // Update cache if name changed
    if (options.name !== undefined) {
      const cacheKey = this.getChatKey(chatId);
      const cached = this.topicCache.get(cacheKey);
      if (cached) {
        const topic = cached.topics.find(t => t.message_thread_id === messageThreadId);
        if (topic) {
          topic.name = options.name;
        }
      }
    }
  }

  /**
   * Get the General topic thread ID
   * The General topic is always thread ID 1 in forums
   */
  getGeneralTopicId(): number {
    return 1;
  }

  /**
   * Add a topic to the cache
   */
  private addTopicToCache(chatId: number | string, topic: ForumTopic): void {
    const cacheKey = this.getChatKey(chatId);
    let cached = this.topicCache.get(cacheKey);

    if (!cached) {
      cached = {
        topics: [],
        fetchedAt: Date.now(),
      };
      this.topicCache.set(cacheKey, cached);
    }

    // Check if topic already exists
    const existingIndex = cached.topics.findIndex(
      t => t.message_thread_id === topic.message_thread_id
    );

    if (existingIndex >= 0) {
      // Update existing
      cached.topics[existingIndex] = topic;
    } else {
      // Add new, respecting max limit
      cached.topics.push(topic);
      if (cached.topics.length > this.config.maxCachedTopicsPerChat!) {
        cached.topics.shift();
      }
    }

    cached.fetchedAt = Date.now();
  }

  /**
   * Remove a topic from the cache
   */
  private removeTopicFromCache(chatId: number | string, messageThreadId: number): void {
    const cacheKey = this.getChatKey(chatId);
    const cached = this.topicCache.get(cacheKey);

    if (cached) {
      cached.topics = cached.topics.filter(t => t.message_thread_id !== messageThreadId);
    }
  }

  /**
   * Clear the topic cache for a chat
   */
  clearCache(chatId: number | string): void {
    const cacheKey = this.getChatKey(chatId);
    this.topicCache.delete(cacheKey);
    this.forumStatusCache.delete(cacheKey);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.topicCache.clear();
    this.forumStatusCache.clear();
  }

  /**
   * Get current configuration
   */
  getConfig(): TopicHandlerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<TopicHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gracefully shutdown the handler
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.clearAllCaches();
    this.removeAllListeners();
  }
}
