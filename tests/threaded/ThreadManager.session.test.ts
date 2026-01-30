import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ThreadManager } from '../../src/threaded/index.js';

const TEST_CHAT_ID = 12345;
const TEST_THREAD_ID = 67890;
const TEST_SESSION_ID = 'session-abc-123';

describe('ThreadManager Session Resolution', () => {
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

  describe('getSessionForThread', () => {
    it('should return undefined when no session is mapped to thread', () => {
      const sessionId = threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID);
      expect(sessionId).toBeUndefined();
    });

    it('should return session ID when session is mapped via mapSessionToThread', () => {
      threadManager.mapSessionToThread(TEST_SESSION_ID, TEST_CHAT_ID, TEST_THREAD_ID);

      const sessionId = threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID);
      expect(sessionId).toBe(TEST_SESSION_ID);
    });

    it('should return session ID when session is mapped via setSessionForThread', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      const sessionId = threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID);
      expect(sessionId).toBe(TEST_SESSION_ID);
    });

    it('should handle string chat IDs', () => {
      const stringChatId = 'chat_abc123';
      threadManager.setSessionForThread(stringChatId, TEST_THREAD_ID, TEST_SESSION_ID);

      const sessionId = threadManager.getSessionForThread(stringChatId, TEST_THREAD_ID);
      expect(sessionId).toBe(TEST_SESSION_ID);
    });
  });

  describe('setSessionForThread', () => {
    it('should create bidirectional mapping', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      // Forward mapping (session -> thread)
      const threadMapping = threadManager.getThreadForSession(TEST_SESSION_ID);
      expect(threadMapping).toEqual({
        chatId: TEST_CHAT_ID,
        threadId: TEST_THREAD_ID,
      });

      // Reverse mapping (thread -> session)
      const sessionId = threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID);
      expect(sessionId).toBe(TEST_SESSION_ID);
    });

    it('should emit session_mapped event', () => {
      const callback = jest.fn();
      threadManager.on('session_mapped', callback);

      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);
    });

    it('should clean up old thread mapping when session already mapped to different thread', () => {
      const oldThreadId = 11111;
      threadManager.setSessionForThread(TEST_CHAT_ID, oldThreadId, TEST_SESSION_ID);

      // Now map same session to new thread
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      // Old thread should no longer have session
      expect(threadManager.getSessionForThread(TEST_CHAT_ID, oldThreadId)).toBeUndefined();

      // New thread should have session
      expect(threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID)).toBe(TEST_SESSION_ID);
    });

    it('should emit session_unmapped when replacing session for thread', () => {
      const oldSessionId = 'old-session-123';
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, oldSessionId);

      const callback = jest.fn();
      threadManager.on('session_unmapped', callback);

      // Replace with new session
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, TEST_THREAD_ID, oldSessionId);
    });

    it('should remove old session forward mapping when replacing', () => {
      const oldSessionId = 'old-session-123';
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, oldSessionId);

      // Replace with new session
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      // Old session should no longer have thread mapping
      expect(threadManager.getThreadForSession(oldSessionId)).toBeUndefined();

      // New session should have thread mapping
      expect(threadManager.getThreadForSession(TEST_SESSION_ID)).toEqual({
        chatId: TEST_CHAT_ID,
        threadId: TEST_THREAD_ID,
      });
    });

    it('should not emit session_unmapped when setting same session', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      const callback = jest.fn();
      threadManager.on('session_unmapped', callback);

      // Set same session again
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('clearSessionForThread', () => {
    it('should remove both forward and reverse mappings', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      threadManager.clearSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID);

      expect(threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID)).toBeUndefined();
      expect(threadManager.getThreadForSession(TEST_SESSION_ID)).toBeUndefined();
    });

    it('should emit session_unmapped event', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      const callback = jest.fn();
      threadManager.on('session_unmapped', callback);

      threadManager.clearSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);
    });

    it('should do nothing if no session mapped to thread', () => {
      const callback = jest.fn();
      threadManager.on('session_unmapped', callback);

      threadManager.clearSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle string chat IDs', () => {
      const stringChatId = 'chat_xyz789';
      threadManager.setSessionForThread(stringChatId, TEST_THREAD_ID, TEST_SESSION_ID);

      threadManager.clearSessionForThread(stringChatId, TEST_THREAD_ID);

      expect(threadManager.getSessionForThread(stringChatId, TEST_THREAD_ID)).toBeUndefined();
    });
  });

  describe('getActiveSessionsPerThread', () => {
    it('should return empty map when no sessions mapped', () => {
      const activeSessions = threadManager.getActiveSessionsPerThread();
      expect(activeSessions.size).toBe(0);
    });

    it('should return all active session-thread mappings', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, 100, 'session-1');
      threadManager.setSessionForThread(TEST_CHAT_ID, 200, 'session-2');
      threadManager.setSessionForThread(22222, 300, 'session-3');

      const activeSessions = threadManager.getActiveSessionsPerThread();

      expect(activeSessions.size).toBe(3);

      const key1 = `chat:${TEST_CHAT_ID}:thread:100`;
      const key2 = `chat:${TEST_CHAT_ID}:thread:200`;
      const key3 = 'chat:22222:thread:300';

      expect(activeSessions.get(key1)).toEqual({
        sessionId: 'session-1',
        chatId: TEST_CHAT_ID,
        threadId: 100,
      });

      expect(activeSessions.get(key2)).toEqual({
        sessionId: 'session-2',
        chatId: TEST_CHAT_ID,
        threadId: 200,
      });

      expect(activeSessions.get(key3)).toEqual({
        sessionId: 'session-3',
        chatId: 22222,
        threadId: 300,
      });
    });

    it('should return a copy not a reference', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      const sessions1 = threadManager.getActiveSessionsPerThread();
      const sessions2 = threadManager.getActiveSessionsPerThread();

      expect(sessions1).not.toBe(sessions2);
    });
  });

  describe('mapSessionToThread with bidirectional mapping', () => {
    it('should update both forward and reverse mappings', () => {
      threadManager.mapSessionToThread(TEST_SESSION_ID, TEST_CHAT_ID, TEST_THREAD_ID);

      // Check forward mapping
      expect(threadManager.getThreadForSession(TEST_SESSION_ID)).toEqual({
        chatId: TEST_CHAT_ID,
        threadId: TEST_THREAD_ID,
      });

      // Check reverse mapping
      expect(threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID)).toBe(TEST_SESSION_ID);
    });

    it('should emit session_mapped event', () => {
      const callback = jest.fn();
      threadManager.on('session_mapped', callback);

      threadManager.mapSessionToThread(TEST_SESSION_ID, TEST_CHAT_ID, TEST_THREAD_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);
    });

    it('should clean up old reverse mapping when remapping session', () => {
      const oldThreadId = 11111;
      threadManager.mapSessionToThread(TEST_SESSION_ID, TEST_CHAT_ID, oldThreadId);

      // Remap to new thread
      threadManager.mapSessionToThread(TEST_SESSION_ID, TEST_CHAT_ID, TEST_THREAD_ID);

      // Old thread should not have session
      expect(threadManager.getSessionForThread(TEST_CHAT_ID, oldThreadId)).toBeUndefined();

      // New thread should have session
      expect(threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID)).toBe(TEST_SESSION_ID);
    });
  });

  describe('unmapSession with bidirectional cleanup', () => {
    it('should remove both forward and reverse mappings', () => {
      threadManager.mapSessionToThread(TEST_SESSION_ID, TEST_CHAT_ID, TEST_THREAD_ID);

      threadManager.unmapSession(TEST_SESSION_ID);

      expect(threadManager.getThreadForSession(TEST_SESSION_ID)).toBeUndefined();
      expect(threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID)).toBeUndefined();
    });

    it('should emit session_unmapped event', () => {
      threadManager.mapSessionToThread(TEST_SESSION_ID, TEST_CHAT_ID, TEST_THREAD_ID);

      const callback = jest.fn();
      threadManager.on('session_unmapped', callback);

      threadManager.unmapSession(TEST_SESSION_ID);

      expect(callback).toHaveBeenCalledWith(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);
    });

    it('should do nothing if session not mapped', () => {
      const callback = jest.fn();
      threadManager.on('session_unmapped', callback);

      threadManager.unmapSession('non-existent-session');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('clearSessionMappings with events', () => {
    it('should emit session_unmapped for all sessions', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, 100, 'session-1');
      threadManager.setSessionForThread(TEST_CHAT_ID, 200, 'session-2');
      threadManager.setSessionForThread(22222, 300, 'session-3');

      const callback = jest.fn();
      threadManager.on('session_unmapped', callback);

      threadManager.clearSessionMappings();

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should clear both forward and reverse mappings', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, 100, 'session-1');
      threadManager.setSessionForThread(TEST_CHAT_ID, 200, 'session-2');

      threadManager.clearSessionMappings();

      expect(threadManager.getSessionForThread(TEST_CHAT_ID, 100)).toBeUndefined();
      expect(threadManager.getSessionForThread(TEST_CHAT_ID, 200)).toBeUndefined();
      expect(threadManager.getThreadForSession('session-1')).toBeUndefined();
      expect(threadManager.getThreadForSession('session-2')).toBeUndefined();
      expect(threadManager.getActiveSessionsPerThread().size).toBe(0);
    });
  });

  describe('generateThreadContextKey', () => {
    it('should generate key with thread ID', () => {
      const key = threadManager.generateThreadContextKey(TEST_CHAT_ID, TEST_THREAD_ID);
      expect(key).toBe(`chat:${TEST_CHAT_ID}:thread:${TEST_THREAD_ID}`);
    });

    it('should use 0 for undefined thread ID', () => {
      const key = threadManager.generateThreadContextKey(TEST_CHAT_ID);
      expect(key).toBe(`chat:${TEST_CHAT_ID}:thread:0`);
    });

    it('should handle string chat IDs', () => {
      const key = threadManager.generateThreadContextKey('string-chat-id', 123);
      expect(key).toBe('chat:string-chat-id:thread:123');
    });
  });

  describe('getThreadsWithSessions', () => {
    it('should return empty array when no sessions mapped', () => {
      const threads = threadManager.getThreadsWithSessions();
      expect(threads).toEqual([]);
    });

    it('should return all thread-session mappings', () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, 100, 'session-1');
      threadManager.setSessionForThread(22222, 200, 'session-2');

      const threads = threadManager.getThreadsWithSessions();

      expect(threads).toHaveLength(2);
      expect(threads).toContainEqual({
        chatId: TEST_CHAT_ID,
        threadId: 100,
        sessionId: 'session-1',
      });
      expect(threads).toContainEqual({
        chatId: 22222,
        threadId: 200,
        sessionId: 'session-2',
      });
    });
  });

  describe('shutdown clears session mappings', () => {
    it('should clear all session mappings on shutdown', async () => {
      threadManager.setSessionForThread(TEST_CHAT_ID, 100, 'session-1');
      threadManager.setSessionForThread(TEST_CHAT_ID, 200, 'session-2');

      await threadManager.shutdown();

      // Create new manager to verify state is cleared
      const newManager = new ThreadManager();
      expect(newManager.getActiveSessionsPerThread().size).toBe(0);
      await newManager.shutdown();
    });
  });

  describe('thread key format', () => {
    it('should use consistent key format for lookups', () => {
      // Map using setSessionForThread
      threadManager.setSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID, TEST_SESSION_ID);

      // Should be retrievable using getSessionForThread
      const sessionId = threadManager.getSessionForThread(TEST_CHAT_ID, TEST_THREAD_ID);
      expect(sessionId).toBe(TEST_SESSION_ID);

      // Active sessions should use the same key format
      const activeSessions = threadManager.getActiveSessionsPerThread();
      const expectedKey = `chat:${TEST_CHAT_ID}:thread:${TEST_THREAD_ID}`;
      expect(activeSessions.has(expectedKey)).toBe(true);
    });
  });

  describe('multiple chats with same thread IDs', () => {
    it('should maintain separate mappings for different chats', () => {
      const chat1 = 11111;
      const chat2 = 22222;
      const sharedThreadId = 100;

      threadManager.setSessionForThread(chat1, sharedThreadId, 'session-chat1');
      threadManager.setSessionForThread(chat2, sharedThreadId, 'session-chat2');

      expect(threadManager.getSessionForThread(chat1, sharedThreadId)).toBe('session-chat1');
      expect(threadManager.getSessionForThread(chat2, sharedThreadId)).toBe('session-chat2');
    });
  });
});
