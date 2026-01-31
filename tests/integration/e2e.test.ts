import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import * as path from 'path';
import { SessionManager } from '../../src/session/SessionManager.js';
import { OutputParser } from '../../src/parser/OutputParser.js';
import type { Session, ParsedQuestion, ClaudeOutput, ToolUseOutput } from '../../src/types/index.js';

// Helper to get a cross-platform test path
const getTestPath = (p: string): string => {
  return path.resolve(p);
};

// Mock fs functions to allow any path in tests
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  statSync: jest.fn(() => ({ isDirectory: () => true })),
}));

// Mock ClaudeCodeProcess
jest.mock('../../src/session/ClaudeCodeProcess.js', () => {
  return {
    ClaudeCodeProcess: jest.fn().mockImplementation(() => {
      const emitter = new EventEmitter();
      (emitter as any).isRunning = true;
      (emitter as any).send = jest.fn((input: string) => {
        // Simulate Claude receiving input and potentially responding
        setTimeout(() => {
          emitter.emit('output', JSON.stringify({
            type: 'assistant',
            content: `Received: ${input}`,
          }));
        }, 10);
      });
      (emitter as any).kill = jest.fn(() => {
        (emitter as any).isRunning = false;
        emitter.emit('close', 0);
      });
      return emitter;
    }),
  };
});

