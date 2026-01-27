import { EventEmitter } from 'events';
import type { ClaudeCodeProcessInterface } from '../types/index.js';
export interface ClaudeCodeProcessEvents {
    'output': (data: string) => void;
    'error': (error: Error) => void;
    'close': (code: number | null) => void;
}
/**
 * Wraps a Claude Code CLI process for interaction
 */
export declare class ClaudeCodeProcess extends EventEmitter implements ClaudeCodeProcessInterface {
    private workingDir;
    private cliPath;
    private process;
    private _isRunning;
    private outputBuffer;
    private resolvedCliPath;
    constructor(workingDir: string, cliPath?: string);
    get isRunning(): boolean;
    /**
     * Resolve the CLI path - if it's just 'claude', try to find it in common locations
     */
    private resolveCliPath;
    /**
     * Spawn the Claude Code CLI process
     */
    private spawn;
    /**
     * Send input to the CLI process stdin
     */
    send(input: string): void;
    /**
     * Kill the CLI process
     */
    kill(): void;
}
//# sourceMappingURL=ClaudeCodeProcess.d.ts.map