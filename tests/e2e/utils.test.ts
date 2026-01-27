/**
 * Tests for E2E Test Utilities
 *
 * Verifies that all utility modules work correctly.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Import from individual modules
import {
  MockTelegramAPI,
  createMockContext,
  createMockTelegrafBot,
} from './utils/mock-telegram.js';

import {
  MockClaudeCodeProcess,
  createSimpleMockProcess,
  isClaudeAvailable,
  createMockQuestionOutput,
  createStandardResponseSequence,
} from './utils/mock-claude.js';

import {
  waitFor,
  sleep,
  createCompletionTracker,
  createEventCollector,
  assertQuestion,
} from './utils/test-helpers.js';

import {
  DEFAULT_BOT_CONFIG,
  SIMPLE_YES_NO_QUESTION,
  createMockSession,
  toJsonLine,
} from './utils/fixtures.js';

import {
  setupBeforeEach,
  createDeferred,
  getCleanEnvironment,
} from './utils/test-setup.js';

// Import from index (verify re-exports work)
import {
  MockTelegramAPI as IndexMockTelegramAPI,
  MockClaudeCodeProcess as IndexMockClaudeCodeProcess,
  DEFAULT_BOT_CONFIG as IndexDefaultBotConfig,
} from './utils/index.js';

describe('E2E Test Utilities', () => {
  describe('mock-telegram', () => {
    let mockTelegram: MockTelegramAPI;

    beforeEach(() => {
      mockTelegram = new MockTelegramAPI();
    });

    afterEach(() => {
      mockTelegram.reset();
    });

    it('should record sent messages', async () => {
      await mockTelegram.sendMessage(12345, 'Hello');
      await mockTelegram.sendMessage(12345, 'World');

      expect(mockTelegram.sentMessages).toHaveLength(2);
      expect(mockTelegram.sentMessages[0].text).toBe('Hello');
      expect(mockTelegram.sentMessages[1].text).toBe('World');
    });

    it('should emit messageSent event', async () => {
      const received: unknown[] = [];
      mockTelegram.on('messageSent', (msg) => received.push(msg));

      await mockTelegram.sendMessage(12345, 'Test');

      expect(received).toHaveLength(1);
    });

    it('should get last message', async () => {
      await mockTelegram.sendMessage(12345, 'First');
      await mockTelegram.sendMessage(12345, 'Last');

      expect(mockTelegram.getLastMessage()?.text).toBe('Last');
    });

    it('should filter messages by chat', async () => {
      await mockTelegram.sendMessage(111, 'Chat 1');
      await mockTelegram.sendMessage(222, 'Chat 2');
      await mockTelegram.sendMessage(111, 'Chat 1 again');

      const chat1Messages = mockTelegram.getMessagesByChat(111);
      expect(chat1Messages).toHaveLength(2);
    });

    it('should create mock context', () => {
      const ctx = createMockContext({
        userId: 12345,
        chatId: 12345,
        messageText: '/start',
      });

      expect(ctx.from?.id).toBe(12345);
      expect(ctx.chat?.id).toBe(12345);
      expect(ctx.message.text).toBe('/start');
      expect(ctx.reply).toBeDefined();
    });

    it('should create mock Telegraf bot', () => {
      const mockBot = createMockTelegrafBot();

      expect(mockBot.command).toBeDefined();
      expect(mockBot.action).toBeDefined();
      expect(mockBot.on).toBeDefined();
      expect(mockBot.launch).toBeDefined();
      expect(mockBot.telegram).toBeInstanceOf(MockTelegramAPI);
    });
  });

  describe('mock-claude', () => {
    it('should create mock process with default behavior', () => {
      const mockProcess = new MockClaudeCodeProcess();

      expect(mockProcess.isRunning).toBe(true);
      expect(mockProcess.hasActiveProcess()).toBe(true);
    });

    it('should emit output when send is called', (done) => {
      const mockProcess = new MockClaudeCodeProcess({
        responseDelay: 5,
        defaultResponse: [{ type: 'assistant', content: 'test response' }],
        autoComplete: false,
      });

      mockProcess.on('output', (data) => {
        const parsed = JSON.parse(data);
        expect(parsed.type).toBeDefined();
        expect(parsed.type).toBe('assistant');
        done();
      });

      mockProcess.send('test input');
    });

    it('should kill process correctly', () => {
      const mockProcess = new MockClaudeCodeProcess();

      mockProcess.kill();

      expect(mockProcess.isRunning).toBe(false);
    });

    it('should track input history', () => {
      const mockProcess = new MockClaudeCodeProcess();

      mockProcess.send('first');
      mockProcess.send('second');

      const history = mockProcess.getInputHistory();
      expect(history).toContain('first');
      expect(history).toContain('second');
    });

    it('should create simple mock process', () => {
      const mockProcess = createSimpleMockProcess();

      expect(mockProcess.isRunning).toBe(true);
      expect(mockProcess.send).toBeDefined();
      expect(mockProcess.kill).toBeDefined();
    });

    it('should create mock question output', () => {
      const output = createMockQuestionOutput(
        'Choose one:',
        [{ label: 'A' }, { label: 'B' }]
      );

      expect(output.type).toBe('tool_use');
      expect(output.name).toBe('AskUserQuestion');
      expect(output.input).toBeDefined();
    });

    it('should create standard response sequence', () => {
      const sequence = createStandardResponseSequence('Hello there!');

      expect(sequence).toHaveLength(3);
      expect(sequence[0].type).toBe('system');
      expect(sequence[1].type).toBe('assistant');
      expect(sequence[2].type).toBe('result');
    });

    it('should check Claude availability', () => {
      // This will return true or false depending on the system
      const available = isClaudeAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('test-helpers', () => {
    it('should wait for condition', async () => {
      let flag = false;

      setTimeout(() => {
        flag = true;
      }, 50);

      await waitFor(() => flag, 1000);

      expect(flag).toBe(true);
    });

    it('should timeout if condition not met', async () => {
      await expect(waitFor(() => false, 100)).rejects.toThrow('Timeout');
    });

    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(90);
    });

    it('should track completion', async () => {
      const tracker = createCompletionTracker();

      expect(tracker.isComplete()).toBe(false);

      tracker.markComplete();

      expect(tracker.isComplete()).toBe(true);
    });

    it('should collect events', async () => {
      const { EventEmitter } = await import('events');
      const emitter = new EventEmitter();

      const collector = createEventCollector(emitter, 'test');

      emitter.emit('test', 'first');
      emitter.emit('test', 'second');

      expect(collector.events).toHaveLength(2);

      collector.stop();
    });

    it('should assert question properties', () => {
      assertQuestion(SIMPLE_YES_NO_QUESTION, {
        questionText: 'proceed',
        optionCount: 2,
        multiSelect: false,
      });
    });
  });

  describe('fixtures', () => {
    it('should have default bot config', () => {
      expect(DEFAULT_BOT_CONFIG.token).toBeDefined();
      expect(DEFAULT_BOT_CONFIG.allowedUserIds).toBeInstanceOf(Array);
    });

    it('should create mock session', () => {
      const session = createMockSession({ name: 'custom-name' });

      expect(session.id).toBeDefined();
      expect(session.name).toBe('custom-name');
      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('should have sample questions', () => {
      expect(SIMPLE_YES_NO_QUESTION.question).toBeDefined();
      expect(SIMPLE_YES_NO_QUESTION.options).toHaveLength(2);
    });

    it('should convert to JSON line', () => {
      const line = toJsonLine({ type: 'test' });

      expect(line).toBe('{"type":"test"}\n');
    });
  });

  describe('test-setup', () => {
    it('should create deferred promise', async () => {
      const deferred = createDeferred<string>();

      setTimeout(() => {
        deferred.resolve('done');
      }, 10);

      const result = await deferred.promise;
      expect(result).toBe('done');
    });

    it('should get clean environment', () => {
      const env = getCleanEnvironment();

      expect(env.CLAUDE_SESSION_ID).toBeUndefined();
      expect(env.CLAUDE_PROJECT).toBeUndefined();
    });
  });

  describe('index re-exports', () => {
    it('should export MockTelegramAPI', () => {
      expect(IndexMockTelegramAPI).toBe(MockTelegramAPI);
    });

    it('should export MockClaudeCodeProcess', () => {
      expect(IndexMockClaudeCodeProcess).toBe(MockClaudeCodeProcess);
    });

    it('should export DEFAULT_BOT_CONFIG', () => {
      expect(IndexDefaultBotConfig).toEqual(DEFAULT_BOT_CONFIG);
    });
  });
});
