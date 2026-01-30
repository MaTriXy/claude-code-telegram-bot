import { EventEmitter } from 'events';
import type {
  StreamingConfig,
  StreamChunk,
  DraftBubbleState,
} from '../types/index.js';
import { StreamingService, DEFAULT_STREAMING_CONFIG } from './StreamingService.js';

/**
 * Events emitted by DraftMessageHandler
 */
export interface DraftMessageHandlerEvents {
  chunk_accumulated: (chatId: number | string, text: string) => void;
  update_sent: (chatId: number | string, text: string) => void;
  draft_flushed: (chatId: number | string, finalText: string) => void;
  error: (error: Error, chatId: number | string) => void;
}

/**
 * Configuration for DraftMessageHandler
 */
export interface DraftMessageHandlerConfig {
  /** Streaming configuration */
  streamingConfig?: Partial<StreamingConfig>;
  /** Maximum text length before auto-flush */
  maxTextLength?: number;
  /** Auto-flush timeout in milliseconds (0 to disable) */
  autoFlushTimeoutMs?: number;
}

/**
 * Internal state for tracking text accumulation
 */
interface AccumulatorState {
  /** Accumulated text buffer */
  buffer: string;
  /** Text that has been sent to draft */
  sentText: string;
  /** Timestamp of last accumulation */
  lastAccumulateTime: number;
  /** Timestamp of last update sent */
  lastUpdateTime: number;
  /** Number of chunks accumulated since last update */
  chunksSinceUpdate: number;
  /** Auto-flush timeout handle */
  autoFlushTimeout?: NodeJS.Timeout;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<DraftMessageHandlerConfig> = {
  streamingConfig: DEFAULT_STREAMING_CONFIG,
  maxTextLength: 4096, // Telegram message limit
  autoFlushTimeoutMs: 5000, // 5 seconds
};

/**
 * DraftMessageHandler manages draft bubble state per chat
 * Handles text accumulation, throttling, and automatic updates
 */
export class DraftMessageHandler extends EventEmitter {
  private streamingService: StreamingService;
  private config: Required<DraftMessageHandlerConfig>;
  private accumulators: Map<string, AccumulatorState> = new Map();
  private isShuttingDown = false;

  constructor(
    streamingService: StreamingService,
    config?: DraftMessageHandlerConfig
  ) {
    super();
    this.streamingService = streamingService;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      streamingConfig: {
        ...DEFAULT_STREAMING_CONFIG,
        ...config?.streamingConfig,
      },
    };

    // Forward errors from streaming service
    this.streamingService.on('error', (error: Error, chatId: number | string) => {
      this.emit('error', error, chatId);
    });
  }

  /**
   * Generate a unique key for chat/thread combination
   */
  private getChatKey(chatId: number | string, messageThreadId?: number): string {
    return messageThreadId ? `${chatId}:${messageThreadId}` : `${chatId}`;
  }

  /**
   * Get or create accumulator state for a chat
   */
  private getAccumulator(chatId: number | string, messageThreadId?: number): AccumulatorState {
    const chatKey = this.getChatKey(chatId, messageThreadId);

    if (!this.accumulators.has(chatKey)) {
      this.accumulators.set(chatKey, {
        buffer: '',
        sentText: '',
        lastAccumulateTime: 0,
        lastUpdateTime: 0,
        chunksSinceUpdate: 0,
      });
    }

    return this.accumulators.get(chatKey)!;
  }

  /**
   * Accumulate a text chunk
   * Returns true if an update should be sent
   */
  accumulate(
    chatId: number | string,
    text: string,
    messageThreadId?: number
  ): boolean {
    if (this.isShuttingDown) {
      return false;
    }

    const accumulator = this.getAccumulator(chatId, messageThreadId);
    const now = Date.now();

    // Add text to buffer
    accumulator.buffer += text;
    accumulator.lastAccumulateTime = now;
    accumulator.chunksSinceUpdate++;

    // Cancel existing auto-flush timeout
    if (accumulator.autoFlushTimeout) {
      clearTimeout(accumulator.autoFlushTimeout);
      accumulator.autoFlushTimeout = undefined;
    }

    // Set up new auto-flush timeout if configured
    if (this.config.autoFlushTimeoutMs > 0) {
      accumulator.autoFlushTimeout = setTimeout(() => {
        this.flush(chatId, messageThreadId).catch((error) => {
          this.emit('error', error instanceof Error ? error : new Error(String(error)), chatId);
        });
      }, this.config.autoFlushTimeoutMs);
    }

    this.emit('chunk_accumulated', chatId, text);

    // Check if we should send an update
    return this.shouldUpdate(chatId, messageThreadId);
  }

