/**
 * Sample Test Data and Fixtures for E2E Tests
 *
 * Provides reusable test data, configurations, and sample payloads
 * for testing the Claude Code Telegram Bot.
 */

import type {
  TelegramBotConfig,
  SessionManagerConfig,
  Session,
  ParsedQuestion,
  QuestionOption,
  ClaudeOutput,
  ToolUseOutput,
  AssistantOutput,
  ToolResultOutput,
} from '../../../src/types/index.js';

// ============================================================================
// Configuration Fixtures
// ============================================================================

/**
 * Default Telegram bot configuration for tests
 */
export const DEFAULT_BOT_CONFIG: TelegramBotConfig = {
  token: 'test-token-123456789',
  allowedUserIds: [12345, 67890, 11111],
  sessionManagerConfig: {
    claudeCliPath: 'claude',
    defaultWorkingDir: '/tmp',
  },
};

/**
 * Default session manager configuration
 */
export const DEFAULT_SESSION_CONFIG: SessionManagerConfig = {
  claudeCliPath: 'claude',
  defaultWorkingDir: '/tmp',
};

/**
 * Bot config with single user
 */
export const SINGLE_USER_BOT_CONFIG: TelegramBotConfig = {
  token: 'single-user-token',
  allowedUserIds: [12345],
  sessionManagerConfig: DEFAULT_SESSION_CONFIG,
};

/**
 * Bot config with custom working directory
 */
export function createBotConfig(
  overrides: Partial<TelegramBotConfig> = {}
): TelegramBotConfig {
  return {
    ...DEFAULT_BOT_CONFIG,
    ...overrides,
  };
}

// ============================================================================
// User Fixtures
// ============================================================================

/**
 * Test user IDs
 */
export const TEST_USER_IDS = {
  AUTHORIZED_1: 12345,
  AUTHORIZED_2: 67890,
  AUTHORIZED_3: 11111,
  UNAUTHORIZED: 99999,
};

/**
 * Test chat IDs
 */
export const TEST_CHAT_IDS = {
  PRIVATE_1: 12345,
  PRIVATE_2: 67890,
  GROUP: -100123456789,
};

// ============================================================================
// Session Fixtures
// ============================================================================

/**
 * Create a mock session object
 */
