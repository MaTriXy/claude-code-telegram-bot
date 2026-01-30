import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ThreadManager,
  DEFAULT_THREAD_MANAGER_CONFIG,
  TopicHandler,
  DEFAULT_TOPIC_HANDLER_CONFIG,
  TOPIC_ICON_COLORS,
} from '../../src/threaded/index.js';
import type { ThreadManagerConfig } from '../../src/threaded/index.js';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

const TEST_BOT_TOKEN = 'test-bot-token-123';
const TEST_CHAT_ID = 12345;
const TEST_THREAD_ID = 67890;
const TEST_USER_ID = 11111;

describe('ThreadManager', () => {
  let threadManager: ThreadManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    threadManager = new ThreadManager();
  });

  afterEach(async () => {
    await threadManager.shutdown();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      expect(threadManager).toBeInstanceOf(ThreadManager);
      expect(threadManager.getConfig()).toEqual(DEFAULT_THREAD_MANAGER_CONFIG);
    });

    it('should create manager with custom config', () => {
      const customConfig: Partial<ThreadManagerConfig> = {
        enabled: false,
        defaultThreadId: 100,
        autoCreateTopics: true,
        topicNamePrefix: 'Custom',
        inactivityTimeoutMs: 30 * 60 * 1000,
      };

      const manager = new ThreadManager(customConfig);
      const config = manager.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.defaultThreadId).toBe(100);
      expect(config.autoCreateTopics).toBe(true);
      expect(config.topicNamePrefix).toBe('Custom');
      expect(config.inactivityTimeoutMs).toBe(30 * 60 * 1000);

      manager.shutdown();
    });
  });

  describe('configuration', () => {
    it('should get and set config', () => {
      threadManager.setConfig({ enabled: false, defaultThreadId: 200 });

      const config = threadManager.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.defaultThreadId).toBe(200);
    });

    it('should check if enabled', () => {
      expect(threadManager.isEnabled()).toBe(true);

      threadManager.setConfig({ enabled: false });
      expect(threadManager.isEnabled()).toBe(false);
    });
  });

  describe('setThread', () => {
    it('should set thread for a chat', () => {
      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);

      expect(threadManager.getThreadId(TEST_CHAT_ID)).toBe(TEST_THREAD_ID);
      expect(threadManager.hasActiveThread(TEST_CHAT_ID)).toBe(true);
    });

    it('should set thread with user-specific preference', () => {
      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_USER_ID);

      // User should get their preference
      expect(threadManager.getThreadId(TEST_CHAT_ID, TEST_USER_ID)).toBe(TEST_THREAD_ID);

      // Without user ID, should fall back to default (undefined)
      expect(threadManager.getThreadId(TEST_CHAT_ID)).toBeUndefined();
    });

    it('should emit thread_set event', () => {
      const callback = jest.fn();
      threadManager.on('thread_set', callback);

      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_USER_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, TEST_THREAD_ID, TEST_USER_ID);
    });

    it('should set forum enabled when setting thread', () => {
      expect(threadManager.isForumEnabled(TEST_CHAT_ID)).toBe(false);

      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);

      expect(threadManager.isForumEnabled(TEST_CHAT_ID)).toBe(true);
    });

    it('should throw error when shutting down', async () => {
      await threadManager.shutdown();

      expect(() => threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID))
        .toThrow('shutting down');
    });
  });

  describe('getThreadId', () => {
    it('should return undefined when no thread is set', () => {
      expect(threadManager.getThreadId(TEST_CHAT_ID)).toBeUndefined();
    });

    it('should return default thread ID from config', () => {
      threadManager.setConfig({ defaultThreadId: 999 });

      expect(threadManager.getThreadId(TEST_CHAT_ID)).toBe(999);
    });

    it('should prioritize user preference over chat default', () => {
      threadManager.setThread(TEST_CHAT_ID, 100); // Chat default
      threadManager.setThread(TEST_CHAT_ID, 200, TEST_USER_ID); // User preference

      expect(threadManager.getThreadId(TEST_CHAT_ID)).toBe(100);
      expect(threadManager.getThreadId(TEST_CHAT_ID, TEST_USER_ID)).toBe(200);
    });

    it('should fall back to chat default when no user preference', () => {
      threadManager.setThread(TEST_CHAT_ID, 100);

      expect(threadManager.getThreadId(TEST_CHAT_ID, TEST_USER_ID)).toBe(100);
    });
  });

  describe('clearThread', () => {
    it('should clear chat default thread', () => {
      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);
      expect(threadManager.hasActiveThread(TEST_CHAT_ID)).toBe(true);

      threadManager.clearThread(TEST_CHAT_ID);
      expect(threadManager.hasActiveThread(TEST_CHAT_ID)).toBe(false);
    });

    it('should clear only user-specific preference', () => {
      threadManager.setThread(TEST_CHAT_ID, 100); // Chat default
      threadManager.setThread(TEST_CHAT_ID, 200, TEST_USER_ID); // User preference

      threadManager.clearThread(TEST_CHAT_ID, TEST_USER_ID);

      // User preference should be cleared, falls back to chat default
      expect(threadManager.getThreadId(TEST_CHAT_ID, TEST_USER_ID)).toBe(100);
      // Chat default should still be set
      expect(threadManager.getThreadId(TEST_CHAT_ID)).toBe(100);
    });

    it('should emit thread_cleared event', () => {
      const callback = jest.fn();
      threadManager.on('thread_cleared', callback);

      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);
      threadManager.clearThread(TEST_CHAT_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, undefined);
    });

    it('should handle clearing non-existent thread', () => {
      // Should not throw
      threadManager.clearThread(99999);
    });
  });

  describe('hasActiveThread', () => {
    it('should return false when no thread is set', () => {
      expect(threadManager.hasActiveThread(TEST_CHAT_ID)).toBe(false);
    });

    it('should return true when chat thread is set', () => {
      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);
      expect(threadManager.hasActiveThread(TEST_CHAT_ID)).toBe(true);
    });

    it('should return true when user preference is set', () => {
      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_USER_ID);
      expect(threadManager.hasActiveThread(TEST_CHAT_ID, TEST_USER_ID)).toBe(true);
    });

    it('should return true when default thread is set in config', () => {
      threadManager.setConfig({ defaultThreadId: 999 });
      expect(threadManager.hasActiveThread(TEST_CHAT_ID)).toBe(true);
    });
  });

  describe('setForumEnabled', () => {
    it('should set forum enabled status', () => {
      threadManager.setForumEnabled(TEST_CHAT_ID, true);
      expect(threadManager.isForumEnabled(TEST_CHAT_ID)).toBe(true);

      threadManager.setForumEnabled(TEST_CHAT_ID, false);
      expect(threadManager.isForumEnabled(TEST_CHAT_ID)).toBe(false);
    });
  });

  describe('getThreadContext', () => {
    it('should return null when no thread is active', () => {
      expect(threadManager.getThreadContext(TEST_CHAT_ID)).toBeNull();
    });

    it('should return valid context when thread is set', () => {
      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);

      const context = threadManager.getThreadContext(TEST_CHAT_ID);

      expect(context).toEqual({
        message_thread_id: TEST_THREAD_ID,
        is_topic_message: true,
      });
    });

    it('should return context with user preference', () => {
      threadManager.setThread(TEST_CHAT_ID, 100);
      threadManager.setThread(TEST_CHAT_ID, 200, TEST_USER_ID);

      const context = threadManager.getThreadContext(TEST_CHAT_ID, TEST_USER_ID);

      expect(context?.message_thread_id).toBe(200);
    });
  });

  describe('getAllThreadIds', () => {
    it('should return empty array when no threads set', () => {
      expect(threadManager.getAllThreadIds(TEST_CHAT_ID)).toEqual([]);
    });

    it('should return all unique thread IDs', () => {
      threadManager.setThread(TEST_CHAT_ID, 100);
      threadManager.setThread(TEST_CHAT_ID, 200, TEST_USER_ID);
      threadManager.setThread(TEST_CHAT_ID, 300, 22222);

      const threadIds = threadManager.getAllThreadIds(TEST_CHAT_ID);

      expect(threadIds).toHaveLength(3);
      expect(threadIds).toContain(100);
      expect(threadIds).toContain(200);
      expect(threadIds).toContain(300);
    });

    it('should not duplicate thread IDs', () => {
      threadManager.setThread(TEST_CHAT_ID, 100);
      threadManager.setThread(TEST_CHAT_ID, 100, TEST_USER_ID); // Same thread ID

      const threadIds = threadManager.getAllThreadIds(TEST_CHAT_ID);

      expect(threadIds).toHaveLength(1);
      expect(threadIds).toContain(100);
    });
  });

  describe('getActiveChatCount', () => {
    it('should return 0 when no chats have threads', () => {
      expect(threadManager.getActiveChatCount()).toBe(0);
    });

    it('should return count of active chats', () => {
      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);
      threadManager.setThread(22222, 100);
      threadManager.setThread(33333, 200);

      expect(threadManager.getActiveChatCount()).toBe(3);
    });
  });

  describe('getActiveChatIds', () => {
    it('should return empty array when no chats active', () => {
      expect(threadManager.getActiveChatIds()).toEqual([]);
    });

    it('should return all active chat IDs', () => {
      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);
      threadManager.setThread(22222, 100);

      const chatIds = threadManager.getActiveChatIds();

      expect(chatIds).toHaveLength(2);
      expect(chatIds).toContain(TEST_CHAT_ID);
      expect(chatIds).toContain(22222);
    });
  });

  describe('clearChat', () => {
    it('should clear all thread data for a chat', () => {
      threadManager.setThread(TEST_CHAT_ID, 100);
      threadManager.setThread(TEST_CHAT_ID, 200, TEST_USER_ID);

      threadManager.clearChat(TEST_CHAT_ID);

      expect(threadManager.hasActiveThread(TEST_CHAT_ID)).toBe(false);
      expect(threadManager.hasActiveThread(TEST_CHAT_ID, TEST_USER_ID)).toBe(false);
      expect(threadManager.isForumEnabled(TEST_CHAT_ID)).toBe(false);
    });

    it('should emit thread_cleared event', () => {
      const callback = jest.fn();
      threadManager.on('thread_cleared', callback);

      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);
      threadManager.clearChat(TEST_CHAT_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID);
    });
  });

  describe('clearAll', () => {
    it('should clear all thread data', () => {
      threadManager.setThread(TEST_CHAT_ID, 100);
      threadManager.setThread(22222, 200);
      threadManager.setThread(33333, 300);

      threadManager.clearAll();

      expect(threadManager.getActiveChatCount()).toBe(0);
    });

    it('should emit thread_cleared for each chat', () => {
      const callback = jest.fn();
      threadManager.on('thread_cleared', callback);

      threadManager.setThread(TEST_CHAT_ID, 100);
      threadManager.setThread(22222, 200);

      threadManager.clearAll();

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('inactivity cleanup', () => {
    it('should clean up inactive threads after timeout', () => {
      const shortTimeout = new ThreadManager({
        inactivityTimeoutMs: 1000, // 1 second
      });

      shortTimeout.setThread(TEST_CHAT_ID, TEST_THREAD_ID);
      expect(shortTimeout.hasActiveThread(TEST_CHAT_ID)).toBe(true);

      // Advance time past timeout
      jest.advanceTimersByTime(2000);

      expect(shortTimeout.hasActiveThread(TEST_CHAT_ID)).toBe(false);

      shortTimeout.shutdown();
    });

    it('should not clean up active threads', () => {
      const shortTimeout = new ThreadManager({
        inactivityTimeoutMs: 1000,
      });

      shortTimeout.setThread(TEST_CHAT_ID, TEST_THREAD_ID);

      // Advance time, but access thread to update activity
      jest.advanceTimersByTime(500);
      shortTimeout.getThreadId(TEST_CHAT_ID); // Updates lastActivity

      jest.advanceTimersByTime(500);
      shortTimeout.getThreadId(TEST_CHAT_ID); // Updates lastActivity again

      expect(shortTimeout.hasActiveThread(TEST_CHAT_ID)).toBe(true);

      shortTimeout.shutdown();
    });
  });

  describe('shutdown', () => {
    it('should clean up all state on shutdown', async () => {
      threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID);
      threadManager.setThread(22222, 100);

      await threadManager.shutdown();

      expect(threadManager.getActiveChatCount()).toBe(0);
    });

    it('should prevent new threads after shutdown', async () => {
      await threadManager.shutdown();

      expect(() => threadManager.setThread(TEST_CHAT_ID, TEST_THREAD_ID))
        .toThrow('shutting down');
    });
  });
});

describe('TopicHandler', () => {
  let topicHandler: TopicHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default successful response
    mockFetch.mockResolvedValue({
      json: async () => ({ ok: true, result: true }),
    } as Response);

    topicHandler = new TopicHandler(TEST_BOT_TOKEN);
  });

  afterEach(async () => {
    await topicHandler.shutdown();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create handler with default config', () => {
      expect(topicHandler).toBeInstanceOf(TopicHandler);
      expect(topicHandler.getConfig()).toEqual(DEFAULT_TOPIC_HANDLER_CONFIG);
    });

    it('should create handler with custom config', () => {
      const handler = new TopicHandler(TEST_BOT_TOKEN, {
        maxCachedTopicsPerChat: 50,
        cacheTtlMs: 10 * 60 * 1000,
      });

      const config = handler.getConfig();
      expect(config.maxCachedTopicsPerChat).toBe(50);
      expect(config.cacheTtlMs).toBe(10 * 60 * 1000);

      handler.shutdown();
    });
  });

  describe('checkForumEnabled', () => {
    it('should return true for forum-enabled chat', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            id: TEST_CHAT_ID,
            type: 'supergroup',
            is_forum: true,
          },
        }),
      } as Response);

      const result = await topicHandler.checkForumEnabled(TEST_CHAT_ID);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_BOT_TOKEN}/getChat`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ chat_id: TEST_CHAT_ID }),
        })
      );
    });

    it('should return false for non-forum chat', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            id: TEST_CHAT_ID,
            type: 'supergroup',
            is_forum: false,
          },
        }),
      } as Response);

      const result = await topicHandler.checkForumEnabled(TEST_CHAT_ID);

      expect(result).toBe(false);
    });

    it('should cache forum status', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            id: TEST_CHAT_ID,
            type: 'supergroup',
            is_forum: true,
          },
        }),
      } as Response);

      // First call
      await topicHandler.checkForumEnabled(TEST_CHAT_ID);
      // Second call should use cache
      await topicHandler.checkForumEnabled(TEST_CHAT_ID);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await topicHandler.checkForumEnabled(TEST_CHAT_ID);

      expect(result).toBe(false);
    });
  });

  describe('createTopic', () => {
    it('should create a forum topic', async () => {
      const topicResponse = {
        ok: true,
        result: {
          message_thread_id: TEST_THREAD_ID,
          name: 'Test Topic',
          icon_color: TOPIC_ICON_COLORS[0],
        },
      };

      mockFetch.mockResolvedValueOnce({
        json: async () => topicResponse,
      } as Response);

      const topic = await topicHandler.createTopic(TEST_CHAT_ID, {
        name: 'Test Topic',
      });

      expect(topic.message_thread_id).toBe(TEST_THREAD_ID);
      expect(topic.name).toBe('Test Topic');
    });

    it('should emit topic_created event', async () => {
      const callback = jest.fn();
      topicHandler.on('topic_created', callback);

      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      await topicHandler.createTopic(TEST_CHAT_ID, { name: 'Test Topic' });

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, expect.objectContaining({
        message_thread_id: TEST_THREAD_ID,
      }));
    });

    it('should use provided icon color', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Topic',
            icon_color: TOPIC_ICON_COLORS[2],
          },
        }),
      } as Response);

      await topicHandler.createTopic(TEST_CHAT_ID, {
        name: 'Test Topic',
        icon_color: TOPIC_ICON_COLORS[2],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.icon_color).toBe(TOPIC_ICON_COLORS[2]);
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
      topicHandler.on('error', errorCallback);

      await expect(topicHandler.createTopic(TEST_CHAT_ID, { name: 'Test' }))
        .rejects.toThrow('Telegram API error');

      expect(errorCallback).toHaveBeenCalled();
    });

    it('should handle rate limiting', async () => {
      const rateLimitCallback = jest.fn();
      const errorCallback = jest.fn();
      topicHandler.on('rate_limited', rateLimitCallback);
      topicHandler.on('error', errorCallback);

      // Override the default mock for this specific test
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          json: () => Promise.resolve({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests',
            parameters: { retry_after: 5 },
          }),
        } as Response)
      );

      await expect(topicHandler.createTopic(TEST_CHAT_ID, { name: 'Test' }))
        .rejects.toThrow('Telegram API error');

      expect(rateLimitCallback).toHaveBeenCalledWith(5, TEST_CHAT_ID);
    });
  });

  describe('listTopics', () => {
    it('should return empty array when no topics cached', () => {
      const topics = topicHandler.listTopics(TEST_CHAT_ID);
      expect(topics).toEqual([]);
    });

    it('should return cached topics after creation', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      await topicHandler.createTopic(TEST_CHAT_ID, { name: 'Test Topic' });

      const topics = topicHandler.listTopics(TEST_CHAT_ID);

      expect(topics).toHaveLength(1);
      expect(topics[0].name).toBe('Test Topic');
    });

    it('should return copy of cached topics', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      await topicHandler.createTopic(TEST_CHAT_ID, { name: 'Test Topic' });

      const topics1 = topicHandler.listTopics(TEST_CHAT_ID);
      const topics2 = topicHandler.listTopics(TEST_CHAT_ID);

      expect(topics1).not.toBe(topics2);
    });
  });

  describe('deleteTopic', () => {
    it('should delete a forum topic', async () => {
      mockFetch.mockResolvedValue({
        json: async () => ({ ok: true, result: true }),
      } as Response);

      // First create a topic
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      await topicHandler.createTopic(TEST_CHAT_ID, { name: 'Test Topic' });

      // Then delete it
      await topicHandler.deleteTopic(TEST_CHAT_ID, TEST_THREAD_ID);

      const topics = topicHandler.listTopics(TEST_CHAT_ID);
      expect(topics).toHaveLength(0);
    });

    it('should emit topic_deleted event', async () => {
      const callback = jest.fn();
      topicHandler.on('topic_deleted', callback);

      await topicHandler.deleteTopic(TEST_CHAT_ID, TEST_THREAD_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, TEST_THREAD_ID);
    });
  });

  describe('reopenTopic', () => {
    it('should reopen a closed forum topic', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ ok: true, result: true }),
      } as Response);

      await topicHandler.reopenTopic(TEST_CHAT_ID, TEST_THREAD_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${TEST_BOT_TOKEN}/reopenForumTopic`,
        expect.objectContaining({
          body: JSON.stringify({
            chat_id: TEST_CHAT_ID,
            message_thread_id: TEST_THREAD_ID,
          }),
        })
      );
    });
  });

  describe('editTopic', () => {
    it('should edit topic name', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ ok: true, result: true }),
      } as Response);

      await topicHandler.editTopic(TEST_CHAT_ID, TEST_THREAD_ID, {
        name: 'Updated Name',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(body.name).toBe('Updated Name');
    });
  });

  describe('getGeneralTopicId', () => {
    it('should return 1 (General topic)', () => {
      expect(topicHandler.getGeneralTopicId()).toBe(1);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for a chat', async () => {
      // Create a topic to populate cache
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      await topicHandler.createTopic(TEST_CHAT_ID, { name: 'Test Topic' });
      expect(topicHandler.listTopics(TEST_CHAT_ID)).toHaveLength(1);

      topicHandler.clearCache(TEST_CHAT_ID);
      expect(topicHandler.listTopics(TEST_CHAT_ID)).toHaveLength(0);
    });
  });

  describe('clearAllCaches', () => {
    it('should clear all caches', async () => {
      // Create topics in multiple chats
      mockFetch.mockResolvedValue({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      await topicHandler.createTopic(TEST_CHAT_ID, { name: 'Topic 1' });
      await topicHandler.createTopic(22222, { name: 'Topic 2' });

      topicHandler.clearAllCaches();

      expect(topicHandler.listTopics(TEST_CHAT_ID)).toHaveLength(0);
      expect(topicHandler.listTopics(22222)).toHaveLength(0);
    });
  });

  describe('shutdown', () => {
    it('should clear caches on shutdown', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      await topicHandler.createTopic(TEST_CHAT_ID, { name: 'Test Topic' });

      await topicHandler.shutdown();

      expect(topicHandler.listTopics(TEST_CHAT_ID)).toHaveLength(0);
    });

    it('should prevent new operations after shutdown', async () => {
      await topicHandler.shutdown();

      await expect(topicHandler.createTopic(TEST_CHAT_ID, { name: 'Test' }))
        .rejects.toThrow('shutting down');
    });
  });
});

