import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { TelegramBot } from '../../src/bot/TelegramBot.js';
import type { StreamingTelegramBotConfig, StreamingMode } from '../../src/types/index.js';

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
      getMe: jest.fn().mockResolvedValue({ username: 'test_bot' } as never),
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

// Mock streaming services
jest.mock('../../src/streaming/StreamingService.js', () => {
  return {
    StreamingService: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      isEnabled: jest.fn().mockReturnValue(true),
      getMode: jest.fn().mockReturnValue('partial'),
      setMode: jest.fn(),
      startDraft: jest.fn().mockResolvedValue({
        isVisible: true,
        currentText: '',
        chatId: 123,
        lastUpdated: Date.now(),
        isFinalized: false,
      } as never),
      updateDraft: jest.fn().mockResolvedValue(null as never),
      completeDraft: jest.fn().mockResolvedValue(null as never),
      cancelDraft: jest.fn().mockResolvedValue(undefined as never),
      hasActiveDraft: jest.fn().mockReturnValue(false),
      shutdown: jest.fn().mockResolvedValue(undefined as never),
    })),
    DEFAULT_STREAMING_CONFIG: {
      mode: 'partial',
      blockSize: 100,
      updateIntervalMs: 500,
      enabled: true,
    },
  };
});

jest.mock('../../src/streaming/DraftMessageHandler.js', () => {
  return {
    DraftMessageHandler: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      accumulate: jest.fn().mockReturnValue(true),
      shouldUpdate: jest.fn().mockReturnValue(true),
      sendUpdate: jest.fn().mockResolvedValue(null as never),
      flush: jest.fn().mockResolvedValue(null as never),
      flushAll: jest.fn().mockResolvedValue(undefined as never),
      reset: jest.fn(),
      resetAll: jest.fn(),
      getBuffer: jest.fn().mockReturnValue('test text'),
      getActiveChatKeys: jest.fn().mockReturnValue([]),
      shutdown: jest.fn().mockResolvedValue(undefined as never),
    })),
  };
});

// Mock threaded services
jest.mock('../../src/threaded/ThreadManager.js', () => {
  return {
    ThreadManager: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      setThread: jest.fn(),
      getThreadId: jest.fn().mockReturnValue(undefined),
      clearThread: jest.fn(),
      hasActiveThread: jest.fn().mockReturnValue(false),
      isForumEnabled: jest.fn().mockReturnValue(false),
      setForumEnabled: jest.fn(),
      listTopics: jest.fn().mockReturnValue([]),
      createTopic: jest.fn().mockResolvedValue({
        message_thread_id: 123,
        name: 'Test Topic',
        icon_color: 0x6FB9F0,
      } as never),
      checkForumEnabled: jest.fn().mockResolvedValue(false as never),
      isEnabled: jest.fn().mockReturnValue(true),
      shutdown: jest.fn().mockResolvedValue(undefined as never),
    })),
    DEFAULT_THREAD_MANAGER_CONFIG: {
      enabled: true,
      autoCreateTopics: false,
      topicNamePrefix: 'Chat',
      inactivityTimeoutMs: 60 * 60 * 1000,
    },
  };
});

jest.mock('../../src/threaded/TopicHandler.js', () => {
  return {
    TopicHandler: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
      createTopic: jest.fn().mockResolvedValue({
        message_thread_id: 123,
        name: 'Test Topic',
        icon_color: 0x6FB9F0,
      } as never),
      listTopics: jest.fn().mockReturnValue([]),
      checkForumEnabled: jest.fn().mockResolvedValue(false as never),
      shutdown: jest.fn().mockResolvedValue(undefined as never),
    })),
    DEFAULT_TOPIC_HANDLER_CONFIG: {
      maxCachedTopicsPerChat: 100,
      cacheTtlMs: 5 * 60 * 1000,
    },
    TOPIC_ICON_COLORS: [0x6FB9F0, 0xFFD67E, 0xCB86DB, 0x8EEE98, 0xFF93B2, 0xFB6F5F],
  };
});

const createMockConfig = (overrides?: Partial<StreamingTelegramBotConfig>): StreamingTelegramBotConfig => ({
  token: 'test-token-123',
  allowedUserIds: [12345, 67890],
  sessionManagerConfig: {
    claudeCliPath: 'claude',
    defaultWorkingDir: '/tmp',
  },
  streamingConfig: {
    mode: 'partial',
    blockSize: 100,
    updateIntervalMs: 500,
    enabled: true,
  },
  threadedModeConfig: {
    enabled: true,
    autoCreateTopics: false,
    topicNamePrefix: 'Chat',
  },
  ...overrides,
});

