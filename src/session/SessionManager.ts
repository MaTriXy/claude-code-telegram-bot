import { ulid } from 'ulid';
import { existsSync, statSync } from 'fs';
import * as path from 'path';
import type { Session, SessionWithProcess, SessionManagerConfig, SessionContext, ContextualSessionConfig } from '../types/index.js';
import { ClaudeCodeProcess } from './ClaudeCodeProcess.js';

/**
 * Default contextual session configuration
 */
const DEFAULT_CONTEXTUAL_CONFIG: ContextualSessionConfig = {
  enabled: false,
  fallbackToGlobal: true,
  cleanupInactiveMs: undefined,
};

/**
 * Manages Claude Code CLI sessions
 */
export class SessionManager {
  private sessions: Map<string, SessionWithProcess> = new Map();
  private activeSessionId: string | undefined;
  private config: SessionManagerConfig;

  /**
   * Maps context keys to session IDs for per-thread/per-chat session support
   * Context key format: "chat:{chatId}:thread:{threadId}" or "chat:{chatId}:user:{userId}:thread:{threadId}"
   */
  private contextualActiveSessions: Map<string, string> = new Map();

  /**
   * Configuration for contextual session support
   */
  private contextualSessionConfig: ContextualSessionConfig;

  constructor(config: SessionManagerConfig = {}) {
    this.config = {
      claudeCliPath: config.claudeCliPath || 'claude',
      defaultWorkingDir: config.defaultWorkingDir || process.cwd(),
      contextualSessionConfig: config.contextualSessionConfig,
    };

    this.contextualSessionConfig = {
      ...DEFAULT_CONTEXTUAL_CONFIG,
      ...config.contextualSessionConfig,
    };
  }

  /**
   * Create a new Claude Code session
   */
  async createSession(name: string, workingDir?: string): Promise<Session> {
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
    } catch (error) {
      if (error instanceof Error && error.message.includes('Path is not a directory')) {
        throw error;
      }
      throw new Error(`Cannot access working directory: ${sessionWorkingDir}`);
    }

    // Create the Claude Code process
    const cliProcess = new ClaudeCodeProcess(
      sessionWorkingDir,
      this.config.claudeCliPath
    );

    const now = new Date();

