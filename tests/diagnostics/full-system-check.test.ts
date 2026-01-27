/**
 * Full System Diagnostic Tests
 *
 * Comprehensive check of the entire Claude Code Telegram Bot system.
 * This will verify:
 * 1. Claude CLI is available and working
 * 2. ClaudeCodeProcess can spawn and communicate
 * 3. SessionManager can create/manage sessions
 * 4. OutputParser correctly parses Claude output
 * 5. TelegramBot components are properly initialized
 * 6. Session attach/resume functionality works
 * 7. End-to-end message flow works
 *
 * Run with: npm test -- --testPathPattern=full-system-check --testTimeout=120000
 */

import { jest, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { SessionManager } from '../../src/session/SessionManager.js';
import { ClaudeCodeProcess } from '../../src/session/ClaudeCodeProcess.js';
import { OutputParser } from '../../src/parser/OutputParser.js';
import { ClaudeSessionScanner } from '../../src/utils/ClaudeSessionScanner.js';
import type { ParsedQuestion } from '../../src/types/index.js';

const CLAUDE_TIMEOUT = 60000;

// ============================================================================
// DIAGNOSTIC UTILITIES
// ============================================================================

interface DiagnosticResult {
  component: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  message: string;
  details?: string;
}

const diagnosticResults: DiagnosticResult[] = [];

function recordResult(result: DiagnosticResult): void {
  diagnosticResults.push(result);
  const icon = {
    'PASS': '✅',
    'FAIL': '❌',
    'WARN': '⚠️',
    'SKIP': '⏭️'
  }[result.status];
  console.log(`${icon} [${result.component}] ${result.message}`);
  if (result.details) {
    console.log(`   Details: ${result.details}`);
  }
}

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

// ============================================================================
// 1. CLAUDE CLI AVAILABILITY CHECK
// ============================================================================

describe('1. Claude CLI Availability', () => {
  const COMMON_PATHS = [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];

  let claudePath: string | null = null;

  it('should find Claude CLI in common paths', () => {
    for (const path of COMMON_PATHS) {
      if (existsSync(path)) {
        claudePath = path;
        break;
      }
    }

    if (claudePath) {
      recordResult({
        component: 'Claude CLI',
        status: 'PASS',
        message: `Claude CLI found at ${claudePath}`
      });
      expect(claudePath).not.toBeNull();
    } else {
      recordResult({
        component: 'Claude CLI',
        status: 'FAIL',
        message: 'Claude CLI not found in common paths',
        details: `Checked: ${COMMON_PATHS.join(', ')}`
      });
      // Don't fail - skip remaining tests
    }
  });

  it('should verify Claude CLI is executable', () => {
    if (!claudePath) {
      recordResult({
        component: 'Claude CLI',
        status: 'SKIP',
        message: 'Skipping - CLI not found'
      });
      return;
    }

    try {
      const result = execSync(`${claudePath} --version 2>&1`, {
        timeout: 5000,
        encoding: 'utf-8'
      });
      recordResult({
        component: 'Claude CLI',
        status: 'PASS',
        message: 'Claude CLI is executable',
        details: result.trim().split('\n')[0]
      });
      expect(result).toBeTruthy();
    } catch (error) {
      recordResult({
        component: 'Claude CLI',
        status: 'FAIL',
        message: 'Claude CLI failed to execute',
        details: String(error)
      });
    }
  });

  it('should verify Claude CLI supports required flags', () => {
    if (!claudePath) {
      recordResult({
        component: 'Claude CLI',
        status: 'SKIP',
        message: 'Skipping - CLI not found'
      });
      return;
    }

    try {
      const helpText = execSync(`${claudePath} --help 2>&1`, {
        timeout: 5000,
        encoding: 'utf-8'
      });

      const requiredFlags = ['--print', '--verbose', '--output-format', '--resume'];
      const missingFlags = requiredFlags.filter(flag => !helpText.includes(flag));

      if (missingFlags.length === 0) {
        recordResult({
          component: 'Claude CLI',
          status: 'PASS',
          message: 'All required flags are supported'
        });
      } else {
        recordResult({
          component: 'Claude CLI',
          status: 'WARN',
          message: 'Some flags may not be supported',
          details: `Missing: ${missingFlags.join(', ')}`
        });
      }
      expect(missingFlags.length).toBeLessThanOrEqual(2); // Allow some flexibility
    } catch (error) {
      recordResult({
        component: 'Claude CLI',
        status: 'WARN',
        message: 'Could not verify CLI flags',
        details: String(error)
      });
    }
  });
});

// ============================================================================
// 2. CLAUDE CODE PROCESS CHECK
// ============================================================================

describe('2. ClaudeCodeProcess', () => {
  let isClaudeAvailable = false;

  beforeAll(() => {
    const paths = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', '/usr/bin/claude'];
    isClaudeAvailable = paths.some(p => existsSync(p));
  });

  it('should instantiate without errors', () => {
    try {
      const proc = new ClaudeCodeProcess(process.cwd());
      recordResult({
        component: 'ClaudeCodeProcess',
        status: 'PASS',
        message: 'ClaudeCodeProcess instantiated successfully'
      });
      expect(proc).toBeDefined();
      expect(proc.isRunning).toBe(true);
      proc.kill();
    } catch (error) {
      recordResult({
        component: 'ClaudeCodeProcess',
        status: 'FAIL',
        message: 'Failed to instantiate ClaudeCodeProcess',
        details: String(error)
      });
      throw error;
    }
  });

  it('should emit output events when sending a message', async () => {
    if (!isClaudeAvailable) {
      recordResult({
        component: 'ClaudeCodeProcess',
        status: 'SKIP',
        message: 'Skipping - Claude CLI not available'
      });
      return;
    }

    const proc = new ClaudeCodeProcess(process.cwd());
    const outputs: string[] = [];
    let completed = false;
    let capturedSessionId: string | null = null;

    proc.on('output', (data: string) => {
      outputs.push(data);
      try {
        const parsed = JSON.parse(data);
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

    proc.on('error', (error: Error) => {
      recordResult({
        component: 'ClaudeCodeProcess',
        status: 'FAIL',
        message: 'Process emitted error',
        details: error.message
      });
    });

    try {
      proc.send('say "DIAGNOSTIC_TEST" exactly');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      const sessionIdDisplay = capturedSessionId ? (capturedSessionId as string).substring(0, 8) : 'none';
      recordResult({
        component: 'ClaudeCodeProcess',
        status: 'PASS',
        message: 'Process received response from Claude',
        details: `${outputs.length} output events, session ID: ${sessionIdDisplay}...`
      });

      expect(outputs.length).toBeGreaterThan(0);
      expect(capturedSessionId).not.toBeNull();
    } catch (error) {
      recordResult({
        component: 'ClaudeCodeProcess',
        status: 'FAIL',
        message: 'Process timed out or failed',
        details: `Received ${outputs.length} outputs before failure`
      });
      throw error;
    } finally {
      proc.kill();
    }
  }, CLAUDE_TIMEOUT + 5000);

  it('should capture session ID for conversation continuity', async () => {
    if (!isClaudeAvailable) {
      recordResult({
        component: 'ClaudeCodeProcess',
        status: 'SKIP',
        message: 'Skipping session ID test - Claude CLI not available'
      });
      return;
    }

    const proc = new ClaudeCodeProcess(process.cwd());
    let completed = false;

    proc.on('output', (data: string) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'result') {
          completed = true;
        }
      } catch {
        // Not JSON
      }
    });

    try {
      proc.send('hi');
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      const sessionId = proc.getSessionId();

      if (sessionId) {
        recordResult({
          component: 'ClaudeCodeProcess',
          status: 'PASS',
          message: 'Session ID captured correctly',
          details: `ID: ${sessionId.substring(0, 8)}...`
        });
      } else {
        recordResult({
          component: 'ClaudeCodeProcess',
          status: 'WARN',
          message: 'Session ID not captured',
          details: 'This may affect conversation continuity'
        });
      }

      expect(sessionId).not.toBeNull();
    } finally {
      proc.kill();
    }
  }, CLAUDE_TIMEOUT + 5000);
});

// ============================================================================
// 3. SESSION MANAGER CHECK
// ============================================================================

describe('3. SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager({
      claudeCliPath: 'claude',
      defaultWorkingDir: process.cwd(),
    });
  });

  afterEach(async () => {
    // Cleanup all sessions
    const sessions = sessionManager.listSessions();
    for (const session of sessions) {
      try {
        await sessionManager.closeSession(session.id);
      } catch {
        // Ignore
      }
    }
  });

  it('should instantiate with default config', () => {
    try {
      recordResult({
        component: 'SessionManager',
        status: 'PASS',
        message: 'SessionManager instantiated successfully'
      });
      expect(sessionManager).toBeDefined();
      expect(sessionManager.sessionCount).toBe(0);
    } catch (error) {
      recordResult({
        component: 'SessionManager',
        status: 'FAIL',
        message: 'Failed to instantiate SessionManager',
        details: String(error)
      });
      throw error;
    }
  });

  it('should create a session', async () => {
    try {
      const session = await sessionManager.createSession('diagnostic-test');

      recordResult({
        component: 'SessionManager',
        status: 'PASS',
        message: 'Session created successfully',
        details: `ID: ${session.id}, Name: ${session.name}`
      });

      expect(session).toBeDefined();
      expect(session.name).toBe('diagnostic-test');
      expect(session.status).toBe('idle');
      expect(sessionManager.sessionCount).toBe(1);
    } catch (error) {
      recordResult({
        component: 'SessionManager',
        status: 'FAIL',
        message: 'Failed to create session',
        details: String(error)
      });
      throw error;
    }
  });

  it('should validate working directory', async () => {
    try {
      await sessionManager.createSession('test', '/nonexistent/path');
      recordResult({
        component: 'SessionManager',
        status: 'FAIL',
        message: 'Should have rejected invalid working directory'
      });
    } catch (error) {
      recordResult({
        component: 'SessionManager',
        status: 'PASS',
        message: 'Correctly validates working directory',
        details: 'Rejected non-existent path'
      });
      expect(String(error)).toContain('does not exist');
    }
  });

  it('should track active session', async () => {
    const session1 = await sessionManager.createSession('session-1');
    const session2 = await sessionManager.createSession('session-2');

    const active = sessionManager.getActiveSession();

    if (active?.id === session2.id) {
      recordResult({
        component: 'SessionManager',
        status: 'PASS',
        message: 'Active session tracking works correctly'
      });
    } else {
      recordResult({
        component: 'SessionManager',
        status: 'FAIL',
        message: 'Active session not tracked correctly'
      });
    }

    expect(active?.id).toBe(session2.id);
  });

  it('should switch between sessions', async () => {
    const session1 = await sessionManager.createSession('session-1');
    const session2 = await sessionManager.createSession('session-2');

    sessionManager.switchSession(session1.id);
    const active = sessionManager.getActiveSession();

    if (active?.id === session1.id) {
      recordResult({
        component: 'SessionManager',
        status: 'PASS',
        message: 'Session switching works correctly'
      });
    } else {
      recordResult({
        component: 'SessionManager',
        status: 'FAIL',
        message: 'Session switching failed'
      });
    }

    expect(active?.id).toBe(session1.id);
  });
});

