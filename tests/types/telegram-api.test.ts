import { describe, it, expect } from '@jest/globals';
import type {
  // Existing types (backward compatibility check)
  SessionStatus,
  Session,
  TelegramBotConfig,
  ExtendedTelegramBotConfig,
  // New Telegram Bot API 9.3 types
  SendMessageDraftOptions,
  StreamingMode,
  ThreadedModeConfig,
  MessageThreadContext,
  DraftBubbleState,
  StreamingConfig,
  StreamChunk,
  StreamState,
  StreamingTelegramBotConfig,
  SendMessageDraftResult,
  StreamingEventType,
  StreamingEvent,
  StreamingHandlerEvents,
} from '../../src/types/index.js';

describe('Telegram Bot API 9.3 Types', () => {
  describe('SendMessageDraftOptions', () => {
    it('should accept numeric chat_id with required text', () => {
      const options: SendMessageDraftOptions = {
        chat_id: 12345678,
        text: 'Draft message content',
      };
      expect(options.chat_id).toBe(12345678);
      expect(options.text).toBe('Draft message content');
      expect(options.message_thread_id).toBeUndefined();
    });

    it('should accept string chat_id (channel username)', () => {
      const options: SendMessageDraftOptions = {
        chat_id: '@channelname',
        text: 'Draft for channel',
      };
      expect(options.chat_id).toBe('@channelname');
    });

    it('should accept optional message_thread_id for forum topics', () => {
      const options: SendMessageDraftOptions = {
        chat_id: 12345678,
        message_thread_id: 42,
        text: 'Draft in topic',
      };
      expect(options.message_thread_id).toBe(42);
    });
  });

  describe('StreamingMode', () => {
    it('should allow "partial" mode', () => {
      const mode: StreamingMode = 'partial';
      expect(mode).toBe('partial');
    });

    it('should allow "block" mode', () => {
      const mode: StreamingMode = 'block';
      expect(mode).toBe('block');
    });

    it('should allow "off" mode', () => {
      const mode: StreamingMode = 'off';
      expect(mode).toBe('off');
    });

    it('should be assignable to string union type', () => {
      const modes: StreamingMode[] = ['partial', 'block', 'off'];
      expect(modes).toHaveLength(3);
    });
  });

  describe('ThreadedModeConfig', () => {
    it('should have required enabled field', () => {
      const config: ThreadedModeConfig = {
        enabled: true,
      };
      expect(config.enabled).toBe(true);
    });

    it('should accept all optional fields', () => {
      const config: ThreadedModeConfig = {
        enabled: true,
        defaultThreadId: 123,
        autoCreateTopics: true,
        topicNamePrefix: 'Claude: ',
      };
      expect(config.defaultThreadId).toBe(123);
      expect(config.autoCreateTopics).toBe(true);
      expect(config.topicNamePrefix).toBe('Claude: ');
    });

    it('should work with disabled mode', () => {
      const config: ThreadedModeConfig = {
        enabled: false,
      };
      expect(config.enabled).toBe(false);
      expect(config.defaultThreadId).toBeUndefined();
    });
  });

  describe('MessageThreadContext', () => {
    it('should have required message_thread_id and is_topic_message', () => {
      const context: MessageThreadContext = {
        message_thread_id: 42,
        is_topic_message: true,
      };
      expect(context.message_thread_id).toBe(42);
      expect(context.is_topic_message).toBe(true);
    });

    it('should accept optional topic metadata', () => {
      const context: MessageThreadContext = {
        message_thread_id: 42,
        is_topic_message: true,
        topic_name: 'General Discussion',
        topic_icon_color: 0x6FB9F0,
        topic_icon_custom_emoji_id: '5368324170671202286',
      };
      expect(context.topic_name).toBe('General Discussion');
      expect(context.topic_icon_color).toBe(0x6FB9F0);
      expect(context.topic_icon_custom_emoji_id).toBe('5368324170671202286');
    });

    it('should work with non-topic messages', () => {
      const context: MessageThreadContext = {
        message_thread_id: 0,
        is_topic_message: false,
      };
      expect(context.is_topic_message).toBe(false);
    });
  });

  describe('DraftBubbleState', () => {
    it('should represent a visible draft bubble', () => {
      const state: DraftBubbleState = {
        isVisible: true,
        currentText: 'Thinking...',
        chatId: 12345678,
        lastUpdated: Date.now(),
        isFinalized: false,
      };
      expect(state.isVisible).toBe(true);
      expect(state.currentText).toBe('Thinking...');
      expect(state.isFinalized).toBe(false);
    });

    it('should support string chat_id', () => {
      const state: DraftBubbleState = {
        isVisible: true,
        currentText: 'Processing...',
        chatId: '@channel',
        lastUpdated: Date.now(),
        isFinalized: false,
      };
      expect(state.chatId).toBe('@channel');
    });

    it('should support optional messageThreadId', () => {
      const state: DraftBubbleState = {
        isVisible: true,
        currentText: 'Draft in topic',
        chatId: 12345678,
        messageThreadId: 42,
        lastUpdated: Date.now(),
        isFinalized: false,
      };
      expect(state.messageThreadId).toBe(42);
    });

    it('should represent a finalized draft', () => {
      const state: DraftBubbleState = {
        isVisible: false,
        currentText: 'Final message',
        chatId: 12345678,
        lastUpdated: Date.now(),
        isFinalized: true,
      };
      expect(state.isFinalized).toBe(true);
      expect(state.isVisible).toBe(false);
    });
  });

  describe('StreamingConfig', () => {
    it('should have all required fields', () => {
      const config: StreamingConfig = {
        mode: 'partial',
        blockSize: 100,
        updateIntervalMs: 500,
        enabled: true,
      };
      expect(config.mode).toBe('partial');
      expect(config.blockSize).toBe(100);
      expect(config.updateIntervalMs).toBe(500);
      expect(config.enabled).toBe(true);
    });

    it('should work with block mode', () => {
      const config: StreamingConfig = {
        mode: 'block',
        blockSize: 500,
        updateIntervalMs: 1000,
        enabled: true,
      };
      expect(config.mode).toBe('block');
      expect(config.blockSize).toBe(500);
    });

    it('should work with streaming disabled', () => {
      const config: StreamingConfig = {
        mode: 'off',
        blockSize: 0,
        updateIntervalMs: 0,
        enabled: false,
      };
      expect(config.enabled).toBe(false);
      expect(config.mode).toBe('off');
    });
  });

  describe('StreamChunk', () => {
    it('should represent an intermediate chunk', () => {
      const chunk: StreamChunk = {
        text: 'Hello, ',
        timestamp: Date.now(),
        isComplete: false,
      };
      expect(chunk.text).toBe('Hello, ');
      expect(chunk.isComplete).toBe(false);
    });

    it('should represent the final chunk', () => {
      const chunk: StreamChunk = {
        text: 'world!',
        timestamp: Date.now(),
        isComplete: true,
      };
      expect(chunk.isComplete).toBe(true);
    });

    it('should handle empty text chunk', () => {
      const chunk: StreamChunk = {
        text: '',
        timestamp: Date.now(),
        isComplete: false,
      };
      expect(chunk.text).toBe('');
    });
  });

  describe('StreamState', () => {
    it('should represent an active streaming session', () => {
      const state: StreamState = {
        isStreaming: true,
        accumulatedText: 'Hello, world!',
        lastUpdateTime: Date.now(),
        chatId: 12345678,
      };
      expect(state.isStreaming).toBe(true);
      expect(state.accumulatedText).toBe('Hello, world!');
    });

    it('should support optional fields', () => {
      const state: StreamState = {
        isStreaming: true,
        accumulatedText: 'Test',
        lastUpdateTime: Date.now(),
        chatId: 12345678,
        messageThreadId: 42,
        chunksReceived: 5,
        totalBytesReceived: 1024,
      };
      expect(state.messageThreadId).toBe(42);
      expect(state.chunksReceived).toBe(5);
      expect(state.totalBytesReceived).toBe(1024);
    });

    it('should support string chat_id', () => {
      const state: StreamState = {
        isStreaming: false,
        accumulatedText: 'Complete',
        lastUpdateTime: Date.now(),
        chatId: '@channel',
      };
      expect(state.chatId).toBe('@channel');
    });

    it('should represent completed stream', () => {
      const state: StreamState = {
        isStreaming: false,
        accumulatedText: 'Final response text',
        lastUpdateTime: Date.now(),
        chatId: 12345678,
        chunksReceived: 10,
      };
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('StreamingTelegramBotConfig', () => {
    it('should extend ExtendedTelegramBotConfig', () => {
      const config: StreamingTelegramBotConfig = {
        token: 'test-token',
        allowedUserIds: [123, 456],
      };
      expect(config.token).toBe('test-token');
      expect(config.allowedUserIds).toEqual([123, 456]);
    });

    it('should accept streaming and threaded mode configs', () => {
      const config: StreamingTelegramBotConfig = {
        token: 'test-token',
        allowedUserIds: [123],
        streamingConfig: {
          mode: 'partial',
          blockSize: 100,
          updateIntervalMs: 500,
          enabled: true,
        },
        threadedModeConfig: {
          enabled: true,
          defaultThreadId: 42,
        },
      };
      expect(config.streamingConfig?.mode).toBe('partial');
      expect(config.threadedModeConfig?.enabled).toBe(true);
    });

    it('should retain all ExtendedTelegramBotConfig fields', () => {
      const config: StreamingTelegramBotConfig = {
        token: 'test-token',
        allowedUserIds: [123],
        voiceConfig: { enabled: true },
        notificationConfig: {
          defaults: { completion: true, error: true, warning: false, progress: false },
        },
        verbosityConfig: { defaultLevel: 'normal' },
        logLevel: 'info',
      };
      expect(config.voiceConfig?.enabled).toBe(true);
      expect(config.logLevel).toBe('info');
    });
  });

  describe('SendMessageDraftResult', () => {
    it('should be a boolean type', () => {
      const successResult: SendMessageDraftResult = true;
      const failResult: SendMessageDraftResult = false;
      expect(typeof successResult).toBe('boolean');
      expect(typeof failResult).toBe('boolean');
    });
  });

  describe('StreamingEventType', () => {
    it('should include all event types', () => {
      const events: StreamingEventType[] = [
        'stream_start',
        'stream_chunk',
        'stream_complete',
        'stream_error',
        'draft_update',
      ];
      expect(events).toHaveLength(5);
    });
  });

  describe('StreamingEvent', () => {
    it('should represent stream_start event', () => {
      const event: StreamingEvent = {
        type: 'stream_start',
        chatId: 12345678,
        data: {
          text: '',
          timestamp: Date.now(),
          isComplete: false,
        } as StreamChunk,
        timestamp: Date.now(),
      };
      expect(event.type).toBe('stream_start');
    });

    it('should represent stream_chunk event with messageThreadId', () => {
      const chunk: StreamChunk = {
        text: 'Hello',
        timestamp: Date.now(),
        isComplete: false,
      };
      const event: StreamingEvent = {
        type: 'stream_chunk',
        chatId: 12345678,
        messageThreadId: 42,
        data: chunk,
        timestamp: Date.now(),
      };
      expect(event.messageThreadId).toBe(42);
      expect((event.data as StreamChunk).text).toBe('Hello');
    });

    it('should represent stream_error event', () => {
      const error = new Error('Connection lost');
      const event: StreamingEvent = {
        type: 'stream_error',
        chatId: 12345678,
        data: error,
        timestamp: Date.now(),
      };
      expect(event.type).toBe('stream_error');
      expect((event.data as Error).message).toBe('Connection lost');
    });

    it('should represent draft_update event', () => {
      const draftState: DraftBubbleState = {
        isVisible: true,
        currentText: 'Updated draft',
        chatId: 12345678,
        lastUpdated: Date.now(),
        isFinalized: false,
      };
      const event: StreamingEvent = {
        type: 'draft_update',
        chatId: 12345678,
        data: draftState,
        timestamp: Date.now(),
      };
      expect((event.data as DraftBubbleState).currentText).toBe('Updated draft');
    });
  });

  describe('StreamingHandlerEvents', () => {
    it('should define correct event signatures', () => {
      // This test verifies the interface structure by creating mock handlers
      const handlers: StreamingHandlerEvents = {
        stream_start: (chatId, threadId) => {
          expect(typeof chatId === 'number' || typeof chatId === 'string').toBe(true);
        },
        stream_chunk: (chunk, chatId, threadId) => {
          expect(chunk).toHaveProperty('text');
          expect(chunk).toHaveProperty('isComplete');
        },
        stream_complete: (state) => {
          expect(state).toHaveProperty('isStreaming');
          expect(state).toHaveProperty('accumulatedText');
        },
        stream_error: (error, chatId) => {
          expect(error).toBeInstanceOf(Error);
        },
        draft_update: (state) => {
          expect(state).toHaveProperty('isVisible');
          expect(state).toHaveProperty('currentText');
        },
      };

      // Invoke handlers to verify they work
      handlers.stream_start(12345678, 42);
      handlers.stream_chunk({ text: 'test', timestamp: Date.now(), isComplete: false }, 123);
      handlers.stream_complete({
        isStreaming: false,
        accumulatedText: 'done',
        lastUpdateTime: Date.now(),
        chatId: 123,
      });
      handlers.stream_error(new Error('test'), 123);
      handlers.draft_update({
        isVisible: true,
        currentText: 'draft',
        chatId: 123,
        lastUpdated: Date.now(),
        isFinalized: false,
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should preserve existing SessionStatus type', () => {
      const statuses: SessionStatus[] = ['active', 'idle', 'waiting_input', 'error'];
      expect(statuses).toHaveLength(4);
    });

    it('should preserve existing Session interface', () => {
      const session: Session = {
        id: 'test-id',
        name: 'Test Session',
        workingDir: '/tmp',
        status: 'active',
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      expect(session.id).toBe('test-id');
    });

    it('should preserve existing TelegramBotConfig interface', () => {
      const config: TelegramBotConfig = {
        token: 'test-token',
        allowedUserIds: [123, 456],
        sessionManagerConfig: {
          claudeCliPath: 'claude',
          defaultWorkingDir: '/tmp',
        },
      };
      expect(config.token).toBe('test-token');
      expect(config.sessionManagerConfig?.claudeCliPath).toBe('claude');
    });

    it('should preserve existing ExtendedTelegramBotConfig interface', () => {
      const config: ExtendedTelegramBotConfig = {
        token: 'test-token',
        allowedUserIds: [123],
        voiceConfig: { enabled: true },
        notificationConfig: {
          defaults: { completion: true, error: true, warning: false, progress: false },
        },
        verbosityConfig: { defaultLevel: 'verbose' },
        fileUploadConfig: {
          enabled: true,
          maxFileSizeMB: 10,
          supportedMimeTypes: ['text/plain'],
          allowedExtensions: ['.txt'],
        },
        logLevel: 'debug',
      };
      expect(config.voiceConfig?.enabled).toBe(true);
      expect(config.fileUploadConfig?.maxFileSizeMB).toBe(10);
    });
  });

  describe('Type Safety Checks', () => {
    it('should enforce required fields in SendMessageDraftOptions', () => {
      // This test documents that TypeScript will catch missing required fields
      const validOptions: SendMessageDraftOptions = {
        chat_id: 123,
        text: 'Required text',
      };
      expect(validOptions).toBeDefined();
    });

    it('should allow numeric and string union for chat_id', () => {
      const numericChatId: SendMessageDraftOptions = { chat_id: 12345, text: 'test' };
      const stringChatId: SendMessageDraftOptions = { chat_id: '@channel', text: 'test' };
      expect(typeof numericChatId.chat_id).toBe('number');
      expect(typeof stringChatId.chat_id).toBe('string');
    });

    it('should enforce StreamingConfig mode as StreamingMode type', () => {
      const configs: StreamingConfig[] = [
        { mode: 'partial', blockSize: 100, updateIntervalMs: 500, enabled: true },
        { mode: 'block', blockSize: 200, updateIntervalMs: 1000, enabled: true },
        { mode: 'off', blockSize: 0, updateIntervalMs: 0, enabled: false },
      ];
      expect(configs.every((c) => ['partial', 'block', 'off'].includes(c.mode))).toBe(true);
    });
  });

  describe('Real-world Usage Scenarios', () => {
    it('should support AI chatbot draft workflow', () => {
      // Simulate the draft bubble workflow for AI chatbot
      const draftOptions: SendMessageDraftOptions = {
        chat_id: 12345678,
        message_thread_id: 42,
        text: 'Thinking about your question...',
      };

      const draftState: DraftBubbleState = {
        isVisible: true,
        currentText: draftOptions.text,
        chatId: draftOptions.chat_id,
        messageThreadId: draftOptions.message_thread_id,
        lastUpdated: Date.now(),
        isFinalized: false,
      };

      // Simulate updating the draft
      draftState.currentText = 'Generating response...';
      draftState.lastUpdated = Date.now();

      // Finalize the draft
      draftState.isFinalized = true;
      draftState.isVisible = false;

      expect(draftState.isFinalized).toBe(true);
    });

    it('should support streaming response workflow', () => {
      const streamConfig: StreamingConfig = {
        mode: 'partial',
        blockSize: 100,
        updateIntervalMs: 250,
        enabled: true,
      };

      const streamState: StreamState = {
        isStreaming: true,
        accumulatedText: '',
        lastUpdateTime: Date.now(),
        chatId: 12345678,
        messageThreadId: 42,
        chunksReceived: 0,
        totalBytesReceived: 0,
      };

      // Simulate receiving chunks
      const chunks: StreamChunk[] = [
        { text: 'Hello, ', timestamp: Date.now(), isComplete: false },
        { text: 'I am Claude. ', timestamp: Date.now() + 100, isComplete: false },
        { text: 'How can I help?', timestamp: Date.now() + 200, isComplete: true },
      ];

      for (const chunk of chunks) {
        streamState.accumulatedText += chunk.text;
        streamState.chunksReceived = (streamState.chunksReceived || 0) + 1;
        streamState.totalBytesReceived =
          (streamState.totalBytesReceived || 0) + chunk.text.length;
        streamState.lastUpdateTime = chunk.timestamp;
        if (chunk.isComplete) {
          streamState.isStreaming = false;
        }
      }

      expect(streamState.accumulatedText).toBe('Hello, I am Claude. How can I help?');
      expect(streamState.chunksReceived).toBe(3);
      expect(streamState.isStreaming).toBe(false);
    });

    it('should support forum topic threading workflow', () => {
      const threadConfig: ThreadedModeConfig = {
        enabled: true,
        defaultThreadId: 42,
        autoCreateTopics: true,
        topicNamePrefix: 'Claude: ',
      };

      const messageContext: MessageThreadContext = {
        message_thread_id: threadConfig.defaultThreadId!,
        is_topic_message: true,
        topic_name: 'Claude: User Question',
        topic_icon_color: 0x6FB9F0,
      };

      const draftInTopic: SendMessageDraftOptions = {
        chat_id: 12345678,
        message_thread_id: messageContext.message_thread_id,
        text: 'Processing your request...',
      };

      expect(draftInTopic.message_thread_id).toBe(messageContext.message_thread_id);
      expect(messageContext.is_topic_message).toBe(true);
    });
  });
});
