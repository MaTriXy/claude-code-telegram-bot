import { EventEmitter } from 'events';
import type {
  StreamingConfig,
  StreamingMode,
  StreamChunk,
  StreamState,
  SendMessageDraftOptions,
  DraftBubbleState,
} from '../types/index.js';

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
 * Telegram API success response for sendMessageDraft
 */
export interface TelegramApiSuccess {
  ok: true;
  result: boolean;
}

/**
 * Events emitted by StreamingService
 */
export interface StreamingServiceEvents {
  error: (error: Error, chatId: number | string) => void;
  draft_updated: (state: DraftBubbleState) => void;
  draft_complete: (state: DraftBubbleState) => void;
  rate_limited: (retryAfter: number, chatId: number | string) => void;
}

/**
 * Default streaming configuration
 */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  mode: 'partial',
  blockSize: 100,
  updateIntervalMs: 500,
  enabled: true,
};

/**
 * StreamingService manages draft message lifecycle for Telegram Bot API 9.3
 * Handles sendMessageDraft API calls via direct HTTP fetch
 */
export class StreamingService extends EventEmitter {
  private config: StreamingConfig;
  private botToken: string;
  private apiBaseUrl: string;
  private draftStates: Map<string, DraftBubbleState> = new Map();
  private streamStates: Map<string, StreamState> = new Map();
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  private retryQueues: Map<string, { text: string; timestamp: number }[]> = new Map();
  private isShuttingDown = false;

  constructor(botToken: string, config?: Partial<StreamingConfig>) {
    super();
    this.botToken = botToken;
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
    this.apiBaseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Generate a unique key for chat/thread combination
   */
  private getChatKey(chatId: number | string, messageThreadId?: number): string {
    return messageThreadId ? `${chatId}:${messageThreadId}` : `${chatId}`;
  }

  /**
   * Get current streaming configuration
   */
  getConfig(): StreamingConfig {
    return { ...this.config };
  }

  /**
   * Update streaming configuration
   */
  setConfig(config: Partial<StreamingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get streaming mode
   */
  getMode(): StreamingMode {
    return this.config.mode;
  }

  /**
   * Set streaming mode
   */
  setMode(mode: StreamingMode): void {
    this.config.mode = mode;
  }

  /**
   * Check if streaming is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.config.mode !== 'off';
  }

  /**
   * Start a new draft message for a chat
   * Initializes the draft bubble state and stream state
   */
  async startDraft(
    chatId: number | string,
    messageThreadId?: number,
    initialText = ''
  ): Promise<DraftBubbleState> {
    if (this.isShuttingDown) {
      throw new Error('StreamingService is shutting down');
    }

    const chatKey = this.getChatKey(chatId, messageThreadId);

    // Cancel any existing draft for this chat
    await this.cancelDraft(chatId, messageThreadId);

    // Initialize draft state
    const draftState: DraftBubbleState = {
      isVisible: false,
      currentText: initialText,
      chatId,
      messageThreadId,
      lastUpdated: Date.now(),
      isFinalized: false,
    };

    // Initialize stream state
    const streamState: StreamState = {
      isStreaming: true,
      accumulatedText: initialText,
      lastUpdateTime: Date.now(),
      chatId,
      messageThreadId,
      chunksReceived: 0,
      totalBytesReceived: initialText.length,
    };

    this.draftStates.set(chatKey, draftState);
    this.streamStates.set(chatKey, streamState);

    // Send initial draft if we have text
    if (initialText) {
      await this.sendDraftRequest(chatId, initialText, messageThreadId);
      draftState.isVisible = true;
    }

    return { ...draftState };
  }

  /**
   * Update an existing draft with new text content
   * Handles batching based on streaming mode
   */
  async updateDraft(
    chatId: number | string,
    chunk: StreamChunk,
    messageThreadId?: number
  ): Promise<DraftBubbleState | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const chatKey = this.getChatKey(chatId, messageThreadId);
    const draftState = this.draftStates.get(chatKey);
    const streamState = this.streamStates.get(chatKey);

    if (!draftState || !streamState) {
      // Auto-start a draft if none exists
      await this.startDraft(chatId, messageThreadId);
      return this.updateDraft(chatId, chunk, messageThreadId);
    }

    if (draftState.isFinalized) {
      return { ...draftState };
    }

    // Accumulate text
    streamState.accumulatedText += chunk.text;
    streamState.chunksReceived = (streamState.chunksReceived || 0) + 1;
    streamState.totalBytesReceived = (streamState.totalBytesReceived || 0) + chunk.text.length;
    streamState.lastUpdateTime = chunk.timestamp;

    // Determine if we should send an update based on mode
    const shouldSendUpdate = this.shouldSendUpdate(streamState, chunk);

    if (shouldSendUpdate) {
      await this.sendScheduledUpdate(chatId, streamState.accumulatedText, messageThreadId);
      draftState.currentText = streamState.accumulatedText;
      draftState.lastUpdated = Date.now();
      draftState.isVisible = true;
    }

    this.emit('draft_updated', { ...draftState });
    return { ...draftState };
  }

  /**
   * Determine if an update should be sent based on streaming mode
   */
  private shouldSendUpdate(streamState: StreamState, chunk: StreamChunk): boolean {
    switch (this.config.mode) {
      case 'partial':
        // Send every delta, but respect throttling interval
        return true;

      case 'block':
        // Send when accumulated text reaches block size
        const lastSentLength = streamState.accumulatedText.length - chunk.text.length;
        const currentBlock = Math.floor(streamState.accumulatedText.length / this.config.blockSize);
        const lastBlock = Math.floor(lastSentLength / this.config.blockSize);
        return currentBlock > lastBlock;

      case 'off':
      default:
        return false;
    }
  }

  /**
   * Schedule an update with throttling to avoid rate limits
   */
  private async sendScheduledUpdate(
    chatId: number | string,
    text: string,
    messageThreadId?: number
  ): Promise<void> {
    const chatKey = this.getChatKey(chatId, messageThreadId);

    // Clear any pending update
    const pendingTimeout = this.pendingUpdates.get(chatKey);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingUpdates.delete(chatKey);
    }

    const streamState = this.streamStates.get(chatKey);
    if (!streamState) return;

    const timeSinceLastUpdate = Date.now() - streamState.lastUpdateTime;
    const minInterval = this.config.updateIntervalMs;

    if (timeSinceLastUpdate >= minInterval) {
      // Send immediately
      await this.sendDraftRequest(chatId, text, messageThreadId);
    } else {
      // Schedule for later
      const delay = minInterval - timeSinceLastUpdate;
      const timeout = setTimeout(async () => {
        this.pendingUpdates.delete(chatKey);
        const currentState = this.streamStates.get(chatKey);
        if (currentState && !this.draftStates.get(chatKey)?.isFinalized) {
          await this.sendDraftRequest(chatId, currentState.accumulatedText, messageThreadId);
        }
      }, delay);
      this.pendingUpdates.set(chatKey, timeout);
    }
  }