describe('TelegramBot Streaming Integration', () => {
  let telegramBot: TelegramBot;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor with streaming config', () => {
    it('should initialize streaming service when enabled', () => {
      const config = createMockConfig();
      telegramBot = new TelegramBot(config);

      expect(telegramBot.getStreamingService()).not.toBeNull();
    });

    it('should initialize draft handler when streaming enabled', () => {
      const config = createMockConfig();
      telegramBot = new TelegramBot(config);

      expect(telegramBot.getDraftHandler()).not.toBeNull();
    });

    it('should not initialize streaming service when disabled', () => {
      const config = createMockConfig({
        streamingConfig: {
          mode: 'off',
          blockSize: 100,
          updateIntervalMs: 500,
          enabled: false,
        },
      });
      telegramBot = new TelegramBot(config);

      expect(telegramBot.getStreamingService()).toBeNull();
    });
  });

  describe('streaming mode helpers', () => {
    beforeEach(() => {
      const config = createMockConfig();
      telegramBot = new TelegramBot(config);
    });

    it('should get default streaming mode from config', () => {
      const mode = telegramBot.getUserStreamingMode(12345);
      expect(mode).toBe('partial');
    });

    it('should set and get user streaming mode', () => {
      telegramBot.setUserStreamingMode(12345, 'block');
      const mode = telegramBot.getUserStreamingMode(12345);
      expect(mode).toBe('block');
    });

    it('should check if streaming is enabled for user', () => {
      const enabled = telegramBot.isStreamingEnabledForUser(12345);
      expect(enabled).toBe(true);
    });

    it('should return false for streaming when mode is off', () => {
      telegramBot.setUserStreamingMode(12345, 'off');
      const enabled = telegramBot.isStreamingEnabledForUser(12345);
      expect(enabled).toBe(false);
    });
  });
});

describe('TelegramBot Threaded Mode Integration', () => {
  let telegramBot: TelegramBot;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor with threaded mode config', () => {
    it('should initialize thread manager when enabled', () => {
      const config = createMockConfig();
      telegramBot = new TelegramBot(config);

      expect(telegramBot.getThreadManager()).not.toBeNull();
    });

    it('should initialize topic handler when enabled', () => {
      const config = createMockConfig();
      telegramBot = new TelegramBot(config);

      expect(telegramBot.getTopicHandler()).not.toBeNull();
    });

    it('should not initialize thread manager when disabled', () => {
      const config = createMockConfig({
        threadedModeConfig: {
          enabled: false,
          autoCreateTopics: false,
        },
      });
      telegramBot = new TelegramBot(config);

      expect(telegramBot.getThreadManager()).toBeNull();
    });
  });

  describe('threaded mode helpers', () => {
    beforeEach(() => {
      const config = createMockConfig();
      telegramBot = new TelegramBot(config);
    });

    it('should get thread ID for user', () => {
      const threadId = telegramBot.getUserThreadId(123456, 12345);
      expect(threadId).toBeUndefined(); // Default mock returns undefined
    });

    it('should set user thread', () => {
      telegramBot.setUserThread(123456, 12345, 999);
      // Verify the thread manager was called
      const threadManager = telegramBot.getThreadManager();
      expect(threadManager?.setThread).toHaveBeenCalledWith(123456, 999, 12345);
    });

    it('should check if threaded mode is enabled for user', () => {
      const enabled = telegramBot.isThreadedModeEnabledForUser(12345);
      expect(enabled).toBe(true); // Default from config
    });

    it('should set user threaded mode', () => {
      telegramBot.setUserThreadedMode(12345, false);
      const enabled = telegramBot.isThreadedModeEnabledForUser(12345);
      expect(enabled).toBe(false);
    });
  });
});

describe('TelegramBot Command Handlers', () => {
  let telegramBot: TelegramBot;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockBot: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = createMockConfig();
    telegramBot = new TelegramBot(config);
    mockBot = telegramBot.getBot();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('/streaming command', () => {
    it('should register streaming command handler', () => {
      expect(mockBot.command).toHaveBeenCalled();

      // Find the streaming command registration
      const calls = mockBot.command.mock.calls;
      const streamingCall = calls.find((call: unknown[]) => call[0] === 'streaming');
      expect(streamingCall).toBeDefined();
    });
  });

  describe('/threads command', () => {
    it('should register threads command handler', () => {
      const calls = mockBot.command.mock.calls;
      const threadsCall = calls.find((call: unknown[]) => call[0] === 'threads');
      expect(threadsCall).toBeDefined();
    });
  });

  describe('/topic command', () => {
    it('should register topic command handler', () => {
      const calls = mockBot.command.mock.calls;
      const topicCall = calls.find((call: unknown[]) => call[0] === 'topic');
      expect(topicCall).toBeDefined();
    });
  });
});