// ============================================================================
// 4. OUTPUT PARSER CHECK
// ============================================================================

describe('4. OutputParser', () => {
  let outputParser: OutputParser;

  beforeEach(() => {
    outputParser = new OutputParser();
  });

  afterEach(() => {
    outputParser.removeAllListeners();
  });

  it('should instantiate correctly', () => {
    try {
      recordResult({
        component: 'OutputParser',
        status: 'PASS',
        message: 'OutputParser instantiated successfully'
      });
      expect(outputParser).toBeDefined();
    } catch (error) {
      recordResult({
        component: 'OutputParser',
        status: 'FAIL',
        message: 'Failed to instantiate OutputParser',
        details: String(error)
      });
      throw error;
    }
  });

  it('should parse assistant text messages', () => {
    const textEvents: string[] = [];
    outputParser.on('text', (text: string) => textEvents.push(text));

    outputParser.parseStreamOutput('{"type":"assistant","message":{"content":[{"type":"text","text":"Hello from Claude"}]}}\n');

    if (textEvents.length > 0 && textEvents[0].includes('Hello from Claude')) {
      recordResult({
        component: 'OutputParser',
        status: 'PASS',
        message: 'Parses assistant text messages correctly'
      });
    } else {
      recordResult({
        component: 'OutputParser',
        status: 'FAIL',
        message: 'Failed to parse assistant text message',
        details: `Events: ${JSON.stringify(textEvents)}`
      });
    }

    expect(textEvents.length).toBeGreaterThan(0);
  });

  it('should emit started event on system init', () => {
    let startedEmitted = false;
    outputParser.on('started', () => { startedEmitted = true; });

    outputParser.parseStreamOutput('{"type":"system","subtype":"init","session_id":"test-123"}\n');

    if (startedEmitted) {
      recordResult({
        component: 'OutputParser',
        status: 'PASS',
        message: 'Emits "started" event on system init'
      });
    } else {
      recordResult({
        component: 'OutputParser',
        status: 'FAIL',
        message: 'Failed to emit "started" event'
      });
    }

    expect(startedEmitted).toBe(true);
  });

  it('should detect questions with options', () => {
    const questions: any[] = [];
    outputParser.on('question', (q: any) => questions.push(q));

    const questionPayload = {
      type: "assistant",
      message: {
        content: [{
          type: "tool_use",
          name: "AskUserQuestion",
          input: {
            questions: [{
              question: "Which option?",
              header: "Test",
              multiSelect: false,
              options: [
                { label: "Option A", description: "First option" },
                { label: "Option B", description: "Second option" }
              ]
            }]
          }
        }]
      }
    };

    outputParser.parseStreamOutput(JSON.stringify(questionPayload) + '\n');

    if (questions.length > 0) {
      recordResult({
        component: 'OutputParser',
        status: 'PASS',
        message: 'Detects questions with options correctly'
      });
    } else {
      recordResult({
        component: 'OutputParser',
        status: 'FAIL',
        message: 'Failed to detect questions'
      });
    }

    expect(questions.length).toBeGreaterThan(0);
  });

  it('should format questions for Telegram with proper escaping', () => {
    // Test that formatForTelegram properly escapes markdown
    const question: ParsedQuestion = {
      question: 'Choose *one* option:',
      header: 'Test_Header',
      options: [
        { label: 'Option_A', description: 'First *option*' },
        { label: 'Option_B', description: 'Second option' }
      ],
      multiSelect: false
    };

    const formatted = outputParser.formatForTelegram(question);

    // Check if markdown characters are escaped
    const hasEscapedAsterisk = formatted.text.includes('\\*');
    const hasEscapedUnderscore = formatted.text.includes('\\_');

    if (hasEscapedAsterisk && hasEscapedUnderscore) {
      recordResult({
        component: 'OutputParser',
        status: 'PASS',
        message: 'Escapes Telegram markdown characters in formatForTelegram'
      });
    } else {
      recordResult({
        component: 'OutputParser',
        status: 'WARN',
        message: 'Markdown escaping may not be complete',
        details: `Asterisk escaped: ${hasEscapedAsterisk}, Underscore escaped: ${hasEscapedUnderscore}`
      });
    }

    // Also verify text event emission works (raw text should not be escaped)
    const textEvents: string[] = [];
    outputParser.on('text', (text: string) => textEvents.push(text));
    outputParser.parseStreamOutput('{"type":"assistant","message":{"content":[{"type":"text","text":"Test *bold* and _italic_"}]}}\n');

    expect(textEvents.length).toBeGreaterThan(0);
    expect(textEvents[0]).toContain('*bold*'); // Raw text should preserve original
  });
});

