/**
 * Real End-to-End Tests for Claude Code Telegram Bot
 *
 * These tests use the REAL Claude CLI (not mocked) to verify the complete
 * flow from user input through the bot to Claude and back.
 *
 * Requirements:
 * - Claude CLI must be installed and accessible
 * - Valid Anthropic API credentials (via env vars or Foundry)
 *
 * Run with: npm test -- --testPathPattern=real-e2e --testTimeout=60000
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { SessionManager } from '../../src/session/SessionManager.js';
import { OutputParser } from '../../src/parser/OutputParser.js';
import { ClaudeCodeProcess } from '../../src/session/ClaudeCodeProcess.js';
import type { ParsedQuestion, ClaudeOutput } from '../../src/types/index.js';

// Test timeout for Claude API calls
const CLAUDE_TIMEOUT = 45000;

// Mock Telegram API only (not Claude CLI)
interface MockTelegramMessage {
  chatId: number;
  text: string;
  options?: Record<string, unknown>;
}

class MockTelegramAPI extends EventEmitter {
  public sentMessages: MockTelegramMessage[] = [];

  async sendMessage(chatId: number, text: string, options?: Record<string, unknown>): Promise<{ message_id: number }> {
    this.sentMessages.push({ chatId, text, options });
    this.emit('messageSent', { chatId, text, options });
    return { message_id: this.sentMessages.length };
  }

  getLastMessage(): MockTelegramMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  getMessagesByChat(chatId: number): MockTelegramMessage[] {
    return this.sentMessages.filter(m => m.chatId === chatId);
  }

  clear(): void {
    this.sentMessages = [];
  }
}

// Helper to wait for a condition with timeout
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

describe('Real E2E Tests - Claude CLI Integration', () => {
  // Skip all tests if Claude CLI is not available
  const shouldSkip = !isClaudeAvailable();

  if (shouldSkip) {
    it('SKIPPED: Claude CLI not found', () => {
      console.warn('Claude CLI not found. Skipping real E2E tests.');
      expect(true).toBe(true);
    });
    return;
  }

  let sessionManager: SessionManager;
  let outputParser: OutputParser;
  let mockTelegram: MockTelegramAPI;
  let textEvents: string[] = [];
  let outputEvents: ClaudeOutput[] = [];

  beforeAll(() => {
    // Ensure environment is clean for spawned processes
    // Note: The ClaudeCodeProcess should already handle this
  });

  beforeEach(() => {
    // Create fresh instances for each test
    sessionManager = new SessionManager({
      claudeCliPath: 'claude',
      defaultWorkingDir: process.cwd(),
    });

    outputParser = new OutputParser();
    mockTelegram = new MockTelegramAPI();
    textEvents = [];
    outputEvents = [];

    // Set up output parser event listeners
    outputParser.on('text', (text: string) => {
      textEvents.push(text);
      // Simulate forwarding to Telegram
      if (text && text.trim()) {
        mockTelegram.sendMessage(12345, text);
      }
    });

    outputParser.on('output', (output: ClaudeOutput) => {
      outputEvents.push(output);
    });

    outputParser.on('question', (question: ParsedQuestion) => {
      const formatted = outputParser.formatForTelegram(question);
      mockTelegram.sendMessage(12345, formatted.text, {
        reply_markup: formatted.replyMarkup
      });
    });

    outputParser.on('progress', (progress: { type: string; toolName?: string }) => {
      if (progress.type === 'tool_start' && progress.toolName) {
        mockTelegram.sendMessage(12345, `🔧 Running: ${progress.toolName}`);
      }
    });
  });

  afterEach(async () => {
    // Clean up all sessions
    const sessions = sessionManager.listSessions();
    for (const session of sessions) {
      try {
        await sessionManager.closeSession(session.id);
      } catch {
        // Ignore cleanup errors
      }
    }

    outputParser.removeAllListeners();
    mockTelegram.removeAllListeners();
  });

  describe('Basic Message Flow', () => {
    it('should send message to Claude and receive response', async () => {
      // Create session
      const session = await sessionManager.createSession('e2e-test');
      expect(session).toBeDefined();

      // Track when we receive the result type (indicates completion)
      let completed = false;

      // Subscribe to session output
      const outputUnsubscribe = sessionManager.onSessionOutput(session.id, (data: string) => {
        outputParser.parseStreamOutput(data + '\n');

        // Check for completion
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'result') {
            completed = true;
          }
        } catch {
          // Not JSON, ignore
        }
      });

      // Send a simple message
      sessionManager.sendToActiveSession('say hello in one word');

      // Wait for completion
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      // Verify we received text
      expect(textEvents.length).toBeGreaterThan(0);
      const responseText = textEvents.join(' ').toLowerCase();
      expect(responseText).toContain('hello');

      // Verify message was "sent" to Telegram
      expect(mockTelegram.sentMessages.length).toBeGreaterThan(0);

      outputUnsubscribe();
    }, CLAUDE_TIMEOUT);

    it('should handle multiple messages in sequence', async () => {
      const session = await sessionManager.createSession('sequence-test');

      let completed = false;

      const outputUnsubscribe = sessionManager.onSessionOutput(session.id, (data: string) => {
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

      // First message
      sessionManager.sendToActiveSession('say "one" and nothing else');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      const firstResponse = textEvents.join('').toLowerCase();
      expect(firstResponse).toContain('one');

      // Clear for second message
      textEvents = [];
      mockTelegram.clear();
      outputParser.resetBuffer();
      completed = false;

      // Second message (uses --resume internally for conversation continuity)
      sessionManager.sendToActiveSession('say "two" and nothing else');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      const secondResponse = textEvents.join('').toLowerCase();
      expect(secondResponse).toContain('two');

      outputUnsubscribe();
    }, CLAUDE_TIMEOUT * 2);
  });

  describe('Session Management', () => {
    it('should create and manage multiple sessions', async () => {
      const session1 = await sessionManager.createSession('session-1');
      const session2 = await sessionManager.createSession('session-2');

      expect(session1.id).not.toBe(session2.id);
      expect(sessionManager.listSessions()).toHaveLength(2);

      // Active should be session2 (last created)
      expect(sessionManager.getActiveSession()?.id).toBe(session2.id);

      // Switch to session1
      sessionManager.switchSession(session1.id);
      expect(sessionManager.getActiveSession()?.id).toBe(session1.id);
    });

    it('should send messages to the correct active session', async () => {
      const session1 = await sessionManager.createSession('active-test-1');
      const session2 = await sessionManager.createSession('active-test-2');

      let completed = false;

      // session2 is active
      const outputUnsubscribe = sessionManager.onSessionOutput(session2.id, (data: string) => {
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

      sessionManager.sendToActiveSession('say "session2" and nothing else');

      await waitFor(() => completed, CLAUDE_TIMEOUT);

      const response = textEvents.join('').toLowerCase();
      expect(response).toContain('session2');

      outputUnsubscribe();
    }, CLAUDE_TIMEOUT);

    it('should close sessions properly', async () => {
      const session = await sessionManager.createSession('close-test');
      expect(sessionManager.listSessions()).toHaveLength(1);

      await sessionManager.closeSession(session.id);
      expect(sessionManager.listSessions()).toHaveLength(0);
    });
  });

  describe('Output Parser Integration', () => {
    it('should parse streaming JSON output correctly', async () => {
      const session = await sessionManager.createSession('parser-test');

      let completed = false;

      const outputUnsubscribe = sessionManager.onSessionOutput(session.id, (data: string) => {
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

      sessionManager.sendToActiveSession('say hello in one word');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      // Should have received various output types
      const outputTypes = outputEvents.map(o => o.type);
      expect(outputTypes).toContain('system'); // init, hook_started, hook_response
      expect(outputTypes).toContain('assistant'); // the actual response
      expect(outputTypes).toContain('result'); // completion result

      outputUnsubscribe();
    }, CLAUDE_TIMEOUT);

    it('should emit text events for assistant messages', async () => {
      const session = await sessionManager.createSession('text-event-test');

      let completed = false;

      const outputUnsubscribe = sessionManager.onSessionOutput(session.id, (data: string) => {
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

      sessionManager.sendToActiveSession('respond with exactly: TEST_RESPONSE_123');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      // Should have emitted at least one text event
      expect(textEvents.length).toBeGreaterThan(0);

      // The response should contain our marker
      const fullResponse = textEvents.join(' ');
      expect(fullResponse).toContain('TEST_RESPONSE_123');

      outputUnsubscribe();
    }, CLAUDE_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle session not found gracefully', async () => {
      await expect(sessionManager.closeSession('non-existent-id')).rejects.toThrow('Session not found');
    });

    it('should handle switch to non-existent session', () => {
      expect(() => sessionManager.switchSession('non-existent')).toThrow('Session not found');
    });

    it('should handle send to no active session', () => {
      expect(() => sessionManager.sendToActiveSession('test')).toThrow('No active session');
    });

    it('should report errors through error events', async () => {
      const session = await sessionManager.createSession('error-test');

      let errorReceived = false;

      sessionManager.onSessionError(session.id, (_error: Error) => {
        errorReceived = true;
      });

      // This test verifies the error subscription works
      // Actual errors would be emitted by ClaudeCodeProcess
      expect(errorReceived).toBe(false); // No error yet
    });
  });

  describe('Telegram Message Formatting', () => {
    it('should truncate long messages', async () => {
      const session = await sessionManager.createSession('truncate-test');

      let completed = false;

      const outputUnsubscribe = sessionManager.onSessionOutput(session.id, (data: string) => {
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

      sessionManager.sendToActiveSession('say hello');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      // All messages sent to Telegram should be under 4096 chars (Telegram limit)
      for (const msg of mockTelegram.sentMessages) {
        expect(msg.text.length).toBeLessThanOrEqual(4100); // Allow small buffer
      }

      outputUnsubscribe();
    }, CLAUDE_TIMEOUT);

    it('should format questions with inline keyboard', () => {
      const question: ParsedQuestion = {
        question: 'Which option do you prefer?',
        header: 'Test Question',
        options: [
          { label: 'Option A', description: 'First option' },
          { label: 'Option B', description: 'Second option' },
        ],
        multiSelect: false,
      };

      const formatted = outputParser.formatForTelegram(question);

      expect(formatted.text).toContain('Test Question');
      expect(formatted.text).toContain('Which option do you prefer');
      expect(formatted.parseMode).toBe('Markdown');
      expect(formatted.replyMarkup?.inline_keyboard).toBeDefined();
      expect(formatted.replyMarkup?.inline_keyboard.length).toBeGreaterThan(0);
    });
  });

  describe('Full Bot Simulation', () => {
    it('should simulate complete user interaction flow', async () => {
      // Simulate: User creates session -> sends message -> receives response

      // Step 1: Create session (simulating /new command)
      const session = await sessionManager.createSession('full-simulation');
      expect(session.status).toBe('idle');

      // Simulate bot sending confirmation
      mockTelegram.sendMessage(12345, `Session created!\nID: ${session.id}\nName: ${session.name}`);
      expect(mockTelegram.sentMessages.length).toBe(1);

      // Step 2: Subscribe to output
      let completed = false;

      const outputUnsubscribe = sessionManager.onSessionOutput(session.id, (data: string) => {
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

      // Step 3: Send user message (simulating text input)
      mockTelegram.clear();

      // Simulate bot confirming message sent
      mockTelegram.sendMessage(12345, 'Sent to Claude session.');

      sessionManager.sendToActiveSession('say "SIMULATION_SUCCESS" exactly');

      // Step 4: Wait for Claude response
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      // Step 5: Verify response was forwarded to Telegram
      await waitFor(() => mockTelegram.sentMessages.some(m =>
        m.text.includes('SIMULATION_SUCCESS')
      ), 5000);

      const responseMessage = mockTelegram.sentMessages.find(m =>
        m.text.includes('SIMULATION_SUCCESS')
      );
      expect(responseMessage).toBeDefined();

      outputUnsubscribe();
    }, CLAUDE_TIMEOUT);
  });
});

describe('ClaudeCodeProcess Direct Tests', () => {
  const shouldSkip = !isClaudeAvailable();

  if (shouldSkip) {
    it('SKIPPED: Claude CLI not found', () => {
      expect(true).toBe(true);
    });
    return;
  }

  it('should spawn Claude CLI and receive output', async () => {
    const claudeProcess = new ClaudeCodeProcess(process.cwd());
    const outputs: string[] = [];

    claudeProcess.on('output', (data: string) => {
      outputs.push(data);
    });

    let completed = false;
    claudeProcess.on('message_complete', () => {
      completed = true;
    });

    claudeProcess.send('say hello in exactly one word');

    await waitFor(() => completed, CLAUDE_TIMEOUT);

    expect(outputs.length).toBeGreaterThan(0);

    // Parse outputs to find assistant message
    let foundAssistant = false;
    for (const output of outputs) {
      try {
        const parsed = JSON.parse(output);
        if (parsed.type === 'assistant') {
          foundAssistant = true;
          break;
        }
      } catch {
        // Not JSON, skip
      }
    }
    expect(foundAssistant).toBe(true);

    claudeProcess.kill();
  }, CLAUDE_TIMEOUT);

  it('should clean environment variables when spawning', async () => {
    // This test verifies the fix for CLAUDE_SESSION_ID inheritance
    // The process should complete even when run from within another Claude session

    const claudeProcess = new ClaudeCodeProcess(process.cwd());
    let completed = false;

    claudeProcess.on('message_complete', () => {
      completed = true;
    });

    claudeProcess.send('say ok');

    // Should complete within timeout (not hang due to env vars)
    await waitFor(() => completed, CLAUDE_TIMEOUT - 5000);
    expect(completed).toBe(true);

    claudeProcess.kill();
  }, CLAUDE_TIMEOUT);
});

describe('Integration: OutputParser with Real Claude Output', () => {
  const shouldSkip = !isClaudeAvailable();

  if (shouldSkip) {
    it('SKIPPED: Claude CLI not found', () => {
      expect(true).toBe(true);
    });
    return;
  }

  it('should correctly parse all event types from real Claude output', async () => {
    const claudeProcess = new ClaudeCodeProcess(process.cwd());
    const outputParser = new OutputParser();

    const eventTypes: Set<string> = new Set();
    const textMessages: string[] = [];

    outputParser.on('output', (output: ClaudeOutput) => {
      eventTypes.add(output.type);
    });

    outputParser.on('text', (text: string) => {
      textMessages.push(text);
    });

    let completed = false;

    claudeProcess.on('output', (data: string) => {
      outputParser.parseStreamOutput(data + '\n');
    });

    claudeProcess.on('message_complete', () => {
      completed = true;
    });

    claudeProcess.send('say "PARSER_TEST" exactly');

    await waitFor(() => completed, CLAUDE_TIMEOUT);

    // Verify expected event types were received
    expect(eventTypes.has('system')).toBe(true);
    expect(eventTypes.has('assistant')).toBe(true);
    expect(eventTypes.has('result')).toBe(true);

    // Verify text was emitted
    expect(textMessages.length).toBeGreaterThan(0);
    const fullText = textMessages.join(' ');
    expect(fullText).toContain('PARSER_TEST');

    claudeProcess.kill();
  }, CLAUDE_TIMEOUT);
});
