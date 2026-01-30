import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { StreamingTelegramBotConfig, SessionContext, Session } from '../../src/types/index.js';

// Session storage for mock SessionManager - these need to be initialized early
let mockSessions: Map<string, Session> = new Map();
let mockActiveSessionId: string | undefined;
let mockContextualSessions: Map<string, string> = new Map();

// Thread storage for mock ThreadManager
let mockThreadSessionMap: Map<string, string> = new Map();
let mockSessionThreadMap: Map<string, { chatId: number | string; threadId: number }> = new Map();

// Reset mock state before creating new instances
const resetMockState = () => {
  mockSessions = new Map();
  mockActiveSessionId = undefined;
  mockContextualSessions = new Map();
};

const resetThreadMocks = () => {
  mockThreadSessionMap = new Map();
  mockSessionThreadMap = new Map();
};

// Helper to generate context keys
function generateContextKey(context: SessionContext): string {
  const parts: string[] = [`chat:${context.chatId}`];
  if (context.userId !== undefined) {
    parts.push(`user:${context.userId}`);
  }
  if (context.threadId !== undefined) {
    parts.push(`thread:${context.threadId}`);
  }
  return parts.join(':');
}

// Helper to generate thread keys
const getThreadKey = (chatId: number | string, threadId: number): string => {
  return `chat:${chatId}:thread:${threadId}`;
};

// Mock telegraf
jest.mock('telegraf', () => {
  const mockBot = {
    command: jest.fn(),
    action: jest.fn(),
    on: jest.fn(),
    use: jest.fn(),
    catch: jest.fn(),
    launch: jest.fn().mockResolvedValue(undefined as never),
    stop: jest.fn(),
    telegram: {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 } as never),
      getMe: jest.fn().mockResolvedValue({ username: 'test_bot' } as never),
    },
  };
  return {
    Telegraf: jest.fn(() => mockBot),
  };
});

// Mock SessionManager
jest.mock('../../src/session/SessionManager.js', () => {
  return {
    SessionManager: jest.fn().mockImplementation(() => ({
      createSession: jest.fn(async (name: string): Promise<Session> => {
        const session: Session = {
          id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          name,
          workingDir: '/tmp',
          status: 'idle',
          createdAt: new Date(),
          lastActivity: new Date(),
        };
        mockSessions.set(session.id, session);
        mockActiveSessionId = session.id;
        return session;
      }),
      getActiveSession: jest.fn((): Session | undefined => {
        if (!mockActiveSessionId) return undefined;
        return mockSessions.get(mockActiveSessionId);
      }),
      getSession: jest.fn((id: string): Session | undefined => {
        return mockSessions.get(id);
      }),
      listSessions: jest.fn((): Session[] => {
        return Array.from(mockSessions.values());
      }),
      switchSession: jest.fn((id: string): Session => {
        const session = mockSessions.get(id);
        if (!session) throw new Error('Session not found');
        mockActiveSessionId = id;
        return session;
      }),
      attachToSession: jest.fn(async (name: string): Promise<Session> => {
        const session: Session = {
          id: `attached-${Date.now()}`,
          name: `${name} (attached)`,
          workingDir: '/tmp',
          status: 'idle',
          createdAt: new Date(),
          lastActivity: new Date(),
        };
        mockSessions.set(session.id, session);
        mockActiveSessionId = session.id;
        return session;
      }),
      closeSession: jest.fn(async (id: string): Promise<void> => {
        mockSessions.delete(id);
        for (const [key, sessionId] of mockContextualSessions) {
          if (sessionId === id) {
            mockContextualSessions.delete(key);
          }
        }
        if (mockActiveSessionId === id) {
          const remaining = Array.from(mockSessions.keys());
          mockActiveSessionId = remaining.length > 0 ? remaining[0] : undefined;
        }
      }),
      sendToActiveSession: jest.fn(),
      sendToSessionForContext: jest.fn((context: SessionContext, _input: string): void => {
        const key = generateContextKey(context);
        const sessionId = mockContextualSessions.get(key);
        let session: Session | undefined;
        if (sessionId) {
          session = mockSessions.get(sessionId);
        }
        if (!session && mockActiveSessionId) {
          session = mockSessions.get(mockActiveSessionId);
        }
        if (!session) {
          throw new Error('No active session for this context');
        }
        session.lastActivity = new Date();
        session.status = 'active';
      }),
      getActiveSessionForContext: jest.fn((context: SessionContext): Session | undefined => {
        const key = generateContextKey(context);
        const sessionId = mockContextualSessions.get(key);
        if (sessionId) {
          return mockSessions.get(sessionId);
        }
        if (mockActiveSessionId) {
          return mockSessions.get(mockActiveSessionId);
        }
        return undefined;
      }),
      setActiveSessionForContext: jest.fn((context: SessionContext, sessionId: string): void => {
        const key = generateContextKey(context);
        mockContextualSessions.set(key, sessionId);
      }),
      clearActiveSessionForContext: jest.fn((context: SessionContext): void => {
        const key = generateContextKey(context);
        mockContextualSessions.delete(key);
      }),
      onSessionOutput: jest.fn().mockReturnValue(() => {}),
      onSessionError: jest.fn().mockReturnValue(() => {}),
      onSessionClose: jest.fn().mockReturnValue(() => {}),
      generateContextKey,
    })),
  };
});