describe('TOPIC_ICON_COLORS', () => {
  it('should have 6 preset colors', () => {
    expect(TOPIC_ICON_COLORS).toHaveLength(6);
  });

  it('should contain valid RGB integer values', () => {
    for (const color of TOPIC_ICON_COLORS) {
      expect(typeof color).toBe('number');
      expect(color).toBeGreaterThan(0);
      expect(color).toBeLessThanOrEqual(0xFFFFFF);
    }
  });
});

describe('ThreadManager with TopicHandler', () => {
  let threadManager: ThreadManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockFetch.mockResolvedValue({
      json: async () => ({ ok: true, result: true }),
    } as Response);

    // Create ThreadManager with bot token to enable TopicHandler
    threadManager = new ThreadManager({
      autoCreateTopics: true,
      topicNamePrefix: 'Test Chat',
    }, TEST_BOT_TOKEN);
  });

  afterEach(async () => {
    await threadManager.shutdown();
    jest.useRealTimers();
  });

  describe('createTopic', () => {
    it('should create a forum topic via TopicHandler', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'My Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      const topic = await threadManager.createTopic(TEST_CHAT_ID, {
        name: 'My Topic',
      });

      expect(topic.message_thread_id).toBe(TEST_THREAD_ID);
      expect(topic.name).toBe('My Topic');
    });

    it('should emit topic_created event', async () => {
      const callback = jest.fn();
      threadManager.on('topic_created', callback);

      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Event Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      await threadManager.createTopic(TEST_CHAT_ID, { name: 'Event Topic' });

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, expect.objectContaining({
        message_thread_id: TEST_THREAD_ID,
      }));
    });

    it('should auto-generate topic name when autoCreateTopics is enabled', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Chat 1234567890',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      const topic = await threadManager.createTopic(TEST_CHAT_ID, {
        name: '', // Empty name should trigger auto-generation
      });

      expect(topic).toBeDefined();
      // The actual name will include timestamp, just verify the call was made
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should throw error when TopicHandler is not initialized', async () => {
      const managerWithoutToken = new ThreadManager();

      await expect(managerWithoutToken.createTopic(TEST_CHAT_ID, { name: 'Test' }))
        .rejects.toThrow('TopicHandler not initialized');

      await managerWithoutToken.shutdown();
    });

    it('should set forum enabled after creating topic', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      expect(threadManager.isForumEnabled(TEST_CHAT_ID)).toBe(false);

      await threadManager.createTopic(TEST_CHAT_ID, { name: 'Test Topic' });

      expect(threadManager.isForumEnabled(TEST_CHAT_ID)).toBe(true);
    });
  });

  describe('listTopics', () => {
    it('should list topics from cache', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Cached Topic',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      await threadManager.createTopic(TEST_CHAT_ID, { name: 'Cached Topic' });

      const topics = threadManager.listTopics(TEST_CHAT_ID);

      expect(topics).toHaveLength(1);
      expect(topics[0].name).toBe('Cached Topic');
    });

    it('should return empty array when no topics cached', () => {
      const topics = threadManager.listTopics(TEST_CHAT_ID);
      expect(topics).toEqual([]);
    });

    it('should return empty array when TopicHandler is not initialized', () => {
      const managerWithoutToken = new ThreadManager();
      const topics = managerWithoutToken.listTopics(TEST_CHAT_ID);
      expect(topics).toEqual([]);
      managerWithoutToken.shutdown();
    });
  });

  describe('checkForumEnabled', () => {
    it('should check forum status via API', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            id: TEST_CHAT_ID,
            type: 'supergroup',
            is_forum: true,
          },
        }),
      } as Response);

      const result = await threadManager.checkForumEnabled(TEST_CHAT_ID);

      expect(result).toBe(true);
      expect(threadManager.isForumEnabled(TEST_CHAT_ID)).toBe(true);
    });

    it('should return false when TopicHandler is not initialized', async () => {
      const managerWithoutToken = new ThreadManager();
      const result = await managerWithoutToken.checkForumEnabled(TEST_CHAT_ID);
      expect(result).toBe(false);
      managerWithoutToken.shutdown();
    });
  });

  describe('getGeneralTopicId', () => {
    it('should return 1 (General topic)', () => {
      expect(threadManager.getGeneralTopicId()).toBe(1);
    });

    it('should return 1 even when TopicHandler is not initialized', () => {
      const managerWithoutToken = new ThreadManager();
      expect(managerWithoutToken.getGeneralTopicId()).toBe(1);
      managerWithoutToken.shutdown();
    });
  });

  describe('setTopicHandler', () => {
    it('should allow setting TopicHandler after construction', async () => {
      const managerWithoutToken = new ThreadManager();

      // Initially should fail
      await expect(managerWithoutToken.createTopic(TEST_CHAT_ID, { name: 'Test' }))
        .rejects.toThrow('TopicHandler not initialized');

      // Set TopicHandler
      managerWithoutToken.setTopicHandler(TEST_BOT_TOKEN);

      // Now should work
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: TEST_THREAD_ID,
            name: 'Test',
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      const topic = await managerWithoutToken.createTopic(TEST_CHAT_ID, { name: 'Test' });
      expect(topic.message_thread_id).toBe(TEST_THREAD_ID);

      await managerWithoutToken.shutdown();
    });
  });
});

