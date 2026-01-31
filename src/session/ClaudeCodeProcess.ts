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
 *
 * Uses a SINGLE persistent process per session with:
 * - --input-format stream-json: enables stdin input
 * - --output-format stream-json: parseable streaming output
 *
 * This allows sending messages (including answers to questions) via stdin
 * without spawning new processes.
 */
export class ClaudeCodeProcess extends EventEmitter implements ClaudeCodeProcessInterface {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private outputBuffer = '';
  private resolvedCliPath: string;
  private claudeSessionId: string | null = null; // Session ID returned by Claude CLI
  private existingSessionId: string | null = null; // For attaching to existing sessions
  private processSpawned = false; // Whether the persistent process has been spawned
  private processReady = false; // Whether the process is ready to receive stdin input
  private pendingMessages: string[] = []; // Messages queued while process is starting

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
   * Spawn the persistent Claude Code CLI process
   * Uses streaming JSON for both input and output
   */
  private spawnPersistentProcess(): void {
    if (this.processSpawned) {
      return; // Already spawned
    }

    try {
      // Build args for persistent process with stdin/stdout streaming:
      // --print: non-interactive mode
      // --input-format stream-json: accept JSON messages on stdin
      // --output-format stream-json: emit JSON on stdout
      // --verbose: required for stream-json output
      const args = [
        '--dangerously-skip-permissions',
        '--print',
        '--verbose',
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
      ];

      // If resuming an existing session, add --resume
      if (this.claudeSessionId) {
        args.push('--resume', this.claudeSessionId);
      }

      // Create a clean environment without Claude session-related variables
      const cleanEnv = { ...process.env };
      delete cleanEnv.CLAUDE_SESSION_ID;
      delete cleanEnv.CLAUDECODE;
      delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;

      console.log(`[ClaudeCodeProcess] Spawning persistent process with stdin streaming...`);
      if (this.claudeSessionId) {
        console.log(`[ClaudeCodeProcess] Resuming session: ${this.claudeSessionId.substring(0, 8)}...`);
      }

      this.process = spawn(this.resolvedCliPath, args, {
        cwd: this.workingDir,
        // stdin is 'pipe' to allow writing messages
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...cleanEnv, FORCE_COLOR: '0' },
      });

      this.processSpawned = true;

      // Mark process as ready after a brief moment to ensure it's initialized
      // Also process any pending messages that were queued during spawn
      setTimeout(() => {
        this.processReady = true;
        console.log(`[ClaudeCodeProcess] Process ready, processing ${this.pendingMessages.length} pending messages`);
        this.processPendingMessages();
      }, 100);

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
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
                console.log(`[ClaudeCodeProcess] Got session ID: ${parsed.session_id.substring(0, 8)}...`);
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
        console.log(`[ClaudeCodeProcess] Process closed with code ${code}`);

        // Emit any remaining buffered output
        if (this.outputBuffer.trim()) {
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

        this.process = null;
        this.processSpawned = false;
        this.processReady = false;

        // Emit close event
        this.emit('close', code);
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
   * Send input to Claude via stdin
   *
   * For stream-json input format, messages are sent as JSON objects.
   * The format is: {"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": "message"}]}}
   */
  send(input: string): void {
    if (!this._isRunning) {
      throw new Error('Process has been killed');
    }

    // Spawn the persistent process if not already running
    if (!this.processSpawned) {
      this.spawnPersistentProcess();
    }

    // If process isn't ready yet, queue the message
    if (!this.processReady) {
      console.log(`[ClaudeCodeProcess] Process not ready, queuing message: "${input.substring(0, 50)}..."`);
      this.pendingMessages.push(input);
      return;
    }

    this.writeMessageToStdin(input);
  }

  /**
   * Write a message to stdin in the stream-json format
   */
  private writeMessageToStdin(input: string): void {
    if (!this.process?.stdin) {
      console.error('[ClaudeCodeProcess] No stdin available to write to');
      this.emit('error', new Error('No stdin available - process may have crashed'));
      return;
    }

    // Format the message as stream-json input
    // The format follows Claude CLI's streaming JSON protocol
    const message = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: input }]
      }
    };

    const jsonMessage = JSON.stringify(message);
    console.log(`[ClaudeCodeProcess] Writing to stdin: ${jsonMessage.substring(0, 100)}...`);
    this.process.stdin.write(jsonMessage + '\n');
  }

  /**
   * Process any messages that were queued while the process was starting
   */
  private processPendingMessages(): void {
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift()!;
      console.log(`[ClaudeCodeProcess] Processing queued message: "${message.substring(0, 50)}..."`);
      this.writeMessageToStdin(message);
    }
  }

  /**
   * Write a response to stdin (for answering AskUserQuestion prompts)
   * This is the same as send() in the new architecture
   */
  writeToStdin(response: string): void {
    this.send(response);
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
      // Close stdin to signal end of input
      this.process.stdin?.end();

      this.process.kill('SIGTERM');

      // Force kill after timeout if still running
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
    this._isRunning = false;
    this.processSpawned = false;
    this.processReady = false;
    this.pendingMessages = [];
    this.emit('close', 0);
  }
}
