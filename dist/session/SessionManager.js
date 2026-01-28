import { ulid } from 'ulid';
import { existsSync, statSync } from 'fs';
import * as path from 'path';
import { ClaudeCodeProcess } from './ClaudeCodeProcess.js';
/**
 * Manages Claude Code CLI sessions
 */
export class SessionManager {
    sessions = new Map();
    activeSessionId;
    config;
    constructor(config = {}) {
        this.config = {
            claudeCliPath: config.claudeCliPath || 'claude',
            defaultWorkingDir: config.defaultWorkingDir || process.cwd(),
        };
    }
    /**
     * Create a new Claude Code session
     */
    async createSession(name, workingDir) {
        const id = ulid();
        // Resolve to absolute path to ensure consistency
        const sessionWorkingDir = path.resolve(workingDir || this.config.defaultWorkingDir || process.cwd());
        // Validate working directory exists and is a directory
        if (!existsSync(sessionWorkingDir)) {
            throw new Error(`Working directory does not exist: ${sessionWorkingDir}`);
        }
        try {
            const stats = statSync(sessionWorkingDir);
            if (!stats.isDirectory()) {
                throw new Error(`Path is not a directory: ${sessionWorkingDir}`);
            }
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Path is not a directory')) {
                throw error;
            }
            throw new Error(`Cannot access working directory: ${sessionWorkingDir}`);
        }
        // Create the Claude Code process
        const cliProcess = new ClaudeCodeProcess(sessionWorkingDir, this.config.claudeCliPath);
        const now = new Date();
        const session = {
            id,
            name,
            workingDir: sessionWorkingDir,
            status: 'idle',
            createdAt: now,
            lastActivity: now,
            process: cliProcess,
        };
        // Store session
        this.sessions.set(id, session);
        // Set as active session
        this.activeSessionId = id;
        // Set up event handlers
        this.setupSessionEventHandlers(session);
        // Return session without process (public interface)
        return this.toPublicSession(session);
    }
    /**
     * Attach to an existing Claude Code session by session ID
     * This allows continuing a session that was started outside of Telegram
     */
    async attachToSession(name, existingSessionId, workingDir) {
        const id = ulid();
        // Resolve to absolute path to ensure consistency
        const sessionWorkingDir = path.resolve(workingDir || this.config.defaultWorkingDir || process.cwd());
        // Validate working directory exists and is a directory
        if (!existsSync(sessionWorkingDir)) {
            throw new Error(`Working directory does not exist: ${sessionWorkingDir}`);
        }
        try {
            const stats = statSync(sessionWorkingDir);
            if (!stats.isDirectory()) {
                throw new Error(`Path is not a directory: ${sessionWorkingDir}`);
            }
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Path is not a directory')) {
                throw error;
            }
            throw new Error(`Cannot access working directory: ${sessionWorkingDir}`);
        }
        // Create the Claude Code process with existing session ID
        const cliProcess = new ClaudeCodeProcess(sessionWorkingDir, this.config.claudeCliPath, existingSessionId // Pass existing session ID to resume
        );
        const now = new Date();
        const session = {
            id,
            name: `${name} (attached)`,
            workingDir: sessionWorkingDir,
            status: 'idle',
            createdAt: now,
            lastActivity: now,
            process: cliProcess,
        };
        // Store session
        this.sessions.set(id, session);
        // Set as active session
        this.activeSessionId = id;
        // Set up event handlers
        this.setupSessionEventHandlers(session);
        // Return session without process (public interface)
        return this.toPublicSession(session);
    }
    /**
     * Set up event handlers for a session
     */
    setupSessionEventHandlers(session) {
        session.process.on('output', () => {
            session.lastActivity = new Date();
        });
        session.process.on('close', () => {
            session.status = 'idle';
        });
        session.process.on('error', () => {
            session.status = 'error';
        });
    }
    /**
     * Convert internal session to public Session interface
     */
    toPublicSession(session) {
        return {
            id: session.id,
            name: session.name,
            workingDir: session.workingDir,
            status: session.status,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
        };
    }
    /**
     * List all sessions
     */
    listSessions() {
        return Array.from(this.sessions.values()).map((s) => this.toPublicSession(s));
    }
    /**
     * Get a session by ID
     */
    getSession(id) {
        const session = this.sessions.get(id);
        return session ? this.toPublicSession(session) : undefined;
    }
    /**
     * Get internal session with process
     */
    getInternalSession(id) {
        return this.sessions.get(id);
    }
    /**
     * Close a session
     */
    async closeSession(id) {
        const session = this.sessions.get(id);
        if (!session) {
            throw new Error(`Session not found: ${id}`);
        }
        // Kill the process
        session.process.kill();
        // Remove from sessions map
        this.sessions.delete(id);
        // If this was the active session, switch to another one
        if (this.activeSessionId === id) {
            const remaining = Array.from(this.sessions.keys());
            this.activeSessionId = remaining.length > 0 ? remaining[0] : undefined;
        }
    }
    /**
     * Switch to a different session
     */
    switchSession(id) {
        const session = this.sessions.get(id);
        if (!session) {
            throw new Error(`Session not found: ${id}`);
        }
        this.activeSessionId = id;
        return this.toPublicSession(session);
    }
    /**
     * Get the active session
     */
    getActiveSession() {
        if (!this.activeSessionId) {
            return undefined;
        }
        return this.getSession(this.activeSessionId);
    }
    /**
     * Get the active internal session with process
     */
    getActiveInternalSession() {
        if (!this.activeSessionId) {
            return undefined;
        }
        return this.sessions.get(this.activeSessionId);
    }
    /**
     * Send input to the active session
     */
    sendToActiveSession(input) {
        const session = this.getActiveInternalSession();
        if (!session) {
            throw new Error('No active session');
        }
        session.process.send(input);
        session.lastActivity = new Date();
        session.status = 'active';
    }
    /**
     * Kill the active session's Claude process (hard stop)
     * The session remains but the current process is terminated
     */
    killActiveProcess() {
        const session = this.getActiveInternalSession();
        if (!session) {
            throw new Error('No active session');
        }
        session.process.kill();
        session.status = 'idle';
        session.lastActivity = new Date();
    }
    /**
     * Write a response to the active session's stdin
     * Used for answering AskUserQuestion prompts
     */
    writeToActiveSession(response) {
        const session = this.getActiveInternalSession();
        if (!session) {
            throw new Error('No active session');
        }
        session.process.writeToStdin(response);
        session.lastActivity = new Date();
    }
    /**
     * Check if the active session has a process that can receive stdin
     */
    hasActiveProcess() {
        const session = this.getActiveInternalSession();
        return session?.process.hasActiveProcess() ?? false;
    }
    /**
     * Subscribe to output events from the active session
     */
    onActiveSessionOutput(callback) {
        const session = this.getActiveInternalSession();
        if (!session) {
            throw new Error('No active session');
        }
        session.process.on('output', callback);
        return () => {
            session.process.off('output', callback);
        };
    }
    /**
     * Subscribe to output events from a specific session
     */
    onSessionOutput(sessionId, callback) {
        const session = this.getInternalSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        session.process.on('output', callback);
        return () => {
            session.process.off('output', callback);
        };
    }
    /**
     * Subscribe to error events from a specific session
     */
    onSessionError(sessionId, callback) {
        const session = this.getInternalSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        session.process.on('error', callback);
        return () => {
            session.process.off('error', callback);
        };
    }
    /**
     * Subscribe to close events from a specific session
     */
    onSessionClose(sessionId, callback) {
        const session = this.getInternalSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        session.process.on('close', callback);
        return () => {
            session.process.off('close', callback);
        };
    }
    /**
     * Change the working directory of a session
     * This kills the current process and starts a new one in the new directory
     */
    async changeDirectory(sessionId, newWorkingDir) {
        const session = this.getInternalSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        // Resolve to absolute path to ensure consistency
        const resolvedWorkingDir = path.resolve(newWorkingDir);
        // Validate new working directory exists and is a directory
        if (!existsSync(resolvedWorkingDir)) {
            throw new Error(`Working directory does not exist: ${resolvedWorkingDir}`);
        }
        try {
            const stats = statSync(resolvedWorkingDir);
            if (!stats.isDirectory()) {
                throw new Error(`Path is not a directory: ${resolvedWorkingDir}`);
            }
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Path is not a directory')) {
                throw error;
            }
            throw new Error(`Cannot access working directory: ${resolvedWorkingDir}`);
        }
        // Kill the current process
        session.process.kill();
        // Create a new process in the new directory with the resolved absolute path
        const newProcess = new ClaudeCodeProcess(resolvedWorkingDir, this.config.claudeCliPath);
        // Update session with the resolved absolute path
        session.workingDir = resolvedWorkingDir;
        session.process = newProcess;
        session.status = 'idle';
        session.lastActivity = new Date();
        // Set up event handlers for the new process
        this.setupSessionEventHandlers(session);
        return this.toPublicSession(session);
    }
    /**
     * Get the number of active sessions
     */
    get sessionCount() {
        return this.sessions.size;
    }
}
//# sourceMappingURL=SessionManager.js.map