// Mock OutputParser
jest.mock('../../src/parser/OutputParser.js');

// Mock ClaudeCodeProcess
jest.mock('../../src/session/ClaudeCodeProcess.js');

// Mock streaming services
jest.mock('../../src/streaming/StreamingService.js', () => {
  return {
    StreamingService: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('partial'),
      setMode: jest.fn(),
      startDraft: jest.fn().mockResolvedValue({
        isVisible: true,
        currentText: '',
        chatId: 123,
        lastUpdated: Date.now(),
        isFinalized: false,
      } as never),
      updateDraft: jest.fn().mockResolvedValue(null as never),
      completeDraft: jest.fn().mockResolvedValue(null as never),
      cancelDraft: jest.fn().mockResolvedValue(undefined as never),
      hasActiveDraft: jest.fn().mockReturnValue(false),
      shutdown: jest.fn().mockResolvedValue(undefined as never),
    })),
    DEFAULT_STREAMING_CONFIG: {
      mode: 'partial',
      blockSize: 100,
      updateIntervalMs: 500,
      enabled: true,
    },
  };
});

jest.mock('../../src/streaming/DraftMessageHandler.js', () => {
  return {
    DraftMessageHandler: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      accumulate: jest.fn().mockReturnValue(true),
      shouldUpdate: jest.fn().mockReturnValue(true),
      sendUpdate: jest.fn().mockResolvedValue(null as never),
      flush: jest.fn().mockResolvedValue(null as never),
      flushAll: jest.fn().mockResolvedValue(undefined as never),
      reset: jest.fn(),
      resetAll: jest.fn(),
      getBuffer: jest.fn().mockReturnValue('test text'),
      getActiveChatKeys: jest.fn().mockReturnValue([]),
      shutdown: jest.fn().mockResolvedValue(undefined as never),
    })),
  };
});