describe('ThreadManager Session Mapping', () => {
  let threadManager: ThreadManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    threadManager = new ThreadManager();
  });

  afterEach(async () => {
    await threadManager.shutdown();
    jest.useRealTimers();
  });

  describe('mapSessionToThread', () => {
    it('should map a session to a thread', () => {
      threadManager.mapSessionToThread('session-123', TEST_CHAT_ID, TEST_THREAD_ID);

      const mapping = threadManager.getThreadForSession('session-123');

      expect(mapping).toEqual({
        chatId: TEST_CHAT_ID,
        threadId: TEST_THREAD_ID,
      });
    });

    it('should overwrite existing mapping', () => {
      threadManager.mapSessionToThread('session-123', TEST_CHAT_ID, 100);
      threadManager.mapSessionToThread('session-123', TEST_CHAT_ID, 200);

      const mapping = threadManager.getThreadForSession('session-123');

      expect(mapping?.threadId).toBe(200);
    });
  });

  describe('getThreadForSession', () => {
    it('should return undefined for unmapped session', () => {
      const mapping = threadManager.getThreadForSession('non-existent');
      expect(mapping).toBeUndefined();
    });
  });

  describe('unmapSession', () => {
    it('should remove session mapping', () => {
      threadManager.mapSessionToThread('session-123', TEST_CHAT_ID, TEST_THREAD_ID);
      expect(threadManager.getThreadForSession('session-123')).toBeDefined();

      threadManager.unmapSession('session-123');

      expect(threadManager.getThreadForSession('session-123')).toBeUndefined();
    });
  });

  describe('getAllSessionMappings', () => {
    it('should return all session mappings', () => {
      threadManager.mapSessionToThread('session-1', TEST_CHAT_ID, 100);
      threadManager.mapSessionToThread('session-2', TEST_CHAT_ID, 200);
      threadManager.mapSessionToThread('session-3', 22222, 300);

      const mappings = threadManager.getAllSessionMappings();

      expect(mappings.size).toBe(3);
      expect(mappings.get('session-1')?.threadId).toBe(100);
      expect(mappings.get('session-2')?.threadId).toBe(200);
      expect(mappings.get('session-3')?.threadId).toBe(300);
    });

    it('should return a copy of mappings', () => {
      threadManager.mapSessionToThread('session-1', TEST_CHAT_ID, 100);

      const mappings1 = threadManager.getAllSessionMappings();
      const mappings2 = threadManager.getAllSessionMappings();

      expect(mappings1).not.toBe(mappings2);
    });
  });

  describe('clearSessionMappings', () => {
    it('should clear all session mappings', () => {
      threadManager.mapSessionToThread('session-1', TEST_CHAT_ID, 100);
      threadManager.mapSessionToThread('session-2', TEST_CHAT_ID, 200);

      threadManager.clearSessionMappings();

      expect(threadManager.getAllSessionMappings().size).toBe(0);
    });
  });
});

