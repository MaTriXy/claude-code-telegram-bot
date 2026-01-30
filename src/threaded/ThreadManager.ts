import { EventEmitter } from 'events';
import type { ThreadedModeConfig, MessageThreadContext } from '../types/index.js';
import { TopicHandler, type ForumTopic, type CreateTopicOptions } from './TopicHandler.js';

/**
 * Events emitted by ThreadManager
 */
export interface ThreadManagerEvents {
  thread_set: (chatId: number | string, threadId: number, userId?: number) => void;
  thread_cleared: (chatId: number | string, userId?: number) => void;
  thread_changed: (chatId: number | string, oldThreadId: number | undefined, newThreadId: number, userId?: number) => void;
  topic_created: (chatId: number | string, topic: ForumTopic) => void;
  session_mapped: (chatId: number | string, threadId: number, sessionId: string) => void;
  session_unmapped: (chatId: number | string, threadId: number, sessionId: string) => void;
  error: (error: Error, chatId: number | string) => void;
}

/**
 * Per-user thread preference within a chat
 */
export interface UserThreadPreference {
  threadId: number;
  setAt: number;
}

/**
 * Thread state for a chat
 */
export interface ChatThreadState {
  /** Default thread ID for this chat */
  defaultThreadId?: number;
  /** Per-user thread preferences */
  userPreferences: Map<number, UserThreadPreference>;
  /** Whether forum mode is enabled for this chat */
  forumEnabled: boolean;
  /** Last activity timestamp */
  lastActivity: number;
}

/**
 * Configuration for ThreadManager
 */
export interface ThreadManagerConfig extends ThreadedModeConfig {
  /** Timeout for inactive threads (ms). Defaults to 1 hour */
  inactivityTimeoutMs?: number;
}

/**
 * Default configuration
 */
export const DEFAULT_THREAD_MANAGER_CONFIG: ThreadManagerConfig = {
  enabled: true,
  autoCreateTopics: true,
  topicNamePrefix: 'Chat',
  inactivityTimeoutMs: 60 * 60 * 1000, // 1 hour
};

/**
 * ThreadManager manages message_thread_id for conversations in Telegram forum topics.
 *
 * It supports:
 * - Mapping chat IDs to active thread IDs
 * - Per-user thread preferences within a chat
 * - Creating and listing forum topics via TopicHandler
 * - Event emission for thread changes
 * - Automatic cleanup of inactive threads
 * - Session-to-thread mapping for Claude sessions
 */
export class ThreadManager extends EventEmitter {
  private config: ThreadManagerConfig;
  private chatThreads: Map<string, ChatThreadState> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private topicHandler: TopicHandler | null = null;
  private sessionThreadMap: Map<string, { chatId: number | string; threadId: number }> = new Map();
  private threadSessionMap: Map<string, string> = new Map(); // key = `chat:{chatId}:thread:{threadId}` -> sessionId

  constructor(config?: Partial<ThreadManagerConfig>, botToken?: string) {
    super();
    this.config = { ...DEFAULT_THREAD_MANAGER_CONFIG, ...config };

    // Initialize TopicHandler if bot token is provided
    if (botToken) {
      this.topicHandler = new TopicHandler(botToken);
      this.setupTopicHandlerEvents();
    }

    // Start cleanup interval if inactivity timeout is set
    if (this.config.inactivityTimeoutMs && this.config.inactivityTimeoutMs > 0) {
      this.startCleanupInterval();
    }
  }

  /**
   * Set up event forwarding from TopicHandler
   */
  private setupTopicHandlerEvents(): void {
    if (!this.topicHandler) return;

    this.topicHandler.on('topic_created', (chatId: number | string, topic: ForumTopic) => {
      this.emit('topic_created', chatId, topic);
    });

    this.topicHandler.on('error', (error: Error, chatId: number | string) => {
      this.emit('error', error, chatId);
    });
  }