  /**
   * Complete and finalize a draft message
   * This removes the draft bubble - caller should then send the final message normally
   */
  async completeDraft(
    chatId: number | string,
    messageThreadId?: number
  ): Promise<DraftBubbleState | null> {
    const chatKey = this.getChatKey(chatId, messageThreadId);
    const draftState = this.draftStates.get(chatKey);
    const streamState = this.streamStates.get(chatKey);

    if (!draftState) {
      return null;
    }

    // Clear any pending updates
    const pendingTimeout = this.pendingUpdates.get(chatKey);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingUpdates.delete(chatKey);
    }

    // Send final update with accumulated text
    if (streamState && streamState.accumulatedText !== draftState.currentText) {
      await this.sendDraftRequest(chatId, streamState.accumulatedText, messageThreadId);
      draftState.currentText = streamState.accumulatedText;
    }

    // Mark as finalized
    draftState.isFinalized = true;
    draftState.lastUpdated = Date.now();

    if (streamState) {
      streamState.isStreaming = false;
    }

    // Send empty draft to clear the bubble
    try {
      await this.sendDraftRequest(chatId, '', messageThreadId);
      draftState.isVisible = false;
    } catch {
      // Ignore errors when clearing - the final message will replace it anyway
    }

    this.emit('draft_complete', { ...draftState });

    // Clean up
    this.draftStates.delete(chatKey);
    this.streamStates.delete(chatKey);
    this.retryQueues.delete(chatKey);