describe('TelegramBot Message Handling with Threads', () => {
  let telegramBot: TelegramBot;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = createMockConfig();
    telegramBot = new TelegramBot(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('message handlers registration', () => {
    it('should register text message handler', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockBot = telegramBot.getBot() as any;

      // Find the text handler registration
      const calls = mockBot.on.mock.calls;
      const textCall = calls.find((call: unknown[]) => call[0] === 'text');
      expect(textCall).toBeDefined();
    });
  });
});

describe('TelegramBot Streaming Mode Settings', () => {
  let telegramBot: TelegramBot;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = createMockConfig();
    telegramBot = new TelegramBot(config);
  });

  it('should support all streaming modes', () => {
    const modes: StreamingMode[] = ['partial', 'block', 'off'];

    for (const mode of modes) {
      telegramBot.setUserStreamingMode(12345, mode);
      expect(telegramBot.getUserStreamingMode(12345)).toBe(mode);
    }
  });

  it('should maintain separate streaming modes per user', () => {
    telegramBot.setUserStreamingMode(12345, 'partial');
    telegramBot.setUserStreamingMode(67890, 'block');
    telegramBot.setUserStreamingMode(11111, 'off');

    expect(telegramBot.getUserStreamingMode(12345)).toBe('partial');
    expect(telegramBot.getUserStreamingMode(67890)).toBe('block');
    expect(telegramBot.getUserStreamingMode(11111)).toBe('off');
  });
});

describe('TelegramBot Threaded Mode Settings', () => {
  let telegramBot: TelegramBot;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = createMockConfig();
    telegramBot = new TelegramBot(config);
  });

  it('should maintain separate threaded mode per user', () => {
    telegramBot.setUserThreadedMode(12345, true);
    telegramBot.setUserThreadedMode(67890, false);

    expect(telegramBot.isThreadedModeEnabledForUser(12345)).toBe(true);
    expect(telegramBot.isThreadedModeEnabledForUser(67890)).toBe(false);
  });

  it('should allow setting threads for different chats', () => {
    telegramBot.setUserThread(100, 12345, 1);
    telegramBot.setUserThread(200, 12345, 2);
    telegramBot.setUserThread(100, 67890, 3);

    const threadManager = telegramBot.getThreadManager();
    expect(threadManager?.setThread).toHaveBeenCalledWith(100, 1, 12345);
    expect(threadManager?.setThread).toHaveBeenCalledWith(200, 2, 12345);
    expect(threadManager?.setThread).toHaveBeenCalledWith(100, 3, 67890);
  });
});

describe('TelegramBot Integration - Disabled Features', () => {
  it('should work without streaming when disabled', () => {
    const config = createMockConfig({
      streamingConfig: {
        mode: 'off',
        blockSize: 100,
        updateIntervalMs: 500,
        enabled: false,
      },
    });
    const bot = new TelegramBot(config);

    expect(bot.getStreamingService()).toBeNull();
    expect(bot.getDraftHandler()).toBeNull();

    // Should still return 'off' mode from config
    expect(bot.getUserStreamingMode(12345)).toBe('off');

    // Streaming should be disabled
    expect(bot.isStreamingEnabledForUser(12345)).toBe(false);
  });

  it('should work without threaded mode when disabled', () => {
    const config = createMockConfig({
      threadedModeConfig: {
        enabled: false,
      },
    });
    const bot = new TelegramBot(config);

    expect(bot.getThreadManager()).toBeNull();
    expect(bot.getTopicHandler()).toBeNull();

    // Should return undefined for thread ID
    expect(bot.getUserThreadId(100, 12345)).toBeUndefined();

    // Threaded mode should be disabled by default
    expect(bot.isThreadedModeEnabledForUser(12345)).toBe(false);
  });
});

describe('TelegramBot backward compatibility', () => {
  it('should work with basic config (no streaming/threading)', () => {
    const basicConfig = {
      token: 'test-token',
      allowedUserIds: [12345],
    };

    const bot = new TelegramBot(basicConfig);

    expect(bot.getBot()).toBeDefined();
    expect(bot.getSessionManager()).toBeDefined();
    expect(bot.isUserAuthorized(12345)).toBe(true);
    expect(bot.isUserAuthorized(99999)).toBe(false);
  });

  it('should work with extended config (no streaming/threading)', () => {
    const extendedConfig = {
      token: 'test-token',
      allowedUserIds: [12345],
      voiceConfig: { enabled: false },
      fileUploadConfig: {
        enabled: false,
        maxFileSizeMB: 10,
        supportedMimeTypes: [],
        allowedExtensions: [],
      },
    };

    const bot = new TelegramBot(extendedConfig);

    expect(bot.getBot()).toBeDefined();
    expect(bot.isUserAuthorized(12345)).toBe(true);
  });
});