  /**
   * Initialize or update the TopicHandler with a bot token
   */
  setTopicHandler(botToken: string): void {
    if (this.topicHandler) {
      this.topicHandler.shutdown();
    }
    this.topicHandler = new TopicHandler(botToken);
    this.setupTopicHandlerEvents();
  }

  /**
   * Get the TopicHandler instance
   */
  getTopicHandler(): TopicHandler | null {
    return this.topicHandler;
  }

  /**
   * Generate a unique key for a chat
   */
  private getChatKey(chatId: number | string): string {
    return `${chatId}`;
  }

  /**
   * Get or create thread state for a chat
   */
  private getOrCreateChatState(chatId: number | string): ChatThreadState {
    const key = this.getChatKey(chatId);
    let state = this.chatThreads.get(key);

    if (!state) {
      state = {
        userPreferences: new Map(),
        forumEnabled: false,
        lastActivity: Date.now(),
      };
      this.chatThreads.set(key, state);
    }

    return state;
  }

  /**
   * Set the active thread for a chat
   *
   * @param chatId - The chat ID
   * @param threadId - The message_thread_id to set
   * @param userId - Optional user ID for per-user preference
   */
  setThread(chatId: number | string, threadId: number, userId?: number): void {
    if (this.isShuttingDown) {
      const error = new Error('ThreadManager is shutting down');
      this.emit('error', error, chatId);
      throw error;
    }

    const state = this.getOrCreateChatState(chatId);
    state.lastActivity = Date.now();
    state.forumEnabled = true;

    // Track old thread ID for thread_changed event
    let oldThreadId: number | undefined;

    if (userId !== undefined) {
      // Get old user preference
      const oldPref = state.userPreferences.get(userId);
      oldThreadId = oldPref?.threadId;

      // Set per-user preference
      state.userPreferences.set(userId, {
        threadId,
        setAt: Date.now(),
      });
    } else {
      // Get old default
      oldThreadId = state.defaultThreadId;

      // Set default thread for chat
      state.defaultThreadId = threadId;
    }

    this.emit('thread_set', chatId, threadId, userId);

    // Emit thread_changed if the thread actually changed
    if (oldThreadId !== threadId) {
      this.emit('thread_changed', chatId, oldThreadId, threadId, userId);
    }
  }

  /**
   * Get the active thread ID for a chat
   *
   * @param chatId - The chat ID
   * @param userId - Optional user ID to check user-specific preference first
   * @returns The thread ID or undefined if no thread is set
   */
  getThreadId(chatId: number | string, userId?: number): number | undefined {
    const key = this.getChatKey(chatId);
    const state = this.chatThreads.get(key);

    if (!state) {
      return this.config.defaultThreadId;
    }

    // Update last activity
    state.lastActivity = Date.now();

    // Check user-specific preference first
    if (userId !== undefined) {
      const userPref = state.userPreferences.get(userId);
      if (userPref) {
        return userPref.threadId;
      }
    }

    // Fall back to chat default, then config default
    return state.defaultThreadId ?? this.config.defaultThreadId;
  }

  /**
   * Clear the active thread for a chat
   *
   * @param chatId - The chat ID
   * @param userId - Optional user ID to clear only user-specific preference
   */
  clearThread(chatId: number | string, userId?: number): void {
    const key = this.getChatKey(chatId);
    const state = this.chatThreads.get(key);

    if (!state) {
      return;
    }

    if (userId !== undefined) {
      // Clear only user-specific preference
      state.userPreferences.delete(userId);
    } else {
      // Clear chat default
      state.defaultThreadId = undefined;
    }

    this.emit('thread_cleared', chatId, userId);
  }

  /**
   * Check if a chat has an active thread
   *
   * @param chatId - The chat ID
   * @param userId - Optional user ID to check user-specific preference
   * @returns true if an active thread is set
   */
  hasActiveThread(chatId: number | string, userId?: number): boolean {
    return this.getThreadId(chatId, userId) !== undefined;
  }