  /**
   * Check if an update should be sent based on configuration
   */
  shouldUpdate(chatId: number | string, messageThreadId?: number): boolean {
    const accumulator = this.getAccumulator(chatId, messageThreadId);
    const config = this.config.streamingConfig;
    const now = Date.now();

    // Check if streaming is disabled
    if (!config.enabled || config.mode === 'off') {
      return false;
    }

    // Check if buffer is empty or unchanged
    if (accumulator.buffer === accumulator.sentText) {
      return false;
    }

    // Check max text length
    if (accumulator.buffer.length >= this.config.maxTextLength) {
      return true;
    }

    // Check minimum update interval
    const timeSinceLastUpdate = now - accumulator.lastUpdateTime;
    const updateInterval = config.updateIntervalMs ?? 500;
    if (timeSinceLastUpdate < updateInterval) {
      return false;
    }

    // Mode-specific checks
    switch (config.mode) {
      case 'partial':
        // In partial mode, update after interval if there's new text
        return accumulator.buffer.length > accumulator.sentText.length;

      case 'block':
        // In block mode, update when we have enough new text
        const unsent = accumulator.buffer.length - accumulator.sentText.length;
        const blockSize = config.blockSize ?? 100;
        return unsent >= blockSize;

      default:
        return false;
    }
  }

  /**
   * Send accumulated text as a draft update if conditions are met
   * Returns the current draft state or null if no update was sent
   */
  async sendUpdate(
    chatId: number | string,
    messageThreadId?: number
  ): Promise<DraftBubbleState | null> {
    const accumulator = this.getAccumulator(chatId, messageThreadId);

    if (!this.shouldUpdate(chatId, messageThreadId)) {
      return null;
    }

    const chunk: StreamChunk = {
      text: accumulator.buffer.slice(accumulator.sentText.length),
      timestamp: Date.now(),
      isComplete: false,
    };

    // First ensure we have an active draft
    if (!this.streamingService.hasActiveDraft(chatId, messageThreadId)) {
      await this.streamingService.startDraft(chatId, messageThreadId, accumulator.buffer);
      accumulator.sentText = accumulator.buffer;
      accumulator.lastUpdateTime = Date.now();
      accumulator.chunksSinceUpdate = 0;
      this.emit('update_sent', chatId, accumulator.buffer);
      return this.streamingService.getDraftState(chatId, messageThreadId);
    }

    const result = await this.streamingService.updateDraft(chatId, chunk, messageThreadId);

    if (result) {
      accumulator.sentText = accumulator.buffer;
      accumulator.lastUpdateTime = Date.now();
      accumulator.chunksSinceUpdate = 0;
      this.emit('update_sent', chatId, accumulator.buffer);
    }

    return result;
  }

  /**
   * Flush all accumulated text and complete the draft
   * Returns the final draft state
   */
  async flush(
    chatId: number | string,
    messageThreadId?: number
  ): Promise<DraftBubbleState | null> {
    const chatKey = this.getChatKey(chatId, messageThreadId);
    const accumulator = this.accumulators.get(chatKey);

    if (!accumulator) {
      return null;
    }

    // Cancel auto-flush timeout
    if (accumulator.autoFlushTimeout) {
      clearTimeout(accumulator.autoFlushTimeout);
      accumulator.autoFlushTimeout = undefined;
    }

    // If there's unsent text, send final update
    if (accumulator.buffer !== accumulator.sentText) {
      // Ensure draft exists
      if (!this.streamingService.hasActiveDraft(chatId, messageThreadId)) {
        await this.streamingService.startDraft(chatId, messageThreadId, accumulator.buffer);
      } else {
        const chunk: StreamChunk = {
          text: accumulator.buffer.slice(accumulator.sentText.length),
          timestamp: Date.now(),
          isComplete: true,
        };
        await this.streamingService.updateDraft(chatId, chunk, messageThreadId);
      }
    }

    const finalText = accumulator.buffer;
    const result = await this.streamingService.completeDraft(chatId, messageThreadId);

    // Clean up accumulator
    this.accumulators.delete(chatKey);

    this.emit('draft_flushed', chatId, finalText);

    return result;
  }

