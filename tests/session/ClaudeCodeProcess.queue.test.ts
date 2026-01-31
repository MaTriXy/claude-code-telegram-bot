import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import { Writable } from 'stream';

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
 * Creates a mock stdin stream
 */
function createMockStdin(): Writable & { writtenData: string[] } {
  const chunks: string[] = [];
  const mockStdin = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    }
  }) as Writable & { writtenData: string[] };
  mockStdin.writtenData = chunks;
  return mockStdin;
}

/**
 * Creates a mock ChildProcess with controllable stdout/stderr/stdin
 */
function createMockChildProcess(): ChildProcess & EventEmitter & { mockStdin: Writable & { writtenData: string[] } } {
  const proc = new EventEmitter() as any;

  // Create mock stdin, stdout and stderr streams
  const mockStdin = createMockStdin();
  proc.stdin = mockStdin;
  proc.mockStdin = mockStdin;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

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

  return proc as ChildProcess & EventEmitter & { mockStdin: Writable & { writtenData: string[] } };
}

describe('ClaudeCodeProcess Persistent Process Architecture', () => {
  let mockSpawn: jest.MockedFunction<typeof spawn>;
  let mockChildProcess: ReturnType<typeof createMockChildProcess>;

  beforeEach(() => {
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    mockChildProcess = createMockChildProcess();
    mockSpawn.mockReturnValue(mockChildProcess);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('send()', () => {
    it('should spawn a persistent process on first send', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      process.send('Hello Claude');

      // Wait for the process ready timeout
      setTimeout(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
        expect(mockSpawn).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['--input-format', 'stream-json', '--output-format', 'stream-json']),
          expect.any(Object)
        );
        done();
      }, 150);
    });

    it('should write messages to stdin as JSON', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      process.send('Hello Claude');

      // Wait for the process ready timeout
      setTimeout(() => {
        expect(mockChildProcess.mockStdin.writtenData.length).toBeGreaterThan(0);
        const writtenMessage = mockChildProcess.mockStdin.writtenData[0];
        const parsed = JSON.parse(writtenMessage.trim());
        expect(parsed.type).toBe('user');
        expect(parsed.message.role).toBe('user');
        expect(parsed.message.content[0].type).toBe('text');
        expect(parsed.message.content[0].text).toBe('Hello Claude');
        done();
      }, 150);
    });

    it('should not spawn a new process for subsequent messages', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      process.send('Message 1');

      // Wait for process to be ready
      setTimeout(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);

        // Send more messages
        process.send('Message 2');
        process.send('Message 3');

        // Should still only have spawned once
        expect(mockSpawn).toHaveBeenCalledTimes(1);

        // All messages should be written to stdin
        expect(mockChildProcess.mockStdin.writtenData.length).toBe(3);
        done();
      }, 150);
    });

    it('should queue messages sent before process is ready', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      // Send multiple messages immediately (before process is ready)
      process.send('Message 1');
      process.send('Message 2');
      process.send('Message 3');

      // Wait for process to be ready and pending messages to be processed
      setTimeout(() => {
        // All messages should be written to stdin
        expect(mockChildProcess.mockStdin.writtenData.length).toBe(3);

        // Verify the messages
        const messages = mockChildProcess.mockStdin.writtenData.map(m => {
          const parsed = JSON.parse(m.trim());
          return parsed.message.content[0].text;
        });
        expect(messages).toEqual(['Message 1', 'Message 2', 'Message 3']);
        done();
      }, 150);
    });

    it('should throw error if process has been killed', () => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      process.kill();

      expect(() => process.send('Hello')).toThrow('Process has been killed');
    });
  });

  describe('session continuity', () => {
    it('should use --resume flag when existingSessionId is provided', () => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude', 'existing-session-123');

      process.send('Hello');

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['--resume', 'existing-session-123']),
        expect.any(Object)
      );
    });

    it('should capture session ID from output', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      process.send('Hello');

      // Wait for process to be ready
      setTimeout(() => {
        // Simulate session_id in output
        mockChildProcess.stdout!.emit('data', Buffer.from('{"session_id":"captured-session-456"}\n'));

        expect(process.getSessionId()).toBe('captured-session-456');
        done();
      }, 150);
    });
  });

  describe('process lifecycle', () => {
    it('should respawn process if it closes and new message is sent', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');

      process.send('Message 1');

      // Wait for process to be ready
      setTimeout(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);

        // Simulate process close
        mockChildProcess.emit('close', 0);

        // Create new mock for respawn
        const newMockProcess = createMockChildProcess();
        mockSpawn.mockReturnValue(newMockProcess);

        // Send another message - should respawn
        process.send('Message 2');

        setTimeout(() => {
          expect(mockSpawn).toHaveBeenCalledTimes(2);
          done();
        }, 150);
      }, 150);
    });

    it('should emit close and message_complete events when process closes', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');
      const closeHandler = jest.fn();
      const messageCompleteHandler = jest.fn();

      process.on('close', closeHandler);
      process.on('message_complete', messageCompleteHandler);

      process.send('Hello');

      // Wait for process to be ready
      setTimeout(() => {
        // Simulate process close
        mockChildProcess.emit('close', 0);

        expect(closeHandler).toHaveBeenCalledWith(0);
        expect(messageCompleteHandler).toHaveBeenCalledWith(0);
        done();
      }, 150);
    });
  });

  describe('error handling', () => {
    it('should emit error when stdin write fails', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');
      const errorHandler = jest.fn();
      process.on('error', errorHandler);

      process.send('Hello');

      // Wait for process to be ready
      setTimeout(() => {
        // Destroy stdin to simulate failure
        mockChildProcess.stdin = null;

        // Try to send another message
        process.send('This should fail');

        // Error should be emitted
        setTimeout(() => {
          expect(errorHandler).toHaveBeenCalled();
          done();
        }, 50);
      }, 150);
    });

    it('should emit error for ENOENT when CLI not found', () => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');
      const errorHandler = jest.fn();
      process.on('error', errorHandler);

      process.send('Hello');

      // Simulate ENOENT error
      const enoentError = new Error('spawn ENOENT') as NodeJS.ErrnoException;
      enoentError.code = 'ENOENT';
      mockChildProcess.emit('error', enoentError);

      expect(errorHandler).toHaveBeenCalled();
      const emittedError = errorHandler.mock.calls[0][0] as Error;
      expect(emittedError.message).toContain('Claude CLI not found');
    });
  });

  describe('output parsing', () => {
    it('should emit output events for complete JSON lines', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');
      const outputs: string[] = [];
      process.on('output', (data: string) => outputs.push(data));

      process.send('Hello');

      // Wait for process to be ready
      setTimeout(() => {
        // Send output
        mockChildProcess.stdout!.emit('data', Buffer.from('{"type":"assistant","content":"Hello"}\n'));
        mockChildProcess.stdout!.emit('data', Buffer.from('{"type":"assistant","content":"World"}\n'));

        expect(outputs).toHaveLength(2);
        done();
      }, 150);
    });

    it('should buffer partial JSON and emit when complete', (done) => {
      const process = new ClaudeCodeProcess('/test/dir', 'claude');
      const outputs: string[] = [];
      process.on('output', (data: string) => outputs.push(data));

      process.send('Hello');

      // Wait for process to be ready
      setTimeout(() => {
        // Send partial output
        mockChildProcess.stdout!.emit('data', Buffer.from('{"type":"assi'));
        expect(outputs).toHaveLength(0);

        // Complete the line
        mockChildProcess.stdout!.emit('data', Buffer.from('stant","content":"Test"}\n'));
        expect(outputs).toHaveLength(1);
        done();
      }, 150);
    });
  });
});
