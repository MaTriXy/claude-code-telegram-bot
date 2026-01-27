import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
// Common paths where claude CLI might be installed
const COMMON_CLAUDE_PATHS = [
    '/opt/homebrew/bin/claude', // macOS Homebrew (Apple Silicon)
    '/usr/local/bin/claude', // macOS Homebrew (Intel) / Linux
    '/usr/bin/claude', // Linux system-wide
];
/**
 * Wraps a Claude Code CLI process for interaction
 * Uses --print mode with --resume to maintain conversation continuity
 * Each message spawns a new process but continues the same Claude session
 */
export class ClaudeCodeProcess extends EventEmitter {
    workingDir;
    cliPath;
    process = null;
    _isRunning = false;
    outputBuffer = '';
    resolvedCliPath;
    claudeSessionId = null; // Session ID returned by Claude CLI
    isFirstMessage = true;
    constructor(workingDir, cliPath = 'claude') {
        super();
        this.workingDir = workingDir;
        this.cliPath = cliPath;
        this.resolvedCliPath = this.resolveCliPath(cliPath);
        // Don't spawn immediately - wait for first input
        this._isRunning = true; // Mark as running so send() works
    }
    get isRunning() {
        return this._isRunning;
    }
    /**
     * Get the Claude session ID (available after first message)
     */
    getSessionId() {
        return this.claudeSessionId;
    }
    /**
     * Resolve the CLI path - if it's just 'claude', try to find it in common locations
     */
    resolveCliPath(cliPath) {
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
    spawnForMessage(prompt) {
        try {
            // Build args:
            // --print: non-interactive mode (exit after response)
            // --output-format stream-json: parseable streaming output (requires --verbose)
            // --verbose: required for stream-json output format
            // --resume: continue previous session (for follow-up messages)
            const args = [
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
            console.log('[DEBUG] Spawning Claude CLI:', this.resolvedCliPath, args.join(' '));
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
            this.process = spawn(this.resolvedCliPath, args, {
                cwd: this.workingDir,
                // IMPORTANT: stdin must be 'ignore', not 'pipe'
                // When stdin is 'pipe', Claude CLI waits for input even in --print mode
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...cleanEnv, FORCE_COLOR: '0' },
            });
            console.log('[DEBUG] Process spawned, PID:', this.process.pid);
            // Handle stdout
            this.process.stdout?.on('data', (data) => {
                console.log('[DEBUG] stdout data received, length:', data.length);
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
                        }
                        catch {
                            // Not valid JSON, ignore
                        }
                        this.emit('output', line);
                    }
                }
            });
            // Handle stderr - not all stderr is an error, some is status info
            this.process.stderr?.on('data', (data) => {
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
                console.log('[DEBUG] Process closed with code:', code);
                // Emit any remaining buffered output
                if (this.outputBuffer.trim()) {
                    // Try to extract session_id from remaining buffer
                    try {
                        const parsed = JSON.parse(this.outputBuffer.trim());
                        if (parsed.session_id && !this.claudeSessionId) {
                            this.claudeSessionId = parsed.session_id;
                        }
                    }
                    catch {
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
            });
            // Handle process errors (like ENOENT)
            this.process.on('error', (error) => {
                console.log('[DEBUG] Process error:', error.message);
                // Provide more helpful error messages
                if (error.code === 'ENOENT') {
                    const helpfulError = new Error(`Claude CLI not found at '${this.resolvedCliPath}'. ` +
                        `Please install Claude Code CLI or set CLAUDE_CLI_PATH in .env to the correct path. ` +
                        `Tried paths: ${COMMON_CLAUDE_PATHS.join(', ')}`);
                    this.emit('error', helpfulError);
                }
                else {
                    this.emit('error', error);
                }
            });
        }
        catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Send input to Claude - spawns a new process for each message
     * but maintains conversation via session ID
     */
    send(input) {
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
    kill() {
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
//# sourceMappingURL=ClaudeCodeProcess.js.map