// Mock ThreadManager
jest.mock('../../src/threaded/ThreadManager.js', () => {
  return {
    ThreadManager: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      setThread: jest.fn(),
      getThreadId: jest.fn(),
      clearThread: jest.fn(),
      hasActiveThread: jest.fn().mockReturnValue(false),
      isForumEnabled: jest.fn().mockReturnValue(true),
      setForumEnabled: jest.fn(),
      listTopics: jest.fn().mockReturnValue([]),
      createTopic: jest.fn().mockResolvedValue({
        message_thread_id: 123,
        name: 'Test Topic',
        icon_color: 0x6FB9F0,
      } as never),
      checkForumEnabled: jest.fn().mockResolvedValue(true as never),
      isEnabled: jest.fn().mockReturnValue(true),
      mapSessionToThread: jest.fn((sessionId: string, chatId: number | string, threadId: number): void => {
        const threadKey = getThreadKey(chatId, threadId);
        mockThreadSessionMap.set(threadKey, sessionId);
        mockSessionThreadMap.set(sessionId, { chatId, threadId });
      }),
      unmapSession: jest.fn((sessionId: string): void => {
        const mapping = mockSessionThreadMap.get(sessionId);
        if (mapping) {
          const threadKey = getThreadKey(mapping.chatId, mapping.threadId);
          mockThreadSessionMap.delete(threadKey);
          mockSessionThreadMap.delete(sessionId);
        }
      }),
      setSessionForThread: jest.fn((chatId: number | string, threadId: number, sessionId: string): void => {
        const threadKey = getThreadKey(chatId, threadId);
        mockThreadSessionMap.set(threadKey, sessionId);
        mockSessionThreadMap.set(sessionId, { chatId, threadId });
      }),
      getSessionForThread: jest.fn((chatId: number | string, threadId: number): string | undefined => {
        const threadKey = getThreadKey(chatId, threadId);
        return mockThreadSessionMap.get(threadKey);
      }),
      clearSessionForThread: jest.fn((chatId: number | string, threadId: number): void => {
        const threadKey = getThreadKey(chatId, threadId);
        const sessionId = mockThreadSessionMap.get(threadKey);
        if (sessionId) {
          mockSessionThreadMap.delete(sessionId);
          mockThreadSessionMap.delete(threadKey);
        }
      }),
      getThreadForSession: jest.fn((sessionId: string): { chatId: number | string; threadId: number } | undefined => {
        return mockSessionThreadMap.get(sessionId);
      }),
      getAllSessionMappings: jest.fn((): Map<string, { chatId: number | string; threadId: number }> => {
        return new Map(mockSessionThreadMap);
      }),
      shutdown: jest.fn().mockResolvedValue(undefined as never),
    })),
    DEFAULT_THREAD_MANAGER_CONFIG: {
      enabled: true,
      autoCreateTopics: false,
      topicNamePrefix: 'Chat',
      inactivityTimeoutMs: 60 * 60 * 1000,
    },
  };
});

jest.mock('../../src/threaded/TopicHandler.js', () => {
  return {
    TopicHandler: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      createTopic: jest.fn().mockResolvedValue({
        message_thread_id: 123,
        name: 'Test Topic',
        icon_color: 0x6FB9F0,
      } as never),
      listTopics: jest.fn().mockReturnValue([]),
      checkForumEnabled: jest.fn().mockResolvedValue(false as never),
      shutdown: jest.fn().mockResolvedValue(undefined as never),
    })),
    DEFAULT_TOPIC_HANDLER_CONFIG: {
      maxCachedTopicsPerChat: 100,
      cacheTtlMs: 5 * 60 * 1000,
    },
    TOPIC_ICON_COLORS: [0x6FB9F0, 0xFFD67E, 0xCB86DB, 0x8EEE98, 0xFF93B2, 0xFB6F5F],
  };
});

// Import TelegramBot after all mocks are set up
import { TelegramBot } from '../../src/bot/TelegramBot.js';

const createMockConfig = (overrides?: Partial<StreamingTelegramBotConfig>): StreamingTelegramBotConfig => ({
  token: 'test-token-123',
  allowedUserIds: [12345, 67890],
  sessionManagerConfig: {
    claudeCliPath: 'claude',
    defaultWorkingDir: '/tmp',
  },
  streamingConfig: {
    mode: 'partial',
    blockSize: 100,
    updateIntervalMs: 500,
    enabled: true,
  },
  threadedModeConfig: {
    enabled: true,
    autoCreateTopics: false,
    topicNamePrefix: 'Chat',
  },
  ...overrides,
});

// ============================================================================
// Helper functions for tests that directly manipulate mock state
// ============================================================================

async function createTestSession(name: string): Promise<Session> {
  const session: Session = {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    name,
    workingDir: '/tmp',
    status: 'idle',
    createdAt: new Date(),
    lastActivity: new Date(),
  };
  mockSessions.set(session.id, session);
  mockActiveSessionId = session.id;
  return session;
}