    const session: SessionWithProcess = {
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
  async attachToSession(name: string, existingSessionId: string, workingDir?: string): Promise<Session> {
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
    } catch (error) {
      if (error instanceof Error && error.message.includes('Path is not a directory')) {
        throw error;
      }
      throw new Error(`Cannot access working directory: ${sessionWorkingDir}`);
    }

    // Create the Claude Code process with existing session ID
    const cliProcess = new ClaudeCodeProcess(
      sessionWorkingDir,
      this.config.claudeCliPath,
      existingSessionId // Pass existing session ID to resume
    );

    const now = new Date();

    const session: SessionWithProcess = {
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
  private setupSessionEventHandlers(session: SessionWithProcess): void {
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
  private toPublicSession(session: SessionWithProcess): Session {
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
  listSessions(): Session[] {
    return Array.from(this.sessions.values()).map((s) => this.toPublicSession(s));
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): Session | undefined {
    const session = this.sessions.get(id);
    return session ? this.toPublicSession(session) : undefined;
  }

  /**
   * Get internal session with process
   */
  private getInternalSession(id: string): SessionWithProcess | undefined {
    return this.sessions.get(id);
  }

  /**
   * Close a session
   */
  async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }

    // Kill the process
    session.process.kill();

    // Remove from sessions map
    this.sessions.delete(id);

    // Clean up contextual session mappings that reference this session
    this.cleanupContextualMappingsForSession(id);

    // If this was the active session, switch to another one
    if (this.activeSessionId === id) {
      const remaining = Array.from(this.sessions.keys());
      this.activeSessionId = remaining.length > 0 ? remaining[0] : undefined;
    }
  }

  /**
   * Clean up all contextual session mappings that reference a specific session ID
   */
  private cleanupContextualMappingsForSession(sessionId: string): void {
    const keysToDelete: string[] = [];
    for (const [contextKey, mappedSessionId] of this.contextualActiveSessions) {
      if (mappedSessionId === sessionId) {
        keysToDelete.push(contextKey);
      }
    }
    for (const key of keysToDelete) {
      this.contextualActiveSessions.delete(key);
    }
  }

  /**
   * Switch to a different session
   */
  switchSession(id: string): Session {
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
  getActiveSession(): Session | undefined {
    if (!this.activeSessionId) {
      return undefined;
    }
    return this.getSession(this.activeSessionId);
  }

  /**
   * Get the active internal session with process
   */
  private getActiveInternalSession(): SessionWithProcess | undefined {
    if (!this.activeSessionId) {
      return undefined;
    }
    return this.sessions.get(this.activeSessionId);
  }

  /**
   * Send input to the active session
   */
  sendToActiveSession(input: string): void {
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
  killActiveProcess(): void {
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
  writeToActiveSession(response: string): void {
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
  hasActiveProcess(): boolean {
    const session = this.getActiveInternalSession();
    return session?.process.hasActiveProcess() ?? false;
  }

  /**
   * Subscribe to output events from the active session
   */
  onActiveSessionOutput(callback: (data: string) => void): () => void {
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
  onSessionOutput(sessionId: string, callback: (data: string) => void): () => void {
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
  onSessionError(sessionId: string, callback: (error: Error) => void): () => void {
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
  onSessionClose(sessionId: string, callback: (code: number | null) => void): () => void {
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
  async changeDirectory(sessionId: string, newWorkingDir: string): Promise<Session> {
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
    } catch (error) {
      if (error instanceof Error && error.message.includes('Path is not a directory')) {
        throw error;
      }
      throw new Error(`Cannot access working directory: ${resolvedWorkingDir}`);
    }

    // Kill the current process
    session.process.kill();

    // Create a new process in the new directory with the resolved absolute path
    const newProcess = new ClaudeCodeProcess(
      resolvedWorkingDir,
      this.config.claudeCliPath
    );

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
  get sessionCount(): number {
    return this.sessions.size;
  }

  // ============================================================================
  // Per-Thread/Per-Context Active Session Support
  // ============================================================================

  /**
   * Generate a context key for session lookup
   * Key format depends on whether userId and threadId are provided:
   * - "chat:{chatId}" - Basic chat-level mapping
   * - "chat:{chatId}:thread:{threadId}" - Thread-level mapping
   * - "chat:{chatId}:user:{userId}" - User-level mapping within a chat
   * - "chat:{chatId}:user:{userId}:thread:{threadId}" - Full context mapping
   */
  generateContextKey(context: SessionContext): string {
    const parts: string[] = [`chat:${context.chatId}`];

    if (context.userId !== undefined) {
      parts.push(`user:${context.userId}`);
    }

    if (context.threadId !== undefined) {
      parts.push(`thread:${context.threadId}`);
    }

    return parts.join(':');
  }

  /**
   * Set the active session for a specific context
   * @param context The session context (chat, thread, user)
   * @param sessionId The session ID to associate with this context
   * @deprecated Use ThreadManager.setSessionForThread() for thread-based session binding.
   * This method is kept for backward compatibility but ThreadManager is now the
   * authoritative source for session-to-thread mappings.
   */
  setActiveSessionForContext(context: SessionContext, sessionId: string): void {
    // Verify session exists
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const contextKey = this.generateContextKey(context);
    this.contextualActiveSessions.set(contextKey, sessionId);
  }

  /**
   * Get the active session for a specific context
   * Falls back through the context hierarchy: thread -> chat -> global
   * @param context The session context (chat, thread, user)
   * @returns The session if found, undefined otherwise
   * @deprecated Use ThreadManager.getSessionForThread() for thread-based session lookup.
   * This method is kept for backward compatibility but ThreadManager is now the
   * authoritative source for session-to-thread mappings.
   */
  getActiveSessionForContext(context: SessionContext): Session | undefined {
    // If contextual sessions are disabled, fall back to global
    if (!this.contextualSessionConfig.enabled) {
      return this.getActiveSession();
    }

    // Try full context key first (most specific)
    const fullContextKey = this.generateContextKey(context);
    let sessionId = this.contextualActiveSessions.get(fullContextKey);

    // Fallback hierarchy: try less specific keys
    if (!sessionId && context.threadId !== undefined) {
      // Try without threadId (chat:X:user:Y or chat:X)
      const contextWithoutThread: SessionContext = {
        chatId: context.chatId,
        userId: context.userId,
      };
      const keyWithoutThread = this.generateContextKey(contextWithoutThread);
      sessionId = this.contextualActiveSessions.get(keyWithoutThread);
    }

    if (!sessionId && context.userId !== undefined) {
      // Try without userId (chat:X:thread:Y or chat:X)
      const contextWithoutUser: SessionContext = {
        chatId: context.chatId,
        threadId: context.threadId,
      };
      const keyWithoutUser = this.generateContextKey(contextWithoutUser);
      sessionId = this.contextualActiveSessions.get(keyWithoutUser);
    }

    if (!sessionId && (context.threadId !== undefined || context.userId !== undefined)) {
      // Try just chat level
      const chatOnlyContext: SessionContext = {
        chatId: context.chatId,
      };
      const chatOnlyKey = this.generateContextKey(chatOnlyContext);
      sessionId = this.contextualActiveSessions.get(chatOnlyKey);
    }

    // If still no session found and fallback to global is enabled
    if (!sessionId && this.contextualSessionConfig.fallbackToGlobal) {
      return this.getActiveSession();
    }

    // Return the session if found
    if (sessionId) {
      return this.getSession(sessionId);
    }

    return undefined;
  }

  /**
   * Clear the active session for a specific context
   * @param context The session context to clear
   * @deprecated Use ThreadManager.clearSessionForThread() for thread-based session cleanup.
   * This method is kept for backward compatibility but ThreadManager is now the
   * authoritative source for session-to-thread mappings.
   */
  clearActiveSessionForContext(context: SessionContext): void {
    const contextKey = this.generateContextKey(context);
    this.contextualActiveSessions.delete(contextKey);
  }

  /**
   * Send input to the active session for a specific context
   * @param context The session context
   * @param input The input to send
   * @deprecated Use ThreadManager for session-thread mapping and sendToSession(sessionId) directly.
   * This method is kept for backward compatibility but ThreadManager is now the
   * authoritative source for session-to-thread mappings.
   */
  sendToSessionForContext(context: SessionContext, input: string): void {
    // If contextual sessions are disabled, use global behavior
    if (!this.contextualSessionConfig.enabled) {
      this.sendToActiveSession(input);
      return;
    }

    // Get active session for context
    const session = this.getActiveSessionForContext(context);
    if (!session) {
      throw new Error('No active session for this context');
    }

    // Get internal session to access process
    const internalSession = this.getInternalSession(session.id);
    if (!internalSession) {
      throw new Error(`Internal session not found: ${session.id}`);
    }

    internalSession.process.send(input);
    internalSession.lastActivity = new Date();
    internalSession.status = 'active';
  }

  /**
   * Get a session by ID (direct lookup without context)
   * @param sessionId The session ID to look up
   * @returns The session if found, undefined otherwise
   */
  getSessionById(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);
    return session ? this.toPublicSession(session) : undefined;
  }

  /**
   * Send input to a specific session by ID
   * @param sessionId The session ID to send input to
   * @param input The input to send
   */
  sendToSession(sessionId: string, input: string): void {
    const session = this.getInternalSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.process.send(input);
    session.lastActivity = new Date();
    session.status = 'active';
  }

  /**
   * Get the contextual session configuration
   */
  getContextualSessionConfig(): ContextualSessionConfig {
    return { ...this.contextualSessionConfig };
  }

  /**
   * Update the contextual session configuration
   * @param config Partial configuration to update
   */
  setContextualSessionConfig(config: Partial<ContextualSessionConfig>): void {
    this.contextualSessionConfig = {
      ...this.contextualSessionConfig,
      ...config,
    };
  }

  /**
   * Get all contextual session mappings
   * @returns A map of context keys to session IDs
   */
  getContextualActiveSessions(): Map<string, string> {
    return new Map(this.contextualActiveSessions);
  }

  /**
   * Get the number of contextual session mappings
   */
  get contextualSessionCount(): number {
    return this.contextualActiveSessions.size;
  }
}
