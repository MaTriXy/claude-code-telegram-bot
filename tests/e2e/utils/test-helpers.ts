/**
 * Test Assertion and Wait Helpers for E2E Tests
 *
 * Provides utility functions for waiting on conditions,
 * custom assertions, and test coordination.
 */

import { expect } from '@jest/globals';
import type { ClaudeOutput, ParsedQuestion } from '../../../src/types/index.js';
import type { MockTelegramMessage } from './mock-telegram.js';

/**
 * Default timeout for wait operations
 */
export const DEFAULT_TIMEOUT = 10000;

/**
 * Default polling interval for wait operations
 */
export const DEFAULT_INTERVAL = 100;

/**
 * Wait for a condition to become true
 *
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in milliseconds
 * @param interval - Polling interval in milliseconds
 * @throws Error if timeout is reached before condition is met
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = DEFAULT_TIMEOUT,
  interval: number = DEFAULT_INTERVAL
): Promise<void> {
  const start = Date.now();

  while (true) {
    const result = await condition();
    if (result) {
      return;
    }

    if (Date.now() - start > timeout) {
      throw new Error(`Timeout (${timeout}ms) waiting for condition`);
    }

    await sleep(interval);
  }
}

/**
 * Wait for a value to be defined
 */
export async function waitForValue<T>(
  getValue: () => T | undefined | null,
  timeout: number = DEFAULT_TIMEOUT
): Promise<T> {
  let value: T | undefined | null;

  await waitFor(() => {
    value = getValue();
    return value !== undefined && value !== null;
  }, timeout);

  return value as T;
}

/**
 * Wait for an array to have at least N items
 */
export async function waitForArrayLength<T>(
  getArray: () => T[],
  minLength: number,
  timeout: number = DEFAULT_TIMEOUT
): Promise<T[]> {
  await waitFor(() => getArray().length >= minLength, timeout);
  return getArray();
}

/**
 * Wait for a specific event to be emitted
 */
export function waitForEvent<T = unknown>(
  emitter: NodeJS.EventEmitter,
  eventName: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      emitter.removeListener(eventName, handler);
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeout);

    const handler = (data: T) => {
      clearTimeout(timeoutId);
      resolve(data);
    };

    emitter.once(eventName, handler);
  });
}

/**
 * Wait for multiple events to be emitted
 */
export function waitForEvents<T = unknown>(
  emitter: NodeJS.EventEmitter,
  eventName: string,
  count: number,
  timeout: number = DEFAULT_TIMEOUT
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const events: T[] = [];

    const timeoutId = setTimeout(() => {
      emitter.removeListener(eventName, handler);
      reject(
        new Error(
          `Timeout waiting for ${count} "${eventName}" events (received ${events.length})`
        )
      );
    }, timeout);

    const handler = (data: T) => {
      events.push(data);
      if (events.length >= count) {
        clearTimeout(timeoutId);
        emitter.removeListener(eventName, handler);
        resolve(events);
      }
    };

    emitter.on(eventName, handler);
  });
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function until it succeeds or max retries is reached
 */
export async function retry<T>(
  fn: () => T | Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

/**
 * Assert that an array contains an item matching a predicate
 */
export function assertContains<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message?: string
): void {
  const found = array.some(predicate);
  expect(found).toBe(true);
  if (!found && message) {
    console.error(message);
  }
}

/**
 * Assert that an array does not contain an item matching a predicate
 */
export function assertNotContains<T>(
  array: T[],
  predicate: (item: T) => boolean,
  message?: string
): void {
  const found = array.some(predicate);
  expect(found).toBe(false);
  if (found && message) {
    console.error(message);
  }
}

/**
 * Assert Claude output contains expected type
 */
export function assertOutputType(
  outputs: ClaudeOutput[],
  expectedType: string
): void {
  const hasType = outputs.some((o) => o.type === expectedType);
  expect(hasType).toBe(true);
}

/**
 * Assert Claude output contains assistant message with text
 */
export function assertAssistantResponse(
  outputs: ClaudeOutput[],
  expectedText: string
): void {
  const found = outputs.some(
    (o) =>
      o.type === 'assistant' &&
      'content' in o &&
      typeof o.content === 'string' &&
      o.content.toLowerCase().includes(expectedText.toLowerCase())
  );
  expect(found).toBe(true);
}

/**
 * Assert that a parsed question matches expected values
 */