function setSessionForContext(context: SessionContext, sessionId: string): void {
  const key = generateContextKey(context);
  mockContextualSessions.set(key, sessionId);
}

function getSessionForContext(context: SessionContext): Session | undefined {
  const key = generateContextKey(context);
  const sessionId = mockContextualSessions.get(key);
  if (sessionId) {
    return mockSessions.get(sessionId);
  }
  if (mockActiveSessionId) {
    return mockSessions.get(mockActiveSessionId);
  }
  return undefined;
}

function sendToContext(context: SessionContext, input: string): void {
  const session = getSessionForContext(context);
  if (!session) {
    throw new Error('No active session for this context');
  }
  session.lastActivity = new Date();
  session.status = 'active';
}

function setSessionForThread(chatId: number | string, threadId: number, sessionId: string): void {
  const threadKey = getThreadKey(chatId, threadId);
  mockThreadSessionMap.set(threadKey, sessionId);
  mockSessionThreadMap.set(sessionId, { chatId, threadId });
}

function getSessionForThread(chatId: number | string, threadId: number): string | undefined {
  const threadKey = getThreadKey(chatId, threadId);
  return mockThreadSessionMap.get(threadKey);
}

function clearSessionForThread(chatId: number | string, threadId: number): void {
  const threadKey = getThreadKey(chatId, threadId);
  const sessionId = mockThreadSessionMap.get(threadKey);
  if (sessionId) {
    mockSessionThreadMap.delete(sessionId);
    mockThreadSessionMap.delete(threadKey);
  }
}

function getThreadForSession(sessionId: string): { chatId: number | string; threadId: number } | undefined {
  return mockSessionThreadMap.get(sessionId);
}

async function closeTestSession(id: string): Promise<void> {
  mockSessions.delete(id);
  for (const [key, sessionId] of mockContextualSessions) {
    if (sessionId === id) {
      mockContextualSessions.delete(key);
    }
  }
  if (mockActiveSessionId === id) {
    const remaining = Array.from(mockSessions.keys());
    mockActiveSessionId = remaining.length > 0 ? remaining[0] : undefined;
  }
}

// ============================================================================
// Integration Tests for Per-Thread Sessions
// ============================================================================