describe('ThreadManager thread_changed event', () => {
  let threadManager: ThreadManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    threadManager = new ThreadManager();
  });

  afterEach(async () => {
    await threadManager.shutdown();
    jest.useRealTimers();
  });

  it('should emit thread_changed when thread changes for chat', () => {
    const callback = jest.fn();
    threadManager.on('thread_changed', callback);

    threadManager.setThread(TEST_CHAT_ID, 100);

    expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, undefined, 100, undefined);
  });

  it('should emit thread_changed with old thread ID when changing threads', () => {
    const callback = jest.fn();
    threadManager.on('thread_changed', callback);

    threadManager.setThread(TEST_CHAT_ID, 100);
    threadManager.setThread(TEST_CHAT_ID, 200);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, TEST_CHAT_ID, undefined, 100, undefined);
    expect(callback).toHaveBeenNthCalledWith(2, TEST_CHAT_ID, 100, 200, undefined);
  });

  it('should emit thread_changed for user-specific thread changes', () => {
    const callback = jest.fn();
    threadManager.on('thread_changed', callback);

    threadManager.setThread(TEST_CHAT_ID, 100, TEST_USER_ID);
    threadManager.setThread(TEST_CHAT_ID, 200, TEST_USER_ID);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, TEST_CHAT_ID, undefined, 100, TEST_USER_ID);
    expect(callback).toHaveBeenNthCalledWith(2, TEST_CHAT_ID, 100, 200, TEST_USER_ID);
  });

  it('should not emit thread_changed when setting same thread ID', () => {
    const callback = jest.fn();
    threadManager.on('thread_changed', callback);

    threadManager.setThread(TEST_CHAT_ID, 100);
    threadManager.setThread(TEST_CHAT_ID, 100); // Same thread

    expect(callback).toHaveBeenCalledTimes(1); // Only first call
  });
});

