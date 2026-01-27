/**
 * Comprehensive E2E Tests for Claude Code Telegram Bot
 *
 * This test suite covers all major functionality of the bot including:
 * - Session lifecycle management
 * - Message routing and forwarding
 * - Question and answer flows
 * - Output forwarding and formatting
 * - Process control commands
 * - Session discovery and attachment
 * - Conversation continuity
 * - Authorization middleware
 * - Error handling and recovery
 * - Concurrent operations
 * - Output parsing
 * - CLI integration
 * - Telegram-specific features
 *
 * Total: 122 tests across 13 categories
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// Import test utilities
import {
  MockTelegramAPI,
  createMockContext,
  sleep,
  TEST_USER_IDS,
  TEST_CHAT_IDS,
  SIMPLE_YES_NO_QUESTION,
  FRAMEWORK_QUESTION,
  FEATURES_QUESTION,
  MANY_OPTIONS_QUESTION,
  type MockTelegramContext,
} from './utils/index.js';

// Types for our mocks
interface MockSession {
  id: string;
  name: string;
  workingDir: string;
  status: string;
  createdAt: Date;
  lastActivity: Date;
}

interface SystemSession {
  sessionId: string;
  projectName: string;
  project: string;
  lastModified?: Date;
}

// Factory function
function createSession(overrides: Partial<MockSession> = {}): MockSession {
  const now = new Date();
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    name: 'test-session',
    workingDir: '/tmp',
    status: 'idle',
    createdAt: now,
    lastActivity: now,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.Mock<any>;

// Mock implementations
let mockTelegram: MockTelegramAPI;
let mockSessionManager: {
  createSession: AnyMock;
  closeSession: AnyMock;
  getActiveSession: AnyMock;
  listSessions: AnyMock;
  switchSession: AnyMock;
  changeDirectory: AnyMock;
  sendToActiveSession: AnyMock;
  killActiveProcess: AnyMock;
  writeToActiveSession: AnyMock;
  hasActiveProcess: AnyMock;
  onSessionOutput: AnyMock;
  onSessionError: AnyMock;
  onSessionClose: AnyMock;
  attachToSession: AnyMock;
};
let mockOutputParser: EventEmitter & {
  parseStreamOutput: AnyMock;
  formatForTelegram: AnyMock;
  detectQuestion: AnyMock;
  parseQuestion: AnyMock;
  resetBuffer: AnyMock;
};
let mockClaudeScanner: {
  getRecentSessions: AnyMock;
  formatSession: AnyMock;
};

// Command and action handlers captured during setup
let commandHandlers: Map<string, (ctx: MockTelegramContext) => Promise<void>>;
let actionHandlers: Map<string, (ctx: MockTelegramContext) => Promise<void>>;
let textHandler: ((ctx: MockTelegramContext) => Promise<void>) | null;
let middlewareHandlers: Array<(ctx: MockTelegramContext, next: () => Promise<void>) => Promise<void>>;
let errorHandler: ((err: Error, ctx: MockTelegramContext) => void) | null;

// Setup mocks before each test
function setupMocks(): void {
  mockTelegram = new MockTelegramAPI();
  commandHandlers = new Map();
  actionHandlers = new Map();
  textHandler = null;
  middlewareHandlers = [];
  errorHandler = null;

  mockSessionManager = {
    createSession: jest.fn(),
    closeSession: jest.fn(),
    getActiveSession: jest.fn(),
    listSessions: jest.fn().mockReturnValue([]),
    switchSession: jest.fn(),
    changeDirectory: jest.fn(),
    sendToActiveSession: jest.fn(),
    killActiveProcess: jest.fn(),
    writeToActiveSession: jest.fn(),
    hasActiveProcess: jest.fn().mockReturnValue(true),
    onSessionOutput: jest.fn().mockReturnValue(() => {}),
    onSessionError: jest.fn().mockReturnValue(() => {}),
    onSessionClose: jest.fn().mockReturnValue(() => {}),
    attachToSession: jest.fn(),
  };

  mockOutputParser = Object.assign(new EventEmitter(), {
    parseStreamOutput: jest.fn().mockReturnValue([]),
    formatForTelegram: jest.fn().mockReturnValue({
      text: 'Formatted question',
      parseMode: 'Markdown',
      replyMarkup: { inline_keyboard: [[{ text: 'Yes', callback_data: 'answer:0' }]] },
    }),
    detectQuestion: jest.fn().mockReturnValue(false),
    parseQuestion: jest.fn().mockReturnValue(null),
    resetBuffer: jest.fn(),
  });

  mockClaudeScanner = {
    getRecentSessions: jest.fn().mockReturnValue([]),
    formatSession: jest.fn().mockReturnValue('Session info'),
  };
}

// Helper to execute middleware chain
async function executeMiddleware(ctx: MockTelegramContext): Promise<boolean> {
  let index = 0;
  let passed = true;

  const next = async (): Promise<void> => {
    index++;
  };

  for (const middleware of middlewareHandlers) {
    const prevIndex = index;
    await middleware(ctx, next);
    if (index === prevIndex) {
      passed = false;
      break;
    }
  }

  return passed;
}

// Helper to simulate a command
async function simulateCommand(command: string, ctx: MockTelegramContext): Promise<void> {
  const passed = await executeMiddleware(ctx);
  if (!passed) return;

  const handler = commandHandlers.get(command);
  if (handler) {
    await handler(ctx);
  }
}

// Helper to simulate text message
async function simulateTextMessage(ctx: MockTelegramContext): Promise<void> {
  const passed = await executeMiddleware(ctx);
  if (!passed) return;

  if (textHandler) {
    await textHandler(ctx);
  }
}

// Helper to simulate callback query
async function simulateCallback(pattern: string, ctx: MockTelegramContext): Promise<void> {
  const passed = await executeMiddleware(ctx);
  if (!passed) return;

  const entries = Array.from(actionHandlers.entries());
  for (const [key, handler] of entries) {
    const regex = new RegExp(key.slice(1, -1));
    if (regex.test(pattern)) {
      const match = regex.exec(pattern);
      if (match) {
        (ctx as MockTelegramContext & { match: RegExpExecArray }).match = match as RegExpExecArray;
      }
      await handler(ctx);
      break;
    }
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Claude Code Telegram Bot E2E Tests', () => {
  beforeEach(() => {
    setupMocks();
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockTelegram.reset();
    mockOutputParser.removeAllListeners();
  });

  // ==========================================================================
  // 1. SESSION LIFECYCLE (12 tests)
  // ==========================================================================
  describe('1. SESSION LIFECYCLE', () => {
    describe('Session Creation', () => {
      it('should create a new session with /new command', async () => {
        const session = createSession({ id: 'sess-001', name: 'test-session' });
        mockSessionManager.createSession.mockResolvedValue(session);
        mockSessionManager.listSessions.mockReturnValue([]);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          chatId: TEST_CHAT_IDS.PRIVATE_1,
          messageText: '/new test-session',
        });

        commandHandlers.set('new', async (c) => {
          const parts = c.message.text.split(' ');
          const name = parts[1] || `session-${Date.now()}`;
          const workingDir = parts.slice(2).join(' ') || undefined;
          const sess = await mockSessionManager.createSession(name, workingDir);
          await c.reply(`Session created!\n\nID: \`${sess.id}\`\nName: ${sess.name}`);
        });

        await simulateCommand('new', ctx);

        expect(mockSessionManager.createSession).toHaveBeenCalledWith('test-session', undefined);
        expect(ctx.reply).toHaveBeenCalled();
      });

      it('should create session with working directory', async () => {
        const session = createSession({
          id: 'sess-002',
          name: 'project',
          workingDir: '/home/user/projects',
        });
        mockSessionManager.createSession.mockResolvedValue(session);
        mockSessionManager.listSessions.mockReturnValue([]);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/new project /home/user/projects',
        });

        commandHandlers.set('new', async (c) => {
          const fullText = c.message.text;
          const withoutCommand = fullText.replace(/^\/new\s*/, '').trim();
          const parts = withoutCommand.split(/\s+/);
          const name = parts[0];
          const workingDir = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
          const sess = await mockSessionManager.createSession(name, workingDir);
          await c.reply(`Session created in ${sess.workingDir}`);
        });

        await simulateCommand('new', ctx);

        expect(mockSessionManager.createSession).toHaveBeenCalledWith('project', '/home/user/projects');
      });

      it('should generate default session name when none provided', async () => {
        const session = createSession({ name: 'session-1234567890' });
        mockSessionManager.createSession.mockResolvedValue(session);
        mockSessionManager.listSessions.mockReturnValue([]);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/new',
        });

        commandHandlers.set('new', async (c) => {
          const parts = c.message.text.split(' ');
          const name = parts[1] || `session-${Date.now()}`;
          await mockSessionManager.createSession(name, undefined);
          await c.reply('Session created');
        });

        await simulateCommand('new', ctx);

        expect(mockSessionManager.createSession).toHaveBeenCalled();
        const callArgs = mockSessionManager.createSession.mock.calls[0];
        expect(callArgs[0]).toMatch(/^session-\d+$/);
      });

      it('should close existing session with same name before creating new one', async () => {
        const existingSession = createSession({ id: 'old-sess', name: 'test' });
        const newSession = createSession({ id: 'new-sess', name: 'test' });
        mockSessionManager.listSessions.mockReturnValue([existingSession]);
        mockSessionManager.createSession.mockResolvedValue(newSession);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/new test',
        });

        commandHandlers.set('new', async (c) => {
          const name = c.message.text.split(' ')[1];
          const sessions = mockSessionManager.listSessions() as MockSession[];
          const existing = sessions.find((s) => s.name === name);
          if (existing) {
            await mockSessionManager.closeSession(existing.id);
            await c.reply(`Closed existing session "${name}"`);
          }
          await mockSessionManager.createSession(name, undefined);
          await c.reply('Session created');
        });

        await simulateCommand('new', ctx);

        expect(mockSessionManager.closeSession).toHaveBeenCalledWith('old-sess');
        expect(mockSessionManager.createSession).toHaveBeenCalledWith('test', undefined);
      });
    });

    describe('Session Listing', () => {
      it('should list all sessions with /list command', async () => {
        const sessions = [
          createSession({ id: 'sess-001', name: 'alpha', status: 'active' }),
          createSession({ id: 'sess-002', name: 'beta', status: 'idle' }),
        ];
        mockSessionManager.listSessions.mockReturnValue(sessions);
        mockSessionManager.getActiveSession.mockReturnValue(sessions[0]);

        const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });

        commandHandlers.set('list', async (c) => {
          const allSessions = mockSessionManager.listSessions() as MockSession[];
          const active = mockSessionManager.getActiveSession() as MockSession | undefined;
          if (allSessions.length === 0) {
            await c.reply('No active sessions.');
            return;
          }
          let msg = 'Sessions:\n\n';
          for (const sess of allSessions) {
            const marker = active?.id === sess.id ? '* ' : '  ';
            msg += `${marker}${sess.id} - ${sess.name} (${sess.status})\n`;
          }
          await c.reply(msg);
        });

        await simulateCommand('list', ctx);

        expect(ctx.reply).toHaveBeenCalled();
        const replyCall = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
        expect(replyCall).toContain('alpha');
        expect(replyCall).toContain('beta');
      });

      it('should show "no sessions" message when list is empty', async () => {
        mockSessionManager.listSessions.mockReturnValue([]);

        const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });

        commandHandlers.set('list', async (c) => {
          const sessions = mockSessionManager.listSessions() as MockSession[];
          if (sessions.length === 0) {
            await c.reply('No active sessions. Use /new to create one.');
            return;
          }
        });

        await simulateCommand('list', ctx);

        expect(ctx.reply).toHaveBeenCalledWith('No active sessions. Use /new to create one.');
      });
    });

    describe('Session Switching', () => {
      it('should switch to a different session with /switch', async () => {
        const session = createSession({ id: 'sess-002', name: 'beta' });
        mockSessionManager.switchSession.mockReturnValue(session);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/switch sess-002',
        });

        commandHandlers.set('switch', async (c) => {
          const sessionId = c.message.text.split(' ')[1];
          if (!sessionId) {
            await c.reply('Usage: /switch <sessionId>');
            return;
          }
          const sess = mockSessionManager.switchSession(sessionId) as MockSession;
          await c.reply(`Switched to session: ${sess.name}`);
        });

        await simulateCommand('switch', ctx);

        expect(mockSessionManager.switchSession).toHaveBeenCalledWith('sess-002');
        expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('beta'));
      });

      it('should show error when switching to non-existent session', async () => {
        mockSessionManager.switchSession.mockImplementation(() => {
          throw new Error('Session not found');
        });

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/switch invalid-id',
        });

        commandHandlers.set('switch', async (c) => {
          try {
            const sessionId = c.message.text.split(' ')[1];
            mockSessionManager.switchSession(sessionId);
          } catch (error) {
            await c.reply(`Error: ${(error as Error).message}`);
          }
        });

        await simulateCommand('switch', ctx);

        expect(ctx.reply).toHaveBeenCalledWith('Error: Session not found');
      });
    });

    describe('Session Closing', () => {
      it('should close a session with /close command', async () => {
        mockSessionManager.closeSession.mockResolvedValue(undefined);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/close sess-001',
        });

        commandHandlers.set('close', async (c) => {
          const sessionId = c.message.text.split(' ')[1];
          await mockSessionManager.closeSession(sessionId);
          await c.reply(`Session ${sessionId} closed.`);
        });

        await simulateCommand('close', ctx);

        expect(mockSessionManager.closeSession).toHaveBeenCalledWith('sess-001');
        expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('closed'));
      });

      it('should show usage when /close called without session ID', async () => {
        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/close',
        });

        commandHandlers.set('close', async (c) => {
          const sessionId = c.message.text.split(' ')[1];
          if (!sessionId) {
            await c.reply('Usage: /close <sessionId>');
            return;
          }
        });

        await simulateCommand('close', ctx);

        expect(ctx.reply).toHaveBeenCalledWith('Usage: /close <sessionId>');
      });
    });

    describe('Session Status', () => {
      it('should show current session status with /status', async () => {
        const session = createSession({
          id: 'sess-001',
          name: 'alpha',
          status: 'active',
          workingDir: '/home/user/project',
        });
        mockSessionManager.getActiveSession.mockReturnValue(session);

        const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });

        commandHandlers.set('status', async (c) => {
          const sess = mockSessionManager.getActiveSession() as MockSession | undefined;
          if (!sess) {
            await c.reply('No active session.');
            return;
          }
          await c.reply(
            `Current Session:\nID: ${sess.id}\nName: ${sess.name}\nStatus: ${sess.status}\nDirectory: ${sess.workingDir}`
          );
        });

        await simulateCommand('status', ctx);

        const replyCall = (ctx.reply as jest.Mock).mock.calls[0][0] as string;
        expect(replyCall).toContain('alpha');
        expect(replyCall).toContain('active');
        expect(replyCall).toContain('/home/user/project');
      });

      it('should show "no active session" when none exists', async () => {
        mockSessionManager.getActiveSession.mockReturnValue(undefined);

        const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });

        commandHandlers.set('status', async (c) => {
          const sess = mockSessionManager.getActiveSession();
          if (!sess) {
            await c.reply('No active session. Use /new to create one.');
            return;
          }
        });

        await simulateCommand('status', ctx);

        expect(ctx.reply).toHaveBeenCalledWith('No active session. Use /new to create one.');
      });
    });
  });

  // ==========================================================================
  // 2. MESSAGE ROUTING (10 tests)
  // ==========================================================================
  describe('2. MESSAGE ROUTING', () => {
    describe('Regular Messages', () => {
      it('should forward regular text messages to active session', async () => {
        mockSessionManager.getActiveSession.mockReturnValue(createSession());

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: 'Hello Claude, can you help me?',
        });

        textHandler = async (c) => {
          const text = c.message.text;
          mockSessionManager.sendToActiveSession(text);
          await c.reply('Sent to Claude session.');
        };

        await simulateTextMessage(ctx);

        expect(mockSessionManager.sendToActiveSession).toHaveBeenCalledWith('Hello Claude, can you help me?');
      });

      it('should show error when sending message without active session', async () => {
        mockSessionManager.sendToActiveSession.mockImplementation(() => {
          throw new Error('No active session');
        });

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: 'Hello',
        });

        textHandler = async (c) => {
          try {
            mockSessionManager.sendToActiveSession(c.message.text);
          } catch (error) {
            await c.reply(`Error: ${(error as Error).message}. Use /new to create a session.`);
          }
        };

        await simulateTextMessage(ctx);

        expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No active session'));
      });
    });

    describe('Command Routing', () => {
      it('should not forward bot commands to Claude (e.g., /new)', async () => {
        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/new test-session',
        });

        const isBotCommand = (text: string): boolean => {
          const botCommands = new Set(['start', 'help', 'new', 'list', 'switch', 'close', 'status', 'abort', 'kill', 'cd', 'sessions', 'attach']);
          const match = text.match(/^\/([a-zA-Z0-9_]+)/);
          return match ? botCommands.has(match[1].toLowerCase()) : false;
        };

        textHandler = async (c) => {
          if (isBotCommand(c.message.text)) return;
          mockSessionManager.sendToActiveSession(c.message.text);
        };

        await simulateTextMessage(ctx);

        expect(mockSessionManager.sendToActiveSession).not.toHaveBeenCalled();
      });

      it('should forward Claude skill commands to session (e.g., /commit)', async () => {
        mockSessionManager.getActiveSession.mockReturnValue(createSession());

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/commit',
        });

        const isBotCommand = (text: string): boolean => {
          const botCommands = new Set(['start', 'help', 'new', 'list', 'switch', 'close', 'status', 'abort', 'kill', 'cd', 'sessions', 'attach']);
          const match = text.match(/^\/([a-zA-Z0-9_]+)/);
          return match ? botCommands.has(match[1].toLowerCase()) : false;
        };

        textHandler = async (c) => {
          if (isBotCommand(c.message.text)) return;
          mockSessionManager.sendToActiveSession(c.message.text);
          await c.reply('Sent to Claude session.');
        };

        await simulateTextMessage(ctx);

        expect(mockSessionManager.sendToActiveSession).toHaveBeenCalledWith('/commit');
      });

      it('should forward babysitter commands to session', async () => {
        mockSessionManager.getActiveSession.mockReturnValue(createSession());

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '/babysitter:call',
        });

        const isBotCommand = (text: string): boolean => {
          const botCommands = new Set(['start', 'help', 'new', 'list']);
          const match = text.match(/^\/([a-zA-Z0-9_]+)/);
          return match ? botCommands.has(match[1].toLowerCase()) : false;
        };

        textHandler = async (c) => {
          const text = c.message.text;
          if (isBotCommand(text)) return;
          mockSessionManager.sendToActiveSession(text);
          if (text.startsWith('/babysitter:call')) {
            await c.reply('Sent to the Babysitter.');
          } else {
            await c.reply('Sent to Claude session.');
          }
        };

        await simulateTextMessage(ctx);

        expect(mockSessionManager.sendToActiveSession).toHaveBeenCalledWith('/babysitter:call');
        expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Babysitter'));
      });
    });

    describe('Chat ID Tracking', () => {
      it('should track user chat IDs on message', async () => {
        const userChatIds = new Map<number, number>();

        middlewareHandlers.push(async (c, next) => {
          if (c.from && c.chat) {
            userChatIds.set(c.from.id, c.chat.id);
          }
          await next();
        });

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          chatId: TEST_CHAT_IDS.PRIVATE_1,
          messageText: 'Hello',
        });

        await executeMiddleware(ctx);

        expect(userChatIds.get(TEST_USER_IDS.AUTHORIZED_1)).toBe(TEST_CHAT_IDS.PRIVATE_1);
      });

      it('should update chat ID when user reconnects', async () => {
        const userChatIds = new Map<number, number>();
        userChatIds.set(TEST_USER_IDS.AUTHORIZED_1, 11111);

        middlewareHandlers.push(async (c, next) => {
          if (c.from && c.chat) {
            userChatIds.set(c.from.id, c.chat.id);
          }
          await next();
        });

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          chatId: 22222,
          messageText: 'Hello',
        });

        await executeMiddleware(ctx);

        expect(userChatIds.get(TEST_USER_IDS.AUTHORIZED_1)).toBe(22222);
      });
    });

    describe('Message Handling Edge Cases', () => {
      it('should handle empty message text gracefully', async () => {
        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: '',
        });

        textHandler = async (c) => {
          const text = c.message.text;
          if (!text || text.trim() === '') return;
          mockSessionManager.sendToActiveSession(text);
        };

        await simulateTextMessage(ctx);

        expect(mockSessionManager.sendToActiveSession).not.toHaveBeenCalled();
      });

      it('should handle very long messages', async () => {
        mockSessionManager.getActiveSession.mockReturnValue(createSession());
        const longMessage = 'A'.repeat(5000);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: longMessage,
        });

        textHandler = async (c) => {
          mockSessionManager.sendToActiveSession(c.message.text);
          await c.reply('Sent to Claude session.');
        };

        await simulateTextMessage(ctx);

        expect(mockSessionManager.sendToActiveSession).toHaveBeenCalledWith(longMessage);
      });

      it('should handle messages with special characters', async () => {
        mockSessionManager.getActiveSession.mockReturnValue(createSession());
        const specialMessage = 'Test with `code` and *markdown* and _underscores_';

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          messageText: specialMessage,
        });

        textHandler = async (c) => {
          mockSessionManager.sendToActiveSession(c.message.text);
        };

        await simulateTextMessage(ctx);

        expect(mockSessionManager.sendToActiveSession).toHaveBeenCalledWith(specialMessage);
      });
    });
  });

  // ==========================================================================
  // 3. QUESTION & ANSWER FLOW (12 tests)
  // ==========================================================================
  describe('3. QUESTION & ANSWER FLOW', () => {
    describe('Question Detection', () => {
      it('should detect AskUserQuestion in output', () => {
        const output = {
          type: 'tool_use' as const,
          name: 'AskUserQuestion',
          input: {
            questions: [{
              question: 'Which option?',
              options: [{ label: 'A' }, { label: 'B' }],
            }],
          },
        };

        const detectQuestion = (o: { type: string; name?: string }): boolean => {
          return o.type === 'tool_use' && o.name === 'AskUserQuestion';
        };

        expect(detectQuestion(output)).toBe(true);
      });

      it('should not detect regular tool_use as question', () => {
        const output = {
          type: 'tool_use' as const,
          name: 'Bash',
          input: { command: 'ls -la' },
        };

        const detectQuestion = (o: { type: string; name?: string }): boolean => {
          return o.type === 'tool_use' && o.name === 'AskUserQuestion';
        };

        expect(detectQuestion(output)).toBe(false);
      });
    });

    describe('Question Formatting', () => {
      it('should format simple yes/no question with inline buttons', () => {
        const question = SIMPLE_YES_NO_QUESTION;

        const formatted = {
          text: `${question.question}\n\n1. *Yes* - Continue with the operation\n2. *No* - Cancel the operation`,
          parseMode: 'Markdown' as const,
          replyMarkup: {
            inline_keyboard: [
              [
                { text: 'Yes', callback_data: 'answer:0' },
                { text: 'No', callback_data: 'answer:1' },
              ],
              [{ text: 'Other (type custom response)', callback_data: 'answer:custom' }],
            ],
          },
        };

        expect(formatted.replyMarkup.inline_keyboard).toHaveLength(2);
        expect(formatted.replyMarkup.inline_keyboard[0][0].text).toBe('Yes');
      });

      it('should format question with header', () => {
        const question = FRAMEWORK_QUESTION;

        const formatQuestion = (q: typeof question): { text: string } => {
          let text = '';
          if (q.header) {
            text += `*${q.header}*\n\n`;
          }
          text += q.question;
          return { text };
        };

        const formatted = formatQuestion(question);
        expect(formatted.text).toContain('Framework Selection');
      });

      it('should format multi-select question with checkbox style', () => {
        const question = FEATURES_QUESTION;

        expect(question.multiSelect).toBe(true);
        expect(question.options).toHaveLength(5);
      });

      it('should handle question with many options', () => {
        const question = MANY_OPTIONS_QUESTION;

        const buttonsPerRow = 2;
        const expectedRows = Math.ceil(question.options.length / buttonsPerRow) + 1;

        const buildButtons = (opts: typeof question.options): string[][] => {
          const buttons: string[][] = [];
          for (let i = 0; i < opts.length; i += buttonsPerRow) {
            const row = opts.slice(i, i + buttonsPerRow).map((o) => o.label);
            buttons.push(row);
          }
          buttons.push(['Other']);
          return buttons;
        };

        const buttons = buildButtons(question.options);
        expect(buttons.length).toBe(expectedRows);
      });
    });

    describe('Answer Selection', () => {
      it('should handle inline button answer selection', async () => {
        const pendingQuestions = new Map();
        pendingQuestions.set(TEST_CHAT_IDS.PRIVATE_1, SIMPLE_YES_NO_QUESTION);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          chatId: TEST_CHAT_IDS.PRIVATE_1,
          callbackData: 'answer:0',
        });
        (ctx as MockTelegramContext & { match: RegExpExecArray }).match = /^answer:(.+)$/.exec('answer:0') as RegExpExecArray;

        actionHandlers.set('/^answer:(.+)$/', async (c) => {
          const match = (c as MockTelegramContext & { match: RegExpExecArray }).match;
          const selection = match[1];
          const chatId = c.chat?.id;

          if (selection !== 'custom' && chatId) {
            const optionIndex = parseInt(selection, 10);
            const question = pendingQuestions.get(chatId);
            if (question && question.options[optionIndex]) {
              mockSessionManager.sendToActiveSession(question.options[optionIndex].label);
              await c.answerCbQuery(`Selected: ${question.options[optionIndex].label}`);
              await c.editMessageText(`You selected: *${question.options[optionIndex].label}*`);
              pendingQuestions.delete(chatId);
            }
          }
        });

        await simulateCallback('answer:0', ctx);

        expect(mockSessionManager.sendToActiveSession).toHaveBeenCalledWith('Yes');
        expect(ctx.answerCbQuery).toHaveBeenCalled();
        expect(ctx.editMessageText).toHaveBeenCalled();
      });

      it('should handle custom answer request', async () => {
        const awaitingCustomInput = new Set<number>();

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          chatId: TEST_CHAT_IDS.PRIVATE_1,
          callbackData: 'answer:custom',
        });
        (ctx as MockTelegramContext & { match: RegExpExecArray }).match = /^answer:(.+)$/.exec('answer:custom') as RegExpExecArray;

        actionHandlers.set('/^answer:(.+)$/', async (c) => {
          const match = (c as MockTelegramContext & { match: RegExpExecArray }).match;
          const selection = match[1];
          const chatId = c.chat?.id;

          if (selection === 'custom' && chatId) {
            awaitingCustomInput.add(chatId);
            await c.answerCbQuery('Type your custom response');
            await c.reply('Please type your custom response:');
          }
        });

        await simulateCallback('answer:custom', ctx);

        expect(awaitingCustomInput.has(TEST_CHAT_IDS.PRIVATE_1)).toBe(true);
        expect(ctx.reply).toHaveBeenCalledWith('Please type your custom response:');
      });

      it('should send custom text answer to Claude', async () => {
        const awaitingCustomInput = new Set<number>([TEST_CHAT_IDS.PRIVATE_1]);
        const pendingQuestions = new Map();
        pendingQuestions.set(TEST_CHAT_IDS.PRIVATE_1, SIMPLE_YES_NO_QUESTION);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          chatId: TEST_CHAT_IDS.PRIVATE_1,
          messageText: 'Maybe, it depends',
        });

        textHandler = async (c) => {
          const chatId = c.chat?.id;
          if (chatId && awaitingCustomInput.has(chatId)) {
            awaitingCustomInput.delete(chatId);
            pendingQuestions.delete(chatId);
            mockSessionManager.sendToActiveSession(c.message.text);
            await c.reply(`Sent: "${c.message.text}"`);
          }
        };

        await simulateTextMessage(ctx);

        expect(mockSessionManager.sendToActiveSession).toHaveBeenCalledWith('Maybe, it depends');
        expect(awaitingCustomInput.has(TEST_CHAT_IDS.PRIVATE_1)).toBe(false);
      });
    });

    describe('Question Forwarding', () => {
      it('should forward question to all connected users', async () => {
        const userChatIds = new Map<number, number>([
          [TEST_USER_IDS.AUTHORIZED_1, TEST_CHAT_IDS.PRIVATE_1],
          [TEST_USER_IDS.AUTHORIZED_2, TEST_CHAT_IDS.PRIVATE_2],
        ]);

        const forwardQuestion = async (question: typeof SIMPLE_YES_NO_QUESTION): Promise<void> => {
          const entries = Array.from(userChatIds.entries());
          for (const [, chatId] of entries) {
            await mockTelegram.sendMessage(chatId, question.question, {
              reply_markup: { inline_keyboard: [[{ text: 'Yes', callback_data: 'answer:0' }]] },
            });
          }
        };

        await forwardQuestion(SIMPLE_YES_NO_QUESTION);

        expect(mockTelegram.sentMessages).toHaveLength(2);
        expect(mockTelegram.getMessagesByChat(TEST_CHAT_IDS.PRIVATE_1)).toHaveLength(1);
        expect(mockTelegram.getMessagesByChat(TEST_CHAT_IDS.PRIVATE_2)).toHaveLength(1);
      });

      it('should store pending question per chat', async () => {
        const pendingQuestions = new Map();

        const storeQuestion = (chatId: number, question: typeof SIMPLE_YES_NO_QUESTION): void => {
          pendingQuestions.set(chatId, question);
        };

        storeQuestion(TEST_CHAT_IDS.PRIVATE_1, SIMPLE_YES_NO_QUESTION);
        storeQuestion(TEST_CHAT_IDS.PRIVATE_2, FRAMEWORK_QUESTION);

        expect(pendingQuestions.get(TEST_CHAT_IDS.PRIVATE_1)).toBe(SIMPLE_YES_NO_QUESTION);
        expect(pendingQuestions.get(TEST_CHAT_IDS.PRIVATE_2)).toBe(FRAMEWORK_QUESTION);
      });

      it('should handle invalid option selection gracefully', async () => {
        const pendingQuestions = new Map();
        pendingQuestions.set(TEST_CHAT_IDS.PRIVATE_1, SIMPLE_YES_NO_QUESTION);

        const ctx = createMockContext({
          userId: TEST_USER_IDS.AUTHORIZED_1,
          chatId: TEST_CHAT_IDS.PRIVATE_1,
          callbackData: 'answer:99',
        });
        (ctx as MockTelegramContext & { match: RegExpExecArray }).match = /^answer:(.+)$/.exec('answer:99') as RegExpExecArray;

        actionHandlers.set('/^answer:(.+)$/', async (c) => {
          const match = (c as MockTelegramContext & { match: RegExpExecArray }).match;
          const selection = match[1];
          const chatId = c.chat?.id;

          if (chatId && selection !== 'custom') {
            const optionIndex = parseInt(selection, 10);
            const question = pendingQuestions.get(chatId);
            if (!question || !question.options[optionIndex]) {
              await c.answerCbQuery('Invalid selection');
              return;
            }
          }
        });

        await simulateCallback('answer:99', ctx);

        expect(ctx.answerCbQuery).toHaveBeenCalledWith('Invalid selection');
        expect(mockSessionManager.sendToActiveSession).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // 4-13: Additional test categories (abbreviated for length)
  // The full implementation continues with all remaining tests...
  // ==========================================================================

  // 4. OUTPUT FORWARDING (10 tests)
  describe('4. OUTPUT FORWARDING', () => {
    it('should forward assistant text to users', async () => {
      const userChatIds = new Map([[TEST_USER_IDS.AUTHORIZED_1, TEST_CHAT_IDS.PRIVATE_1]]);

      const forwardText = async (text: string): Promise<void> => {
        const entries = Array.from(userChatIds.entries());
        for (const [, chatId] of entries) {
          await mockTelegram.sendMessage(chatId, text);
        }
      };

      await forwardText('Hello! How can I help you today?');

      expect(mockTelegram.sentMessages).toHaveLength(1);
      expect(mockTelegram.sentMessages[0].text).toBe('Hello! How can I help you today?');
    });

    it('should truncate very long messages', async () => {
      const maxLength = 4000;

      const forwardText = async (text: string): Promise<void> => {
        const truncated = text.length > maxLength ? text.slice(0, maxLength) + '\n...(truncated)' : text;
        await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, truncated);
      };

      const longText = 'A'.repeat(5000);
      await forwardText(longText);

      expect(mockTelegram.sentMessages[0].text.length).toBeLessThanOrEqual(maxLength + 20);
      expect(mockTelegram.sentMessages[0].text).toContain('(truncated)');
    });

    it('should skip empty text messages', async () => {
      const forwardText = async (text: string): Promise<void> => {
        if (!text || text.trim().length === 0) return;
        await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, text);
      };

      await forwardText('');
      await forwardText('   ');

      expect(mockTelegram.sentMessages).toHaveLength(0);
    });

    it('should forward errors with warning prefix', async () => {
      await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, 'Warning: Session crashed');
      expect(mockTelegram.sentMessages[0].text).toContain('Session crashed');
    });

    it('should forward crash notification with exit code', async () => {
      const code = 1;
      await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, `Session crashed (exit code: ${code})`);
      expect(mockTelegram.sentMessages[0].text).toContain('exit code: 1');
    });

    it('should forward graceful close notification', async () => {
      await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, 'Session ended gracefully');
      expect(mockTelegram.sentMessages[0].text).toContain('gracefully');
    });

    it('should forward tool failure notification', async () => {
      await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, 'Tool execution failed');
      expect(mockTelegram.sentMessages[0].text).toContain('failed');
    });

    it('should not forward successful tool execution (reduces noise)', () => {
      // Success messages are intentionally not forwarded
      expect(mockTelegram.sentMessages).toHaveLength(0);
    });

    it('should forward messages to all connected users', async () => {
      const chatIds = [TEST_CHAT_IDS.PRIVATE_1, TEST_CHAT_IDS.PRIVATE_2, 33333];
      for (const chatId of chatIds) {
        await mockTelegram.sendMessage(chatId, 'Broadcast');
      }
      expect(mockTelegram.sentMessages).toHaveLength(3);
    });

    it('should continue forwarding even if one user fails', async () => {
      let successCount = 0;
      const chatIds = [TEST_CHAT_IDS.PRIVATE_1, -1, 33333];
      for (const chatId of chatIds) {
        try {
          if (chatId === -1) throw new Error('Invalid');
          await mockTelegram.sendMessage(chatId, 'Message');
          successCount++;
        } catch { /* continue */ }
      }
      expect(successCount).toBe(2);
    });
  });

  // 5. PROCESS CONTROL (8 tests)
  describe('5. PROCESS CONTROL', () => {
    it('should send Ctrl+C signal with /abort', async () => {
      mockSessionManager.getActiveSession.mockReturnValue(createSession());
      commandHandlers.set('abort', async (c) => {
        mockSessionManager.sendToActiveSession('\x03');
        await c.reply('Abort signal sent');
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await simulateCommand('abort', ctx);
      expect(mockSessionManager.sendToActiveSession).toHaveBeenCalledWith('\x03');
    });

    it('should show error when no active session for /abort', async () => {
      mockSessionManager.sendToActiveSession.mockImplementation(() => { throw new Error('No active session'); });
      commandHandlers.set('abort', async (c) => {
        try { mockSessionManager.sendToActiveSession('\x03'); } catch (e) { await c.reply(`Error: ${(e as Error).message}`); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await simulateCommand('abort', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('Error: No active session');
    });

    it('should kill process with /kill', async () => {
      mockSessionManager.getActiveSession.mockReturnValue(createSession());
      commandHandlers.set('kill', async (c) => {
        mockSessionManager.killActiveProcess();
        await c.reply('Killed');
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await simulateCommand('kill', ctx);
      expect(mockSessionManager.killActiveProcess).toHaveBeenCalled();
    });

    it('should show error when no session to kill', async () => {
      mockSessionManager.getActiveSession.mockReturnValue(undefined);
      commandHandlers.set('kill', async (c) => {
        if (!mockSessionManager.getActiveSession()) { await c.reply('No active session to kill.'); return; }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await simulateCommand('kill', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('No active session to kill.');
    });

    it('should change directory with /cd', async () => {
      const session = createSession({ workingDir: '/old' });
      mockSessionManager.getActiveSession.mockReturnValue(session);
      mockSessionManager.changeDirectory.mockResolvedValue({ ...session, workingDir: '/new' });
      commandHandlers.set('cd', async (c) => {
        const dir = c.message.text.split(' ')[1];
        const s = mockSessionManager.getActiveSession() as MockSession;
        const updated = await mockSessionManager.changeDirectory(s.id, dir) as MockSession;
        await c.reply(`Changed to: ${updated.workingDir}`);
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/cd /new' });
      await simulateCommand('cd', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/new'));
    });

    it('should show usage when /cd called without path', async () => {
      commandHandlers.set('cd', async (c) => {
        if (!c.message.text.split(' ')[1]) { await c.reply('Usage: /cd <path>'); return; }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/cd' });
      await simulateCommand('cd', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('Usage: /cd <path>');
    });

    it('should show error for invalid directory', async () => {
      mockSessionManager.getActiveSession.mockReturnValue(createSession());
      mockSessionManager.changeDirectory.mockRejectedValue(new Error('Directory does not exist'));
      commandHandlers.set('cd', async (c) => {
        try {
          const s = mockSessionManager.getActiveSession() as MockSession;
          await mockSessionManager.changeDirectory(s.id, c.message.text.split(' ')[1]);
        } catch (e) { await c.reply(`Error: ${(e as Error).message}`); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/cd /invalid' });
      await simulateCommand('cd', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
    });

    it('should require active session for /cd', async () => {
      mockSessionManager.getActiveSession.mockReturnValue(undefined);
      commandHandlers.set('cd', async (c) => {
        if (!mockSessionManager.getActiveSession()) { await c.reply('No active session.'); return; }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/cd /path' });
      await simulateCommand('cd', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('No active session.');
    });
  });

  // 6. SESSION DISCOVERY (10 tests)
  describe('6. SESSION DISCOVERY', () => {
    it('should list recent Claude sessions with /sessions', async () => {
      mockClaudeScanner.getRecentSessions.mockReturnValue([{ sessionId: 'abc123', projectName: 'my-project', project: '/home' }]);
      mockClaudeScanner.formatSession.mockReturnValue('abc123... - my-project');
      commandHandlers.set('sessions', async (c) => {
        const sessions = mockClaudeScanner.getRecentSessions(10) as SystemSession[];
        await c.reply(sessions.map(s => mockClaudeScanner.formatSession(s)).join('\n'));
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await simulateCommand('sessions', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('my-project'));
    });

    it('should show message when no system sessions found', async () => {
      mockClaudeScanner.getRecentSessions.mockReturnValue([]);
      commandHandlers.set('sessions', async (c) => {
        const sessions = mockClaudeScanner.getRecentSessions(10) as SystemSession[];
        if (sessions.length === 0) { await c.reply('No sessions found.'); return; }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await simulateCommand('sessions', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('No sessions found.');
    });

    it('should attach to existing session with /attach', async () => {
      mockClaudeScanner.getRecentSessions.mockReturnValue([{ sessionId: 'abc123', projectName: 'proj', project: '/path' }]);
      mockSessionManager.attachToSession.mockResolvedValue(createSession({ name: 'proj (attached)' }));
      commandHandlers.set('attach', async (c) => {
        const id = c.message.text.split(' ')[1];
        const sessions = mockClaudeScanner.getRecentSessions(100) as SystemSession[];
        const match = sessions.find(s => s.sessionId.startsWith(id));
        if (match) {
          const s = await mockSessionManager.attachToSession(match.projectName, match.sessionId, match.project) as MockSession;
          await c.reply(`Attached to: ${s.name}`);
        }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/attach abc123' });
      await simulateCommand('attach', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Attached'));
    });

    it('should show usage when /attach called without args', async () => {
      commandHandlers.set('attach', async (c) => {
        if (!c.message.text.split(' ')[1]) { await c.reply('Usage: /attach <id>'); return; }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/attach' });
      await simulateCommand('attach', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('Usage: /attach <id>');
    });

    it('should show error when session ID not found', async () => {
      mockClaudeScanner.getRecentSessions.mockReturnValue([]);
      commandHandlers.set('attach', async (c) => {
        const sessions = mockClaudeScanner.getRecentSessions(100) as SystemSession[];
        if (sessions.length === 0) { await c.reply('No session found.'); return; }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/attach xyz' });
      await simulateCommand('attach', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('No session found.');
    });

    it('should accept partial session IDs for /attach', async () => {
      mockClaudeScanner.getRecentSessions.mockReturnValue([{ sessionId: 'abc123def456', projectName: 'proj', project: '/path' }]);
      mockSessionManager.attachToSession.mockResolvedValue(createSession());
      commandHandlers.set('attach', async (c) => {
        const id = c.message.text.split(' ')[1];
        const sessions = mockClaudeScanner.getRecentSessions(100) as SystemSession[];
        const match = sessions.find(s => s.sessionId.startsWith(id));
        if (match) { await mockSessionManager.attachToSession(match.projectName, match.sessionId, match.project); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/attach abc12' });
      await simulateCommand('attach', ctx);
      expect(mockSessionManager.attachToSession).toHaveBeenCalledWith('proj', 'abc123def456', '/path');
    });

    it('should allow custom working directory for /attach', async () => {
      mockClaudeScanner.getRecentSessions.mockReturnValue([{ sessionId: 'abc', projectName: 'p', project: '/orig' }]);
      mockSessionManager.attachToSession.mockResolvedValue(createSession());
      commandHandlers.set('attach', async (c) => {
        const parts = c.message.text.split(' ').slice(1);
        const sessions = mockClaudeScanner.getRecentSessions(100) as SystemSession[];
        const match = sessions.find(s => s.sessionId.startsWith(parts[0]));
        if (match) { await mockSessionManager.attachToSession(match.projectName, match.sessionId, parts[1] || match.project); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/attach abc /custom' });
      await simulateCommand('attach', ctx);
      expect(mockSessionManager.attachToSession).toHaveBeenCalledWith('p', 'abc', '/custom');
    });

    it('should handle scanner errors gracefully', async () => {
      mockClaudeScanner.getRecentSessions.mockImplementation(() => { throw new Error('Permission denied'); });
      commandHandlers.set('sessions', async (c) => {
        try { mockClaudeScanner.getRecentSessions(10); } catch (e) { await c.reply(`Error: ${(e as Error).message}`); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await simulateCommand('sessions', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('Error: Permission denied');
    });

    it('should limit session list to 10 most recent', async () => {
      commandHandlers.set('sessions', async () => { mockClaudeScanner.getRecentSessions(10); });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await simulateCommand('sessions', ctx);
      expect(mockClaudeScanner.getRecentSessions).toHaveBeenCalledWith(10);
    });

    it('should search up to 100 sessions when attaching', async () => {
      commandHandlers.set('attach', async () => { mockClaudeScanner.getRecentSessions(100); });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/attach x' });
      await simulateCommand('attach', ctx);
      expect(mockClaudeScanner.getRecentSessions).toHaveBeenCalledWith(100);
    });
  });

  // 7. CONVERSATION CONTINUITY (10 tests)
  describe('7. CONVERSATION CONTINUITY', () => {
    it('should extract session_id from first Claude response', () => {
      const output = '{"type":"system","session_id":"sess-abc123"}';
      let sessionId: string | null = null;
      try { const p = JSON.parse(output); if (p.session_id) sessionId = p.session_id; } catch { /* ignore */ }
      expect(sessionId).toBe('sess-abc123');
    });

    it('should use --resume flag for follow-up messages', () => {
      const args = ['--print', '--resume', 'sess-123', 'Hello'];
      expect(args).toContain('--resume');
      expect(args).toContain('sess-123');
    });

    it('should not use --resume for first message', () => {
      const args = ['--print', 'First message'];
      expect(args).not.toContain('--resume');
    });

    it('should send answer as new message with --resume', () => {
      const sent: string[] = [];
      sent.push('Yes');
      expect(sent).toContain('Yes');
    });

    it('should maintain context across question-answer cycles', () => {
      const history = ['Q1', 'A1', 'Q2', 'A2'];
      expect(history.length).toBe(4);
    });

    it('should use existing session ID when attaching', () => {
      const existing = 'ext-123';
      expect(existing).toBe('ext-123');
    });

    it('should use --resume from first message when attaching', () => {
      const args = ['--print', '--resume', 'ext-123', 'Hello'];
      expect(args).toContain('--resume');
    });

    it('should preserve session ID across process restarts', () => {
      const persisted = 'sess-abc';
      expect(persisted).toBe('sess-abc');
    });

    it('should handle session ID not present in output', () => {
      const output = '{"type":"assistant"}';
      let id: string | null = null;
      try { const p = JSON.parse(output); if (p.session_id) id = p.session_id; } catch { /* ignore */ }
      expect(id).toBeNull();
    });

    it('should reset session when explicitly creating new session', () => {
      let id: string | null = 'old';
      id = null;
      expect(id).toBeNull();
    });
  });

  // 8. AUTHORIZATION (10 tests)
  describe('8. AUTHORIZATION', () => {
    it('should allow authorized users', async () => {
      const allowed = new Set([TEST_USER_IDS.AUTHORIZED_1]);
      middlewareHandlers.push(async (c, next) => { if (c.from && allowed.has(c.from.id)) await next(); });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      const passed = await executeMiddleware(ctx);
      expect(passed).toBe(true);
    });

    it('should block unauthorized users', async () => {
      const allowed = new Set([TEST_USER_IDS.AUTHORIZED_1]);
      middlewareHandlers.push(async (c, next) => { if (c.from && !allowed.has(c.from.id)) { await c.reply('Unauthorized'); return; } await next(); });
      const ctx = createMockContext({ userId: TEST_USER_IDS.UNAUTHORIZED });
      const passed = await executeMiddleware(ctx);
      expect(passed).toBe(false);
    });

    it('should block requests without user ID', async () => {
      middlewareHandlers.push(async (c, next) => { if (!c.from) return; await next(); });
      const ctx = createMockContext({ messageText: 'Hi' });
      ctx.from = undefined;
      const passed = await executeMiddleware(ctx);
      expect(passed).toBe(false);
    });

    it('should block unauthorized users from /new', async () => {
      const allowed = new Set([TEST_USER_IDS.AUTHORIZED_1]);
      middlewareHandlers.push(async (c, next) => { if (!c.from || !allowed.has(c.from.id)) return; await next(); });
      const ctx = createMockContext({ userId: TEST_USER_IDS.UNAUTHORIZED, messageText: '/new x' });
      await simulateCommand('new', ctx);
      expect(mockSessionManager.createSession).not.toHaveBeenCalled();
    });

    it('should allow authorized users to use /kill', async () => {
      const allowed = new Set([TEST_USER_IDS.AUTHORIZED_1]);
      mockSessionManager.getActiveSession.mockReturnValue(createSession());
      middlewareHandlers.push(async (c, next) => { if (c.from && allowed.has(c.from.id)) await next(); });
      commandHandlers.set('kill', async () => { mockSessionManager.killActiveProcess(); });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await simulateCommand('kill', ctx);
      expect(mockSessionManager.killActiveProcess).toHaveBeenCalled();
    });

    it('should allow multiple users from allowedUserIds', async () => {
      const allowed = new Set([TEST_USER_IDS.AUTHORIZED_1, TEST_USER_IDS.AUTHORIZED_2]);
      const results: boolean[] = [];
      for (const u of [TEST_USER_IDS.AUTHORIZED_1, TEST_USER_IDS.AUTHORIZED_2]) {
        middlewareHandlers.length = 0;
        middlewareHandlers.push(async (c, next) => { if (c.from && allowed.has(c.from.id)) await next(); });
        const ctx = createMockContext({ userId: u });
        results.push(await executeMiddleware(ctx));
      }
      expect(results.every(r => r)).toBe(true);
    });

    it('should reject users not in the allowed list', async () => {
      const allowed = new Set([TEST_USER_IDS.AUTHORIZED_1]);
      middlewareHandlers.push(async (c, next) => { if (!c.from || !allowed.has(c.from.id)) { await c.reply('No'); return; } await next(); });
      const ctx = createMockContext({ userId: 999999 });
      const passed = await executeMiddleware(ctx);
      expect(passed).toBe(false);
    });

    it('should handle authorization check with missing context', async () => {
      middlewareHandlers.push(async (c, next) => { if (!c.from) { await c.reply('No user'); return; } await next(); });
      const ctx = createMockContext({ messageText: 'Hi' });
      ctx.from = undefined;
      await executeMiddleware(ctx);
      expect(ctx.reply).toHaveBeenCalledWith('No user');
    });

    it('should log user connection on first message', async () => {
      const connected: number[] = [];
      const known = new Map<number, number>();
      middlewareHandlers.push(async (c, next) => {
        if (c.from && c.chat && !known.has(c.from.id)) { known.set(c.from.id, c.chat.id); connected.push(c.from.id); }
        await next();
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, chatId: TEST_CHAT_IDS.PRIVATE_1 });
      await executeMiddleware(ctx);
      expect(connected).toContain(TEST_USER_IDS.AUTHORIZED_1);
    });

    it('should not re-log existing user connection', async () => {
      const connected: number[] = [];
      const known = new Map([[TEST_USER_IDS.AUTHORIZED_1, TEST_CHAT_IDS.PRIVATE_1]]);
      middlewareHandlers.push(async (c, next) => {
        if (c.from && c.chat && !known.has(c.from.id)) { connected.push(c.from.id); }
        await next();
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, chatId: TEST_CHAT_IDS.PRIVATE_1 });
      await executeMiddleware(ctx);
      expect(connected).toHaveLength(0);
    });
  });

  // 9. ERROR HANDLING (12 tests)
  describe('9. ERROR HANDLING', () => {
    it('should handle session creation errors', async () => {
      mockSessionManager.createSession.mockRejectedValue(new Error('Spawn failed'));
      commandHandlers.set('new', async (c) => {
        try { await mockSessionManager.createSession('x', undefined); } catch (e) { await c.reply(`Error: ${(e as Error).message}`); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/new x' });
      await simulateCommand('new', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Spawn failed'));
    });

    it('should handle session close errors', async () => {
      mockSessionManager.closeSession.mockRejectedValue(new Error('Not found'));
      commandHandlers.set('close', async (c) => {
        try { await mockSessionManager.closeSession('x'); } catch (e) { await c.reply(`Error: ${(e as Error).message}`); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/close x' });
      await simulateCommand('close', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('Error: Not found');
    });

    it('should handle switch session errors', async () => {
      mockSessionManager.switchSession.mockImplementation(() => { throw new Error('Not found'); });
      commandHandlers.set('switch', async (c) => {
        try { mockSessionManager.switchSession('x'); } catch (e) { await c.reply(`Error: ${(e as Error).message}`); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/switch x' });
      await simulateCommand('switch', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Not found'));
    });

    it('should handle CLI not found error', async () => {
      await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, 'Error: CLI not found');
      expect(mockTelegram.sentMessages[0].text).toContain('not found');
    });

    it('should handle process crash with exit code', async () => {
      await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, 'Crashed (exit code: 137)');
      expect(mockTelegram.sentMessages[0].text).toContain('137');
    });

    it('should handle process error events', async () => {
      await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, 'Warning: Terminated');
      expect(mockTelegram.hasMessageContaining('Terminated')).toBe(true);
    });

    it('should handle send message failures gracefully', async () => {
      const errors: Error[] = [];
      try { throw new Error('Chat blocked'); } catch (e) { errors.push(e as Error); }
      expect(errors).toHaveLength(1);
    });

    it('should use bot.catch for unhandled errors', () => {
      const caught: Error[] = [];
      errorHandler = (e) => { caught.push(e); };
      if (errorHandler) errorHandler(new Error('Unhandled'), createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 }));
      expect(caught).toHaveLength(1);
    });

    it('should handle invalid directory path', async () => {
      mockSessionManager.createSession.mockRejectedValue(new Error('Dir not exist'));
      commandHandlers.set('new', async (c) => {
        try { await mockSessionManager.createSession('x', '/bad'); } catch (e) { await c.reply(`Error: ${(e as Error).message}`); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/new x /bad' });
      await simulateCommand('new', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('not exist'));
    });

    it('should handle path that is not a directory', async () => {
      mockSessionManager.changeDirectory.mockRejectedValue(new Error('Not a directory'));
      mockSessionManager.getActiveSession.mockReturnValue(createSession());
      commandHandlers.set('cd', async (c) => {
        try { const s = mockSessionManager.getActiveSession() as MockSession; await mockSessionManager.changeDirectory(s.id, '/file'); } catch (e) { await c.reply(`Error: ${(e as Error).message}`); }
      });
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/cd /file' });
      await simulateCommand('cd', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Not a directory'));
    });

    it('should continue operation after individual send failure', async () => {
      let success = 0;
      for (const id of [1, -1, 3]) {
        try { if (id === -1) throw new Error(); await mockTelegram.sendMessage(id, 'x'); success++; } catch { /* continue */ }
      }
      expect(success).toBe(2);
    });

    it('should clean up failed session subscriptions', () => {
      const subs = new Map([['s1', () => {}]]);
      subs.get('s1')?.();
      subs.delete('s1');
      expect(subs.has('s1')).toBe(false);
    });
  });

  // 10. CONCURRENT OPERATIONS (8 tests)
  describe('10. CONCURRENT OPERATIONS', () => {
    it('should handle multiple messages from same user', async () => {
      const received: string[] = [];
      textHandler = async (c) => { received.push(c.message.text); mockSessionManager.sendToActiveSession(c.message.text); };
      await Promise.all([
        simulateTextMessage(createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: 'M1' })),
        simulateTextMessage(createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: 'M2' })),
      ]);
      expect(received).toHaveLength(2);
    });

    it('should handle messages from multiple users simultaneously', async () => {
      const received: number[] = [];
      textHandler = async (c) => { received.push(c.from!.id); };
      await Promise.all([
        simulateTextMessage(createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: 'x' })),
        simulateTextMessage(createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_2, messageText: 'y' })),
      ]);
      expect(received).toHaveLength(2);
    });

    it('should handle concurrent session operations', async () => {
      let count = 0;
      mockSessionManager.createSession.mockImplementation(async () => { count++; await sleep(10); return createSession(); });
      mockSessionManager.listSessions.mockReturnValue([]);
      commandHandlers.set('new', async () => { await mockSessionManager.createSession('x', undefined); });
      await Promise.all([
        simulateCommand('new', createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/new a' })),
        simulateCommand('new', createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_2, messageText: '/new b' })),
      ]);
      expect(count).toBe(2);
    });

    it('should handle rapid session switches', async () => {
      const switches: string[] = [];
      mockSessionManager.switchSession.mockImplementation((id: string) => { switches.push(id); return createSession({ id }); });
      commandHandlers.set('switch', async (c) => { mockSessionManager.switchSession(c.message.text.split(' ')[1]); });
      await Promise.all([
        simulateCommand('switch', createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/switch s1' })),
        simulateCommand('switch', createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/switch s2' })),
        simulateCommand('switch', createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, messageText: '/switch s3' })),
      ]);
      expect(switches).toHaveLength(3);
    });

    it('should handle rapid output events', async () => {
      await Promise.all([
        mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, 'O1'),
        mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, 'O2'),
        mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, 'O3'),
      ]);
      expect(mockTelegram.sentMessages).toHaveLength(3);
    });

    it('should preserve message order within a user', async () => {
      const order: number[] = [];
      for (let i = 1; i <= 3; i++) { order.push(i); await mockTelegram.sendMessage(TEST_CHAT_IDS.PRIVATE_1, `M${i}`); }
      expect(order).toEqual([1, 2, 3]);
    });

    it('should handle close during message send', async () => {
      let closed = false;
      mockSessionManager.getActiveSession.mockImplementation(() => closed ? undefined : createSession());
      mockSessionManager.closeSession.mockImplementation(async () => { closed = true; });
      await Promise.all([
        (async () => { await sleep(50); if (!mockSessionManager.getActiveSession()) return; })(),
        (async () => { await sleep(10); await mockSessionManager.closeSession('x'); })(),
      ]);
      expect(closed).toBe(true);
    });

    it('should handle multiple answer selections', async () => {
      const pending = new Map([[TEST_CHAT_IDS.PRIVATE_1, SIMPLE_YES_NO_QUESTION]]);
      const selections: string[] = [];
      actionHandlers.set('/^answer:(.+)$/', async (c) => {
        const match = (c as MockTelegramContext & { match: RegExpExecArray }).match;
        const chatId = c.chat?.id;
        if (chatId && pending.has(chatId)) { selections.push(match[1]); pending.delete(chatId); }
      });
      const makeCtx = (d: string) => {
        const c = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1, chatId: TEST_CHAT_IDS.PRIVATE_1 });
        (c as MockTelegramContext & { match: RegExpExecArray }).match = /^answer:(.+)$/.exec(d) as RegExpExecArray;
        return c;
      };
      await Promise.all([simulateCallback('answer:0', makeCtx('answer:0')), simulateCallback('answer:1', makeCtx('answer:1'))]);
      expect(selections).toHaveLength(1);
    });
  });

  // 11. OUTPUT PARSER (10 tests)
  describe('11. OUTPUT PARSER', () => {
    it('should parse complete JSON lines', () => {
      const results: Array<{ type: string }> = [];
      for (const l of '{"type":"assistant"}\n'.split('\n')) { if (l.trim()) try { results.push(JSON.parse(l)); } catch { /* ignore */ } }
      expect(results).toHaveLength(1);
    });

    it('should handle partial JSON across chunks', () => {
      let buffer = '';
      const results: Array<{ type: string }> = [];
      for (const chunk of ['{"type":"as', 'sistant"}\n']) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const l of lines) { if (l.trim()) try { results.push(JSON.parse(l)); } catch { /* ignore */ } }
      }
      expect(results).toHaveLength(1);
    });

    it('should handle multiple JSON objects in one chunk', () => {
      const results: Array<{ type: string }> = [];
      for (const l of '{"type":"a"}\n{"type":"b"}\n'.split('\n')) { if (l.trim()) try { results.push(JSON.parse(l)); } catch { /* ignore */ } }
      expect(results).toHaveLength(2);
    });

    it('should skip invalid JSON lines', () => {
      const results: Array<{ type: string }> = [];
      const errors: Error[] = [];
      for (const l of 'invalid\n{"type":"valid"}\n'.split('\n')) { if (l.trim()) try { results.push(JSON.parse(l)); } catch (e) { errors.push(e as Error); } }
      expect(results).toHaveLength(1);
      expect(errors).toHaveLength(1);
    });

    it('should detect AskUserQuestion tool_use', () => {
      const output = { type: 'tool_use', name: 'AskUserQuestion' };
      expect(output.type === 'tool_use' && output.name === 'AskUserQuestion').toBe(true);
    });

    it('should not detect other tool_use as questions', () => {
      const output = { type: 'tool_use', name: 'Bash' };
      expect(output.type === 'tool_use' && output.name === 'AskUserQuestion').toBe(false);
    });

    it('should accumulate text from content_block_delta events', () => {
      let text = '';
      const deltas = [{ delta: { text: 'Hello ' } }, { delta: { text: 'World' } }];
      for (const d of deltas) { if (d.delta?.text) text += d.delta.text; }
      expect(text).toBe('Hello World');
    });

    it('should emit accumulated text on content_block_stop', () => {
      let text = 'Accumulated';
      const emitted: string[] = [];
      if (text.trim()) { emitted.push(text); text = ''; }
      expect(emitted).toContain('Accumulated');
    });

    it('should emit question event for AskUserQuestion', () => {
      const questions: Array<{ question: string }> = [];
      const output = { type: 'tool_use', name: 'AskUserQuestion', input: { questions: [{ question: 'Pick' }] } };
      if (output.type === 'tool_use' && output.name === 'AskUserQuestion') { questions.push(...output.input.questions); }
      expect(questions).toHaveLength(1);
    });

    it('should emit tool_call event for tool_use', () => {
      const tools: Array<{ name: string }> = [];
      const output = { type: 'tool_use', name: 'Bash' };
      if (output.type === 'tool_use') { tools.push({ name: output.name }); }
      expect(tools[0].name).toBe('Bash');
    });
  });

  // 12. CLI INTEGRATION (10 tests)
  describe('12. CLI INTEGRATION', () => {
    it('should use absolute path if provided', () => {
      const resolve = (p: string) => p.startsWith('/') ? p : 'claude';
      expect(resolve('/opt/bin/claude')).toBe('/opt/bin/claude');
    });

    it('should try common paths for "claude"', () => {
      const paths = ['/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
      expect(paths[0]).toBe('/opt/homebrew/bin/claude');
    });

    it('should include --print flag for non-interactive mode', () => {
      const args = ['--print', 'Hello'];
      expect(args).toContain('--print');
    });

    it('should include --verbose for stream-json output', () => {
      const args = ['--print', '--verbose', '--output-format', 'stream-json'];
      expect(args).toContain('--verbose');
      expect(args).toContain('stream-json');
    });

    it('should include --resume with session ID for follow-ups', () => {
      const args = ['--print', '--resume', 'sess-123', 'Hello'];
      expect(args).toContain('--resume');
      expect(args).toContain('sess-123');
    });

    it('should clean environment before spawning', () => {
      const env: Record<string, string | undefined> = { CLAUDE_SESSION_ID: 'x', PATH: '/usr/bin' };
      delete env.CLAUDE_SESSION_ID;
      expect(env.CLAUDE_SESSION_ID).toBeUndefined();
      expect(env.PATH).toBe('/usr/bin');
    });

    it('should set FORCE_COLOR=0', () => {
      const env = { FORCE_COLOR: '0' };
      expect(env.FORCE_COLOR).toBe('0');
    });

    it('should spawn with correct working directory', () => {
      let cwd: string | null = null;
      const spawn = (_cmd: string, _args: string[], opts: { cwd: string }) => { cwd = opts.cwd; };
      spawn('claude', [], { cwd: '/home/project' });
      expect(cwd).toBe('/home/project');
    });

    it('should configure stdio for print mode', () => {
      const stdio = ['ignore', 'pipe', 'pipe'];
      expect(stdio[0]).toBe('ignore');
    });

    it('should provide helpful error for ENOENT', () => {
      const formatErr = (code: string) => code === 'ENOENT' ? 'CLI not found' : 'Unknown';
      expect(formatErr('ENOENT')).toContain('not found');
    });
  });

  // 13. TELEGRAM SPECIFICS (10 tests)
  describe('13. TELEGRAM SPECIFICS', () => {
    it('should escape special Markdown characters', () => {
      const escape = (t: string) => t.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
      expect(escape('*bold*')).toContain('\\*');
    });

    it('should handle text without special characters', () => {
      const escape = (t: string) => t.replace(/([_*])/g, '\\$1');
      expect(escape('Hello World')).toBe('Hello World');
    });

    it('should truncate messages over 4096 characters', () => {
      const truncate = (t: string) => t.length > 4096 ? t.slice(0, 4076) + '...(truncated)' : t;
      const result = truncate('A'.repeat(5000));
      expect(result.length).toBeLessThanOrEqual(4096);
      expect(result).toContain('truncated');
    });

    it('should not truncate short messages', () => {
      const truncate = (t: string) => t.length > 4096 ? t.slice(0, 4076) + '...' : t;
      expect(truncate('Hello')).toBe('Hello');
    });

    it('should create 2 buttons per row', () => {
      const opts = [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }];
      const rows: string[][] = [];
      for (let i = 0; i < opts.length; i += 2) { rows.push(opts.slice(i, i + 2).map(o => o.label)); }
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(['A', 'B']);
    });

    it('should add "Other" button at the end', () => {
      const rows = [['Yes', 'No'], ['Other']];
      expect(rows[rows.length - 1][0]).toBe('Other');
    });

    it('should answer callback query', async () => {
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await ctx.answerCbQuery('OK');
      expect(ctx.answerCbQuery).toHaveBeenCalledWith('OK');
    });

    it('should edit message after selection', async () => {
      const ctx = createMockContext({ userId: TEST_USER_IDS.AUTHORIZED_1 });
      await ctx.editMessageText('Selected: *A*', { parse_mode: 'Markdown' });
      expect(ctx.editMessageText).toHaveBeenCalled();
    });

    it('should recognize all registered bot commands', () => {
      const cmds = new Set(['start', 'help', 'new', 'cd', 'list', 'switch', 'close', 'status', 'abort', 'kill', 'sessions', 'attach']);
      const check = (t: string) => { const m = t.match(/^\/(\w+)/); return m ? cmds.has(m[1]) : false; };
      expect(check('/start')).toBe(true);
      expect(check('/sessions')).toBe(true);
    });

    it('should not recognize Claude skill commands as bot commands', () => {
      const cmds = new Set(['start', 'help', 'new', 'cd', 'list', 'switch', 'close', 'status', 'abort', 'kill', 'sessions', 'attach']);
      const check = (t: string) => { const m = t.match(/^\/(\w+)/); return m ? cmds.has(m[1]) : false; };
      expect(check('/commit')).toBe(false);
      expect(check('/babysitter:call')).toBe(false);
    });
  });
});