describe('TelegramBot Per-Thread Session Integration Tests', () => {
  let telegramBot: TelegramBot;

  // Test constants
  const CHAT_ID = -1001234567890; // Group chat ID
  const USER_ID = 12345;
  const THREAD_A = 100;
  const THREAD_B = 200;

  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();
    resetThreadMocks();
    const config = createMockConfig();
    telegramBot = new TelegramBot(config);
    // Enable threaded mode for the test user
    telegramBot.setUserThreadedMode(USER_ID, true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Scenario 1: Create session in Thread A', () => {
    it('should create a session and bind it to Thread A', async () => {
      // Simulate creating a session in Thread A
      const sessionA = await createTestSession('Session-A');

      // Bind the session to Thread A
      const contextA: SessionContext = {
        chatId: CHAT_ID,
        threadId: THREAD_A,
        userId: USER_ID,
      };
      setSessionForContext(contextA, sessionA.id);
      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);

      // Verify session was created
      expect(sessionA).toBeDefined();
      expect(sessionA.name).toBe('Session-A');
      expect(mockSessions.size).toBe(1);

      // Verify thread binding
      expect(getSessionForThread(CHAT_ID, THREAD_A)).toBe(sessionA.id);

      // Verify contextual binding
      expect(getSessionForContext(contextA)?.id).toBe(sessionA.id);
    });

    it('should store both thread and contextual mapping', async () => {
      const sessionA = await createTestSession('Session-A');
      const contextA: SessionContext = {
        chatId: CHAT_ID,
        threadId: THREAD_A,
        userId: USER_ID,
      };

      setSessionForContext(contextA, sessionA.id);
      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);

      // Verify both mappings exist
      expect(mockContextualSessions.size).toBe(1);
      expect(mockThreadSessionMap.size).toBe(1);
      expect(mockSessionThreadMap.size).toBe(1);
    });
  });

  describe('Scenario 2: Create session in Thread B', () => {
    it('should create a separate session and bind it to Thread B', async () => {
      // First create Session A in Thread A
      const sessionA = await createTestSession('Session-A');
      const contextA: SessionContext = {
        chatId: CHAT_ID,
        threadId: THREAD_A,
        userId: USER_ID,
      };
      setSessionForContext(contextA, sessionA.id);
      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);

      // Now create Session B in Thread B
      const sessionB = await createTestSession('Session-B');
      const contextB: SessionContext = {
        chatId: CHAT_ID,
        threadId: THREAD_B,
        userId: USER_ID,
      };
      setSessionForContext(contextB, sessionB.id);
      setSessionForThread(CHAT_ID, THREAD_B, sessionB.id);

      // Verify both sessions exist
      expect(mockSessions.size).toBe(2);

      // Verify Session A is still bound to Thread A
      expect(getSessionForThread(CHAT_ID, THREAD_A)).toBe(sessionA.id);

      // Verify Session B is bound to Thread B
      expect(getSessionForThread(CHAT_ID, THREAD_B)).toBe(sessionB.id);

      // Verify they are different sessions
      expect(sessionA.id).not.toBe(sessionB.id);
    });

    it('should maintain separate contextual mappings for different threads', async () => {
      const sessionA = await createTestSession('Session-A');
      const sessionB = await createTestSession('Session-B');

      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextB: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);
      setSessionForContext(contextB, sessionB.id);

      // Verify separate contextual mappings
      expect(getSessionForContext(contextA)?.id).toBe(sessionA.id);
      expect(getSessionForContext(contextB)?.id).toBe(sessionB.id);
    });
  });

  describe('Scenario 3: Send message from Thread A - verify routed to Session A', () => {
    it('should route messages from Thread A to Session A', async () => {
      // Setup: Create sessions for both threads
      const sessionA = await createTestSession('Session-A');
      const sessionB = await createTestSession('Session-B');

      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextB: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);
      setSessionForContext(contextB, sessionB.id);
      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);
      setSessionForThread(CHAT_ID, THREAD_B, sessionB.id);

      // Send message from Thread A
      sendToContext(contextA, 'Hello from Thread A');

      // Verify Session A was updated (status should be active after send)
      const updatedSessionA = mockSessions.get(sessionA.id);
      expect(updatedSessionA?.status).toBe('active');
    });

    it('should not affect Session B when sending to Thread A', async () => {
      const sessionA = await createTestSession('Session-A');
      const sessionB = await createTestSession('Session-B');

      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextB: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);
      setSessionForContext(contextB, sessionB.id);

      // Get Session B's initial state
      const sessionBBefore = mockSessions.get(sessionB.id)!;
      const initialStatus = sessionBBefore.status;

      // Send message from Thread A
      sendToContext(contextA, 'Hello from Thread A');

      // Verify Session B was not modified
      const sessionBAfter = mockSessions.get(sessionB.id)!;
      expect(sessionBAfter.status).toBe(initialStatus);
    });
  });

  describe('Scenario 4: Send message from Thread B - verify routed to Session B', () => {
    it('should route messages from Thread B to Session B', async () => {
      // Setup: Create sessions for both threads
      const sessionA = await createTestSession('Session-A');
      const sessionB = await createTestSession('Session-B');

      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextB: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);
      setSessionForContext(contextB, sessionB.id);
      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);
      setSessionForThread(CHAT_ID, THREAD_B, sessionB.id);

      // Send message from Thread B
      sendToContext(contextB, 'Hello from Thread B');

      // Verify Session B was updated (status should be active after send)
      const updatedSessionB = mockSessions.get(sessionB.id);
      expect(updatedSessionB?.status).toBe('active');
    });

    it('should correctly resolve session when sending from different threads in sequence', async () => {
      const sessionA = await createTestSession('Session-A');
      const sessionB = await createTestSession('Session-B');

      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextB: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);
      setSessionForContext(contextB, sessionB.id);

      // Reset status to idle before testing
      sessionA.status = 'idle';
      sessionB.status = 'idle';

      // Send messages alternating between threads
      sendToContext(contextA, 'Message 1 from Thread A');
      expect(mockSessions.get(sessionA.id)?.status).toBe('active');

      // Reset and send from B
      sessionA.status = 'idle';
      sendToContext(contextB, 'Message 1 from Thread B');
      expect(mockSessions.get(sessionB.id)?.status).toBe('active');
      expect(mockSessions.get(sessionA.id)?.status).toBe('idle'); // A should still be idle
    });
  });

  describe('Scenario 5: Switch global context and verify thread isolation preserved', () => {
    it('should preserve thread-specific sessions when global session is switched', async () => {
      // Create sessions
      const sessionA = await createTestSession('Session-A');
      const sessionB = await createTestSession('Session-B');
      const sessionGlobal = await createTestSession('Session-Global');

      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextB: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      // Bind sessions to threads
      setSessionForContext(contextA, sessionA.id);
      setSessionForContext(contextB, sessionB.id);
      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);
      setSessionForThread(CHAT_ID, THREAD_B, sessionB.id);

      // Verify initial state - global session is the last created one
      expect(mockActiveSessionId).toBe(sessionGlobal.id);

      // Switch global session to Session A
      mockActiveSessionId = sessionA.id;

      // Verify thread mappings are still intact
      expect(getSessionForThread(CHAT_ID, THREAD_A)).toBe(sessionA.id);
      expect(getSessionForThread(CHAT_ID, THREAD_B)).toBe(sessionB.id);

      // Verify contextual session resolution still works
      expect(getSessionForContext(contextA)?.id).toBe(sessionA.id);
      expect(getSessionForContext(contextB)?.id).toBe(sessionB.id);
    });

    it('should keep thread bindings independent of global active session', async () => {
      const sessionA = await createTestSession('Session-A');
      const sessionB = await createTestSession('Session-B');

      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextB: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);
      setSessionForContext(contextB, sessionB.id);
      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);
      setSessionForThread(CHAT_ID, THREAD_B, sessionB.id);

      // Change global session multiple times
      mockActiveSessionId = sessionA.id;
      mockActiveSessionId = sessionB.id;
      mockActiveSessionId = sessionA.id;

      // Thread bindings should be unchanged
      expect(getSessionForThread(CHAT_ID, THREAD_A)).toBe(sessionA.id);
      expect(getSessionForThread(CHAT_ID, THREAD_B)).toBe(sessionB.id);

      // Contextual resolution should still work
      expect(getSessionForContext(contextA)?.id).toBe(sessionA.id);
      expect(getSessionForContext(contextB)?.id).toBe(sessionB.id);
    });

    it('should allow sending to thread sessions even when different global session is active', async () => {
      const sessionA = await createTestSession('Session-A');
      const sessionB = await createTestSession('Session-B');

      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextB: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);
      setSessionForContext(contextB, sessionB.id);

      // Set global session to B
      mockActiveSessionId = sessionB.id;

      // Sending from Thread A should still go to Session A
      sendToContext(contextA, 'Message from Thread A');

      // Session A should be updated
      expect(mockSessions.get(sessionA.id)?.status).toBe('active');
    });
  });

  describe('Scenario 6: Close thread session and verify cleanup', () => {
    it('should clean up thread mapping when session is closed', async () => {
      // Create and bind session to Thread A
      const sessionA = await createTestSession('Session-A');
      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);
      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);

      // Verify binding exists
      expect(getSessionForThread(CHAT_ID, THREAD_A)).toBe(sessionA.id);

      // Close the session
      await closeTestSession(sessionA.id);

      // Also clean up thread mapping (simulating what TelegramBot.unsubscribeFromSession does)
      clearSessionForThread(CHAT_ID, THREAD_A);

      // Verify session is removed
      expect(mockSessions.has(sessionA.id)).toBe(false);

      // Verify thread mapping is cleaned up
      expect(getSessionForThread(CHAT_ID, THREAD_A)).toBeUndefined();
    });

    it('should clean up contextual mapping when session is closed', async () => {
      const sessionA = await createTestSession('Session-A');
      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);

      // Verify contextual mapping exists
      expect(getSessionForContext(contextA)?.id).toBe(sessionA.id);

      // Close the session
      await closeTestSession(sessionA.id);

      // After closing, getSessionForContext returns undefined (no global fallback now)
      expect(getSessionForContext(contextA)).toBeUndefined();
    });

    it('should not affect other thread sessions when one is closed', async () => {
      // Create sessions for both threads
      const sessionA = await createTestSession('Session-A');
      const sessionB = await createTestSession('Session-B');

      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextB: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);
      setSessionForContext(contextB, sessionB.id);
      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);
      setSessionForThread(CHAT_ID, THREAD_B, sessionB.id);

      // Close Session A
      await closeTestSession(sessionA.id);
      clearSessionForThread(CHAT_ID, THREAD_A);

      // Session B should still be intact
      expect(mockSessions.has(sessionB.id)).toBe(true);
      expect(getSessionForThread(CHAT_ID, THREAD_B)).toBe(sessionB.id);
      expect(getSessionForContext(contextB)?.id).toBe(sessionB.id);
    });

    it('should handle cleanup when session was bound to multiple contexts', async () => {
      const session = await createTestSession('Multi-bound-session');

      // Bind same session to multiple thread contexts (unusual but possible)
      const context1: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const context2: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID };

      setSessionForContext(context1, session.id);
      setSessionForContext(context2, session.id);

      // Close the session
      await closeTestSession(session.id);

      // Both contextual mappings should be cleaned up
      expect(getSessionForContext(context1)).toBeUndefined();
      expect(getSessionForContext(context2)).toBeUndefined();
    });
  });

  describe('Thread Isolation Additional Tests', () => {
    it('should handle messages from unbound threads using global session', async () => {
      const sessionA = await createTestSession('Session-A');
      const contextA: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };

      setSessionForContext(contextA, sessionA.id);

      // Create context for unbound thread (Thread C = 300)
      const unboundContext: SessionContext = { chatId: CHAT_ID, threadId: 300, userId: USER_ID };

      // Should fallback to global session (sessionA is the most recent, so it's global)
      const resolvedSession = getSessionForContext(unboundContext);
      expect(resolvedSession).toBeDefined();
      expect(resolvedSession?.id).toBe(sessionA.id);
    });

    it('should correctly track session-to-thread bidirectional mapping', async () => {
      const sessionA = await createTestSession('Session-A');

      setSessionForThread(CHAT_ID, THREAD_A, sessionA.id);

      // Forward lookup: thread -> session
      expect(getSessionForThread(CHAT_ID, THREAD_A)).toBe(sessionA.id);

      // Reverse lookup: session -> thread
      expect(getThreadForSession(sessionA.id)).toEqual({
        chatId: CHAT_ID,
        threadId: THREAD_A,
      });
    });

    it('should handle re-binding session to different thread', async () => {
      const session = await createTestSession('Session-Rebind');

      // Initially bind to Thread A
      setSessionForThread(CHAT_ID, THREAD_A, session.id);
      expect(getSessionForThread(CHAT_ID, THREAD_A)).toBe(session.id);

      // Re-bind to Thread B
      clearSessionForThread(CHAT_ID, THREAD_A);
      setSessionForThread(CHAT_ID, THREAD_B, session.id);

      // Thread A should have no session
      expect(getSessionForThread(CHAT_ID, THREAD_A)).toBeUndefined();

      // Thread B should have the session
      expect(getSessionForThread(CHAT_ID, THREAD_B)).toBe(session.id);
    });

    it('should handle multiple users in different threads', async () => {
      const USER_ID_2 = 67890;

      const sessionUser1 = await createTestSession('Session-User1');
      const sessionUser2 = await createTestSession('Session-User2');

      const contextUser1: SessionContext = { chatId: CHAT_ID, threadId: THREAD_A, userId: USER_ID };
      const contextUser2: SessionContext = { chatId: CHAT_ID, threadId: THREAD_B, userId: USER_ID_2 };

      setSessionForContext(contextUser1, sessionUser1.id);
      setSessionForContext(contextUser2, sessionUser2.id);

      // Each user should have their own session
      expect(getSessionForContext(contextUser1)?.id).toBe(sessionUser1.id);
      expect(getSessionForContext(contextUser2)?.id).toBe(sessionUser2.id);
    });
  });
});

