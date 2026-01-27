import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
/**
 * Scans for existing Claude Code sessions on the system
 */
export class ClaudeSessionScanner {
    claudeDir;
    constructor() {
        this.claudeDir = join(homedir(), '.claude');
    }
    /**
     * Get recent sessions from history.jsonl
     */
    getRecentSessions(limit = 10) {
        const historyPath = join(this.claudeDir, 'history.jsonl');
        if (!existsSync(historyPath)) {
            return [];
        }
        try {
            const content = readFileSync(historyPath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l.trim());
            // Parse lines and group by sessionId
            const sessionMap = new Map();
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    if (entry.sessionId && entry.project) {
                        const projectName = entry.project.split('/').pop() || entry.project;
                        sessionMap.set(entry.sessionId, {
                            sessionId: entry.sessionId,
                            project: entry.project,
                            projectName,
                            lastMessage: entry.display?.substring(0, 100) || '',
                            timestamp: new Date(entry.timestamp),
                            filePath: this.getSessionFilePath(entry.project, entry.sessionId),
                        });
                    }
                }
                catch {
                    // Skip invalid lines
                }
            }
            // Sort by timestamp descending and return
            return Array.from(sessionMap.values())
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .slice(0, limit);
        }
        catch {
            return [];
        }
    }
    /**
     * Get session file path for a project and session ID
     */
    getSessionFilePath(project, sessionId) {
        const projectDirName = project.replace(/\//g, '-');
        return join(this.claudeDir, 'projects', projectDirName, `${sessionId}.jsonl`);
    }
    /**
     * List all sessions for a specific project
     */
    getProjectSessions(projectPath) {
        const projectDirName = projectPath.replace(/\//g, '-');
        const projectDir = join(this.claudeDir, 'projects', projectDirName);
        if (!existsSync(projectDir)) {
            return [];
        }
        try {
            const files = readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
            const sessions = [];
            for (const file of files) {
                const sessionId = file.replace('.jsonl', '');
                const filePath = join(projectDir, file);
                try {
                    const stats = statSync(filePath);
                    const content = readFileSync(filePath, 'utf-8');
                    const lines = content.trim().split('\n').filter(l => l.trim());
                    const lastLine = lines[lines.length - 1];
                    let lastMessage = '';
                    try {
                        const parsed = JSON.parse(lastLine);
                        lastMessage = parsed.message?.content?.[0]?.text?.substring(0, 100) || '';
                    }
                    catch {
                        // Ignore parse errors
                    }
                    sessions.push({
                        sessionId,
                        project: projectPath,
                        projectName: projectPath.split('/').pop() || projectPath,
                        lastMessage,
                        timestamp: stats.mtime,
                        filePath,
                    });
                }
                catch {
                    // Skip files we can't read
                }
            }
            return sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        }
        catch {
            return [];
        }
    }
    /**
     * Check if a session exists
     */
    sessionExists(sessionId) {
        const recentSessions = this.getRecentSessions(100);
        return recentSessions.find(s => s.sessionId === sessionId) || null;
    }
    /**
     * Format session for display
     */
    formatSession(session) {
        const timeAgo = this.getTimeAgo(session.timestamp);
        const truncatedMessage = session.lastMessage.length > 50
            ? session.lastMessage.substring(0, 50) + '...'
            : session.lastMessage;
        return `📁 ${session.projectName}\n` +
            `   ID: \`${session.sessionId.substring(0, 8)}...\`\n` +
            `   ${timeAgo}\n` +
            `   "${truncatedMessage}"`;
    }
    /**
     * Get human-readable time ago string
     */
    getTimeAgo(date) {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60)
            return 'just now';
        if (seconds < 3600)
            return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400)
            return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }
}
//# sourceMappingURL=ClaudeSessionScanner.js.map