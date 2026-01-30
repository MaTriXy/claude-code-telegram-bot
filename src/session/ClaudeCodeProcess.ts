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
 * Uses --print mode with --resume to maintain conversation continuity
 * Each message spawns a new process but continues the same Claude session
 */
export class ClaudeCodeProcess extends EventEmitter implements ClaudeCodeProcessInterface {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private outputBuffer = '';
  private resolvedCliPath: string;
  private claudeSessionId: string | null = null; // Session ID returned by Claude CLI
  private isFirstMessage = true;
  private existingSessionId: string | null = null; // For attaching to existing sessions

  // Message queue to prevent concurrent process spawning
  // When a process is running, new messages are queued and sent when the process completes
  private pendingMessages: string[] = [];
  private processId: number = 0; // Unique ID to track which process emits events

  constructor(
    private workingDir: string,
    private cliPath: string = 'claude',
    existingSessionId?: string // Optional: attach to existing session
  ) {
    super();
    this.resolvedCliPath = this.resolveCliPath(cliPath);
    // If attaching to existing session, set it up
    if (existingSessionId) {
      this.existingSessionId = existingSessionId;
      this.claudeSessionId = existingSessionId;
      this.isFirstMessage = false; // Will use --resume from the start
    }
    // Don't spawn immediately - wait for first input
    this._isRunning = true; // Mark as running so send() works
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Get the Claude session ID (available after first message)
   */
  getSessionId(): string | null {
    return this.claudeSessionId;
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
      // Increment process ID to track which process emits events
      // This prevents stale event handlers from corrupting state
      this.processId++;
      const currentProcessId = this.processId;

      // Build args:
      // --print: non-interactive mode (exit after response)
      // --output-format stream-json: parseable streaming output (requires --verbose)
      // --verbose: required for stream-json output format
      // --resume: continue previous session (for follow-up messages)
      const args = [
        '--dangerously-skip-permissions',
        '--print',
        '--verbose',
        '--output-format', 'stream-json',
      ];

      // For follow-up messages, use --resume to continue the conversation
      if (!this.isFirstMessage && this.claudeSessionId) {
        args.push('--resume', this.claudeSessionId);
      }

      // Add the prompt
      args.push(prompt);


      // Create a clean environment without Claude session-related variables
      // The parent process may be running inside Claude Code which sets various
      // environment variables that could conflict with spawning a new Claude CLI process
      const cleanEnv = { ...process.env };
      // Remove session/entrypoint variables that could cause the child to think
      // it's part of the parent Claude session
      delete cleanEnv.CLAUDE_SESSION_ID;
      delete cleanEnv.CLAUDECODE;
      delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
      // Note: Keep CLAUDE_CODE_USE_FOUNDRY as it may be needed for authentication

      console.log(`[ClaudeCodeProcess] Spawning process #${currentProcessId} for message: "${prompt.substring(0, 50)}..."`);

      this.process = spawn(this.resolvedCliPath, args, {
        cwd: this.workingDir,
        // stdin is 'ignore' because --print mode doesn't support interactive input
        // When Claude asks a question (AskUserQuestion), it gets auto-denied
        // We detect the question in output and send the user's answer as a new message
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...cleanEnv, FORCE_COLOR: '0' },
      });


      // Handle stdout
      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        // Guard against stale event handlers from previous processes
        if (currentProcessId !== this.processId) {
          return;
        }

        const text = data.toString();
        this.outputBuffer += text;

        // Emit complete lines
        const lines = this.outputBuffer.split('\n');
        this.outputBuffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            // Try to extract session_id from output for conversation continuity
            try {
              const parsed = JSON.parse(line);
              if (parsed.session_id && !this.claudeSessionId) {
                this.claudeSessionId = parsed.session_id;
              }
            } catch {
              // Not valid JSON, ignore
            }
            this.emit('output', line);
          }
        }
      });

      // Handle stderr - not all stderr is an error, some is status info
      this.process.stderr?.on('data', (data: Buffer) => {
        // Guard against stale event handlers from previous processes
        if (currentProcessId !== this.processId) {
          return;
        }

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
        // Guard against stale event handlers from previous processes
        if (currentProcessId !== this.processId) {
          console.log(`[ClaudeCodeProcess] Ignoring close event from stale process #${currentProcessId} (current is #${this.processId})`);
          return;
        }

        console.log(`[ClaudeCodeProcess] Process #${currentProcessId} closed with code ${code}`);

        // Emit any remaining buffered output
        if (this.outputBuffer.trim()) {
          // Try to extract session_id from remaining buffer
          try {
            const parsed = JSON.parse(this.outputBuffer.trim());
            if (parsed.session_id && !this.claudeSessionId) {
              this.claudeSessionId = parsed.session_id;
            }
          } catch {
            // Not valid JSON, ignore
          }
          this.emit('output', this.outputBuffer);
          this.outputBuffer = '';
        }

        // Process completed - in print mode this is normal
        // Don't set _isRunning to false, we can still send more messages
        this.process = null;

        // Mark that first message is done
        if (this.isFirstMessage) {
          this.isFirstMessage = false;
        }

        // Emit close event for this message completion
        this.emit('message_complete', code);

        // Process any queued messages
        this.processNextMessage();
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
   *
   * If a process is already running, the message is queued and will be
   * sent when the current process completes. This prevents race conditions
   * where multiple processes could interfere with each other.
   */
  send(input: string): void {
    if (!this._isRunning) {
      throw new Error('Process has been killed');
    }

    // If a process is already running, queue the message instead of spawning
    if (this.process) {
      console.log(`[ClaudeCodeProcess] Process still running, queuing message: "${input.substring(0, 50)}..."`);
      this.pendingMessages.push(input);
      return;
    }

    // Spawn a new process for this message
    this.spawnForMessage(input);
  }

  /**
   * Process the next queued message if any
   * Called when the current process completes
   */
  private processNextMessage(): void {
    if (this.pendingMessages.length > 0 && !this.process) {
      const nextMessage = this.pendingMessages.shift()!;
      console.log(`[ClaudeCodeProcess] Processing queued message: "${nextMessage.substring(0, 50)}..."`);
      this.spawnForMessage(nextMessage);
    }
  }

  /**
   * Write a response to stdin (for answering AskUserQuestion prompts)
   * This is used when Claude asks a question and we need to provide the answer
   */
  writeToStdin(response: string): void {
    if (!this.process || !this.process.stdin) {
      console.warn('[ClaudeCodeProcess] No active process or stdin to write to');
      return;
    }

    console.log(`[ClaudeCodeProcess] Writing to stdin: "${response}"`);
    this.process.stdin.write(response + '\n');
  }

  /**
   * Check if there's an active process that can receive stdin input
   */
  hasActiveProcess(): boolean {
    return this.process !== null && this.process.stdin !== null;
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
