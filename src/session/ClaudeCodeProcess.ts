import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';
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
 * Uses --print mode with --session-id to maintain conversation continuity
 * Each message spawns a new process but continues the same Claude session
 */
export class ClaudeCodeProcess extends EventEmitter implements ClaudeCodeProcessInterface {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private outputBuffer = '';
  private resolvedCliPath: string;
  private sessionId: string;
  private pendingInput: string | null = null;

  constructor(
    private workingDir: string,
    private cliPath: string = 'claude'
  ) {
    super();
    this.resolvedCliPath = this.resolveCliPath(cliPath);
    this.sessionId = randomUUID();
    // Don't spawn immediately - wait for first input
    this._isRunning = true; // Mark as running so send() works
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Get the session ID for this process
   */
  getSessionId(): string {
    return this.sessionId;
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
   * Spawn the Claude Code CLI process for a single message
   * Uses --print mode with streaming JSON for parseable output
   */
  private spawnForMessage(prompt: string): void {
    try {
      // Spawn claude with:
      // --print: non-interactive mode (exit after response)
      // --output-format stream-json: parseable streaming output (requires --verbose)
      // --verbose: required for stream-json output format
      // --session-id: maintain conversation continuity across invocations
      const args = [
        '--print',
        '--verbose',
        '--output-format', 'stream-json',
        '--session-id', this.sessionId,
        prompt
      ];

      this.process = spawn(this.resolvedCliPath, args, {
        cwd: this.workingDir,
        // IMPORTANT: stdin must be 'ignore', not 'pipe'
        // When stdin is 'pipe', Claude CLI waits for input even in --print mode
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' },
      });

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

      // Handle stderr - not all stderr is an error, some is status info
      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        // Only emit as error if it looks like an actual error
        if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fatal')) {
          this.emit('error', new Error(text));
        }
        // Otherwise log it for debugging but don't treat as error
        console.error('[Claude stderr]:', text);
      });

      // Handle process close
      this.process.on('close', (code) => {
        // Emit any remaining buffered output
        if (this.outputBuffer.trim()) {
          this.emit('output', this.outputBuffer);
          this.outputBuffer = '';
        }

        // Process completed - in print mode this is normal
        // Don't set _isRunning to false, we can still send more messages
        this.process = null;

        // Emit close event for this message completion
        this.emit('message_complete', code);
      });

      // Handle process errors (like ENOENT)
      this.process.on('error', (error: NodeJS.ErrnoException) => {
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
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Send input to Claude - spawns a new process for each message
   * but maintains conversation via session ID
   */
  send(input: string): void {
    if (!this._isRunning) {
      throw new Error('Process has been killed');
    }

    // If a process is already running, warn but continue
    if (this.process) {
      console.warn('[ClaudeCodeProcess] Previous message still processing, spawning new process anyway');
    }

    // Spawn a new process for this message
    this.spawnForMessage(input);
  }

  /**
   * Kill the CLI process
   */
  kill(): void {
    if (this.process) {
      this.process.kill('SIGTERM');

      // Force kill after timeout if still running
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
    this._isRunning = false;
    this.emit('close', 0);
  }
}