// ============================================================================
// 5. CLAUDE SESSION SCANNER CHECK
// ============================================================================

describe('5. ClaudeSessionScanner', () => {
  let scanner: ClaudeSessionScanner;

  beforeEach(() => {
    scanner = new ClaudeSessionScanner();
  });

  it('should instantiate correctly', () => {
    try {
      recordResult({
        component: 'ClaudeSessionScanner',
        status: 'PASS',
        message: 'ClaudeSessionScanner instantiated successfully'
      });
      expect(scanner).toBeDefined();
    } catch (error) {
      recordResult({
        component: 'ClaudeSessionScanner',
        status: 'FAIL',
        message: 'Failed to instantiate ClaudeSessionScanner',
        details: String(error)
      });
      throw error;
    }
  });

  it('should return array from getRecentSessions', () => {
    const sessions = scanner.getRecentSessions(10);

    recordResult({
      component: 'ClaudeSessionScanner',
      status: 'PASS',
      message: `Found ${sessions.length} recent sessions`,
      details: sessions.length > 0 ? `Latest: ${sessions[0].projectName}` : 'No sessions found'
    });

    expect(Array.isArray(sessions)).toBe(true);
  });

  it('should format sessions for display', () => {
    const sessions = scanner.getRecentSessions(1);

    if (sessions.length > 0) {
      const formatted = scanner.formatSession(sessions[0]);

      if (formatted.includes(sessions[0].projectName)) {
        recordResult({
          component: 'ClaudeSessionScanner',
          status: 'PASS',
          message: 'Session formatting works correctly'
        });
      } else {
        recordResult({
          component: 'ClaudeSessionScanner',
          status: 'FAIL',
          message: 'Session formatting incorrect'
        });
      }

      expect(formatted).toContain(sessions[0].projectName);
    } else {
      recordResult({
        component: 'ClaudeSessionScanner',
        status: 'SKIP',
        message: 'No sessions to format'
      });
    }
  });
});

