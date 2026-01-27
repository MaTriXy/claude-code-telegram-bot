/**
 * Telegram Bot Mocking Utilities for E2E Tests
 *
 * Provides mock implementations of Telegram API and bot functionality
 * for testing the Claude Code Telegram Bot without actual Telegram connections.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

/**
 * Mock Telegram message structure
 */
export interface MockTelegramMessage {
  message_id: number;
  chatId: number;
  text: string;
  options?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Mock Telegram callback query
 */
export interface MockCallbackQuery {
  id: string;
  chatId: number;
  messageId: number;
  data: string;
  from: MockTelegramUser;
}

/**
 * Mock Telegram user
 */
export interface MockTelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  is_bot: boolean;
}

/**
 * Mock Telegram chat
 */
export interface MockTelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
}

/**
 * Mock Telegram context for command/message handlers
 */
export interface MockTelegramContext {
  from: MockTelegramUser | undefined;
  chat: MockTelegramChat | undefined;
  message: {
    text: string;
    message_id: number;
  };
  match?: RegExpExecArray;
  reply: jest.Mock;
  answerCbQuery: jest.Mock;
  editMessageText: jest.Mock;
}

/**
 * MockTelegramAPI - Simulates Telegram Bot API
 *
 * Extends EventEmitter to allow listening for sent messages and callbacks.
 * Events:
 * - 'messageSent': Emitted when sendMessage is called
 * - 'messageEdited': Emitted when editMessageText is called
 * - 'callbackAnswered': Emitted when answerCbQuery is called
 */
export class MockTelegramAPI extends EventEmitter {
  public sentMessages: MockTelegramMessage[] = [];
  public editedMessages: MockTelegramMessage[] = [];
  public answeredCallbacks: string[] = [];
  private messageIdCounter = 1;

  /**
   * Simulate sending a message
   */
  async sendMessage(
    chatId: number,
    text: string,
    options?: Record<string, unknown>
  ): Promise<{ message_id: number }> {
    const message: MockTelegramMessage = {
      message_id: this.messageIdCounter++,
      chatId,
      text,
      options,
      timestamp: new Date(),
    };

    this.sentMessages.push(message);
    this.emit('messageSent', message);

    return { message_id: message.message_id };
  }

  /**
   * Simulate editing a message
   */
  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    options?: Record<string, unknown>
  ): Promise<{ message_id: number }> {
    const message: MockTelegramMessage = {
      message_id: messageId,
      chatId,
      text,
      options,
      timestamp: new Date(),
    };

    this.editedMessages.push(message);
    this.emit('messageEdited', message);

    return { message_id: messageId };
  }

  /**
   * Simulate answering a callback query
   */
  async answerCbQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    this.answeredCallbacks.push(callbackQueryId);
    this.emit('callbackAnswered', { id: callbackQueryId, text });
    return true;
  }

  /**
   * Get the last sent message
   */
  getLastMessage(): MockTelegramMessage | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }

  /**
   * Get all messages sent to a specific chat
   */
  getMessagesByChat(chatId: number): MockTelegramMessage[] {
    return this.sentMessages.filter((m) => m.chatId === chatId);
  }

  /**
   * Get messages containing specific text
   */
  getMessagesContaining(text: string): MockTelegramMessage[] {
    return this.sentMessages.filter((m) =>
      m.text.toLowerCase().includes(text.toLowerCase())
    );
  }

  /**
   * Check if a message was sent containing specific text
   */
  hasMessageContaining(text: string): boolean {
    return this.sentMessages.some((m) =>
      m.text.toLowerCase().includes(text.toLowerCase())
    );
  }

  /**
   * Get messages with inline keyboards
   */
  getMessagesWithKeyboard(): MockTelegramMessage[] {
    return this.sentMessages.filter(
      (m) => m.options && 'reply_markup' in m.options
    );
  }

  /**
   * Clear all recorded messages and state
   */
  clear(): void {
    this.sentMessages = [];
    this.editedMessages = [];
    this.answeredCallbacks = [];
    this.messageIdCounter = 1;
  }

  /**
   * Reset the mock (alias for clear)
   */
  reset(): void {
    this.clear();
    this.removeAllListeners();
  }
}

/**
 * Create a mock Telegraf bot instance
 */
export function createMockTelegrafBot(): {
  command: jest.Mock;
  action: jest.Mock;
  on: jest.Mock;
  use: jest.Mock;
  catch: jest.Mock;
  launch: jest.Mock;
  stop: jest.Mock;
  telegram: MockTelegramAPI;
} {
  const mockTelegram = new MockTelegramAPI();

  return {
    command: jest.fn(),
    action: jest.fn(),
    on: jest.fn(),
    use: jest.fn(),
    catch: jest.fn(),
    launch: jest.fn().mockResolvedValue(undefined as never),
    stop: jest.fn(),
    telegram: mockTelegram,
  };
}

/**
 * Create a mock Telegram context for testing handlers
 */
