/**
 * E2E Tests for Session Scanning and Attaching
 *
 * Tests the ability to:
 * 1. Scan for existing Claude sessions on the system
 * 2. Attach to an existing session and continue it
 * 3. Receive responses from attached sessions
 *
 * Run with: npm test -- --testPathPattern=session-attach --testTimeout=60000
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { existsSync } from 'fs';
import { SessionManager } from '../../src/session/SessionManager.js';
import { OutputParser } from '../../src/parser/OutputParser.js';
import { ClaudeSessionScanner, ExistingClaudeSession } from '../../src/utils/ClaudeSessionScanner.js';
import { ClaudeCodeProcess } from '../../src/session/ClaudeCodeProcess.js';
import type { ClaudeOutput } from '../../src/types/index.js';

const CLAUDE_TIMEOUT = 45000;

// Helper to wait for a condition
async function waitFor(
  condition: () => boolean,
  timeout: number = 10000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

// Check if Claude CLI is available
function isClaudeAvailable(): boolean {
  const paths = [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];
  return paths.some(p => existsSync(p));
}

describe('ClaudeSessionScanner', () => {
  let scanner: ClaudeSessionScanner;

  beforeEach(() => {
    scanner = new ClaudeSessionScanner();
  });

  describe('getRecentSessions', () => {
    it('should return an array of sessions', () => {
      const sessions = scanner.getRecentSessions(10);
      expect(Array.isArray(sessions)).toBe(true);
    });

    it('should return sessions with required properties', () => {
      const sessions = scanner.getRecentSessions(10);

      for (const session of sessions) {
        expect(session).toHaveProperty('sessionId');
        expect(session).toHaveProperty('project');
        expect(session).toHaveProperty('projectName');
        expect(session).toHaveProperty('timestamp');
        expect(session).toHaveProperty('filePath');
        expect(typeof session.sessionId).toBe('string');
        expect(session.timestamp instanceof Date).toBe(true);
      }
    });

    it('should respect the limit parameter', () => {
      const sessions5 = scanner.getRecentSessions(5);
      const sessions10 = scanner.getRecentSessions(10);

      expect(sessions5.length).toBeLessThanOrEqual(5);
      expect(sessions10.length).toBeLessThanOrEqual(10);
    });

    it('should return sessions sorted by timestamp descending', () => {
      const sessions = scanner.getRecentSessions(10);

      for (let i = 1; i < sessions.length; i++) {
        expect(sessions[i - 1].timestamp.getTime())
          .toBeGreaterThanOrEqual(sessions[i].timestamp.getTime());
      }
    });
  });

  describe('formatSession', () => {
    it('should format a session for display', () => {
      const mockSession: ExistingClaudeSession = {
        sessionId: 'abc12345-6789-0123-4567-890abcdef012',
        project: '/Users/test/project',
        projectName: 'project',
        lastMessage: 'This is a test message',
        timestamp: new Date(),
        filePath: '/path/to/session.jsonl',
      };

      const formatted = scanner.formatSession(mockSession);

      expect(formatted).toContain('project');
      expect(formatted).toContain('abc12345');
      expect(formatted).toContain('This is a test message');
    });

    it('should truncate long messages', () => {
      const longMessage = 'A'.repeat(100);
      const mockSession: ExistingClaudeSession = {
        sessionId: 'abc12345-6789-0123-4567-890abcdef012',
        project: '/Users/test/project',
        projectName: 'project',
        lastMessage: longMessage,
        timestamp: new Date(),
        filePath: '/path/to/session.jsonl',
      };

      const formatted = scanner.formatSession(mockSession);

      expect(formatted).toContain('...');
      expect(formatted.length).toBeLessThan(longMessage.length + 100);
    });
  });

  describe('sessionExists', () => {
    it('should return null for non-existent session', () => {
      const result = scanner.sessionExists('non-existent-session-id-12345');
      expect(result).toBeNull();
    });

    it('should return session if it exists in recent sessions', () => {
      const sessions = scanner.getRecentSessions(1);
      if (sessions.length > 0) {
        const result = scanner.sessionExists(sessions[0].sessionId);
        expect(result).not.toBeNull();
        expect(result?.sessionId).toBe(sessions[0].sessionId);
      }
    });
  });
});

describe('Session Attach E2E Tests', () => {
  const shouldSkip = !isClaudeAvailable();

  if (shouldSkip) {
    it('SKIPPED: Claude CLI not found', () => {
      console.warn('Claude CLI not found. Skipping session attach E2E tests.');
      expect(true).toBe(true);
    });
    return;
  }

  let sessionManager: SessionManager;
  let outputParser: OutputParser;
  let scanner: ClaudeSessionScanner;

  beforeEach(() => {
    sessionManager = new SessionManager({
      claudeCliPath: 'claude',
      defaultWorkingDir: process.cwd(),
    });
    outputParser = new OutputParser();
    scanner = new ClaudeSessionScanner();
  });

  afterEach(async () => {
    // Clean up sessions
    const sessions = sessionManager.listSessions();
    for (const session of sessions) {
      try {
        await sessionManager.closeSession(session.id);
      } catch {
        // Ignore
      }
    }
    outputParser.removeAllListeners();
  });

  describe('Creating and finding sessions', () => {
    it('should create a session that can be found by scanner later', async () => {
      // Create a new session and send a message
      const session = await sessionManager.createSession('scanner-test');

      let completed = false;
      let capturedSessionId: string | null = null;

      const unsubscribe = sessionManager.onSessionOutput(session.id, (data: string) => {
        outputParser.parseStreamOutput(data + '\n');
        try {
          const parsed = JSON.parse(data);
          // Capture the Claude session ID from init message
          if (parsed.session_id) {
            capturedSessionId = parsed.session_id;
          }
          if (parsed.type === 'result') {
            completed = true;
          }
        } catch {
          // Not JSON
        }
      });

      sessionManager.sendToActiveSession('say "SCANNER_TEST" exactly');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      unsubscribe();

      // Now check if the session appears in recent sessions
      // Note: There might be a slight delay before it appears in history
      await new Promise(resolve => setTimeout(resolve, 1000));

      const recentSessions = scanner.getRecentSessions(20);

      // The session should be findable (either by our captured ID or in recent list)
      expect(recentSessions.length).toBeGreaterThan(0);

      // At minimum, we should have recent sessions from this project
      const thisProjectSessions = recentSessions.filter(s =>
        s.project.includes('claude-code-telegram') ||
        s.project.includes('claude code telegram')
      );
      expect(thisProjectSessions.length).toBeGreaterThan(0);
    }, CLAUDE_TIMEOUT + 5000);
  });

  describe('Attaching to existing sessions', () => {
    it('should attach to an existing session and continue conversation', async () => {
      // First, create a session and get its Claude session ID
      const session1 = await sessionManager.createSession('attach-test-1');

      let completed = false;
      let claudeSessionId: string | null = null;

      const unsubscribe1 = sessionManager.onSessionOutput(session1.id, (data: string) => {
        outputParser.parseStreamOutput(data + '\n');
        try {
          const parsed = JSON.parse(data);
          if (parsed.session_id && !claudeSessionId) {
            claudeSessionId = parsed.session_id;
          }
          if (parsed.type === 'result') {
            completed = true;
          }
        } catch {
          // Not JSON
        }
      });

      // Send first message to establish session
      sessionManager.sendToActiveSession('remember the code word "ELEPHANT"');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      unsubscribe1();
      expect(claudeSessionId).not.toBeNull();

      // Close the first Telegram session
      await sessionManager.closeSession(session1.id);

      // Reset state
      completed = false;
      outputParser.resetBuffer();
      const textResponses: string[] = [];

      outputParser.on('text', (text: string) => {
        textResponses.push(text);
      });

      // Now attach to the same Claude session
      const session2 = await sessionManager.attachToSession(
        'attach-test-2',
        claudeSessionId!,
        process.cwd()
      );

      const unsubscribe2 = sessionManager.onSessionOutput(session2.id, (data: string) => {
        outputParser.parseStreamOutput(data + '\n');
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'result') {
            completed = true;
          }
        } catch {
          // Not JSON
        }
      });

      // Ask about the code word - should remember from previous conversation
      sessionManager.sendToActiveSession('what was the code word I told you to remember?');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      unsubscribe2();

      // Should mention "ELEPHANT" since we're continuing the same session
      const fullResponse = textResponses.join(' ').toUpperCase();
      expect(fullResponse).toContain('ELEPHANT');
    }, CLAUDE_TIMEOUT * 2 + 5000);
  });

  describe('SessionManager attachToSession', () => {
    it('should create a session marked as attached', async () => {
      // Get a recent session to attach to
      const recentSessions = scanner.getRecentSessions(1);

      if (recentSessions.length === 0) {
        console.warn('No recent sessions to attach to, skipping test');
        return;
      }

      const existingSession = recentSessions[0];

      const session = await sessionManager.attachToSession(
        'test-attach',
        existingSession.sessionId,
        existingSession.project
      );

      expect(session).toBeDefined();
      expect(session.name).toContain('attached');
      expect(session.workingDir).toBe(existingSession.project);
    });

    it('should throw error for invalid working directory', async () => {
      await expect(
        sessionManager.attachToSession('test', 'some-session-id', '/nonexistent/path')
      ).rejects.toThrow('Working directory does not exist');
    });
  });
});

describe('ClaudeCodeProcess with existing session', () => {
  const shouldSkip = !isClaudeAvailable();

  if (shouldSkip) {
    it('SKIPPED: Claude CLI not found', () => {
      expect(true).toBe(true);
    });
    return;
  }

  it('should use --resume flag when created with existing session ID', async () => {
    // First create a session to get a valid session ID
    const process1 = new ClaudeCodeProcess(process.cwd());
    let sessionId: string | null = null;
    let completed = false;

    process1.on('output', (data: string) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.session_id && !sessionId) {
          sessionId = parsed.session_id;
        }
        if (parsed.type === 'result') {
          completed = true;
        }
      } catch {
        // Not JSON
      }
    });

    process1.send('say hello');
    await waitFor(() => completed, CLAUDE_TIMEOUT);
    process1.kill();

    expect(sessionId).not.toBeNull();

    // Now create a process with that session ID
    const process2 = new ClaudeCodeProcess(process.cwd(), 'claude', sessionId!);
    completed = false;
    const outputs: string[] = [];

    process2.on('output', (data: string) => {
      outputs.push(data);
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'result') {
          completed = true;
        }
      } catch {
        // Not JSON
      }
    });

    process2.send('say goodbye');
    await waitFor(() => completed, CLAUDE_TIMEOUT);

    // Verify we got output
    expect(outputs.length).toBeGreaterThan(0);

    // The process should complete successfully
    expect(completed).toBe(true);

    process2.kill();
  }, CLAUDE_TIMEOUT * 2 + 5000);
});

describe('Integration: Full attach workflow simulation', () => {
  const shouldSkip = !isClaudeAvailable();

  if (shouldSkip) {
    it('SKIPPED: Claude CLI not found', () => {
      expect(true).toBe(true);
    });
    return;
  }

  it('should simulate the /sessions command workflow', () => {
    const scanner = new ClaudeSessionScanner();

    // Simulate /sessions command
    const recentSessions = scanner.getRecentSessions(10);
    expect(Array.isArray(recentSessions)).toBe(true);

    // Verify session format for display
    if (recentSessions.length > 0) {
      const formatted = scanner.formatSession(recentSessions[0]);
      expect(formatted).toContain(recentSessions[0].projectName);
    }
  });

  it('should simulate the /attach command workflow with partial ID matching', async () => {
    const sessionManager = new SessionManager({
      claudeCliPath: 'claude',
      defaultWorkingDir: process.cwd(),
    });
    const scanner = new ClaudeSessionScanner();

    const recentSessions = scanner.getRecentSessions(10);

    if (recentSessions.length === 0) {
      console.warn('No recent sessions available, skipping attach simulation');
      return;
    }

    const targetSession = recentSessions[0];
    const partialId = targetSession.sessionId.substring(0, 8);

    // Simulate partial ID matching (what the bot does)
    const matchingSession = recentSessions.find(s =>
      s.sessionId.startsWith(partialId)
    );
    expect(matchingSession).toBeDefined();
    expect(matchingSession?.sessionId).toBe(targetSession.sessionId);

    // Verify we can create an attached session
    const session = await sessionManager.attachToSession(
      matchingSession!.projectName,
      matchingSession!.sessionId,
      matchingSession!.project
    );

    expect(session).toBeDefined();
    expect(session.name).toContain('attached');

    // Cleanup
    await sessionManager.closeSession(session.id);
  });
});