describe('Integration: ThreadManager + TopicHandler', () => {
  let threadManager: ThreadManager;
  let topicHandler: TopicHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockFetch.mockResolvedValue({
      json: async () => ({ ok: true, result: true }),
    } as Response);

    threadManager = new ThreadManager({
      autoCreateTopics: true,
    });
    topicHandler = new TopicHandler(TEST_BOT_TOKEN);
  });

  afterEach(async () => {
    await threadManager.shutdown();
    await topicHandler.shutdown();
    jest.useRealTimers();
  });

  it('should work together for threaded conversation management', async () => {
    // Check if forum is enabled
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        result: {
          id: TEST_CHAT_ID,
          type: 'supergroup',
          is_forum: true,
        },
      }),
    } as Response);

    const forumEnabled = await topicHandler.checkForumEnabled(TEST_CHAT_ID);
    expect(forumEnabled).toBe(true);

    // Create a topic
    mockFetch.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        result: {
          message_thread_id: TEST_THREAD_ID,
          name: 'User Conversation',
          icon_color: TOPIC_ICON_COLORS[0],
        },
      }),
    } as Response);

    const topic = await topicHandler.createTopic(TEST_CHAT_ID, {
      name: 'User Conversation',
    });

    // Set thread in thread manager
    threadManager.setForumEnabled(TEST_CHAT_ID, true);
    threadManager.setThread(TEST_CHAT_ID, topic.message_thread_id, TEST_USER_ID);

    // Verify thread context is available
    const context = threadManager.getThreadContext(TEST_CHAT_ID, TEST_USER_ID);

    expect(context).not.toBeNull();
    expect(context?.message_thread_id).toBe(TEST_THREAD_ID);
    expect(context?.is_topic_message).toBe(true);

    // Verify topic is in handler's cache
    const topics = topicHandler.listTopics(TEST_CHAT_ID);
    expect(topics).toHaveLength(1);
    expect(topics[0].name).toBe('User Conversation');
  });

  it('should handle multiple users with different threads', async () => {
    // Create topics for different users
    const topics = [
      { userId: 111, threadId: 1001, name: 'User 111 Chat' },
      { userId: 222, threadId: 1002, name: 'User 222 Chat' },
      { userId: 333, threadId: 1003, name: 'User 333 Chat' },
    ];

    for (const { userId, threadId, name } of topics) {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: {
            message_thread_id: threadId,
            name,
            icon_color: TOPIC_ICON_COLORS[0],
          },
        }),
      } as Response);

      const topic = await topicHandler.createTopic(TEST_CHAT_ID, { name });
      threadManager.setThread(TEST_CHAT_ID, topic.message_thread_id, userId);
    }

    // Verify each user has their own thread
    expect(threadManager.getThreadId(TEST_CHAT_ID, 111)).toBe(1001);
    expect(threadManager.getThreadId(TEST_CHAT_ID, 222)).toBe(1002);
    expect(threadManager.getThreadId(TEST_CHAT_ID, 333)).toBe(1003);

    // Verify all threads are tracked
    const allThreadIds = threadManager.getAllThreadIds(TEST_CHAT_ID);
    expect(allThreadIds).toHaveLength(3);
    expect(allThreadIds).toContain(1001);
    expect(allThreadIds).toContain(1002);
    expect(allThreadIds).toContain(1003);
  });
});
