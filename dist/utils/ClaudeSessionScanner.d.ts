export interface ExistingClaudeSession {
    sessionId: string;
    project: string;
    projectName: string;
    lastMessage: string;
    timestamp: Date;
    filePath: string;
}
/**
 * Scans for existing Claude Code sessions on the system
 */
export declare class ClaudeSessionScanner {
    private claudeDir;
    constructor();
    /**
     * Get recent sessions from history.jsonl
     */
    getRecentSessions(limit?: number): ExistingClaudeSession[];
    /**
     * Get session file path for a project and session ID
     */
    private getSessionFilePath;
    /**
     * List all sessions for a specific project
     */
    getProjectSessions(projectPath: string): ExistingClaudeSession[];
    /**
     * Check if a session exists
     */
    sessionExists(sessionId: string): ExistingClaudeSession | null;
    /**
     * Format session for display
     */
    formatSession(session: ExistingClaudeSession): string;
    /**
     * Get human-readable time ago string
     */
    private getTimeAgo;
}
//# sourceMappingURL=ClaudeSessionScanner.d.ts.map