    return { ...draftState };
  }

  /**
   * Cancel a draft without sending a final message
   */
  async cancelDraft(
    chatId: number | string,
    messageThreadId?: number
  ): Promise<void> {
    const chatKey = this.getChatKey(chatId, messageThreadId);

    // Clear pending updates
    const pendingTimeout = this.pendingUpdates.get(chatKey);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingUpdates.delete(chatKey);
    }

    // Send empty draft to clear the bubble
    if (this.draftStates.has(chatKey)) {
      try {
        await this.sendDraftRequest(chatId, '', messageThreadId);
      } catch {
        // Ignore errors when canceling
      }
    }

    // Clean up state
    this.draftStates.delete(chatKey);
    this.streamStates.delete(chatKey);
    this.retryQueues.delete(chatKey);
  }

  /**
   * Send a sendMessageDraft request to Telegram API
   * Uses direct HTTP fetch since Telegraf doesn't support Bot API 9.3
   */
  async sendDraftRequest(
    chatId: number | string,
    text: string,
    messageThreadId?: number
  ): Promise<boolean> {
    const options: SendMessageDraftOptions = {
      chat_id: chatId,
      text,
    };

    if (messageThreadId !== undefined) {
      options.message_thread_id = messageThreadId;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/sendMessageDraft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options),
      });

      const result = await response.json() as TelegramApiSuccess | TelegramApiError;

      if (!result.ok) {
        const error = result as TelegramApiError;

        // Handle rate limiting
        if (error.error_code === 429 && error.parameters?.retry_after) {
          const retryAfter = error.parameters.retry_after;
          this.emit('rate_limited', retryAfter, chatId);

          // Queue for retry
          const chatKey = this.getChatKey(chatId, messageThreadId);
          if (!this.retryQueues.has(chatKey)) {
            this.retryQueues.set(chatKey, []);
          }
          this.retryQueues.get(chatKey)!.push({ text, timestamp: Date.now() });

          // Schedule retry
          setTimeout(() => {
            this.processRetryQueue(chatId, messageThreadId);
          }, retryAfter * 1000);

          return false;
        }

        const apiError = new Error(`Telegram API error: ${error.description} (${error.error_code})`);
        this.emit('error', apiError, chatId);
        throw apiError;
      }

      return (result as TelegramApiSuccess).result;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Telegram API error:')) {
        throw error;
      }

      // Network or other errors
      const networkError = error instanceof Error
        ? new Error(`Network error: ${error.message}`)
        : new Error('Unknown network error');

      this.emit('error', networkError, chatId);
      throw networkError;
    }
  }

  /**
   * Process retry queue after rate limit expires
   */
  private async processRetryQueue(
    chatId: number | string,
    messageThreadId?: number
  ): Promise<void> {
    const chatKey = this.getChatKey(chatId, messageThreadId);
    const queue = this.retryQueues.get(chatKey);

    if (!queue || queue.length === 0) {
      return;
    }

    // Get the most recent text (skip older queued items)
    const latest = queue[queue.length - 1];
    this.retryQueues.set(chatKey, []);

    try {
      await this.sendDraftRequest(chatId, latest.text, messageThreadId);
    } catch {
      // Already emitting errors in sendDraftRequest
    }
  }

  /**
   * Get current draft state for a chat
   */
  getDraftState(chatId: number | string, messageThreadId?: number): DraftBubbleState | null {
    const chatKey = this.getChatKey(chatId, messageThreadId);
    const state = this.draftStates.get(chatKey);
    return state ? { ...state } : null;
  }

  /**
   * Get current stream state for a chat
   */
  getStreamState(chatId: number | string, messageThreadId?: number): StreamState | null {
    const chatKey = this.getChatKey(chatId, messageThreadId);
    const state = this.streamStates.get(chatKey);
    return state ? { ...state } : null;
  }

  /**
   * Check if a chat has an active draft
   */
  hasActiveDraft(chatId: number | string, messageThreadId?: number): boolean {
    const chatKey = this.getChatKey(chatId, messageThreadId);
    const draft = this.draftStates.get(chatKey);
    return draft !== undefined && !draft.isFinalized;
  }

  /**
   * Get all active draft chat IDs
   */
  getActiveDraftChatIds(): (number | string)[] {
    const chatIds: (number | string)[] = [];
    for (const [, state] of this.draftStates) {
      if (!state.isFinalized) {
        chatIds.push(state.chatId);
      }
    }
    return chatIds;
  }

  /**
   * Cancel all active drafts
   */
  async cancelAllDrafts(): Promise<void> {
    const chatKeys = Array.from(this.draftStates.keys());

    for (const chatKey of chatKeys) {
      const state = this.draftStates.get(chatKey);
      if (state) {
        await this.cancelDraft(state.chatId, state.messageThreadId);
      }
    }
  }

  /**
   * Gracefully shutdown the service
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Clear all pending timeouts
    for (const timeout of this.pendingUpdates.values()) {
      clearTimeout(timeout);
    }
    this.pendingUpdates.clear();

    // Cancel all drafts
    await this.cancelAllDrafts();

    // Clear all state
    this.draftStates.clear();
    this.streamStates.clear();
    this.retryQueues.clear();

    this.removeAllListeners();
  }
}
