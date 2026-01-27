import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import type { ClaudeCodeProcessInterface } from '../types/index.js';

export interface ClaudeCodeProcessEvents {
  'output': (data: string) => void;
  'error': (error: Error) => void;
  'close': (code: number | null) => void;
}

/**
 * Wraps a Claude Code CLI process for interaction
 */
export class ClaudeCodeProcess extends EventEmitter implements ClaudeCodeProcessInterface {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private outputBuffer = '';

  constructor(
    private workingDir: string,
    private cliPath: string = 'claude'
  ) {
    super();
    this.spawn();
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Spawn the Claude Code CLI process
   */
  private spawn(): void {
    try {
      // Spawn claude with stream-json output format for parseable output
      this.process = spawn(this.cliPath, ['--output-format', 'stream-json'], {
        cwd: this.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      this._isRunning = true;

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.outputBuffer += text;

        // Emit complete lines
        const lines = this.outputBuffer.split('\n');
        this.outputBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            this.emit('output', line);
          }
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.emit('error', new Error(text));
      });

      // Handle process close
      this.process.on('close', (code) => {
        this._isRunning = false;

        // Emit any remaining buffered output
        if (this.outputBuffer.trim()) {
          this.emit('output', this.outputBuffer);
          this.outputBuffer = '';
        }

        this.emit('close', code);
      });

      // Handle process errors
      this.process.on('error', (error) => {
        this._isRunning = false;
        this.emit('error', error);
      });
    } catch (error) {
      this._isRunning = false;
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send input to the CLI process stdin
   */
  send(input: string): void {
    if (!this._isRunning || !this.process?.stdin) {
      throw new Error('Process is not running');
    }

    // Write input followed by newline
    this.process.stdin.write(input + '\n');
  }

  /**
   * Kill the CLI process
   */
  kill(): void {
    if (this.process) {
      this.process.kill('SIGTERM');

      // Force kill after timeout if still running
      setTimeout(() => {
        if (this._isRunning && this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
    this._isRunning = false;
  }
}