  /**
   * Set whether forum mode is enabled for a chat
   *
   * @param chatId - The chat ID
   * @param enabled - Whether forum mode is enabled
   */
  setForumEnabled(chatId: number | string, enabled: boolean): void {
    const state = this.getOrCreateChatState(chatId);
    state.forumEnabled = enabled;
    state.lastActivity = Date.now();
  }

  /**
   * Check if forum mode is enabled for a chat
   *
   * @param chatId - The chat ID
   * @returns true if forum mode is enabled
   */
  isForumEnabled(chatId: number | string): boolean {
    const key = this.getChatKey(chatId);
    const state = this.chatThreads.get(key);
    return state?.forumEnabled ?? false;
  }

  /**
   * Get the thread context for a message
   *
   * @param chatId - The chat ID
   * @param userId - Optional user ID
   * @returns MessageThreadContext or null if no thread is active
   */
  getThreadContext(chatId: number | string, userId?: number): MessageThreadContext | null {
    const threadId = this.getThreadId(chatId, userId);

    if (threadId === undefined) {
      return null;
    }

    return {
      message_thread_id: threadId,
      is_topic_message: true,
    };
  }

  /**
   * Get all thread IDs for a chat (including user-specific ones)
   *
   * @param chatId - The chat ID
   * @returns Array of unique thread IDs
   */
  getAllThreadIds(chatId: number | string): number[] {
    const key = this.getChatKey(chatId);
    const state = this.chatThreads.get(key);

    if (!state) {
      return this.config.defaultThreadId ? [this.config.defaultThreadId] : [];
    }

    const threadIds = new Set<number>();

    if (state.defaultThreadId !== undefined) {
      threadIds.add(state.defaultThreadId);
    }

    for (const pref of state.userPreferences.values()) {
      threadIds.add(pref.threadId);
    }

    return Array.from(threadIds);
  }

  /**
   * Get the number of active chats with threads
   */
  getActiveChatCount(): number {
    return this.chatThreads.size;
  }

  /**
   * Get all chat IDs with active threads
   */
  getActiveChatIds(): (number | string)[] {
    const chatIds: (number | string)[] = [];
    for (const key of this.chatThreads.keys()) {
      // Try to parse as number, otherwise keep as string
      const num = parseInt(key, 10);
      chatIds.push(isNaN(num) ? key : num);
    }
    return chatIds;
  }

  /**
   * Get current configuration
   */
  getConfig(): ThreadManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ThreadManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if threading is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Clear all thread data for a chat
   *
   * @param chatId - The chat ID
   */
  clearChat(chatId: number | string): void {
    const key = this.getChatKey(chatId);
    this.chatThreads.delete(key);
    this.emit('thread_cleared', chatId);
  }

  /**
   * Clear all thread data
   */
  clearAll(): void {
    for (const key of this.chatThreads.keys()) {
      const num = parseInt(key, 10);
      const chatId = isNaN(num) ? key : num;
      this.emit('thread_cleared', chatId);
    }
    this.chatThreads.clear();
  }

  // ============================================================================
  // Topic Management Methods (delegates to TopicHandler)
  // ============================================================================

  /**
   * Create a new forum topic in a chat
   *
   * @param chatId - The chat ID (must be a supergroup with forum topics enabled)
   * @param options - Topic creation options (name, icon_color, icon_custom_emoji_id)
   * @returns The created topic
   * @throws Error if TopicHandler is not initialized or API call fails
   */
  async createTopic(chatId: number | string, options: CreateTopicOptions): Promise<ForumTopic> {
    if (!this.topicHandler) {
      const error = new Error('TopicHandler not initialized. Provide a bot token to the constructor or call setTopicHandler().');
      this.emit('error', error, chatId);
      throw error;
    }

    if (this.isShuttingDown) {
      const error = new Error('ThreadManager is shutting down');
      this.emit('error', error, chatId);
      throw error;
    }

    // Use auto-generated name if autoCreateTopics is enabled and name not provided
    const topicName = options.name || (this.config.autoCreateTopics
      ? `${this.config.topicNamePrefix || 'Chat'} ${Date.now()}`
      : 'New Topic');

    const topic = await this.topicHandler.createTopic(chatId, {
      ...options,
      name: topicName,
    });

    // Automatically set forum enabled for this chat
    this.setForumEnabled(chatId, true);

    return topic;
  }

