import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

// Import after mocking
import { ClaudeCodeProcess } from '../../src/session/ClaudeCodeProcess.js';

/**
 * Creates a mock ChildProcess with controllable stdout/stderr/close events
 */
function createMockChildProcess(): ChildProcess & EventEmitter {
  const proc = new EventEmitter() as any;

  // Create mock stdout and stderr streams
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = null; // We use 'ignore' for stdin

  // Use Object.defineProperty for read-only properties
  Object.defineProperty(proc, 'pid', {
    value: Math.floor(Math.random() * 10000),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(proc, 'killed', {
    value: false,
    writable: true,
    configurable: true,
  });

  proc.kill = jest.fn(() => {
    (proc as any).killed = true;
    proc.emit('close', 0);
    return true;
  });

  return proc as ChildProcess & EventEmitter;
}

describe('ClaudeCodeProcess Message Queue', () => {
  let mockSpawn: jest.MockedFunction<typeof spawn>;
  let mockChildProcess: ChildProcess & EventEmitter;

  beforeEach(() => {
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    mockChildProcess = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChildProcess);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send()', () => {
    it('should spawn a new process for the first message', () => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      process.send('Hello Claude');

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--print', 'Hello Claude']),
        expect.any(Object)
      );
    });

    it('should queue messages when a process is already running', () => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      // Send first message - spawns process
      process.send('Message 1');
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Send second message while first is still running - should queue
      process.send('Message 2');
      expect(mockSpawn).toHaveBeenCalledTimes(1); // Still only 1 spawn

      // Send third message - should also queue
      process.send('Message 3');
      expect(mockSpawn).toHaveBeenCalledTimes(1); // Still only 1 spawn
    });

    it('should process queued messages when process completes', () => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      // Send first message
      process.send('Message 1');
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Queue second message
      process.send('Message 2');
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Create new mock for second spawn
      const secondMockProcess = createMockChildProcess();
      mockSpawn.mockReturnValue(secondMockProcess);

      // Simulate first process completing
      mockChildProcess.emit('close', 0);

      // Should have spawned second process for queued message
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawn).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.arrayContaining(['Message 2']),
        expect.any(Object)
      );
    });

    it('should process multiple queued messages in order', () => {
      const processes: (ChildProcess & EventEmitter)[] = [];
      const spawnCalls: string[][] = [];

      mockSpawn.mockImplementation((_cmd: any, args: any) => {
        spawnCalls.push(args as string[]);
        const proc = createMockChildProcess();
        processes.push(proc);
        return proc as any;
      });

      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      // Send first message
      process.send('Message 1');

      // Queue multiple messages
      process.send('Message 2');
      process.send('Message 3');
      process.send('Message 4');

      // Should only have spawned once so far
      expect(spawnCalls.length).toBe(1);
      expect(spawnCalls[0]).toContain('Message 1');

      // Complete first process
      processes[0].emit('close', 0);

      // Should process next queued message
      expect(spawnCalls.length).toBe(2);
      expect(spawnCalls[1]).toContain('Message 2');
    });

    it('should throw error if process has been killed', () => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      process.kill();

      expect(() => process.send('Hello')).toThrow('Process has been killed');
    });
  });

  describe('stale event handler protection', () => {
    it('should ignore events from stale processes', () => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');
      const outputHandler = jest.fn();
      process.on('output', outputHandler);

      // Send first message
      process.send('Message 1');
      const firstProcess = mockChildProcess;

      // Queue second message
      process.send('Message 2');

      // Create new mock for second spawn
      const secondProcess = createMockChildProcess();
      mockSpawn.mockReturnValue(secondProcess);

      // Complete first process, triggering second spawn
      firstProcess.emit('close', 0);

      // Emit output from second (current) process - should be processed
      secondProcess.stdout!.emit('data', Buffer.from('{"type":"text"}\n'));
      expect(outputHandler).toHaveBeenCalledTimes(1);

      // Emit output from first (stale) process - should be ignored
      firstProcess.stdout!.emit('data', Buffer.from('{"type":"stale"}\n'));
      // Output handler should not have been called again
      expect(outputHandler).toHaveBeenCalledTimes(1);
    });

    it('should ignore close events from stale processes', () => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');
      const messageCompleteHandler = jest.fn();
      process.on('message_complete', messageCompleteHandler);

      // Send first message
      process.send('Message 1');
      const firstProcess = mockChildProcess;

      // Queue second message
      process.send('Message 2');

      // Create new mock for second spawn
      const secondProcess = createMockChildProcess();
      mockSpawn.mockReturnValue(secondProcess);

      // Complete first process
      firstProcess.emit('close', 0);
      expect(messageCompleteHandler).toHaveBeenCalledTimes(1);

      // Emit close from first (stale) process again - should be ignored
      firstProcess.emit('close', 0);
      expect(messageCompleteHandler).toHaveBeenCalledTimes(1); // Still only 1

      // Complete second process - should be processed
      secondProcess.emit('close', 0);
      expect(messageCompleteHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('session continuity', () => {
    it('should use --resume flag after first message', async () => {
      const processes: (ChildProcess & EventEmitter)[] = [];
      const spawnCalls: string[][] = [];

      mockSpawn.mockImplementation((_cmd: any, args: any) => {
        spawnCalls.push(args as string[]);
        const mock = createMockChildProcess();
        processes.push(mock);
        // Simulate session_id in output synchronously
        setImmediate(() => {
          mock.stdout!.emit('data', Buffer.from('{"session_id":"test-session-123"}\n'));
        });
        return mock as any;
      });

      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      // First message - no --resume
      process.send('Message 1');
      expect(spawnCalls[0]).not.toContain('--resume');

      // Wait for session ID to be captured
      await new Promise<void>(resolve => setImmediate(resolve));

      // Complete first process
      processes[0].emit('close', 0);

      // Send another message now (not queued)
      process.send('Message 2');

      // Second spawn should have --resume
      expect(spawnCalls.length).toBe(2);
      expect(spawnCalls[1]).toContain('--resume');
      expect(spawnCalls[1]).toContain('test-session-123');
    });
  });
});
