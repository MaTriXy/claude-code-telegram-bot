import { EventEmitter } from 'events';
import { spawn } from 'child_process';
/**
 * Wraps a Claude Code CLI process for interaction
 */
export class ClaudeCodeProcess extends EventEmitter {
    workingDir;
    cliPath;
    process = null;
    _isRunning = false;
    outputBuffer = '';
    constructor(workingDir, cliPath = 'claude') {
        super();
        this.workingDir = workingDir;
        this.cliPath = cliPath;
        this.spawn();
    }
    get isRunning() {
        return this._isRunning;
    }
    /**
     * Spawn the Claude Code CLI process
     */
    spawn() {
        try {
            // Spawn claude with stream-json output format for parseable output
            this.process = spawn(this.cliPath, ['--output-format', 'stream-json'], {
                cwd: this.workingDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env },
            });
            this._isRunning = true;
            // Handle stdout
            this.process.stdout?.on('data', (data) => {
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
            this.process.stderr?.on('data', (data) => {
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
        }
        catch (error) {
            this._isRunning = false;
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
        }
    }
    /**
     * Send input to the CLI process stdin
     */
    send(input) {
        if (!this._isRunning || !this.process?.stdin) {
            throw new Error('Process is not running');
        }
        // Write input followed by newline
        this.process.stdin.write(input + '\n');
    }
    /**
     * Kill the CLI process
     */
    kill() {
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
//# sourceMappingURL=ClaudeCodeProcess.js.map