  /**
   * List active topics for a chat (from cache)
   *
   * Note: Returns cached topics that were created through this handler.
   * For a complete list, Telegram's MTProto API would be needed.
   *
   * @param chatId - The chat ID
   * @returns Array of cached forum topics
   */
  listTopics(chatId: number | string): ForumTopic[] {
    if (!this.topicHandler) {
      return [];
    }
    return this.topicHandler.listTopics(chatId);
  }

  /**
   * Check if forum mode is enabled for a chat via Telegram API
   *
   * @param chatId - The chat ID to check
   * @returns true if the chat has forum topics enabled
   */
  async checkForumEnabled(chatId: number | string): Promise<boolean> {
    if (!this.topicHandler) {
      return false;
    }

    const isEnabled = await this.topicHandler.checkForumEnabled(chatId);
    if (isEnabled) {
      this.setForumEnabled(chatId, true);
    }
    return isEnabled;
  }

  /**
   * Get the General topic thread ID (always 1 in forums)
   */
  getGeneralTopicId(): number {
    return this.topicHandler?.getGeneralTopicId() ?? 1;
  }

  // ============================================================================
  // Session-to-Thread Mapping (for Claude sessions)
  // ============================================================================

  /**
   * Generate a thread key for reverse lookup map (internal use)
   *
   * @param chatId - The chat ID
   * @param threadId - The thread ID
   * @returns Key in format `chat:{chatId}:thread:{threadId}`
   */
  private getThreadKey(chatId: number | string, threadId: number): string {
    return `chat:${chatId}:thread:${threadId}`;
  }

  /**
   * Generate a context key for thread lookup
   *
   * @param chatId - The chat ID
   * @param threadId - Optional thread ID (if undefined, uses 0 to represent main/general thread)
   * @returns Key in format `chat:{chatId}:thread:{threadId}`
   */
  generateThreadContextKey(chatId: number | string, threadId?: number): string {
    return `chat:${chatId}:thread:${threadId ?? 0}`;
  }

  /**
   * Map a Claude session to a specific thread
   *
   * @param sessionId - The Claude session ID
   * @param chatId - The chat ID
   * @param threadId - The thread ID to associate with this session
   */
  mapSessionToThread(sessionId: string, chatId: number | string, threadId: number): void {
    // Remove any existing mapping for this session (clean up reverse lookup)
    const existing = this.sessionThreadMap.get(sessionId);
    if (existing) {
      const oldKey = this.getThreadKey(existing.chatId, existing.threadId);
      this.threadSessionMap.delete(oldKey);
    }

    // Set forward mapping
    this.sessionThreadMap.set(sessionId, { chatId, threadId });

    // Set reverse mapping
    const threadKey = this.getThreadKey(chatId, threadId);
    this.threadSessionMap.set(threadKey, sessionId);

    // Emit session_mapped event
    this.emit('session_mapped', chatId, threadId, sessionId);
  }

  /**
   * Get the thread mapping for a Claude session
   *
   * @param sessionId - The Claude session ID
   * @returns The chat and thread ID, or undefined if not mapped
   */
  getThreadForSession(sessionId: string): { chatId: number | string; threadId: number } | undefined {
    const result = this.sessionThreadMap.get(sessionId);
    console.log(`[ThreadManager.getThreadForSession] session=${sessionId.substring(0, 8)}... -> ${result ? `thread=${result.threadId} in chat=${result.chatId}` : 'NOT FOUND'}`);
    return result;
  }

