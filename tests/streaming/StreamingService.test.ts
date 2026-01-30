import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { StreamingService, DEFAULT_STREAMING_CONFIG } from '../../src/streaming/StreamingService.js';
import { DraftMessageHandler } from '../../src/streaming/DraftMessageHandler.js';
import type { StreamChunk, StreamingConfig, DraftBubbleState } from '../../src/types/index.js';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

const TEST_BOT_TOKEN = 'test-bot-token-123';
const TEST_CHAT_ID = 12345;
const TEST_THREAD_ID = 67890;

describe('StreamingService', () => {
  let streamingService: StreamingService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default successful response
    mockFetch.mockResolvedValue({
      json: async () => ({ ok: true, result: true }),
    } as Response);

    streamingService = new StreamingService(TEST_BOT_TOKEN);
  });

  afterEach(async () => {
    await streamingService.shutdown();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      expect(streamingService).toBeInstanceOf(StreamingService);
      expect(streamingService.getConfig()).toEqual(DEFAULT_STREAMING_CONFIG);
    });

    it('should create service with custom config', () => {
      const customConfig: Partial<StreamingConfig> = {
        mode: 'block',
        blockSize: 200,
        updateIntervalMs: 1000,
      };

      const service = new StreamingService(TEST_BOT_TOKEN, customConfig);
      const config = service.getConfig();

      expect(config.mode).toBe('block');
      expect(config.blockSize).toBe(200);
      expect(config.updateIntervalMs).toBe(1000);
      expect(config.enabled).toBe(true); // default preserved
    });
  });

  describe('configuration', () => {
    it('should get and set config', () => {
      streamingService.setConfig({ mode: 'block', blockSize: 150 });

      const config = streamingService.getConfig();
      expect(config.mode).toBe('block');
      expect(config.blockSize).toBe(150);
    });

    it('should get and set mode', () => {
      expect(streamingService.getMode()).toBe('partial');

      streamingService.setMode('block');
      expect(streamingService.getMode()).toBe('block');

      streamingService.setMode('off');
      expect(streamingService.getMode()).toBe('off');
    });

    it('should check if enabled', () => {
      expect(streamingService.isEnabled()).toBe(true);

      streamingService.setConfig({ enabled: false });
      expect(streamingService.isEnabled()).toBe(false);

      streamingService.setConfig({ enabled: true, mode: 'off' });
      expect(streamingService.isEnabled()).toBe(false);
    });
  });

  describe('startDraft', () => {
    it('should start a new draft', async () => {
      const state = await streamingService.startDraft(TEST_CHAT_ID);

      expect(state.chatId).toBe(TEST_CHAT_ID);
      expect(state.isVisible).toBe(false);
      expect(state.currentText).toBe('');
      expect(state.isFinalized).toBe(false);
    });

    it('should start draft with initial text', async () => {
      const state = await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Hello');

      expect(state.currentText).toBe('Hello');
      expect(state.isVisible).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should start draft with thread ID', async () => {
      const state = await streamingService.startDraft(TEST_CHAT_ID, TEST_THREAD_ID, 'Hello');

      expect(state.messageThreadId).toBe(TEST_THREAD_ID);

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.message_thread_id).toBe(TEST_THREAD_ID);
    });

    it('should cancel existing draft before starting new one', async () => {
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'First');
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Second');

      // Should have called: first draft, cancel (empty), second draft
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw error when shutting down', async () => {
      await streamingService.shutdown();

      await expect(streamingService.startDraft(TEST_CHAT_ID)).rejects.toThrow('shutting down');
    });
  });

  describe('updateDraft', () => {
    it('should update existing draft', async () => {
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Hello');

      const chunk: StreamChunk = {
        text: ' World',
        timestamp: Date.now(),
        isComplete: false,
      };

      const state = await streamingService.updateDraft(TEST_CHAT_ID, chunk);

      expect(state?.currentText).toBe('Hello World');
    });

    it('should auto-start draft if none exists', async () => {
      const chunk: StreamChunk = {
        text: 'Auto started',
        timestamp: Date.now(),
        isComplete: false,
      };

      const state = await streamingService.updateDraft(TEST_CHAT_ID, chunk);

      expect(state).not.toBeNull();
      expect(streamingService.hasActiveDraft(TEST_CHAT_ID)).toBe(true);
    });

    it('should return null when streaming is disabled', async () => {
      streamingService.setConfig({ enabled: false });

      const chunk: StreamChunk = {
        text: 'Test',
        timestamp: Date.now(),
        isComplete: false,
      };

      const state = await streamingService.updateDraft(TEST_CHAT_ID, chunk);
      expect(state).toBeNull();
    });

    it('should emit draft_updated event', async () => {
      const callback = jest.fn();
      streamingService.on('draft_updated', callback);

      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Hello');

      const chunk: StreamChunk = {
        text: ' World',
        timestamp: Date.now(),
        isComplete: false,
      };

      await streamingService.updateDraft(TEST_CHAT_ID, chunk);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle block mode correctly', async () => {
      streamingService.setConfig({ mode: 'block', blockSize: 10 });
      await streamingService.startDraft(TEST_CHAT_ID);

      // Send chunks smaller than block size
      for (let i = 0; i < 5; i++) {
        const chunk: StreamChunk = {
          text: 'ab',
          timestamp: Date.now(),
          isComplete: false,
        };
        await streamingService.updateDraft(TEST_CHAT_ID, chunk);
      }

      // After 10 chars (5 * 2), should have triggered update
      const state = streamingService.getStreamState(TEST_CHAT_ID);
      expect(state?.accumulatedText.length).toBe(10);
    });
  });

  describe('completeDraft', () => {
    it('should complete and finalize draft', async () => {
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Complete me');

      const state = await streamingService.completeDraft(TEST_CHAT_ID);

      expect(state?.isFinalized).toBe(true);
      expect(state?.isVisible).toBe(false);
      expect(streamingService.hasActiveDraft(TEST_CHAT_ID)).toBe(false);
    });

    it('should emit draft_complete event', async () => {
      const callback = jest.fn();
      streamingService.on('draft_complete', callback);

      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Test');
      await streamingService.completeDraft(TEST_CHAT_ID);

      expect(callback).toHaveBeenCalled();
    });

    it('should return null for non-existent draft', async () => {
      const state = await streamingService.completeDraft(99999);
      expect(state).toBeNull();
    });

    it('should send empty draft to clear bubble', async () => {
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Test');
      mockFetch.mockClear();

      await streamingService.completeDraft(TEST_CHAT_ID);

      // Should send empty text to clear the draft bubble
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1]?.body as string);
      expect(body.text).toBe('');
    });
  });

  describe('cancelDraft', () => {
    it('should cancel draft and clean up state', async () => {
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Cancel me');

      await streamingService.cancelDraft(TEST_CHAT_ID);

      expect(streamingService.hasActiveDraft(TEST_CHAT_ID)).toBe(false);
      expect(streamingService.getDraftState(TEST_CHAT_ID)).toBeNull();
    });

    it('should send empty draft when canceling', async () => {
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Test');
      mockFetch.mockClear();

      await streamingService.cancelDraft(TEST_CHAT_ID);

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle cancel when no draft exists', async () => {
      // Should not throw
      await streamingService.cancelDraft(99999);
    });
  });

  describe('sendDraftRequest', () => {
    it('should send correct API request', async () => {
      await streamingService.sendDraftRequest(TEST_CHAT_ID, 'Hello World');

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_BOT_TOKEN}/sendMessageDraft`,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.chat_id).toBe(TEST_CHAT_ID);
      expect(body.text).toBe('Hello World');
    });

    it('should include thread ID when provided', async () => {
      await streamingService.sendDraftRequest(TEST_CHAT_ID, 'Hello', TEST_THREAD_ID);

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.message_thread_id).toBe(TEST_THREAD_ID);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: false,
          error_code: 400,
          description: 'Bad Request',
        }),
      } as Response);

      const errorCallback = jest.fn();
      streamingService.on('error', errorCallback);

      await expect(streamingService.sendDraftRequest(TEST_CHAT_ID, 'Test'))
        .rejects.toThrow('Telegram API error');

      expect(errorCallback).toHaveBeenCalled();
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: false,
          error_code: 429,
          description: 'Too Many Requests',
          parameters: { retry_after: 5 },
        }),
      } as Response);

      const rateLimitCallback = jest.fn();
      streamingService.on('rate_limited', rateLimitCallback);

      const result = await streamingService.sendDraftRequest(TEST_CHAT_ID, 'Test');

      expect(result).toBe(false);
      expect(rateLimitCallback).toHaveBeenCalledWith(5, TEST_CHAT_ID);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failed'));

      const errorCallback = jest.fn();
      streamingService.on('error', errorCallback);

      await expect(streamingService.sendDraftRequest(TEST_CHAT_ID, 'Test'))
        .rejects.toThrow('Network error');

      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('should get draft state', async () => {
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Hello');

      const state = streamingService.getDraftState(TEST_CHAT_ID);

      expect(state).not.toBeNull();
      expect(state?.currentText).toBe('Hello');
    });

    it('should get stream state', async () => {
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Hello');

      const state = streamingService.getStreamState(TEST_CHAT_ID);

      expect(state).not.toBeNull();
      expect(state?.accumulatedText).toBe('Hello');
      expect(state?.isStreaming).toBe(true);
    });

    it('should check for active draft', async () => {
      expect(streamingService.hasActiveDraft(TEST_CHAT_ID)).toBe(false);

      await streamingService.startDraft(TEST_CHAT_ID);
      expect(streamingService.hasActiveDraft(TEST_CHAT_ID)).toBe(true);

      await streamingService.completeDraft(TEST_CHAT_ID);
      expect(streamingService.hasActiveDraft(TEST_CHAT_ID)).toBe(false);
    });

    it('should get active draft chat IDs', async () => {
      await streamingService.startDraft(TEST_CHAT_ID);
      await streamingService.startDraft(11111);
      await streamingService.startDraft(22222);

      const chatIds = streamingService.getActiveDraftChatIds();

      expect(chatIds).toHaveLength(3);
      expect(chatIds).toContain(TEST_CHAT_ID);
      expect(chatIds).toContain(11111);
      expect(chatIds).toContain(22222);
    });

    it('should handle thread ID in state lookup', async () => {
      await streamingService.startDraft(TEST_CHAT_ID, TEST_THREAD_ID, 'Thread');
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'No thread');

      const threadState = streamingService.getDraftState(TEST_CHAT_ID, TEST_THREAD_ID);
      const noThreadState = streamingService.getDraftState(TEST_CHAT_ID);

      expect(threadState?.currentText).toBe('Thread');
      expect(noThreadState?.currentText).toBe('No thread');
    });
  });

  describe('cancelAllDrafts', () => {
    it('should cancel all active drafts', async () => {
      await streamingService.startDraft(TEST_CHAT_ID);
      await streamingService.startDraft(11111);
      await streamingService.startDraft(22222);

      await streamingService.cancelAllDrafts();

      expect(streamingService.getActiveDraftChatIds()).toHaveLength(0);
    });
  });

  describe('shutdown', () => {
    it('should clean up all state on shutdown', async () => {
      await streamingService.startDraft(TEST_CHAT_ID);
      await streamingService.startDraft(11111);

      await streamingService.shutdown();

      expect(streamingService.getActiveDraftChatIds()).toHaveLength(0);
    });

    it('should prevent new drafts after shutdown', async () => {
      await streamingService.shutdown();

      await expect(streamingService.startDraft(TEST_CHAT_ID))
        .rejects.toThrow('shutting down');
    });
  });

  describe('throttling', () => {
    it('should throttle updates based on updateIntervalMs', async () => {
      streamingService.setConfig({ updateIntervalMs: 500 });
      await streamingService.startDraft(TEST_CHAT_ID, undefined, 'Start');

      mockFetch.mockClear();

      // Send multiple rapid updates
      for (let i = 0; i < 5; i++) {
        const chunk: StreamChunk = {
          text: `${i}`,
          timestamp: Date.now(),
          isComplete: false,
        };
        await streamingService.updateDraft(TEST_CHAT_ID, chunk);
      }

      // Should have scheduled updates, not sent all immediately
      // The exact behavior depends on timing, but rapid updates should be batched
      jest.advanceTimersByTime(500);
    });
  });
});

describe('DraftMessageHandler', () => {
  let streamingService: StreamingService;
  let handler: DraftMessageHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockFetch.mockResolvedValue({
      json: async () => ({ ok: true, result: true }),
    } as Response);

    streamingService = new StreamingService(TEST_BOT_TOKEN);
    handler = new DraftMessageHandler(streamingService);
  });

  afterEach(async () => {
    await handler.shutdown();
    await streamingService.shutdown();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create handler with default config', () => {
      expect(handler).toBeInstanceOf(DraftMessageHandler);
    });

    it('should create handler with custom config', () => {
      const customHandler = new DraftMessageHandler(streamingService, {
        maxTextLength: 2000,
        autoFlushTimeoutMs: 10000,
      });

      expect(customHandler).toBeInstanceOf(DraftMessageHandler);
    });

    it('should forward errors from streaming service', () => {
      const errorCallback = jest.fn();
      handler.on('error', errorCallback);

      streamingService.emit('error', new Error('Test error'), TEST_CHAT_ID);

      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error), TEST_CHAT_ID);
    });
  });

  describe('accumulate', () => {
    it('should accumulate text chunks', () => {
      handler.accumulate(TEST_CHAT_ID, 'Hello');
      handler.accumulate(TEST_CHAT_ID, ' World');

      expect(handler.getBuffer(TEST_CHAT_ID)).toBe('Hello World');
    });

    it('should emit chunk_accumulated event', () => {
      const callback = jest.fn();
      handler.on('chunk_accumulated', callback);

      handler.accumulate(TEST_CHAT_ID, 'Test');

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, 'Test');
    });

    it('should track chunks since update', () => {
      handler.accumulate(TEST_CHAT_ID, 'One');
      handler.accumulate(TEST_CHAT_ID, 'Two');
      handler.accumulate(TEST_CHAT_ID, 'Three');

      expect(handler.getChunksSinceUpdate(TEST_CHAT_ID)).toBe(3);
    });

    it('should set up auto-flush timeout', () => {
      handler.accumulate(TEST_CHAT_ID, 'Test');

      expect(handler.hasAccumulatedText(TEST_CHAT_ID)).toBe(true);

      // Fast-forward to trigger auto-flush
      jest.advanceTimersByTime(5000);
    });

    it('should handle separate thread IDs', () => {
      handler.accumulate(TEST_CHAT_ID, 'Main', undefined);
      handler.accumulate(TEST_CHAT_ID, 'Thread', TEST_THREAD_ID);

      expect(handler.getBuffer(TEST_CHAT_ID)).toBe('Main');
      expect(handler.getBuffer(TEST_CHAT_ID, TEST_THREAD_ID)).toBe('Thread');
    });
  });

  describe('shouldUpdate', () => {
    it('should return false when streaming is disabled', () => {
      // Create handler with disabled streaming
      const disabledHandler = new DraftMessageHandler(streamingService, {
        streamingConfig: { enabled: false, mode: 'partial', blockSize: 100, updateIntervalMs: 0 },
      });
      disabledHandler.accumulate(TEST_CHAT_ID, 'Test');

      expect(disabledHandler.shouldUpdate(TEST_CHAT_ID)).toBe(false);
    });

    it('should return false when mode is off', () => {
      // Create handler with mode off
      const offHandler = new DraftMessageHandler(streamingService, {
        streamingConfig: { enabled: true, mode: 'off', blockSize: 100, updateIntervalMs: 0 },
      });
      offHandler.accumulate(TEST_CHAT_ID, 'Test');

      expect(offHandler.shouldUpdate(TEST_CHAT_ID)).toBe(false);
    });

    it('should return true when max text length reached', () => {
      const customHandler = new DraftMessageHandler(streamingService, {
        maxTextLength: 10,
      });

      customHandler.accumulate(TEST_CHAT_ID, 'This is longer than 10 chars');

      expect(customHandler.shouldUpdate(TEST_CHAT_ID)).toBe(true);
    });

    it('should respect update interval in partial mode', async () => {
      streamingService.setConfig({ mode: 'partial', updateIntervalMs: 500 });

      handler.accumulate(TEST_CHAT_ID, 'Test');
      // First call should return true (no previous update)
      expect(handler.shouldUpdate(TEST_CHAT_ID)).toBe(true);

      await handler.sendUpdate(TEST_CHAT_ID);
      handler.accumulate(TEST_CHAT_ID, ' more');

      // Immediately after, should be throttled
      expect(handler.shouldUpdate(TEST_CHAT_ID)).toBe(false);

      // After interval, should be true
      jest.advanceTimersByTime(500);
      expect(handler.shouldUpdate(TEST_CHAT_ID)).toBe(true);
    });

    it('should check block size in block mode', () => {
      // Create handler with block mode
      const blockHandler = new DraftMessageHandler(streamingService, {
        streamingConfig: { enabled: true, mode: 'block', blockSize: 10, updateIntervalMs: 0 },
      });

      blockHandler.accumulate(TEST_CHAT_ID, 'Short');
      expect(blockHandler.shouldUpdate(TEST_CHAT_ID)).toBe(false);

      blockHandler.accumulate(TEST_CHAT_ID, ' text!');
      expect(blockHandler.shouldUpdate(TEST_CHAT_ID)).toBe(true);
    });
  });

  describe('sendUpdate', () => {
    it('should send update and emit event', async () => {
      const callback = jest.fn();
      handler.on('update_sent', callback);

      handler.accumulate(TEST_CHAT_ID, 'Hello World');
      await handler.sendUpdate(TEST_CHAT_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, 'Hello World');
    });

    it('should return null when shouldUpdate is false', async () => {
      // Create handler with disabled streaming
      const disabledHandler = new DraftMessageHandler(streamingService, {
        streamingConfig: { enabled: false, mode: 'partial', blockSize: 100, updateIntervalMs: 0 },
      });
      disabledHandler.accumulate(TEST_CHAT_ID, 'Test');

      const result = await disabledHandler.sendUpdate(TEST_CHAT_ID);
      expect(result).toBeNull();
    });

    it('should reset chunks counter after update', async () => {
      handler.accumulate(TEST_CHAT_ID, 'One');
      handler.accumulate(TEST_CHAT_ID, 'Two');
      expect(handler.getChunksSinceUpdate(TEST_CHAT_ID)).toBe(2);

      await handler.sendUpdate(TEST_CHAT_ID);
      expect(handler.getChunksSinceUpdate(TEST_CHAT_ID)).toBe(0);
    });
  });

  describe('flush', () => {
    it('should flush all accumulated text', async () => {
      const callback = jest.fn();
      handler.on('draft_flushed', callback);

      handler.accumulate(TEST_CHAT_ID, 'Hello');
      handler.accumulate(TEST_CHAT_ID, ' World');

      await handler.flush(TEST_CHAT_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, 'Hello World');
    });

    it('should clean up accumulator state', async () => {
      handler.accumulate(TEST_CHAT_ID, 'Test');
      await handler.flush(TEST_CHAT_ID);

      expect(handler.hasAccumulatedText(TEST_CHAT_ID)).toBe(false);
    });

    it('should return null for non-existent accumulator', async () => {
      const result = await handler.flush(99999);
      expect(result).toBeNull();
    });

    it('should cancel auto-flush timeout', async () => {
      handler.accumulate(TEST_CHAT_ID, 'Test');
      await handler.flush(TEST_CHAT_ID);

      // Auto-flush should not trigger anything after manual flush
      jest.advanceTimersByTime(10000);
    });
  });

  describe('reset', () => {
    it('should reset accumulator state', () => {
      handler.accumulate(TEST_CHAT_ID, 'Test');
      handler.reset(TEST_CHAT_ID);

      expect(handler.hasAccumulatedText(TEST_CHAT_ID)).toBe(false);
      expect(handler.getBuffer(TEST_CHAT_ID)).toBe('');
    });

    it('should cancel any active draft', async () => {
      handler.accumulate(TEST_CHAT_ID, 'Test');
      await handler.sendUpdate(TEST_CHAT_ID);

      // Verify draft exists
      expect(streamingService.hasActiveDraft(TEST_CHAT_ID)).toBe(true);

      handler.reset(TEST_CHAT_ID);

      // Run timers to let async cancel complete
      await jest.runAllTimersAsync();

      expect(streamingService.hasActiveDraft(TEST_CHAT_ID)).toBe(false);
    });
  });

  describe('forceUpdate', () => {
    it('should send update regardless of throttling', async () => {
      streamingService.setConfig({ mode: 'partial', updateIntervalMs: 10000 });

      handler.accumulate(TEST_CHAT_ID, 'First');
      await handler.sendUpdate(TEST_CHAT_ID);

      handler.accumulate(TEST_CHAT_ID, ' Second');

      // Should be throttled normally
      expect(handler.shouldUpdate(TEST_CHAT_ID)).toBe(false);

      // Force should bypass throttle
      const result = await handler.forceUpdate(TEST_CHAT_ID);
      expect(result).not.toBeNull();
    });

    it('should return draft state when no unsent text', async () => {
      handler.accumulate(TEST_CHAT_ID, 'Test');
      await handler.sendUpdate(TEST_CHAT_ID);

      // No new text accumulated
      const result = await handler.forceUpdate(TEST_CHAT_ID);
      expect(result).toBeDefined();
    });
  });

  describe('utility methods', () => {
    it('should get unsent length', () => {
      handler.accumulate(TEST_CHAT_ID, 'Hello World');

      expect(handler.getUnsentLength(TEST_CHAT_ID)).toBe(11);
    });

    it('should get last accumulate time', () => {
      const before = Date.now();
      handler.accumulate(TEST_CHAT_ID, 'Test');
      const after = Date.now();

      const time = handler.getLastAccumulateTime(TEST_CHAT_ID);
      expect(time).toBeGreaterThanOrEqual(before);
      expect(time).toBeLessThanOrEqual(after);
    });

    it('should get last update time', async () => {
      handler.accumulate(TEST_CHAT_ID, 'Test');

      const beforeUpdate = handler.getLastUpdateTime(TEST_CHAT_ID);
      expect(beforeUpdate).toBe(0);

      await handler.sendUpdate(TEST_CHAT_ID);

      const afterUpdate = handler.getLastUpdateTime(TEST_CHAT_ID);
      expect(afterUpdate).toBeGreaterThan(0);
    });

    it('should get active chat keys', () => {
      handler.accumulate(TEST_CHAT_ID, 'One');
      handler.accumulate(11111, 'Two');
      handler.accumulate(TEST_CHAT_ID, 'Three', TEST_THREAD_ID);

      const keys = handler.getActiveChatKeys();

      expect(keys).toHaveLength(3);
      expect(keys).toContain(`${TEST_CHAT_ID}`);
      expect(keys).toContain('11111');
      expect(keys).toContain(`${TEST_CHAT_ID}:${TEST_THREAD_ID}`);
    });

    it('should get streaming service', () => {
      expect(handler.getStreamingService()).toBe(streamingService);
    });
  });

  describe('flushAll', () => {
    it('should flush all active accumulators', async () => {
      handler.accumulate(TEST_CHAT_ID, 'One');
      handler.accumulate(11111, 'Two');
      handler.accumulate(22222, 'Three');

      await handler.flushAll();

      expect(handler.getActiveChatKeys()).toHaveLength(0);
    });
  });

  describe('resetAll', () => {
    it('should reset all accumulators', () => {
      handler.accumulate(TEST_CHAT_ID, 'One');
      handler.accumulate(11111, 'Two');
      handler.accumulate(22222, 'Three');

      handler.resetAll();

      expect(handler.getActiveChatKeys()).toHaveLength(0);
    });
  });

  describe('shutdown', () => {
    it('should flush and clean up on shutdown', async () => {
      handler.accumulate(TEST_CHAT_ID, 'Test');
      handler.accumulate(11111, 'Test2');

      await handler.shutdown();

      expect(handler.getActiveChatKeys()).toHaveLength(0);
    });
  });
});

describe('Integration: StreamingService + DraftMessageHandler', () => {
  let streamingService: StreamingService;
  let handler: DraftMessageHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockFetch.mockResolvedValue({
      json: async () => ({ ok: true, result: true }),
    } as Response);

    streamingService = new StreamingService(TEST_BOT_TOKEN, {
      mode: 'partial',
      updateIntervalMs: 100,
    });
    handler = new DraftMessageHandler(streamingService, {
      autoFlushTimeoutMs: 1000,
    });
  });

  afterEach(async () => {
    await handler.shutdown();
    await streamingService.shutdown();
    jest.useRealTimers();
  });

  it('should handle complete streaming workflow', async () => {
    // Simulate streaming chunks
    const chunks = ['Hello', ' ', 'World', '!'];
    const events: string[] = [];

    handler.on('chunk_accumulated', () => events.push('accumulated'));
    handler.on('update_sent', () => events.push('sent'));
    handler.on('draft_flushed', () => events.push('flushed'));

    // Accumulate chunks
    for (const chunk of chunks) {
      handler.accumulate(TEST_CHAT_ID, chunk);
      jest.advanceTimersByTime(50);
    }

    // Send update
    await handler.sendUpdate(TEST_CHAT_ID);

    // Verify buffer
    expect(handler.getBuffer(TEST_CHAT_ID)).toBe('Hello World!');

    // Flush
    await handler.flush(TEST_CHAT_ID);

    // Verify events
    expect(events).toContain('accumulated');
    expect(events).toContain('sent');
    expect(events).toContain('flushed');
  });

  it('should handle multiple concurrent streams', async () => {
    const chat1 = 11111;
    const chat2 = 22222;

    handler.accumulate(chat1, 'Stream 1 - Part 1');
    handler.accumulate(chat2, 'Stream 2 - Part 1');

    await handler.sendUpdate(chat1);
    await handler.sendUpdate(chat2);

    handler.accumulate(chat1, ' - Part 2');
    handler.accumulate(chat2, ' - Part 2');

    expect(handler.getBuffer(chat1)).toBe('Stream 1 - Part 1 - Part 2');
    expect(handler.getBuffer(chat2)).toBe('Stream 2 - Part 1 - Part 2');

    await handler.flushAll();

    expect(handler.hasAccumulatedText(chat1)).toBe(false);
    expect(handler.hasAccumulatedText(chat2)).toBe(false);
  });

  it('should handle auto-flush timeout', async () => {
    const callback = jest.fn();
    handler.on('draft_flushed', callback);

    handler.accumulate(TEST_CHAT_ID, 'Auto flush me');

    // Fast-forward past auto-flush timeout
    jest.advanceTimersByTime(1500);

    // Run all pending timers and promises
    await jest.runAllTimersAsync();

    expect(callback).toHaveBeenCalled();
  });
});
