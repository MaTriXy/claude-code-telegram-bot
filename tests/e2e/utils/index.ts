/**
 * E2E Test Utilities Index
 *
 * Re-exports all test utilities for convenient importing.
 *
 * Usage:
 * ```typescript
 * import {
 *   MockTelegramAPI,
 *   MockClaudeCodeProcess,
 *   waitFor,
 *   DEFAULT_BOT_CONFIG,
 * } from '../utils/index.js';
 * ```
 */

// Test setup and lifecycle
export {
  CLAUDE_TIMEOUT,
  DEFAULT_WAIT_TIMEOUT,
  DEFAULT_POLL_INTERVAL,
  TELEGRAM_MAX_MESSAGE_LENGTH,
  type TestEnvironment,
  getTestEnvironment,
  resetTestEnvironment,
  registerCleanup,
  executeCleanup,
  setupBeforeEach,
  setupAfterEach,
  setupAfterAll,
  setupTestLifecycle,
  getCleanEnvironment,
  setTestTimeout,
  createDeferred,
  createMockEmitter,
  skipIf,
  runOnlyIf,
} from './test-setup.js';

// Telegram mocking utilities
export {
  type MockTelegramMessage,
  type MockCallbackQuery,
  type MockTelegramUser,
  type MockTelegramChat,
  type MockTelegramContext,
  MockTelegramAPI,
  createMockTelegrafBot,
  createMockContext,
  createTelegrafMock,
  getTelegrafMockSetup,
  simulateUserMessage,
  simulateCallbackQuery,
  simulateCommand,
  waitForMessage,
  waitForMessageContaining,
} from './mock-telegram.js';

// Claude CLI mocking utilities
export {
  type MockClaudeOutputType,
  type MockClaudeOutput,
  type MockClaudeConfig,
  MockClaudeCodeProcess,
  createMockClaudeCodeProcessFactory,
  createClaudeCodeProcessMock,
  createSimpleMockProcess,
  isClaudeAvailable,
  getClaudeCliPath,
  createMockQuestionOutput,
  createMockToolUseOutput,
  createMockToolResultOutput,
  createMockAssistantOutput,
  createMockResultOutput,
  createStandardResponseSequence,
  createQuestionResponseSequence,
  getFsMockSetup,
} from './mock-claude.js';

// Test helpers and assertions
export {
  DEFAULT_TIMEOUT,
  DEFAULT_INTERVAL,
  waitFor,
  waitForValue,
  waitForArrayLength,
  waitForEvent,
  waitForEvents,
  sleep,
  retry,
  assertContains,
  assertNotContains,
  assertOutputType,
  assertAssistantResponse,
  assertQuestion,
  assertTelegramMessage,
  assertMessageLengths,
  createCompletionTracker,
  createEventCollector,
  arraysEqualUnordered,
  extractTextFromOutputs,
  extractToolCalls,
  hasToolCall,
  createTimeout,
  withTimeout,
} from './test-helpers.js';

// Test fixtures and sample data
export {
  DEFAULT_BOT_CONFIG,
  DEFAULT_SESSION_CONFIG,
  SINGLE_USER_BOT_CONFIG,
  createBotConfig,
  TEST_USER_IDS,
  TEST_CHAT_IDS,
  createMockSession,
  SAMPLE_SESSIONS,
  SIMPLE_YES_NO_QUESTION,
  FRAMEWORK_QUESTION,
  FEATURES_QUESTION,
  MANY_OPTIONS_QUESTION,
  MINIMAL_QUESTION,
  createQuestion,
  SYSTEM_INIT_OUTPUT,
  SIMPLE_ASSISTANT_OUTPUT,
  BASH_TOOL_USE_OUTPUT,
  READ_TOOL_USE_OUTPUT,
  WRITE_TOOL_USE_OUTPUT,
  TOOL_RESULT_SUCCESS,
  TOOL_RESULT_ERROR,
  ASK_USER_QUESTION_OUTPUT,
  RESULT_OUTPUT,
  createResponseSequence,
  createToolSequence,
  JSON_STREAM_CHUNKS,
  BOT_COMMANDS,
  CLAUDE_SKILL_COMMANDS,
  ERROR_MESSAGES,
  USER_MESSAGES,
  CLAUDE_RESPONSES,
  generateSessionId,
  generateMessageId,
  createTimestamp,
  toJsonLine,
  toJsonLines,
} from './fixtures.js';