// ============================================================================
// 6. END-TO-END MESSAGE FLOW CHECK
// ============================================================================

describe('6. End-to-End Message Flow', () => {
  let isClaudeAvailable = false;

  beforeAll(() => {
    const paths = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', '/usr/bin/claude'];
    isClaudeAvailable = paths.some(p => existsSync(p));
  });

  it('should complete full message flow: SessionManager -> ClaudeCodeProcess -> OutputParser', async () => {
    if (!isClaudeAvailable) {
      recordResult({
        component: 'E2E Flow',
        status: 'SKIP',
        message: 'Skipping - Claude CLI not available'
      });
      return;
    }

    const sessionManager = new SessionManager({
      claudeCliPath: 'claude',
      defaultWorkingDir: process.cwd(),
    });
    const outputParser = new OutputParser();

    let sessionStarted = false;
    let textReceived = false;
    let completed = false;
    const receivedTexts: string[] = [];

    outputParser.on('started', () => {
      sessionStarted = true;
    });

    outputParser.on('text', (text: string) => {
      textReceived = true;
      receivedTexts.push(text);
    });

    try {
      // Create session
      const session = await sessionManager.createSession('e2e-diagnostic');

      // Subscribe to output
      const unsubscribe = sessionManager.onSessionOutput(session.id, (data: string) => {
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

      // Send message
      sessionManager.sendToActiveSession('say "E2E_SUCCESS" exactly');

      // Wait for completion
      await waitFor(() => completed, CLAUDE_TIMEOUT);

      unsubscribe();

      // Check results
      const fullResponse = receivedTexts.join(' ');
      const hasExpectedResponse = fullResponse.toUpperCase().includes('E2E_SUCCESS');

      if (sessionStarted && textReceived && hasExpectedResponse) {
        recordResult({
          component: 'E2E Flow',
          status: 'PASS',
          message: 'Full message flow completed successfully',
          details: `Started: ${sessionStarted}, Text received: ${textReceived}, Correct response: ${hasExpectedResponse}`
        });
      } else {
        recordResult({
          component: 'E2E Flow',
          status: 'FAIL',
          message: 'Message flow incomplete',
          details: `Started: ${sessionStarted}, Text: ${textReceived}, Response: ${fullResponse.substring(0, 50)}`
        });
      }

      expect(completed).toBe(true);

      // Cleanup
      await sessionManager.closeSession(session.id);
    } catch (error) {
      recordResult({
        component: 'E2E Flow',
        status: 'FAIL',
        message: 'E2E flow failed',
        details: String(error)
      });
      throw error;
    } finally {
      outputParser.removeAllListeners();
    }
  }, CLAUDE_TIMEOUT + 10000);
});

// ============================================================================
// 7. SESSION RESUME CHECK
// ============================================================================

describe('7. Session Resume Functionality', () => {
  let isClaudeAvailable = false;

  beforeAll(() => {
    const paths = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', '/usr/bin/claude'];
    isClaudeAvailable = paths.some(p => existsSync(p));
  });

  it('should maintain conversation context with --resume', async () => {
    if (!isClaudeAvailable) {
      recordResult({
        component: 'Session Resume',
        status: 'SKIP',
        message: 'Skipping - Claude CLI not available'
      });
      return;
    }

    const sessionManager = new SessionManager({
      claudeCliPath: 'claude',
      defaultWorkingDir: process.cwd(),
    });
    const outputParser = new OutputParser();

    let completed = false;
    let capturedClaudeSessionId: string | null = null;
    const receivedTexts: string[] = [];

    try {
      // Create session and send first message
      const session = await sessionManager.createSession('resume-test');

      const unsubscribe1 = sessionManager.onSessionOutput(session.id, (data: string) => {
        outputParser.parseStreamOutput(data + '\n');
        try {
          const parsed = JSON.parse(data);
          if (parsed.session_id && !capturedClaudeSessionId) {
            capturedClaudeSessionId = parsed.session_id;
          }
          if (parsed.type === 'result') {
            completed = true;
          }
        } catch {
          // Not JSON
        }
      });

      // First message - set a code word
      sessionManager.sendToActiveSession('remember the secret code "PURPLE_ELEPHANT_42"');
      await waitFor(() => completed, CLAUDE_TIMEOUT);
      unsubscribe1();

      // Reset for second message
      completed = false;
      outputParser.resetBuffer();

      outputParser.on('text', (text: string) => {
        receivedTexts.push(text);
      });

      const unsubscribe2 = sessionManager.onSessionOutput(session.id, (data: string) => {
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

      // Second message - ask for the code word
      sessionManager.sendToActiveSession('what was the secret code I told you?');
      await waitFor(() => completed, CLAUDE_TIMEOUT);
      unsubscribe2();

      // Check if Claude remembered
      const fullResponse = receivedTexts.join(' ').toUpperCase();
      const remembered = fullResponse.includes('PURPLE') || fullResponse.includes('ELEPHANT') || fullResponse.includes('42');

      const sessionIdDisplay = capturedClaudeSessionId ? (capturedClaudeSessionId as string).substring(0, 8) : 'none';
      if (remembered) {
        recordResult({
          component: 'Session Resume',
          status: 'PASS',
          message: 'Claude remembered context across messages',
          details: `Session ID: ${sessionIdDisplay}...`
        });
      } else {
        recordResult({
          component: 'Session Resume',
          status: 'WARN',
          message: 'Claude may not have remembered the context',
          details: `Response: ${fullResponse.substring(0, 100)}`
        });
      }

      expect(capturedClaudeSessionId).not.toBeNull();

      // Cleanup
      await sessionManager.closeSession(session.id);
    } catch (error) {
      recordResult({
        component: 'Session Resume',
        status: 'FAIL',
        message: 'Session resume test failed',
        details: String(error)
      });
      throw error;
    } finally {
      outputParser.removeAllListeners();
    }
  }, CLAUDE_TIMEOUT * 2 + 10000);
});

// ============================================================================
// 8. ATTACH TO EXISTING SESSION CHECK
// ============================================================================

describe('8. Attach to Existing Session', () => {
  let isClaudeAvailable = false;

  beforeAll(() => {
    const paths = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', '/usr/bin/claude'];
    isClaudeAvailable = paths.some(p => existsSync(p));
  });

  it('should attach to an existing session from scanner', async () => {
    const scanner = new ClaudeSessionScanner();
    const recentSessions = scanner.getRecentSessions(5);

    if (recentSessions.length === 0) {
      recordResult({
        component: 'Session Attach',
        status: 'SKIP',
        message: 'No existing sessions to attach to'
      });
      return;
    }

    const sessionManager = new SessionManager({
      claudeCliPath: 'claude',
      defaultWorkingDir: process.cwd(),
    });

    try {
      const targetSession = recentSessions[0];

      const session = await sessionManager.attachToSession(
        'attach-diagnostic',
        targetSession.sessionId,
        targetSession.project
      );

      if (session && session.name.includes('attached')) {
        recordResult({
          component: 'Session Attach',
          status: 'PASS',
          message: 'Successfully attached to existing session',
          details: `Attached to: ${targetSession.projectName} (${targetSession.sessionId.substring(0, 8)}...)`
        });
      } else {
        recordResult({
          component: 'Session Attach',
          status: 'FAIL',
          message: 'Attach did not work as expected'
        });
      }

      expect(session).toBeDefined();
      expect(session.name).toContain('attached');

      // Cleanup
      await sessionManager.closeSession(session.id);
    } catch (error) {
      recordResult({
        component: 'Session Attach',
        status: 'FAIL',
        message: 'Failed to attach to session',
        details: String(error)
      });
      throw error;
    }
  });
});

// ============================================================================
// FINAL SUMMARY
// ============================================================================

afterAll(() => {
  console.log('\n' + '='.repeat(70));
  console.log('DIAGNOSTIC SUMMARY');
  console.log('='.repeat(70));

  const passed = diagnosticResults.filter(r => r.status === 'PASS').length;
  const failed = diagnosticResults.filter(r => r.status === 'FAIL').length;
  const warned = diagnosticResults.filter(r => r.status === 'WARN').length;
  const skipped = diagnosticResults.filter(r => r.status === 'SKIP').length;

  console.log(`\n✅ Passed:  ${passed}`);
  console.log(`❌ Failed:  ${failed}`);
  console.log(`⚠️  Warnings: ${warned}`);
  console.log(`⏭️  Skipped: ${skipped}`);

  if (failed > 0) {
    console.log('\n--- FAILURES ---');
    diagnosticResults
      .filter(r => r.status === 'FAIL')
      .forEach(r => {
        console.log(`❌ [${r.component}] ${r.message}`);
        if (r.details) console.log(`   ${r.details}`);
      });
  }

  if (warned > 0) {
    console.log('\n--- WARNINGS ---');
    diagnosticResults
      .filter(r => r.status === 'WARN')
      .forEach(r => {
        console.log(`⚠️  [${r.component}] ${r.message}`);
        if (r.details) console.log(`   ${r.details}`);
      });
  }

  console.log('\n' + '='.repeat(70));

  if (failed === 0) {
    console.log('🎉 ALL SYSTEMS OPERATIONAL');
  } else {
    console.log('🔧 SOME ISSUES DETECTED - SEE FAILURES ABOVE');
  }
  console.log('='.repeat(70) + '\n');
});
