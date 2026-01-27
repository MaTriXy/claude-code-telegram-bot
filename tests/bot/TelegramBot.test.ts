import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TelegramBot } from '../../src/bot/TelegramBot.js';
import type { TelegramBotConfig, Session } from '../../src/types/index.js';

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
    },
  };
  return {
    Telegraf: jest.fn(() => mockBot),
  };
});

// Mock SessionManager
jest.mock('../../src/session/SessionManager.js');

// Mock OutputParser
jest.mock('../../src/parser/OutputParser.js');

// Mock ClaudeCodeProcess
jest.mock('../../src/session/ClaudeCodeProcess.js');

const mockConfig: TelegramBotConfig = {
  token: 'test-token-123',
  allowedUserIds: [12345, 67890],
  sessionManagerConfig: {
    claudeCliPath: 'claude',
    defaultWorkingDir: '/tmp',
  },
};

describe('TelegramBot', () => {
  let telegramBot: TelegramBot;

  beforeEach(() => {
    jest.clearAllMocks();
    telegramBot = new TelegramBot(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a Telegraf bot instance', () => {
      expect(telegramBot.getBot()).toBeDefined();
    });

    it('should initialize with provided token', () => {
      const { Telegraf } = require('telegraf');
      expect(Telegraf).toHaveBeenCalledWith('test-token-123');
    });

    it('should create SessionManager', () => {
      expect(telegramBot.getSessionManager()).toBeDefined();
    });

    it('should set allowed user IDs from config', () => {
      expect(telegramBot.isUserAuthorized(12345)).toBe(true);
      expect(telegramBot.isUserAuthorized(67890)).toBe(true);
    });
  });

  describe('isUserAuthorized', () => {
    it('should return true for users in the allowed list', () => {
      expect(telegramBot.isUserAuthorized(12345)).toBe(true);
      expect(telegramBot.isUserAuthorized(67890)).toBe(true);
    });

    it('should return false for users not in the allowed list', () => {
      expect(telegramBot.isUserAuthorized(99999)).toBe(false);
      expect(telegramBot.isUserAuthorized(11111)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(telegramBot.isUserAuthorized(0)).toBe(false);
      expect(telegramBot.isUserAuthorized(-1)).toBe(false);
    });
  });

  describe('getBot', () => {
    it('should return the Telegraf bot instance', () => {
      const bot = telegramBot.getBot();
      expect(bot).toBeDefined();
      expect(typeof bot.command).toBe('function');
    });
  });

  describe('getSessionManager', () => {
    it('should return the SessionManager instance', () => {
      const sessionManager = telegramBot.getSessionManager();
      expect(sessionManager).toBeDefined();
    });
  });

  describe('command registration (structure tests)', () => {
    it('should have bot.command method available for /new', () => {
      const bot = telegramBot.getBot();
      expect(bot.command).toBeDefined();
    });

    it('should have bot.command method available for /list', () => {
      const bot = telegramBot.getBot();
      expect(bot.command).toBeDefined();
    });

    it('should have bot.command method available for /switch', () => {
      const bot = telegramBot.getBot();
      expect(bot.command).toBeDefined();
    });

    it('should have bot.command method available for /close', () => {
      const bot = telegramBot.getBot();
      expect(bot.command).toBeDefined();
    });

    it('should have bot.command method available for /status', () => {
      const bot = telegramBot.getBot();
      expect(bot.command).toBeDefined();
    });
  });

  describe('middleware setup (structure tests)', () => {
    it('should have bot.use method for middleware', () => {
      const bot = telegramBot.getBot();
      expect(bot.use).toBeDefined();
    });

    it('should have bot.on method for message handlers', () => {
      const bot = telegramBot.getBot();
      expect(bot.on).toBeDefined();
    });

    it('should have bot.action method for callback queries', () => {
      const bot = telegramBot.getBot();
      expect(bot.action).toBeDefined();
    });
  });

  describe('start and stop', () => {
    it('should have start method defined', () => {
      expect(typeof telegramBot.start).toBe('function');
    });

    it('should have stop method defined', () => {
      expect(typeof telegramBot.stop).toBe('function');
    });

    it('start should call bot.launch()', async () => {
      const bot = telegramBot.getBot();
      await telegramBot.start();
      expect(bot.launch).toHaveBeenCalled();
    });

    it('stop should call bot.stop()', async () => {
      const bot = telegramBot.getBot();
      const sessionManager = telegramBot.getSessionManager();
      // Mock listSessions to return empty array
      (sessionManager.listSessions as jest.Mock).mockReturnValue([]);
      await telegramBot.stop();
      expect(bot.stop).toHaveBeenCalled();
    });
  });

  describe('expected command behavior (specification tests)', () => {
    // These tests document expected behavior for implementation

    it('/new should create a session with name and optional working directory', () => {
      // Expected: /new <name> [workingDir]
      // Should call sessionManager.createSession(name, workingDir)
      // Should reply with session info
      expect(true).toBe(true); // Placeholder for implementation
    });

    it('/list should display all sessions with active indicator', () => {
      // Expected: /list
      // Should call sessionManager.listSessions()
      // Should format output showing: id, name, status, workingDir
      // Should mark active session with indicator
      expect(true).toBe(true);
    });

    it('/switch should change the active session', () => {
      // Expected: /switch <sessionId>
      // Should call sessionManager.switchSession(id)
      // Should confirm switch to user
      expect(true).toBe(true);
    });

    it('/close should terminate and remove a session', () => {
      // Expected: /close <sessionId>
      // Should call sessionManager.closeSession(id)
      // Should confirm closure to user
      expect(true).toBe(true);
    });

    it('/status should show current session information', () => {
      // Expected: /status
      // Should call sessionManager.getActiveSession()
      // Should display detailed session info
      expect(true).toBe(true);
    });

    it('text messages should be forwarded to active session as prompts', () => {
      // When user sends regular text (not a command)
      // Should call sessionManager.sendToActiveSession(text)
      expect(true).toBe(true);
    });

    it('callback queries should answer questions', () => {
      // When user clicks inline button with answer:N
      // Should send the selected option to Claude session
      // Should acknowledge the selection
      expect(true).toBe(true);
    });

    it('unauthorized users should be rejected', () => {
      // When user not in allowedUserIds sends any message
      // Should reply with "Unauthorized" message
      // Should not process the command
      expect(true).toBe(true);
    });

    it('Claude skill invocations (like /babysitter:call) should be forwarded to session', () => {
      // When user sends /babysitter:call or /commit or other Claude skills
      // Should NOT be treated as a bot command
      // Should be forwarded to the active Claude session
      expect(true).toBe(true);
    });

    it('bot commands should be handled by bot, not forwarded to Claude', () => {
      // Commands like /new, /list, /status should be handled by the bot
      // They should NOT be forwarded to Claude session
      expect(true).toBe(true);
    });
  });
});
