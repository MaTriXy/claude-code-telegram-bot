/**
 * Common setup and teardown utilities for E2E tests
 *
 * Provides shared configuration, lifecycle hooks, and environment setup
 * for end-to-end testing of the Claude Code Telegram Bot.
 */

import { jest, beforeEach, afterEach, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import type { SessionManager } from '../../../src/session/SessionManager.js';
import type { OutputParser } from '../../../src/parser/OutputParser.js';
import type { TelegramBot } from '../../../src/bot/TelegramBot.js';

/**
 * Default test timeout for Claude API calls
 */
export const CLAUDE_TIMEOUT = 45000;

/**
 * Default timeout for waiting on conditions
 */
export const DEFAULT_WAIT_TIMEOUT = 10000;

/**
 * Polling interval for wait functions
 */
export const DEFAULT_POLL_INTERVAL = 100;

/**
 * Maximum Telegram message length
 */
export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

/**
 * Test environment configuration
 */
export interface TestEnvironment {
  sessionManager: SessionManager | null;
  outputParser: OutputParser | null;
  telegramBot: TelegramBot | null;
  cleanupFunctions: Array<() => Promise<void> | void>;
}

/**
 * Global test environment state
 */
let testEnv: TestEnvironment = {
  sessionManager: null,
  outputParser: null,
  telegramBot: null,
  cleanupFunctions: [],
};

/**
 * Get the current test environment
 */
export function getTestEnvironment(): TestEnvironment {
  return testEnv;
}

/**
 * Reset the test environment
 */
export function resetTestEnvironment(): void {
  testEnv = {
    sessionManager: null,
    outputParser: null,
    telegramBot: null,
    cleanupFunctions: [],
  };
}

/**
 * Register a cleanup function to be called during teardown
 */
export function registerCleanup(fn: () => Promise<void> | void): void {
  testEnv.cleanupFunctions.push(fn);
}

/**
 * Execute all registered cleanup functions
 */
export async function executeCleanup(): Promise<void> {
  for (const fn of testEnv.cleanupFunctions) {
    try {
      await fn();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
  testEnv.cleanupFunctions = [];
}

/**
 * Standard beforeEach setup for E2E tests
 *
 * Clears mocks and resets environment state
 */
export function setupBeforeEach(): void {
  beforeEach(() => {
    jest.clearAllMocks();
    resetTestEnvironment();
  });
}

/**
 * Standard afterEach cleanup for E2E tests
 *
 * Closes sessions, removes listeners, and executes cleanup functions
 */
export function setupAfterEach(options?: {
  sessionManager?: SessionManager;
  outputParser?: OutputParser;
}): void {
  afterEach(async () => {
    // Close all sessions if session manager is provided
    if (options?.sessionManager) {
      const sessions = options.sessionManager.listSessions();
      for (const session of sessions) {
        try {
          await options.sessionManager.closeSession(session.id);
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // Remove all listeners from output parser
    if (options?.outputParser) {
      options.outputParser.removeAllListeners();
    }

    // Execute registered cleanup functions
    await executeCleanup();
  });
}

/**
 * Standard afterAll cleanup
 *
 * Final cleanup after all tests complete
 */
export function setupAfterAll(): void {
  afterAll(async () => {
    await executeCleanup();
    resetTestEnvironment();
  });
}

/**
 * Setup complete test lifecycle hooks
 */
export function setupTestLifecycle(options?: {
  sessionManager?: SessionManager;
  outputParser?: OutputParser;
}): void {
  setupBeforeEach();
  setupAfterEach(options);
  setupAfterAll();
}

/**
 * Create a clean environment for spawned processes
 *
 * Removes Claude-specific environment variables that could interfere
 * with spawned Claude CLI processes.
 */
export function getCleanEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  // Remove variables that could cause issues when spawning Claude CLI
  const varsToRemove = [
    'CLAUDE_SESSION_ID',
    'CLAUDE_PROJECT',
    'CLAUDE_CONVERSATION_ID',
    'CLAUDE_API_KEY', // Let CLI use its own credentials
  ];

  for (const varName of varsToRemove) {
    delete env[varName];
  }

  return env;
}

/**
 * Configure Jest timeout for the current test file
 */
export function setTestTimeout(ms: number): void {
  jest.setTimeout(ms);
}

/**
 * Create a deferred promise for async test coordination
 */
export function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Create a mock EventEmitter with common methods
 */
export function createMockEmitter(): EventEmitter & {
  mockClear: () => void;
  getEmittedEvents: () => Array<{ event: string; args: unknown[] }>;
} {
  const emitter = new EventEmitter();
  const emittedEvents: Array<{ event: string; args: unknown[] }> = [];

  const originalEmit = emitter.emit.bind(emitter);
  emitter.emit = (event: string | symbol, ...args: unknown[]): boolean => {
    emittedEvents.push({ event: String(event), args });
    return originalEmit(event, ...args);
  };

  return Object.assign(emitter, {
    mockClear: () => {
      emittedEvents.length = 0;
      emitter.removeAllListeners();
    },
    getEmittedEvents: () => [...emittedEvents],
  });
}

/**
 * Skip test if condition is not met
 */
export function skipIf(condition: boolean, message: string): void {
  if (condition) {
    console.warn(`SKIPPED: ${message}`);
  }
}

/**
 * Run test only if condition is met
 */
export function runOnlyIf(condition: boolean, message: string): boolean {
  if (!condition) {
    console.warn(`SKIPPED: ${message}`);
    return false;
  }
  return true;
}
