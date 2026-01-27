/**
 * Claude CLI Mocking Utilities for E2E Tests
 *
 * Provides mock implementations of ClaudeCodeProcess and related
 * functionality for testing without actual Claude CLI connections.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import type { ClaudeCodeProcessInterface } from '../../../src/types/index.js';

/**
 * Mock Claude output message types
 */
export type MockClaudeOutputType =
  | 'system'
  | 'assistant'
  | 'user'
  | 'tool_use'
  | 'tool_result'
  | 'result'
  | 'error';

/**
 * Mock Claude output message
 */
export interface MockClaudeOutput {
  type: MockClaudeOutputType;
  content?: string;
  name?: string;
  input?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

/**
 * Configuration for mock Claude process behavior
 */
export interface MockClaudeConfig {
  /** Delay before emitting response (ms) */
  responseDelay?: number;
  /** Whether the process should be running */
  isRunning?: boolean;
  /** Predefined responses for specific inputs */
  responses?: Map<string, MockClaudeOutput[]>;
  /** Default response when no match is found */
  defaultResponse?: MockClaudeOutput[];
  /** Whether to auto-emit result after responses */
  autoComplete?: boolean;
}

/**
 * MockClaudeCodeProcess - Simulates Claude CLI process
 *
 * Events emitted:
 * - 'output': Raw JSON output string
 * - 'message_complete': When a response sequence is complete
 * - 'error': On errors
 * - 'close': When process terminates
 */
export class MockClaudeCodeProcess
  extends EventEmitter
  implements ClaudeCodeProcessInterface
{
  private _isRunning: boolean;
  private config: MockClaudeConfig;
  private inputHistory: string[] = [];
  private outputHistory: MockClaudeOutput[] = [];

  constructor(config: MockClaudeConfig = {}) {
    super();
    this._isRunning = config.isRunning ?? true;
    this.config = {
      responseDelay: config.responseDelay ?? 10,
      isRunning: config.isRunning ?? true,
      responses: config.responses ?? new Map(),
      defaultResponse: config.defaultResponse ?? [
        { type: 'system', content: 'init' },
        { type: 'assistant', content: 'Mock response' },
        { type: 'result', content: 'completed' },
      ],
      autoComplete: config.autoComplete ?? true,
    };
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Send input to the mock process
   */
  send(input: string): void {
    if (!this._isRunning) {
      throw new Error('Process is not running');
    }

    this.inputHistory.push(input);

    // Find matching response or use default
    const responses =
      this.config.responses?.get(input) ?? this.config.defaultResponse ?? [];

    // Emit responses with delay
    setTimeout(() => {
      this.emitResponses(responses);
    }, this.config.responseDelay);
  }

  /**
   * Write directly to stdin (for answering questions)
   */
  writeToStdin(response: string): void {
    if (!this._isRunning) {
      throw new Error('Process is not running');
    }

    this.inputHistory.push(`[stdin] ${response}`);

    // Emit acknowledgment
    setTimeout(() => {
      this.emit(
        'output',
        JSON.stringify({
          type: 'assistant',
          content: `Received: ${response}`,
        })
      );
    }, this.config.responseDelay);
  }

  /**
   * Check if process has an active subprocess
   */
  hasActiveProcess(): boolean {
    return this._isRunning;
  }

  /**
   * Kill the mock process
   */
  kill(): void {
    this._isRunning = false;
    this.emit('close', 0);
  }

  /**
   * Emit a sequence of responses
   */
  private emitResponses(responses: MockClaudeOutput[]): void {
    for (const response of responses) {
      this.outputHistory.push(response);
      this.emit('output', JSON.stringify(response));
    }

    if (this.config.autoComplete) {
      this.emit('message_complete');
    }
  }

  /**
   * Manually trigger a response sequence
   */
  triggerResponses(responses: MockClaudeOutput[]): void {
    setTimeout(() => {
      this.emitResponses(responses);
    }, this.config.responseDelay);
  }

  /**
   * Trigger an error
   */
  triggerError(error: Error): void {
    this.emit('error', error);
  }

  /**
   * Trigger process close
   */
  triggerClose(code: number): void {
    this._isRunning = false;
    this.emit('close', code);
  }

  /**
   * Get input history
   */
  getInputHistory(): string[] {
    return [...this.inputHistory];
  }

  /**
   * Get output history
   */
  getOutputHistory(): MockClaudeOutput[] {
    return [...this.outputHistory];
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.inputHistory = [];
    this.outputHistory = [];
  }

  /**
   * Reset the mock
   */
  reset(): void {
    this.clearHistory();
    this._isRunning = true;
    this.removeAllListeners();
  }
}

/**
 * Create a factory function for mock ClaudeCodeProcess
 */
export function createMockClaudeCodeProcessFactory(
  config?: MockClaudeConfig
): () => MockClaudeCodeProcess {
  return () => new MockClaudeCodeProcess(config);
}

/**
 * Create the ClaudeCodeProcess module mock for jest.mock()
 */
export function createClaudeCodeProcessMock(config?: MockClaudeConfig): {
  ClaudeCodeProcess: jest.Mock;
  mockProcess: MockClaudeCodeProcess;
} {
  const mockProcess = new MockClaudeCodeProcess(config);

  return {
    ClaudeCodeProcess: jest.fn(() => mockProcess),
    mockProcess,
  };
}

/**
 * Create a simple mock process with EventEmitter for basic tests
 */
export function createSimpleMockProcess(): ClaudeCodeProcessInterface &
  EventEmitter {
  const emitter = new EventEmitter() as ClaudeCodeProcessInterface &
    EventEmitter;

  Object.defineProperty(emitter, 'isRunning', {
    value: true,
    writable: true,
  });

  emitter.send = jest.fn((input: string) => {
    setTimeout(() => {
      emitter.emit(
        'output',
        JSON.stringify({
          type: 'assistant',
          content: `Received: ${input}`,
        })
      );
    }, 10);
  });

  emitter.writeToStdin = jest.fn();

  emitter.hasActiveProcess = jest.fn(() => true);

  emitter.kill = jest.fn(() => {
    (emitter as unknown as { isRunning: boolean }).isRunning = false;
    emitter.emit('close', 0);
  });

  return emitter;
}

/**
 * Check if Claude CLI is available on the system
 */
export function isClaudeAvailable(): boolean {
  const paths = [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];
  return paths.some((p) => existsSync(p));
}

/**
 * Get the Claude CLI path if available
 */
export function getClaudeCliPath(): string | null {
  const paths = [
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Create a mock question (AskUserQuestion) output
 */
export function createMockQuestionOutput(
  question: string,
  options: Array<{ label: string; description?: string }>,
  multiSelect = false
): MockClaudeOutput {
  return {
    type: 'tool_use',
    name: 'AskUserQuestion',
    input: {
      questions: [
        {
          question,
          options,
          multiSelect,
        },
      ],
    },
  };
}

/**
 * Create a mock tool use output
 */
export function createMockToolUseOutput(
  toolName: string,
  input: Record<string, unknown>
): MockClaudeOutput {
  return {
    type: 'tool_use',
    name: toolName,
    input,
  };
}

/**
 * Create a mock tool result output
 */
export function createMockToolResultOutput(
  toolName: string,
  result: unknown,
  error?: string
): MockClaudeOutput {
  return {
    type: 'tool_result',
    name: toolName,
    result,
    error,
  };
}

/**
 * Create a mock assistant response output
 */
export function createMockAssistantOutput(content: string): MockClaudeOutput {
  return {
    type: 'assistant',
    content,
  };
}

/**
 * Create a mock result (completion) output
 */
export function createMockResultOutput(): MockClaudeOutput {
  return {
    type: 'result',
    content: 'completed',
  };
}

/**
 * Create a standard response sequence
 */
export function createStandardResponseSequence(
  assistantContent: string
): MockClaudeOutput[] {
  return [
    { type: 'system', content: 'init' },
    { type: 'assistant', content: assistantContent },
    { type: 'result', content: 'completed' },
  ];
}

/**
 * Create a question response sequence
 */
export function createQuestionResponseSequence(
  question: string,
  options: Array<{ label: string; description?: string }>
): MockClaudeOutput[] {
  return [
    { type: 'system', content: 'init' },
    createMockQuestionOutput(question, options),
  ];
}

/**
 * Setup fs mock to allow any path in tests
 */
export function getFsMockSetup(): string {
  return `
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  statSync: jest.fn(() => ({ isDirectory: () => true })),
}));
`;
}