export function createMockSession(
  overrides: Partial<Session> = {}
): Session {
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

/**
 * Sample sessions for list tests
 */
export const SAMPLE_SESSIONS: Session[] = [
  createMockSession({ id: 'sess-001', name: 'project-alpha', workingDir: '/projects/alpha' }),
  createMockSession({ id: 'sess-002', name: 'project-beta', workingDir: '/projects/beta' }),
  createMockSession({ id: 'sess-003', name: 'project-gamma', workingDir: '/projects/gamma', status: 'active' }),
];

// ============================================================================
// Question Fixtures
// ============================================================================

/**
 * Simple yes/no question
 */
export const SIMPLE_YES_NO_QUESTION: ParsedQuestion = {
  question: 'Do you want to proceed?',
  options: [
    { label: 'Yes', description: 'Continue with the operation' },
    { label: 'No', description: 'Cancel the operation' },
  ],
  multiSelect: false,
};

/**
 * Framework selection question
 */
export const FRAMEWORK_QUESTION: ParsedQuestion = {
  question: 'Which framework would you like to use?',
  header: 'Framework Selection',
  options: [
    { label: 'React', description: 'A JavaScript library for building user interfaces' },
    { label: 'Vue', description: 'The Progressive JavaScript Framework' },
    { label: 'Angular', description: 'Platform for building mobile and desktop web applications' },
    { label: 'Svelte', description: 'Cybernetically enhanced web apps' },
  ],
  multiSelect: false,
};

/**
 * Multi-select features question
 */
export const FEATURES_QUESTION: ParsedQuestion = {
  question: 'Select the features you want to include:',
  header: 'Feature Selection',
  options: [
    { label: 'TypeScript', description: 'Add TypeScript support' },
    { label: 'ESLint', description: 'Add linting support' },
    { label: 'Prettier', description: 'Add code formatting' },
    { label: 'Testing', description: 'Add testing framework' },
    { label: 'CI/CD', description: 'Add continuous integration' },
  ],
  multiSelect: true,
};

/**
 * Question with many options
 */
export const MANY_OPTIONS_QUESTION: ParsedQuestion = {
  question: 'Select a color:',
  options: Array.from({ length: 10 }, (_, i) => ({
    label: `Color ${i + 1}`,
    description: `This is color option ${i + 1}`,
  })),
  multiSelect: false,
};

/**
 * Question without descriptions
 */
export const MINIMAL_QUESTION: ParsedQuestion = {
  question: 'Pick one:',
  options: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
  multiSelect: false,
};

/**
 * Create a custom question
 */
export function createQuestion(
  question: string,
  options: QuestionOption[],
  overrides: Partial<ParsedQuestion> = {}
): ParsedQuestion {
  return {
    question,
    options,
    multiSelect: false,
    ...overrides,
  };
}

// ============================================================================
// Claude Output Fixtures
// ============================================================================

/**
 * System init output
 */
export const SYSTEM_INIT_OUTPUT: ClaudeOutput = {
  type: 'system',
  timestamp: new Date().toISOString(),
};

/**
 * Simple assistant response
 */
export const SIMPLE_ASSISTANT_OUTPUT: AssistantOutput = {
  type: 'assistant',
  content: 'Hello! How can I help you today?',
};

/**
 * Tool use output (Bash command)
 */
export const BASH_TOOL_USE_OUTPUT: ToolUseOutput = {
  type: 'tool_use',
  name: 'Bash',
  input: { command: 'ls -la' },
};

/**
 * Tool use output (Read file)
 */
export const READ_TOOL_USE_OUTPUT: ToolUseOutput = {
  type: 'tool_use',
  name: 'Read',
  input: { file_path: '/path/to/file.ts' },
};

/**
 * Tool use output (Write file)
 */
export const WRITE_TOOL_USE_OUTPUT: ToolUseOutput = {
  type: 'tool_use',
  name: 'Write',
  input: {
    file_path: '/path/to/new-file.ts',
    content: 'console.log("Hello, World!");',
  },
};

/**
 * Tool result output (success)
 */
export const TOOL_RESULT_SUCCESS: ToolResultOutput = {
  type: 'tool_result',
  name: 'Bash',
  result: 'file1.txt\nfile2.txt\nfile3.txt',
};

/**
 * Tool result output (error)
 */
export const TOOL_RESULT_ERROR: ToolResultOutput = {
  type: 'tool_result',
  name: 'Bash',
  result: null,
  error: 'Command failed with exit code 1',
};

/**
 * AskUserQuestion tool use output
 */
export const ASK_USER_QUESTION_OUTPUT: ToolUseOutput = {
  type: 'tool_use',
  name: 'AskUserQuestion',
  input: {
    questions: [
      {
        question: 'Which option do you prefer?',
        options: [
          { label: 'Option A', description: 'First choice' },
          { label: 'Option B', description: 'Second choice' },
        ],
      },
    ],
  },
};

/**
 * Result (completion) output
 */
export const RESULT_OUTPUT: ClaudeOutput = {
  type: 'result',
  timestamp: new Date().toISOString(),
};

/**
 * Create a standard response sequence
 */
export function createResponseSequence(
  content: string
): ClaudeOutput[] {
  return [
    SYSTEM_INIT_OUTPUT,
    { type: 'assistant', content } as AssistantOutput,
    RESULT_OUTPUT,
  ];
}

/**
 * Create a tool execution sequence
 */
export function createToolSequence(
  toolName: string,
  input: Record<string, unknown>,
  result: unknown
): ClaudeOutput[] {
  return [
    SYSTEM_INIT_OUTPUT,
    { type: 'tool_use', name: toolName, input } as ToolUseOutput,
    { type: 'tool_result', name: toolName, result } as ToolResultOutput,
    { type: 'assistant', content: 'Done!' } as AssistantOutput,
    RESULT_OUTPUT,
  ];
}

// ============================================================================
// JSON Stream Fixtures
// ============================================================================

/**
 * Sample JSON stream chunks for parsing tests
 */
export const JSON_STREAM_CHUNKS = {
  COMPLETE_LINE: '{"type":"assistant","content":"Hello"}\n',
  PARTIAL_START: '{"type":"assi',
  PARTIAL_END: 'stant","content":"Hi"}\n',
  MULTIPLE_LINES:
    '{"type":"assistant","content":"One"}\n{"type":"assistant","content":"Two"}\n',
  WITH_EMPTY_LINES: '\n\n{"type":"assistant","content":"Data"}\n\n',
  INVALID_JSON: 'not valid json\n',
  MIXED_VALID_INVALID: 'invalid\n{"type":"assistant","content":"Valid"}\n',
};

// ============================================================================
// Command Fixtures
// ============================================================================

/**
 * Sample bot commands
 */
export const BOT_COMMANDS = {
  START: '/start',
  HELP: '/help',
  NEW: '/new test-session',
  NEW_WITH_DIR: '/new my-project /home/user/projects',
  LIST: '/list',
  SWITCH: '/switch sess-001',
  CLOSE: '/close sess-001',
  STATUS: '/status',
  CD: '/cd /home/user/other-project',
  ABORT: '/abort',
  KILL: '/kill',
  SESSIONS: '/sessions',
  ATTACH: '/attach abc12345',
};

/**
 * Sample Claude skill commands (should be forwarded to Claude)
 */
export const CLAUDE_SKILL_COMMANDS = {
  COMMIT: '/commit',
  REVIEW_PR: '/review-pr 123',
  BABYSITTER_CALL: '/babysitter:call',
  BABYSITTER_BABYSIT: '/babysitter:babysit',
};

// ============================================================================
// Error Fixtures
// ============================================================================

/**
 * Common error messages
 */
export const ERROR_MESSAGES = {
  SESSION_NOT_FOUND: 'Session not found',
  NO_ACTIVE_SESSION: 'No active session',
  UNAUTHORIZED: 'Unauthorized',
  INVALID_DIRECTORY: 'Invalid directory',
  PROCESS_NOT_RUNNING: 'Process is not running',
  TIMEOUT: 'Operation timed out',
};

// ============================================================================
// Message Text Fixtures
// ============================================================================

/**
 * Sample user messages
 */
export const USER_MESSAGES = {
  SIMPLE_GREETING: 'Hello',
  CODE_REQUEST: 'Write a function that adds two numbers',
  FILE_REQUEST: 'Show me the contents of package.json',
  LONG_MESSAGE: 'A'.repeat(5000),
  WITH_CODE_BLOCK: '```typescript\nconst x = 1;\n```',
  WITH_EMOJI: 'Please help me with this issue :)',
};

/**
 * Sample Claude responses
 */
export const CLAUDE_RESPONSES = {
  GREETING: 'Hello! How can I help you today?',
  ACKNOWLEDGMENT: "I'll help you with that.",
  CODE_RESPONSE: 'Here is the function:\n```typescript\nfunction add(a: number, b: number): number {\n  return a + b;\n}\n```',
  ERROR_RESPONSE: "I'm sorry, I encountered an error while processing your request.",
  LONG_RESPONSE: 'This is a long response. '.repeat(200),
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): number {
  return Math.floor(Math.random() * 1000000);
}

/**
 * Create a timestamp for a specific time ago
 */
export function createTimestamp(minutesAgo: number = 0): Date {
  return new Date(Date.now() - minutesAgo * 60 * 1000);
}

/**
 * Create a JSON string for stream parsing
 */
export function toJsonLine(obj: unknown): string {
  return JSON.stringify(obj) + '\n';
}

/**
 * Create multiple JSON lines
 */
export function toJsonLines(objects: unknown[]): string {
  return objects.map((obj) => JSON.stringify(obj) + '\n').join('');
}