export function assertQuestion(
  question: ParsedQuestion,
  expected: {
    questionText?: string;
    optionCount?: number;
    optionLabels?: string[];
    multiSelect?: boolean;
  }
): void {
  if (expected.questionText) {
    expect(question.question.toLowerCase()).toContain(
      expected.questionText.toLowerCase()
    );
  }

  if (expected.optionCount !== undefined) {
    expect(question.options.length).toBe(expected.optionCount);
  }

  if (expected.optionLabels) {
    const labels = question.options.map((o) => o.label);
    for (const expectedLabel of expected.optionLabels) {
      expect(labels).toContain(expectedLabel);
    }
  }

  if (expected.multiSelect !== undefined) {
    expect(question.multiSelect).toBe(expected.multiSelect);
  }
}

/**
 * Assert Telegram message was sent with expected content
 */
export function assertTelegramMessage(
  messages: MockTelegramMessage[],
  expected: {
    text?: string;
    chatId?: number;
    hasKeyboard?: boolean;
  }
): void {
  let found: MockTelegramMessage | undefined;

  if (expected.text) {
    found = messages.find((m) =>
      m.text.toLowerCase().includes(expected.text!.toLowerCase())
    );
    expect(found).toBeDefined();
  }

  if (expected.chatId !== undefined && found) {
    expect(found.chatId).toBe(expected.chatId);
  }

  if (expected.hasKeyboard !== undefined && found) {
    const hasKeyboard = found.options && 'reply_markup' in found.options;
    expect(hasKeyboard).toBe(expected.hasKeyboard);
  }
}

/**
 * Assert that all messages are within Telegram's length limit
 */
export function assertMessageLengths(
  messages: MockTelegramMessage[],
  maxLength: number = 4096
): void {
  for (const msg of messages) {
    expect(msg.text.length).toBeLessThanOrEqual(maxLength);
  }
}

/**
 * Create a completion tracker for async operations
 */
export function createCompletionTracker(): {
  isComplete: () => boolean;
  markComplete: () => void;
  waitForCompletion: (timeout?: number) => Promise<void>;
  reset: () => void;
} {
  let complete = false;

  return {
    isComplete: () => complete,
    markComplete: () => {
      complete = true;
    },
    waitForCompletion: (timeout = DEFAULT_TIMEOUT) =>
      waitFor(() => complete, timeout),
    reset: () => {
      complete = false;
    },
  };
}

/**
 * Create an event collector for tracking emitted events
 */
export function createEventCollector<T = unknown>(
  emitter: NodeJS.EventEmitter,
  eventName: string
): {
  events: T[];
  clear: () => void;
  stop: () => void;
  waitForCount: (count: number, timeout?: number) => Promise<T[]>;
} {
  const events: T[] = [];

  const handler = (data: T) => {
    events.push(data);
  };

  emitter.on(eventName, handler);

  return {
    events,
    clear: () => {
      events.length = 0;
    },
    stop: () => {
      emitter.removeListener(eventName, handler);
    },
    waitForCount: async (count: number, timeout = DEFAULT_TIMEOUT) => {
      await waitFor(() => events.length >= count, timeout);
      return events;
    },
  };
}

/**
 * Compare two arrays for equality (order-independent)
 */
export function arraysEqualUnordered<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;

  const sortedA = [...a].sort();
  const sortedB = [...b].sort();

  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Extract text content from Claude outputs
 */
export function extractTextFromOutputs(outputs: ClaudeOutput[]): string {
  return outputs
    .filter((o) => o.type === 'assistant' && 'content' in o)
    .map((o) => (o as { content: string }).content)
    .join(' ');
}

/**
 * Extract tool calls from Claude outputs
 */
export function extractToolCalls(
  outputs: ClaudeOutput[]
): Array<{ name: string; input: Record<string, unknown> }> {
  return outputs
    .filter((o) => o.type === 'tool_use' && 'name' in o && 'input' in o)
    .map((o) => ({
      name: (o as { name: string }).name,
      input: (o as { input: Record<string, unknown> }).input,
    }));
}

/**
 * Check if outputs contain a specific tool call
 */
export function hasToolCall(
  outputs: ClaudeOutput[],
  toolName: string
): boolean {
  return outputs.some(
    (o) => o.type === 'tool_use' && 'name' in o && o.name === toolName
  );
}

/**
 * Create a timeout promise that rejects after specified duration
 */
export function createTimeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message ?? `Operation timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Race a promise against a timeout
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string
): Promise<T> {
  return Promise.race([promise, createTimeout(ms, message)]);
}
