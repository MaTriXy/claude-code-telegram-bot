import { EventEmitter } from 'events';
import type { ClaudeCodeProcessInterface } from '../types/index.js';
export interface ClaudeCodeProcessEvents {
    'output': (data: string) => void;
    'error': (error: Error) => void;
    'close': (code: number | null) => void;
}
/**
 * Wraps a Claude Code CLI process for interaction
 * Uses --print mode with --session-id to maintain conversation continuity
 * Each message spawns a new process but continues the same Claude session
 */
export declare class ClaudeCodeProcess extends EventEmitter implements ClaudeCodeProcessInterface {
    private workingDir;
    private cliPath;
    private process;
    private _isRunning;
    private outputBuffer;
    private resolvedCliPath;
    private sessionId;
    private pendingInput;
    constructor(workingDir: string, cliPath?: string);
    get isRunning(): boolean;
    /**
     * Get the session ID for this process
     */
    getSessionId(): string;
    /**
     * Resolve the CLI path - if it's just 'claude', try to find it in common locations
     */
    private resolveCliPath;
    /**
     * Spawn the Claude Code CLI process for a single message
     * Uses --print mode with streaming JSON for parseable output
     */
    private spawnForMessage;
    /**
     * Send input to Claude - spawns a new process for each message
     * but maintains conversation via session ID
     */
    send(input: string): void;
    /**
     * Kill the CLI process
     */
    kill(): void;
}
//# sourceMappingURL=ClaudeCodeProcess.d.ts.map