describe('Integration Tests', () => {
  let sessionManager: SessionManager;
  let outputParser: OutputParser;

  beforeEach(() => {
    jest.clearAllMocks();
    sessionManager = new SessionManager({
      claudeCliPath: 'claude',
      defaultWorkingDir: getTestPath('/tmp'),
    });
    outputParser = new OutputParser();
  });

  afterEach(async () => {
    // Clean up all sessions
    const sessions = sessionManager.listSessions();
    for (const session of sessions) {
      try {
        await sessionManager.closeSession(session.id);
      } catch {
        // Ignore errors during cleanup
      }
    }
  });

  describe('Full Workflow', () => {
    it('should create a session and send input', async () => {
      // Create session
      const session = await sessionManager.createSession('test-workflow');
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();

      // Session should be active
      const activeSession = sessionManager.getActiveSession();
      expect(activeSession?.id).toBe(session.id);
    });

    it('should parse output when question is detected', () => {
      const questionOutput: ToolUseOutput = {
        type: 'tool_use',
        name: 'AskUserQuestion',
        input: {
          questions: [{
            question: 'Which framework?',
            options: [
              { label: 'React', description: 'Popular library' },
              { label: 'Vue', description: 'Progressive framework' },
            ],
          }],
        },
      };

      // Detect question
      expect(outputParser.detectQuestion(questionOutput)).toBe(true);

      // Parse question
      const parsed = outputParser.parseQuestion(questionOutput);
      expect(parsed).toBeDefined();
      expect(parsed?.question).toBe('Which framework?');
      expect(parsed?.options).toHaveLength(2);
    });

    it('should format question for Telegram with inline keyboard', () => {
      const question: ParsedQuestion = {
        question: 'Select an option',
        options: [
          { label: 'Option A' },
          { label: 'Option B' },
        ],
        multiSelect: false,
      };

      const formatted = outputParser.formatForTelegram(question);

      expect(formatted.text).toContain('Select an option');
      expect(formatted.parseMode).toBe('Markdown');
      expect(formatted.replyMarkup?.inline_keyboard).toBeDefined();
      expect(formatted.replyMarkup?.inline_keyboard.flat().length).toBeGreaterThan(0);
    });

    it('should emit question event when parsing stream with question', (done) => {
      const questionJson = JSON.stringify({
        type: 'tool_use',
        name: 'AskUserQuestion',
        input: {
          questions: [{
            question: 'Test question?',
            options: [{ label: 'Yes' }, { label: 'No' }],
          }],
        },
      });

      outputParser.on('question', (question: ParsedQuestion) => {
        expect(question.question).toBe('Test question?');
        done();
      });

      outputParser.parseStreamOutput(questionJson + '\n');
    });
  });

  describe('Session Management', () => {
    it('should create multiple sessions with unique IDs', async () => {
      const session1 = await sessionManager.createSession('project-a', getTestPath('/tmp/a'));
      const session2 = await sessionManager.createSession('project-b', getTestPath('/tmp/b'));
      const session3 = await sessionManager.createSession('project-c', getTestPath('/tmp/c'));

      expect(session1.id).not.toBe(session2.id);
      expect(session2.id).not.toBe(session3.id);
      expect(session1.id).not.toBe(session3.id);

      const sessions = sessionManager.listSessions();
      expect(sessions).toHaveLength(3);
    });

    it('should switch between sessions correctly', async () => {
      const session1 = await sessionManager.createSession('first');
      const session2 = await sessionManager.createSession('second');

      // session2 should be active (last created)
      expect(sessionManager.getActiveSession()?.id).toBe(session2.id);

      // Switch to session1
      sessionManager.switchSession(session1.id);
      expect(sessionManager.getActiveSession()?.id).toBe(session1.id);

      // Switch back to session2
      sessionManager.switchSession(session2.id);
      expect(sessionManager.getActiveSession()?.id).toBe(session2.id);
    });

    it('should maintain separate session state', async () => {
      const pathA = getTestPath('/project/a');
      const pathB = getTestPath('/project/b');
      const session1 = await sessionManager.createSession('session-a', pathA);
      const session2 = await sessionManager.createSession('session-b', pathB);

      // Verify sessions have different working directories
      const retrieved1 = sessionManager.getSession(session1.id);
      const retrieved2 = sessionManager.getSession(session2.id);

      expect(retrieved1?.workingDir).toBe(pathA);
      expect(retrieved2?.workingDir).toBe(pathB);
    });

    it('should remove session when closed', async () => {
      const session = await sessionManager.createSession('to-close');
      expect(sessionManager.listSessions()).toHaveLength(1);

      await sessionManager.closeSession(session.id);
      expect(sessionManager.listSessions()).toHaveLength(0);
    });

    it('should switch to another session when active is closed', async () => {
      const session1 = await sessionManager.createSession('keep');
      const session2 = await sessionManager.createSession('close-me');

      // session2 is active
      expect(sessionManager.getActiveSession()?.id).toBe(session2.id);

      // Close session2
      await sessionManager.closeSession(session2.id);

      // session1 should now be active
      expect(sessionManager.getActiveSession()?.id).toBe(session1.id);
    });
  });

  describe('Error Recovery', () => {
    it('should handle session not found gracefully', async () => {
      await expect(sessionManager.closeSession('non-existent')).rejects.toThrow(
        'Session not found'
      );
    });

    it('should handle switch to non-existent session', () => {
      expect(() => sessionManager.switchSession('non-existent')).toThrow(
        'Session not found'
      );
    });

    it('should handle send to no active session', async () => {
      // No sessions created
      expect(() => sessionManager.sendToActiveSession('hello')).toThrow(
        'No active session'
      );
    });

    it('should handle invalid JSON in stream output', () => {
      const results = outputParser.parseStreamOutput('not json\n');
      expect(results).toHaveLength(0);
    });

    it('should continue parsing after invalid JSON', () => {
      const validJson = '{"type":"assistant","content":"Hello"}\n';
      const results = outputParser.parseStreamOutput(
        'invalid\n' + validJson
      );
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('assistant');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle rapid session creation', async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(sessionManager.createSession(`session-${i}`));
      }

      const sessions = await Promise.all(promises);
      expect(sessions).toHaveLength(5);

      // All should have unique IDs
      const ids = new Set(sessions.map((s) => s.id));
      expect(ids.size).toBe(5);
    });

    it('should handle multiple stream chunks', () => {
      const allResults: ClaudeOutput[] = [];

      outputParser.on('output', (output: ClaudeOutput) => {
        allResults.push(output);
      });

      // Send multiple chunks
      outputParser.parseStreamOutput('{"type":"assistant","content":"One"}\n');
      outputParser.parseStreamOutput('{"type":"assistant","content":"Two"}\n');
      outputParser.parseStreamOutput('{"type":"assistant","content":"Three"}\n');

      expect(allResults).toHaveLength(3);
    });

    it('should handle interleaved partial chunks', () => {
      // First partial
      const results1 = outputParser.parseStreamOutput('{"type":"assi');
      expect(results1).toHaveLength(0);

      // Complete first, start second partial
      const results2 = outputParser.parseStreamOutput('stant","content":"A"}\n{"type":"tool');
      expect(results2).toHaveLength(1);

      // Complete second
      const results3 = outputParser.parseStreamOutput('_use","name":"Bash","input":{}}\n');
      expect(results3).toHaveLength(1);
    });
  });

  describe('Output Parser Events', () => {
    it('should emit output event for each parsed message', (done) => {
      let count = 0;
      const expected = 3;

      outputParser.on('output', () => {
        count++;
        if (count === expected) {
          done();
        }
      });

      const data =
        '{"type":"assistant","content":"1"}\n' +
        '{"type":"assistant","content":"2"}\n' +
        '{"type":"assistant","content":"3"}\n';

      outputParser.parseStreamOutput(data);
    });

    it('should emit tool_call event for tool use', (done) => {
      outputParser.on('tool_call', (tool: ToolUseOutput) => {
        expect(tool.name).toBe('Read');
        expect(tool.input).toEqual({ file_path: '/test.txt' });
        done();
      });

      // Tool calls come inside assistant.message.content blocks in stream-json format
      const data = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"/test.txt"}}]}}\n';
      outputParser.parseStreamOutput(data);
    });
  });
});