  /**
   * Get the session ID for a specific thread
   *
   * @param chatId - The chat ID
   * @param threadId - The thread ID
   * @returns The session ID, or undefined if no session is mapped to this thread
   */
  getSessionForThread(chatId: number | string, threadId: number): string | undefined {
    const threadKey = this.getThreadKey(chatId, threadId);
    const result = this.threadSessionMap.get(threadKey);
    console.log(`[ThreadManager.getSessionForThread] thread=${threadId} (key=${threadKey}) -> ${result ? `session=${result.substring(0, 8)}...` : 'NOT FOUND'}`);
    console.log(`[ThreadManager.getSessionForThread] threadSessionMap has ${this.threadSessionMap.size} entries:`);
    for (const [key, sid] of this.threadSessionMap.entries()) {
      console.log(`  - ${key} -> ${sid.substring(0, 8)}...`);
    }
    return result;
  }

  /**
   * Set a bidirectional session-to-thread mapping
   *
   * @param chatId - The chat ID
   * @param threadId - The thread ID
   * @param sessionId - The session ID to associate with this thread
   */
  setSessionForThread(chatId: number | string, threadId: number, sessionId: string): void {
    console.log(`[ThreadManager.setSessionForThread] SETTING: session=${sessionId.substring(0, 8)}... -> thread=${threadId} in chat=${chatId}`);
    console.log(`[ThreadManager.setSessionForThread] BEFORE: sessionThreadMap size=${this.sessionThreadMap.size}, threadSessionMap size=${this.threadSessionMap.size}`);

    // Log all current mappings
    console.log(`[ThreadManager.setSessionForThread] Current sessionThreadMap:`);
    for (const [sid, data] of this.sessionThreadMap.entries()) {
      console.log(`  - session ${sid.substring(0, 8)}... -> thread ${data.threadId} in chat ${data.chatId}`);
    }
    console.log(`[ThreadManager.setSessionForThread] Current threadSessionMap:`);
    for (const [key, sid] of this.threadSessionMap.entries()) {
      console.log(`  - ${key} -> session ${sid.substring(0, 8)}...`);
    }

    // Remove any existing mapping for this session (clean up old thread mapping)
    const existingThread = this.sessionThreadMap.get(sessionId);
    if (existingThread) {
      const oldKey = this.getThreadKey(existingThread.chatId, existingThread.threadId);
      console.log(`[ThreadManager.setSessionForThread] CLEANUP: Removing old thread mapping for session ${sessionId.substring(0, 8)}...: was thread=${existingThread.threadId}, key=${oldKey}`);
      this.threadSessionMap.delete(oldKey);
    }

    // Remove any existing session for this thread (clean up old session mapping)
    const threadKey = this.getThreadKey(chatId, threadId);
    const existingSession = this.threadSessionMap.get(threadKey);
    if (existingSession && existingSession !== sessionId) {
      console.log(`[ThreadManager.setSessionForThread] CLEANUP: Thread ${threadId} was mapped to session ${existingSession.substring(0, 8)}..., removing that mapping`);
      this.sessionThreadMap.delete(existingSession);
      this.emit('session_unmapped', chatId, threadId, existingSession);
    }

    // Set bidirectional mapping
    this.sessionThreadMap.set(sessionId, { chatId, threadId });
    this.threadSessionMap.set(threadKey, sessionId);

    console.log(`[ThreadManager.setSessionForThread] AFTER: sessionThreadMap size=${this.sessionThreadMap.size}, threadSessionMap size=${this.threadSessionMap.size}`);
    console.log(`[ThreadManager.setSessionForThread] SUCCESS: session=${sessionId.substring(0, 8)}... <-> thread=${threadId} (key=${threadKey})`);

    // Emit session_mapped event
    this.emit('session_mapped', chatId, threadId, sessionId);
  }

