import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import type { Session, ClaudeCodeProcessInterface } from '../../src/types/index.js';
import { SessionManager } from '../../src/session/SessionManager.js';
import { ClaudeCodeProcess } from '../../src/session/ClaudeCodeProcess.js';

// Mock ClaudeCodeProcess
jest.mock('../../src/session/ClaudeCodeProcess.js');

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
  return emitter;
}

describe('SessionManager', () => {
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
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should return a Session object with unique ID', async () => {
      const session = await sessionManager.createSession('test-session');

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(typeof session.id).toBe('string');
      expect(session.id.length).toBeGreaterThan(0);
    });

    it('should create session with provided name', async () => {
      const session = await sessionManager.createSession('my-project');

      expect(session.name).toBe('my-project');
    });

    it('should use provided working directory', async () => {
      const session = await sessionManager.createSession('test', '/home/user/projects');

      expect(session.workingDir).toBe('/home/user/projects');
    });

    it('should use default working directory if not provided', async () => {
      const session = await sessionManager.createSession('test');

      expect(session.workingDir).toBe('/tmp');
    });

    it('should spawn Claude Code CLI process', async () => {
      await sessionManager.createSession('test');

      expect(ClaudeCodeProcess).toHaveBeenCalled();
    });

    it('should store session in internal map', async () => {
      const session = await sessionManager.createSession('test');
      const retrievedSession = sessionManager.getSession(session.id);

      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.id).toBe(session.id);
    });

    it('should set the new session as active', async () => {
      const session = await sessionManager.createSession('test');
      const activeSession = sessionManager.getActiveSession();

      expect(activeSession).toBeDefined();
      expect(activeSession?.id).toBe(session.id);
    });

    it('should set initial status to idle', async () => {
      const session = await sessionManager.createSession('test');

      expect(session.status).toBe('idle');
    });

    it('should set createdAt timestamp', async () => {
      const before = new Date();
      const session = await sessionManager.createSession('test');
      const after = new Date();

      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should generate unique IDs for multiple sessions', async () => {
      const session1 = await sessionManager.createSession('test1');
      const session2 = await sessionManager.createSession('test2');

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('listSessions', () => {
    it('should return empty array when no sessions exist', () => {
      const sessions = sessionManager.listSessions();

      expect(sessions).toEqual([]);
    });

    it('should return array of all sessions', async () => {
      await sessionManager.createSession('session1');
      await sessionManager.createSession('session2');
      await sessionManager.createSession('session3');

      const sessions = sessionManager.listSessions();

      expect(sessions).toHaveLength(3);
    });

    it('should include session metadata', async () => {
      await sessionManager.createSession('my-session', '/projects');

      const sessions = sessionManager.listSessions();

      expect(sessions[0]).toMatchObject({
        name: 'my-session',
        workingDir: '/projects',
        status: 'idle',
      });
      expect(sessions[0].id).toBeDefined();
      expect(sessions[0].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getSession', () => {
    it('should return session if exists', async () => {
      const created = await sessionManager.createSession('test');
      const retrieved = sessionManager.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('test');
    });

    it('should return undefined if session not found', () => {
      const session = sessionManager.getSession('non-existent-id');

      expect(session).toBeUndefined();
    });
  });

  describe('closeSession', () => {
    it('should terminate the CLI process', async () => {
      const session = await sessionManager.createSession('test');
      await sessionManager.closeSession(session.id);

      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should remove session from list', async () => {
      const session = await sessionManager.createSession('test');
      await sessionManager.closeSession(session.id);

      const sessions = sessionManager.listSessions();
      expect(sessions).toHaveLength(0);
    });

    it('should switch to another session if closing active one', async () => {
      const session1 = await sessionManager.createSession('session1');
      const session2 = await sessionManager.createSession('session2');

      // session2 should be active now
      expect(sessionManager.getActiveSession()?.id).toBe(session2.id);

      // Close session2, should switch to session1
      await sessionManager.closeSession(session2.id);

      const activeSession = sessionManager.getActiveSession();
      expect(activeSession?.id).toBe(session1.id);
    });

    it('should set active session to undefined if closing the only session', async () => {
      const session = await sessionManager.createSession('test');
      await sessionManager.closeSession(session.id);

      const activeSession = sessionManager.getActiveSession();
      expect(activeSession).toBeUndefined();
    });

    it('should throw error if session not found', async () => {
      await expect(sessionManager.closeSession('non-existent')).rejects.toThrow(
        'Session not found: non-existent'
      );
    });
  });

  describe('switchSession', () => {
    it('should change active session reference', async () => {
      const session1 = await sessionManager.createSession('session1');
      const session2 = await sessionManager.createSession('session2');

      // session2 is active
      expect(sessionManager.getActiveSession()?.id).toBe(session2.id);

      // Switch to session1
      sessionManager.switchSession(session1.id);

      expect(sessionManager.getActiveSession()?.id).toBe(session1.id);
    });

    it('should throw if session not found', () => {
      expect(() => sessionManager.switchSession('non-existent')).toThrow(
        'Session not found: non-existent'
      );
    });

    it('should return the switched session', async () => {
      const session1 = await sessionManager.createSession('session1');
      await sessionManager.createSession('session2');

      const switched = sessionManager.switchSession(session1.id);

      expect(switched.id).toBe(session1.id);
    });
  });

  describe('getActiveSession', () => {
    it('should return current active session', async () => {
      const session = await sessionManager.createSession('test');
      const activeSession = sessionManager.getActiveSession();

      expect(activeSession).toBeDefined();
      expect(activeSession?.id).toBe(session.id);
    });

    it('should return undefined if no sessions exist', () => {
      const activeSession = sessionManager.getActiveSession();

      expect(activeSession).toBeUndefined();
    });
  });

  describe('sendToActiveSession', () => {
    it('should send input to active session process', async () => {
      await sessionManager.createSession('test');
      sessionManager.sendToActiveSession('hello world');

      expect(mockProcess.send).toHaveBeenCalledWith('hello world');
    });

    it('should throw if no active session', () => {
      expect(() => sessionManager.sendToActiveSession('hello')).toThrow(
        'No active session'
      );
    });
  });
});