// ============================================================================
// TelegramBot API Tests
// ============================================================================

describe('TelegramBot Thread API Methods', () => {
  let telegramBot: TelegramBot;

  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();
    resetThreadMocks();
    const config = createMockConfig();
    telegramBot = new TelegramBot(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isThreadedModeEnabledForUser', () => {
    it('should default to config setting', () => {
      const userId = 12345;
      // Config has enabled: true
      expect(telegramBot.isThreadedModeEnabledForUser(userId)).toBe(true);
    });

    it('should respect user preference when explicitly set', () => {
      const userId = 12345;

      telegramBot.setUserThreadedMode(userId, false);
      expect(telegramBot.isThreadedModeEnabledForUser(userId)).toBe(false);

      telegramBot.setUserThreadedMode(userId, true);
      expect(telegramBot.isThreadedModeEnabledForUser(userId)).toBe(true);
    });
  });

  describe('getThreadManager', () => {
    it('should return ThreadManager when enabled', () => {
      expect(telegramBot.getThreadManager()).not.toBeNull();
    });

    it('should return null when threading is disabled', () => {
      const config = createMockConfig({
        threadedModeConfig: {
          enabled: false,
          autoCreateTopics: false,
          topicNamePrefix: 'Chat',
        },
      });
      const botWithNoThreads = new TelegramBot(config);

      expect(botWithNoThreads.getThreadManager()).toBeNull();
    });
  });

  describe('getTopicHandler', () => {
    it('should return TopicHandler when threading is enabled', () => {
      expect(telegramBot.getTopicHandler()).not.toBeNull();
    });

    it('should return null when threading is disabled', () => {
      const config = createMockConfig({
        threadedModeConfig: {
          enabled: false,
          autoCreateTopics: false,
          topicNamePrefix: 'Chat',
        },
      });
      const botWithNoThreads = new TelegramBot(config);

      expect(botWithNoThreads.getTopicHandler()).toBeNull();
    });
  });
});