export function createMockContext(options: {
  userId?: number;
  chatId?: number;
  messageText?: string;
  callbackData?: string;
  isAuthorized?: boolean;
}): MockTelegramContext {
  const {
    userId = 12345,
    chatId = 12345,
    messageText = '',
    callbackData,
  } = options;

  const ctx: MockTelegramContext = {
    from: {
      id: userId,
      first_name: 'Test',
      last_name: 'User',
      username: 'testuser',
      is_bot: false,
    },
    chat: {
      id: chatId,
      type: 'private',
    },
    message: {
      text: messageText,
      message_id: 1,
    },
    reply: jest.fn().mockResolvedValue({ message_id: 1 } as never),
    answerCbQuery: jest.fn().mockResolvedValue(true as never),
    editMessageText: jest.fn().mockResolvedValue({ message_id: 1 } as never),
  };

  // Add match for callback queries
  if (callbackData) {
    const match = /^answer:(.+)$/.exec(callbackData);
    if (match) {
      ctx.match = match as RegExpExecArray;
    }
  }

  return ctx;
}

/**
 * Create the Telegraf module mock for jest.mock()
 */
export function createTelegrafMock(): {
  Telegraf: jest.Mock;
  mockBot: ReturnType<typeof createMockTelegrafBot>;
} {
  const mockBot = createMockTelegrafBot();

  return {
    Telegraf: jest.fn(() => mockBot),
    mockBot,
  };
}

/**
 * Setup Telegraf mock for a test file
 *
 * Call this at the top of your test file before imports:
 * ```typescript
 * jest.mock('telegraf', () => createTelegrafMock());
 * ```
 */
export function getTelegrafMockSetup(): string {
  return `
jest.mock('telegraf', () => {
  const mockBot = {
    command: jest.fn(),
    action: jest.fn(),
    on: jest.fn(),
    use: jest.fn(),
    catch: jest.fn(),
    launch: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    telegram: {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    },
  };
  return {
    Telegraf: jest.fn(() => mockBot),
  };
});
`;
}

/**
 * Simulate a user sending a text message
 */
export async function simulateUserMessage(
  mockBot: ReturnType<typeof createMockTelegrafBot>,
  ctx: MockTelegramContext
): Promise<void> {
  // Find the 'text' handler
  const textHandler = mockBot.on.mock.calls.find(
    (call) => call[0] === 'text'
  )?.[1] as ((ctx: MockTelegramContext) => Promise<void>) | undefined;

  if (textHandler) {
    await textHandler(ctx);
  }
}

/**
 * Simulate a user clicking a callback button
 */
export async function simulateCallbackQuery(
  mockBot: ReturnType<typeof createMockTelegrafBot>,
  ctx: MockTelegramContext,
  pattern: RegExp
): Promise<void> {
  // Find the matching action handler
  const actionHandler = mockBot.action.mock.calls.find((call) => {
    const handlerPattern = call[0] as RegExp;
    return handlerPattern.toString() === pattern.toString();
  })?.[1] as ((ctx: MockTelegramContext) => Promise<void>) | undefined;

  if (actionHandler) {
    await actionHandler(ctx);
  }
}

/**
 * Simulate a user sending a command
 */
export async function simulateCommand(
  mockBot: ReturnType<typeof createMockTelegrafBot>,
  commandName: string,
  ctx: MockTelegramContext
): Promise<void> {
  // Find the command handler
  const commandHandler = mockBot.command.mock.calls.find(
    (call) => call[0] === commandName
  )?.[1] as ((ctx: MockTelegramContext) => Promise<void>) | undefined;

  if (commandHandler) {
    await commandHandler(ctx);
  }
}

/**
 * Wait for a specific message to be sent
 */
export function waitForMessage(
  mockTelegram: MockTelegramAPI,
  predicate: (msg: MockTelegramMessage) => boolean,
  timeout = 5000
): Promise<MockTelegramMessage> {
  return new Promise((resolve, reject) => {
    // Check existing messages first
    const existing = mockTelegram.sentMessages.find(predicate);
    if (existing) {
      resolve(existing);
      return;
    }

    const timeoutId = setTimeout(() => {
      mockTelegram.removeListener('messageSent', handler);
      reject(new Error('Timeout waiting for message'));
    }, timeout);

    const handler = (msg: MockTelegramMessage) => {
      if (predicate(msg)) {
        clearTimeout(timeoutId);
        mockTelegram.removeListener('messageSent', handler);
        resolve(msg);
      }
    };

    mockTelegram.on('messageSent', handler);
  });
}

/**
 * Wait for a message containing specific text
 */
export function waitForMessageContaining(
  mockTelegram: MockTelegramAPI,
  text: string,
  timeout = 5000
): Promise<MockTelegramMessage> {
  return waitForMessage(
    mockTelegram,
    (msg) => msg.text.toLowerCase().includes(text.toLowerCase()),
    timeout
  );
}