  /**
   * Reset accumulator state without sending updates
   */
  reset(chatId: number | string, messageThreadId?: number): void {
    const chatKey = this.getChatKey(chatId, messageThreadId);
    const accumulator = this.accumulators.get(chatKey);

    if (accumulator?.autoFlushTimeout) {
      clearTimeout(accumulator.autoFlushTimeout);
    }

    this.accumulators.delete(chatKey);

    // Also cancel any active draft
    this.streamingService.cancelDraft(chatId, messageThreadId).catch(() => {
      // Ignore cancel errors during reset
    });
  }

  /**
   * Get current buffer contents
   */
  getBuffer(chatId: number | string, messageThreadId?: number): string {
    const accumulator = this.getAccumulator(chatId, messageThreadId);
    return accumulator.buffer;
  }

  /**
   * Get amount of unsent text
   */
  getUnsentLength(chatId: number | string, messageThreadId?: number): number {
    const accumulator = this.getAccumulator(chatId, messageThreadId);
    return accumulator.buffer.length - accumulator.sentText.length;
  }

  /**
   * Check if there's any accumulated text
   */
  hasAccumulatedText(chatId: number | string, messageThreadId?: number): boolean {
    const chatKey = this.getChatKey(chatId, messageThreadId);
    const accumulator = this.accumulators.get(chatKey);
    return accumulator !== undefined && accumulator.buffer.length > 0;
  }

  /**
   * Get chunk count since last update
   */
  getChunksSinceUpdate(chatId: number | string, messageThreadId?: number): number {
    const accumulator = this.getAccumulator(chatId, messageThreadId);
    return accumulator.chunksSinceUpdate;
  }

  /**
   * Get timestamp of last accumulation
   */
  getLastAccumulateTime(chatId: number | string, messageThreadId?: number): number {
    const accumulator = this.getAccumulator(chatId, messageThreadId);
    return accumulator.lastAccumulateTime;
  }

  /**
   * Get timestamp of last update sent
   */
  getLastUpdateTime(chatId: number | string, messageThreadId?: number): number {
    const accumulator = this.getAccumulator(chatId, messageThreadId);
    return accumulator.lastUpdateTime;
  }

  /**
   * Force an update regardless of throttling
   */
  async forceUpdate(
    chatId: number | string,
    messageThreadId?: number
  ): Promise<DraftBubbleState | null> {
    const accumulator = this.getAccumulator(chatId, messageThreadId);

    if (accumulator.buffer === accumulator.sentText) {
      return this.streamingService.getDraftState(chatId, messageThreadId);
    }

    // Temporarily set lastUpdateTime far in the past to bypass throttling
    const originalTime = accumulator.lastUpdateTime;
    accumulator.lastUpdateTime = 0;

    try {
      return await this.sendUpdate(chatId, messageThreadId);
    } finally {
      // Restore if update failed (sendUpdate already updated it on success)
      if (accumulator.lastUpdateTime === 0) {
        accumulator.lastUpdateTime = originalTime;
      }
    }
  }

  /**
   * Get all active chat keys
   */
  getActiveChatKeys(): string[] {
    return Array.from(this.accumulators.keys());
  }

  /**
   * Flush all active accumulators
   */
  async flushAll(): Promise<void> {
    const chatKeys = Array.from(this.accumulators.keys());

    for (const chatKey of chatKeys) {
      const accumulator = this.accumulators.get(chatKey);
      if (accumulator) {
        // Parse chatId and messageThreadId from key
        const [chatIdStr, threadIdStr] = chatKey.split(':');
        const chatId = /^\d+$/.test(chatIdStr) ? parseInt(chatIdStr, 10) : chatIdStr;
        const messageThreadId = threadIdStr ? parseInt(threadIdStr, 10) : undefined;

        await this.flush(chatId, messageThreadId);
      }
    }
  }

  /**
   * Reset all accumulators
   */
  resetAll(): void {
    for (const accumulator of this.accumulators.values()) {
      if (accumulator.autoFlushTimeout) {
        clearTimeout(accumulator.autoFlushTimeout);
      }
    }
    this.accumulators.clear();
  }

  /**
   * Get the underlying streaming service
   */
  getStreamingService(): StreamingService {
    return this.streamingService;
  }

  /**
   * Gracefully shutdown the handler
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Flush all remaining text
    await this.flushAll();

    // Reset all state
    this.resetAll();

    this.removeAllListeners();
  }
}