// ============================================================================
// SessionContext Building Tests
// ============================================================================

describe('SessionContext Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockState();
    resetThreadMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should build correct SessionContext structure', () => {
    const chatId = 123;
    const threadId = 456;
    const userId = 789;

    const context: SessionContext = {
      chatId,
      threadId,
      userId,
    };

    expect(context.chatId).toBe(chatId);
    expect(context.threadId).toBe(threadId);
    expect(context.userId).toBe(userId);
  });

  it('should generate correct context key for full context', () => {
    const context: SessionContext = {
      chatId: 123,
      threadId: 456,
      userId: 789,
    };

    const key = generateContextKey(context);
    expect(key).toBe('chat:123:user:789:thread:456');
  });

  it('should generate correct context key without userId', () => {
    const context: SessionContext = {
      chatId: 123,
      threadId: 456,
    };

    const key = generateContextKey(context);
    expect(key).toBe('chat:123:thread:456');
  });

  it('should generate correct context key without threadId', () => {
    const context: SessionContext = {
      chatId: 123,
      userId: 789,
    };

    const key = generateContextKey(context);
    expect(key).toBe('chat:123:user:789');
  });

  it('should generate correct context key with only chatId', () => {
    const context: SessionContext = {
      chatId: 123,
    };

    const key = generateContextKey(context);
    expect(key).toBe('chat:123');
  });

  it('should handle negative chat IDs (group chats)', () => {
    const context: SessionContext = {
      chatId: -1001234567890,
      threadId: 100,
    };

    const key = generateContextKey(context);
    expect(key).toBe('chat:-1001234567890:thread:100');
  });
});
