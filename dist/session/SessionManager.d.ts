import type { Session, SessionManagerConfig } from '../types/index.js';
/**
 * Manages Claude Code CLI sessions
 */
export declare class SessionManager {
    private sessions;
    private activeSessionId;
    private config;
    constructor(config?: SessionManagerConfig);
    /**
     * Create a new Claude Code session
     */
    createSession(name: string, workingDir?: string): Promise<Session>;
    /**
     * Attach to an existing Claude Code session by session ID
     * This allows continuing a session that was started outside of Telegram
     */
    attachToSession(name: string, existingSessionId: string, workingDir?: string): Promise<Session>;
    /**
     * Set up event handlers for a session
     */
    private setupSessionEventHandlers;
    /**
     * Convert internal session to public Session interface
     */
    private toPublicSession;
    /**
     * List all sessions
     */
    listSessions(): Session[];
    /**
     * Get a session by ID
     */
    getSession(id: string): Session | undefined;
    /**
     * Get internal session with process
     */
    private getInternalSession;
    /**
     * Close a session
     */
    closeSession(id: string): Promise<void>;
    /**
     * Switch to a different session
     */
    switchSession(id: string): Session;
    /**
     * Get the active session
     */
    getActiveSession(): Session | undefined;
    /**
     * Get the active internal session with process
     */
    private getActiveInternalSession;
    /**
     * Send input to the active session
     */
    sendToActiveSession(input: string): void;
    /**
     * Kill the active session's Claude process (hard stop)
     * The session remains but the current process is terminated
     */
    killActiveProcess(): void;
    /**
     * Subscribe to output events from the active session
     */
    onActiveSessionOutput(callback: (data: string) => void): () => void;
    /**
     * Subscribe to output events from a specific session
     */
    onSessionOutput(sessionId: string, callback: (data: string) => void): () => void;
    /**
     * Subscribe to error events from a specific session
     */
    onSessionError(sessionId: string, callback: (error: Error) => void): () => void;
    /**
     * Subscribe to close events from a specific session
     */
    onSessionClose(sessionId: string, callback: (code: number | null) => void): () => void;
    /**
     * Change the working directory of a session
     * This kills the current process and starts a new one in the new directory
     */
    changeDirectory(sessionId: string, newWorkingDir: string): Promise<Session>;
    /**
     * Get the number of active sessions
     */
    get sessionCount(): number;
}
//# sourceMappingURL=SessionManager.d.ts.map