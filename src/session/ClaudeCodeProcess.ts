import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import type { ClaudeCodeProcessInterface } from '../types/index.js';

export interface ClaudeCodeProcessEvents {
  'output': (data: string) => void;
  'error': (error: Error) => void;
  'close': (code: number | null) => void;
}

// Common paths where claude CLI might be installed
const COMMON_CLAUDE_PATHS = [
  '/opt/homebrew/bin/claude',  // macOS Homebrew (Apple Silicon)
  '/usr/local/bin/claude',     // macOS Homebrew (Intel) / Linux
  '/usr/bin/claude',           // Linux system-wide
];

/**
 * Wraps a Claude Code CLI process for interaction
 */
export class ClaudeCodeProcess extends EventEmitter implements ClaudeCodeProcessInterface {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private outputBuffer = '';
  private resolvedCliPath: string;

  constructor(
    private workingDir: string,
    private cliPath: string = 'claude'
  ) {
    super();
    this.resolvedCliPath = this.resolveCliPath(cliPath);
    this.spawn();
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Resolve the CLI path - if it's just 'claude', try to find it in common locations
   */
  private resolveCliPath(cliPath: string): string {
    // If it's an absolute path and exists, use it
    if (cliPath.startsWith('/') && existsSync(cliPath)) {
      return cliPath;
    }

    // If it's just 'claude', try common paths
    if (cliPath === 'claude') {
      for (const commonPath of COMMON_CLAUDE_PATHS) {
        if (existsSync(commonPath)) {
          return commonPath;
        }
      }
    }

    // Fall back to the provided path (will fail with a clear error if not found)
    return cliPath;
  }

  /**
   * Spawn the Claude Code CLI process
   */
  private spawn(): void {
    try {
      // Spawn claude with stream-json output format for parseable output
      this.process = spawn(this.resolvedCliPath, ['--output-format', 'stream-json'], {
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

      // Handle process errors (like ENOENT)
      this.process.on('error', (error: NodeJS.ErrnoException) => {
        this._isRunning = false;

        // Provide more helpful error messages
        if (error.code === 'ENOENT') {
          const helpfulError = new Error(
            `Claude CLI not found at '${this.resolvedCliPath}'. ` +
            `Please install Claude Code CLI or set CLAUDE_CLI_PATH in .env to the correct path. ` +
            `Tried paths: ${COMMON_CLAUDE_PATHS.join(', ')}`
          );
          this.emit('error', helpfulError);
        } else {
          this.emit('error', error);
        }
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