  /**
   * Clear session mapping for a specific thread
   *
   * @param chatId - The chat ID
   * @param threadId - The thread ID
   */
  clearSessionForThread(chatId: number | string, threadId: number): void {
    const threadKey = this.getThreadKey(chatId, threadId);
    const sessionId = this.threadSessionMap.get(threadKey);

    if (sessionId) {
      // Remove both forward and reverse mappings
      this.sessionThreadMap.delete(sessionId);
      this.threadSessionMap.delete(threadKey);

      // Emit session_unmapped event
      this.emit('session_unmapped', chatId, threadId, sessionId);
    }
  }

  /**
   * Get all active sessions per thread
   *
   * @returns Map with thread keys to session info
   */
  getActiveSessionsPerThread(): Map<string, { sessionId: string; chatId: number | string; threadId: number }> {
    const result = new Map<string, { sessionId: string; chatId: number | string; threadId: number }>();

    for (const [threadKey, sessionId] of this.threadSessionMap.entries()) {
      const mapping = this.sessionThreadMap.get(sessionId);
      if (mapping) {
        result.set(threadKey, {
          sessionId,
          chatId: mapping.chatId,
          threadId: mapping.threadId,
        });
      }
    }

    return result;
  }

  /**
   * Get all threads that have associated sessions
   *
   * @returns Array of thread-session mappings with chatId, optional threadId, and sessionId
   */
  getThreadsWithSessions(): Array<{ chatId: number | string; threadId?: number; sessionId: string }> {
    const result: Array<{ chatId: number | string; threadId?: number; sessionId: string }> = [];

    for (const [sessionId, mapping] of this.sessionThreadMap.entries()) {
      result.push({
        chatId: mapping.chatId,
        threadId: mapping.threadId,
        sessionId,
      });
    }

    return result;
  }

  /**
   * Remove the thread mapping for a Claude session
   *
   * @param sessionId - The Claude session ID
   */
  unmapSession(sessionId: string): void {
    const mapping = this.sessionThreadMap.get(sessionId);
    if (mapping) {
      const threadKey = this.getThreadKey(mapping.chatId, mapping.threadId);
      this.threadSessionMap.delete(threadKey);
      this.sessionThreadMap.delete(sessionId);

      // Emit session_unmapped event
      this.emit('session_unmapped', mapping.chatId, mapping.threadId, sessionId);
    }
  }

  /**
   * Get all session-to-thread mappings
   */
  getAllSessionMappings(): Map<string, { chatId: number | string; threadId: number }> {
    return new Map(this.sessionThreadMap);
  }

  /**
   * Clear all session mappings
   */
  clearSessionMappings(): void {
    // Emit session_unmapped for all mappings before clearing
    for (const [sessionId, mapping] of this.sessionThreadMap.entries()) {
      this.emit('session_unmapped', mapping.chatId, mapping.threadId, sessionId);
    }
    this.sessionThreadMap.clear();
    this.threadSessionMap.clear();
  }

  /**
   * Start the cleanup interval for inactive threads
   */
  private startCleanupInterval(): void {
    // Run cleanup every 5 minutes
    const intervalMs = Math.min(5 * 60 * 1000, this.config.inactivityTimeoutMs! / 2);

    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveThreads();
    }, intervalMs);
  }

  /**
   * Clean up inactive threads
   */
  private cleanupInactiveThreads(): void {
    if (!this.config.inactivityTimeoutMs) {
      return;
    }

    const now = Date.now();
    const timeout = this.config.inactivityTimeoutMs;

    for (const [key, state] of this.chatThreads.entries()) {
      if (now - state.lastActivity > timeout) {
        const num = parseInt(key, 10);
        const chatId = isNaN(num) ? key : num;
        this.clearChat(chatId);
      }
    }
  }

  /**
   * Gracefully shutdown the manager
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Shutdown TopicHandler if initialized
    if (this.topicHandler) {
      await this.topicHandler.shutdown();
      this.topicHandler = null;
    }

    // Clear all state
    this.chatThreads.clear();
    this.sessionThreadMap.clear();
    this.threadSessionMap.clear();
    this.removeAllListeners();
  }
}
