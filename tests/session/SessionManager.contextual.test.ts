import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import type { ClaudeCodeProcessInterface, SessionContext } from '../../src/types/index.js';
import { SessionManager } from '../../src/session/SessionManager.js';
import { ClaudeCodeProcess } from '../../src/session/ClaudeCodeProcess.js';

// Mock ClaudeCodeProcess
jest.mock('../../src/session/ClaudeCodeProcess.js');

// Mock fs functions to allow any path in tests
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  statSync: jest.fn(() => ({ isDirectory: () => true })),
}));

/**
 * Creates a mock ClaudeCodeProcess instance
 */
function createMockProcess(): ClaudeCodeProcessInterface & EventEmitter {
  const emitter = new EventEmitter() as ClaudeCodeProcessInterface & EventEmitter;
  Object.defineProperty(emitter, 'isRunning', {
    value: true,
    writable: true,
  });
  emitter.send = jest.fn();
  emitter.kill = jest.fn(() => {
    (emitter as any).isRunning = false;
    emitter.emit('close', 0);
  });
  emitter.writeToStdin = jest.fn();
  emitter.hasActiveProcess = jest.fn(() => true);
  return emitter;
}

describe('SessionManager - Contextual Session Support', () => {
  let sessionManager: SessionManager;
  let mockProcess: ClaudeCodeProcessInterface & EventEmitter;

  beforeEach(() => {
    mockProcess = createMockProcess();
    (ClaudeCodeProcess as jest.MockedClass<typeof ClaudeCodeProcess>).mockImplementation(
      () => mockProcess as any
    );
    sessionManager = new SessionManager({
      claudeCliPath: 'claude',
      defaultWorkingDir: '/tmp',
      contextualSessionConfig: {
        enabled: true,
        fallbackToGlobal: true,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateContextKey', () => {
    it('should generate key with chatId only', () => {
      const context: SessionContext = { chatId: 12345 };
      const key = sessionManager.generateContextKey(context);
      expect(key).toBe('chat:12345');
    });

    it('should generate key with chatId and threadId', () => {
      const context: SessionContext = { chatId: 12345, threadId: 67890 };
      const key = sessionManager.generateContextKey(context);
      expect(key).toBe('chat:12345:thread:67890');
    });

    it('should generate key with chatId and userId', () => {
      const context: SessionContext = { chatId: 12345, userId: 111 };
      const key = sessionManager.generateContextKey(context);
      expect(key).toBe('chat:12345:user:111');
    });

    it('should generate key with chatId, userId, and threadId', () => {
      const context: SessionContext = { chatId: 12345, userId: 111, threadId: 67890 };
      const key = sessionManager.generateContextKey(context);
      expect(key).toBe('chat:12345:user:111:thread:67890');
    });

    it('should handle string chatId', () => {
      const context: SessionContext = { chatId: '@channelname' };
      const key = sessionManager.generateContextKey(context);
      expect(key).toBe('chat:@channelname');
    });

    it('should handle negative chatId (group chats)', () => {
      const context: SessionContext = { chatId: -1001234567890, threadId: 100 };
      const key = sessionManager.generateContextKey(context);
      expect(key).toBe('chat:-1001234567890:thread:100');
    });
  });

  describe('setActiveSessionForContext', () => {
    it('should set active session for a context', async () => {
      const session = await sessionManager.createSession('test-session');
      const context: SessionContext = { chatId: 12345, threadId: 100 };

      sessionManager.setActiveSessionForContext(context, session.id);

      const retrieved = sessionManager.getActiveSessionForContext(context);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
    });

    it('should throw error if session does not exist', () => {
      const context: SessionContext = { chatId: 12345 };

      expect(() => {
        sessionManager.setActiveSessionForContext(context, 'non-existent-session');
      }).toThrow('Session not found: non-existent-session');
    });

    it('should overwrite existing context mapping', async () => {
      const session1 = await sessionManager.createSession('session1');
      const session2 = await sessionManager.createSession('session2');
      const context: SessionContext = { chatId: 12345, threadId: 100 };

      sessionManager.setActiveSessionForContext(context, session1.id);
      sessionManager.setActiveSessionForContext(context, session2.id);

      const retrieved = sessionManager.getActiveSessionForContext(context);
      expect(retrieved?.id).toBe(session2.id);
    });

    it('should allow multiple contexts to map to the same session', async () => {
      const session = await sessionManager.createSession('shared-session');
      const context1: SessionContext = { chatId: 12345, threadId: 100 };
      const context2: SessionContext = { chatId: 12345, threadId: 200 };

      sessionManager.setActiveSessionForContext(context1, session.id);
      sessionManager.setActiveSessionForContext(context2, session.id);

      expect(sessionManager.getActiveSessionForContext(context1)?.id).toBe(session.id);
      expect(sessionManager.getActiveSessionForContext(context2)?.id).toBe(session.id);
    });
  });

  describe('getActiveSessionForContext', () => {
    it('should return session for exact context match', async () => {
      const session = await sessionManager.createSession('thread-session');
      const context: SessionContext = { chatId: 12345, threadId: 100 };

      sessionManager.setActiveSessionForContext(context, session.id);

      const retrieved = sessionManager.getActiveSessionForContext(context);
      expect(retrieved?.id).toBe(session.id);
    });

    it('should return undefined when no session exists for context', async () => {
      const context: SessionContext = { chatId: 99999, threadId: 100 };

      // Create a session but don't assign it to this context
      await sessionManager.createSession('other-session');

      // With fallbackToGlobal: true, it would fall back, so let's test with disabled config
      const noFallbackManager = new SessionManager({
        claudeCliPath: 'claude',
        defaultWorkingDir: '/tmp',
        contextualSessionConfig: {
          enabled: true,
          fallbackToGlobal: false,
        },
      });

      const retrieved = noFallbackManager.getActiveSessionForContext(context);
      expect(retrieved).toBeUndefined();
    });

    describe('fallback chain', () => {
      it('should fallback from thread-level to chat-level', async () => {
        const chatSession = await sessionManager.createSession('chat-session');
        const chatContext: SessionContext = { chatId: 12345 };
        const threadContext: SessionContext = { chatId: 12345, threadId: 100 };

        // Set session at chat level only
        sessionManager.setActiveSessionForContext(chatContext, chatSession.id);

        // Query at thread level should fallback to chat level
        const retrieved = sessionManager.getActiveSessionForContext(threadContext);
        expect(retrieved?.id).toBe(chatSession.id);
      });

      it('should prefer thread-level over chat-level', async () => {
        const chatSession = await sessionManager.createSession('chat-session');
        const threadSession = await sessionManager.createSession('thread-session');
        const chatContext: SessionContext = { chatId: 12345 };
        const threadContext: SessionContext = { chatId: 12345, threadId: 100 };

        // Set sessions at both levels
        sessionManager.setActiveSessionForContext(chatContext, chatSession.id);
        sessionManager.setActiveSessionForContext(threadContext, threadSession.id);

        // Query at thread level should return thread session
        const retrieved = sessionManager.getActiveSessionForContext(threadContext);
        expect(retrieved?.id).toBe(threadSession.id);
      });

      it('should fallback to global active session when fallbackToGlobal is enabled', async () => {
        const globalSession = await sessionManager.createSession('global-session');
        const context: SessionContext = { chatId: 99999, threadId: 100 };

        // No contextual mapping set, should fallback to global
        const retrieved = sessionManager.getActiveSessionForContext(context);
        expect(retrieved?.id).toBe(globalSession.id);
      });

      it('should not fallback to global when fallbackToGlobal is disabled', async () => {
        const noFallbackManager = new SessionManager({
          claudeCliPath: 'claude',
          defaultWorkingDir: '/tmp',
          contextualSessionConfig: {
            enabled: true,
            fallbackToGlobal: false,
          },
        });

        await noFallbackManager.createSession('global-session');
        const context: SessionContext = { chatId: 99999, threadId: 100 };

        const retrieved = noFallbackManager.getActiveSessionForContext(context);
        expect(retrieved).toBeUndefined();
      });

      it('should use global behavior when contextual sessions are disabled', async () => {
        const disabledManager = new SessionManager({
          claudeCliPath: 'claude',
          defaultWorkingDir: '/tmp',
          contextualSessionConfig: {
            enabled: false,
            fallbackToGlobal: true,
          },
        });

        const globalSession = await disabledManager.createSession('global-session');
        const context: SessionContext = { chatId: 12345, threadId: 100 };

        // Even though context is provided, should return global session
        const retrieved = disabledManager.getActiveSessionForContext(context);
        expect(retrieved?.id).toBe(globalSession.id);
      });

      it('should fallback from full context to user-level', async () => {
        const userSession = await sessionManager.createSession('user-session');
        const userContext: SessionContext = { chatId: 12345, userId: 111 };
        const fullContext: SessionContext = { chatId: 12345, userId: 111, threadId: 200 };

        // Set session at user level only
        sessionManager.setActiveSessionForContext(userContext, userSession.id);

        // Query at full context should fallback to user level
        const retrieved = sessionManager.getActiveSessionForContext(fullContext);
        expect(retrieved?.id).toBe(userSession.id);
      });
    });
  });

  describe('clearActiveSessionForContext', () => {
    it('should remove context mapping', async () => {
      const session = await sessionManager.createSession('test-session');
      const context: SessionContext = { chatId: 12345, threadId: 100 };

      sessionManager.setActiveSessionForContext(context, session.id);
      expect(sessionManager.getActiveSessionForContext(context)?.id).toBe(session.id);

      sessionManager.clearActiveSessionForContext(context);

      // With fallbackToGlobal enabled, it will still return global session
      // So we need to check contextual count instead
      expect(sessionManager.contextualSessionCount).toBe(0);
    });

    it('should not affect other context mappings', async () => {
      const session1 = await sessionManager.createSession('session1');
      const session2 = await sessionManager.createSession('session2');
      const context1: SessionContext = { chatId: 12345, threadId: 100 };
      const context2: SessionContext = { chatId: 12345, threadId: 200 };

      sessionManager.setActiveSessionForContext(context1, session1.id);
      sessionManager.setActiveSessionForContext(context2, session2.id);

      sessionManager.clearActiveSessionForContext(context1);

      expect(sessionManager.contextualSessionCount).toBe(1);
      expect(sessionManager.getActiveSessionForContext(context2)?.id).toBe(session2.id);
    });

    it('should be safe to call for non-existent context', () => {
      const context: SessionContext = { chatId: 99999 };

      // Should not throw
      expect(() => {
        sessionManager.clearActiveSessionForContext(context);
      }).not.toThrow();
    });

    it('should clean up mappings when session is closed', async () => {
      const session = await sessionManager.createSession('test-session');
      const context1: SessionContext = { chatId: 12345, threadId: 100 };
      const context2: SessionContext = { chatId: 12345, threadId: 200 };

      sessionManager.setActiveSessionForContext(context1, session.id);
      sessionManager.setActiveSessionForContext(context2, session.id);
      expect(sessionManager.contextualSessionCount).toBe(2);

      await sessionManager.closeSession(session.id);

      expect(sessionManager.contextualSessionCount).toBe(0);
    });
  });

  describe('sendToSessionForContext', () => {
    it('should send input to session for context', async () => {
      const session = await sessionManager.createSession('test-session');
      const context: SessionContext = { chatId: 12345, threadId: 100 };

      sessionManager.setActiveSessionForContext(context, session.id);
      sessionManager.sendToSessionForContext(context, 'hello world');

      expect(mockProcess.send).toHaveBeenCalledWith('hello world');
    });

    it('should throw error if no session exists for context', () => {
      const noFallbackManager = new SessionManager({
        claudeCliPath: 'claude',
        defaultWorkingDir: '/tmp',
        contextualSessionConfig: {
          enabled: true,
          fallbackToGlobal: false,
        },
      });

      const context: SessionContext = { chatId: 99999 };

      expect(() => {
        noFallbackManager.sendToSessionForContext(context, 'hello');
      }).toThrow('No active session for this context');
    });

    it('should use fallback session when fallbackToGlobal is enabled', async () => {
      const globalSession = await sessionManager.createSession('global-session');
      const context: SessionContext = { chatId: 99999 };

      // No contextual mapping, should use global session
      sessionManager.sendToSessionForContext(context, 'hello world');

      expect(mockProcess.send).toHaveBeenCalledWith('hello world');
    });

    it('should use global behavior when contextual sessions are disabled', async () => {
      const disabledManager = new SessionManager({
        claudeCliPath: 'claude',
        defaultWorkingDir: '/tmp',
        contextualSessionConfig: {
          enabled: false,
          fallbackToGlobal: true,
        },
      });

      (ClaudeCodeProcess as jest.MockedClass<typeof ClaudeCodeProcess>).mockImplementation(
        () => mockProcess as any
      );

      await disabledManager.createSession('global-session');
      const context: SessionContext = { chatId: 12345 };

      disabledManager.sendToSessionForContext(context, 'hello world');

      expect(mockProcess.send).toHaveBeenCalledWith('hello world');
    });
  });

  describe('backward compatibility', () => {
    it('should work with global activeSessionId when contextual disabled', async () => {
      const manager = new SessionManager({
        claudeCliPath: 'claude',
        defaultWorkingDir: '/tmp',
        contextualSessionConfig: {
          enabled: false,
          fallbackToGlobal: true,
        },
      });

      (ClaudeCodeProcess as jest.MockedClass<typeof ClaudeCodeProcess>).mockImplementation(
        () => mockProcess as any
      );

      const session = await manager.createSession('test');

      // getActiveSession should still work
      expect(manager.getActiveSession()?.id).toBe(session.id);

      // sendToActiveSession should still work
      manager.sendToActiveSession('hello');
      expect(mockProcess.send).toHaveBeenCalledWith('hello');
    });

    it('should allow mixing global and contextual session management', async () => {
      const globalSession = await sessionManager.createSession('global-session');
      const contextSession = await sessionManager.createSession('context-session');
      const context: SessionContext = { chatId: 12345, threadId: 100 };

      // Set contextual session
      sessionManager.setActiveSessionForContext(context, contextSession.id);

      // Global session is still the most recently created
      expect(sessionManager.getActiveSession()?.id).toBe(contextSession.id);

      // But we can switch global session independently
      sessionManager.switchSession(globalSession.id);
      expect(sessionManager.getActiveSession()?.id).toBe(globalSession.id);

      // Contextual session should still be context-specific
      expect(sessionManager.getActiveSessionForContext(context)?.id).toBe(contextSession.id);
    });
  });

  describe('contextual session configuration', () => {
    it('should return default config when not specified', () => {
      const manager = new SessionManager({
        claudeCliPath: 'claude',
        defaultWorkingDir: '/tmp',
      });

      const config = manager.getContextualSessionConfig();
      expect(config.enabled).toBe(false);
      expect(config.fallbackToGlobal).toBe(true);
      expect(config.cleanupInactiveMs).toBeUndefined();
    });

    it('should allow updating config at runtime', () => {
      sessionManager.setContextualSessionConfig({ enabled: false });

      const config = sessionManager.getContextualSessionConfig();
      expect(config.enabled).toBe(false);
    });

    it('should track contextual session count', async () => {
      expect(sessionManager.contextualSessionCount).toBe(0);

      const session = await sessionManager.createSession('test');
      sessionManager.setActiveSessionForContext({ chatId: 1 }, session.id);
      sessionManager.setActiveSessionForContext({ chatId: 2 }, session.id);

      expect(sessionManager.contextualSessionCount).toBe(2);
    });

    it('should return copy of contextual active sessions map', async () => {
      const session = await sessionManager.createSession('test');
      sessionManager.setActiveSessionForContext({ chatId: 12345 }, session.id);

      const mappings = sessionManager.getContextualActiveSessions();
      expect(mappings.size).toBe(1);
      expect(mappings.get('chat:12345')).toBe(session.id);

      // Modifying the returned map should not affect internal state
      mappings.clear();
      expect(sessionManager.contextualSessionCount).toBe(1);
    });
  });
});
