import { Telegraf } from 'telegraf';
import { SessionManager } from '../session/SessionManager.js';
import { OutputParser } from '../parser/OutputParser.js';
import { ClaudeSessionScanner } from '../utils/ClaudeSessionScanner.js';
// Bot commands that are handled by the Telegram bot itself (not forwarded to Claude)
const BOT_COMMANDS = new Set([
    'start', 'help', 'new', 'cd', 'list', 'switch', 'close', 'status', 'abort', 'kill', 'sessions', 'attach'
]);
/**
 * Telegram bot for remote Claude Code operation
 */
export class TelegramBot {
    bot;
    sessionManager;
    outputParser;
    sessionScanner;
    allowedUsers;
    userChatIds = new Map(); // userId -> chatId
    pendingQuestions = new Map(); // chatId -> question
    awaitingCustomInput = new Set(); // chatIds awaiting custom input
    outputUnsubscribers = new Map(); // sessionId -> unsubscribe function
    errorUnsubscribers = new Map(); // sessionId -> error unsubscribe
    closeUnsubscribers = new Map(); // sessionId -> close unsubscribe
    lastThinkingMessageTime = 0; // Debounce thinking messages
    static THINKING_DEBOUNCE_MS = 5000; // 5 seconds debounce
    waitingForUserResponse = false; // True when a question is pending and we're waiting for user input
    suppressedMessages = []; // Buffer messages while waiting for response
    constructor(config) {
        this.bot = new Telegraf(config.token);
        this.sessionManager = new SessionManager(config.sessionManagerConfig);
        this.outputParser = new OutputParser();
        this.sessionScanner = new ClaudeSessionScanner();
        this.allowedUsers = new Set(config.allowedUserIds);
        this.setupMiddleware();
        this.setupCommands();
        this.setupCallbackHandlers();
        this.setupMessageHandlers();
        this.setupOutputForwarding();
    }
    /**
     * Set up authorization middleware
     */
    setupMiddleware() {
        // Authorization middleware
        this.bot.use(async (ctx, next) => {
            const userId = ctx.from?.id;
            if (!userId || !this.isUserAuthorized(userId)) {
                await ctx.reply('Unauthorized. Your user ID is not in the allowed list.');
                return;
            }
            // Store chat ID for this user
            if (ctx.chat) {
                const wasNew = !this.userChatIds.has(userId);
                this.userChatIds.set(userId, ctx.chat.id);
                if (wasNew) {
                    console.log(`[Auth] User ${userId} connected with chat ID ${ctx.chat.id}`);
                }
            }
            await next();
        });
        // Error handling middleware
        this.bot.catch((err, ctx) => {
            console.error(`Error for ${ctx.updateType}:`, err);
            ctx.reply('An error occurred. Please try again.').catch(() => { });
        });
    }
    /**
     * Set up command handlers
     */
    setupCommands() {
        // /start - Welcome message
        this.bot.command('start', async (ctx) => {
            await ctx.reply('🤖 *Welcome to Claude Code Bot\\!*\n\n' +
                'Control Claude Code CLI remotely from Telegram\\.\n\n' +
                '*Commands:*\n' +
                '/new <name> \\[dir\\] \\- Create new session\n' +
                '/cd <path> \\- Change directory\n' +
                '/list \\- List all sessions\n' +
                '/switch <id> \\- Switch to session\n' +
                '/close <id> \\- Close session\n' +
                '/status \\- Current session info\n' +
                '/help \\- Full command list\n\n' +
                'Send any text to interact with the active Claude session\\.\n\n' +
                '═══════════════════════════════\n' +
                '🧙 *100% Built using Babysitter*\n' +
                '      by [a5c\\.ai](https://a5c.ai)\n' +
                '═══════════════════════════════', { parse_mode: 'MarkdownV2' });
        });
        // /help - Show help
        this.bot.command('help', async (ctx) => {
            await ctx.reply('*Claude Code Bot Commands*\n\n' +
                '*Session Management:*\n' +
                '/new <name> \\[workingDir\\] \\- Create a new session\n' +
                '/sessions \\- List existing Claude sessions on system\n' +
                '/attach <id> \\[dir\\] \\- Attach to existing session\n' +
                '/list \\- List active Telegram sessions\n' +
                '/switch <id> \\- Switch to a different session\n' +
                '/close <id> \\- Close and terminate a session\n' +
                '/status \\- Show current session details\n' +
                '/cd <path> \\- Change working directory\n\n' +
                '*Control:*\n' +
                '/abort \\- Abort current operation \\(Ctrl\\+C\\)\n' +
                '/kill \\- Force kill current process\n\n' +
                'When Claude asks questions, use the inline buttons or type a custom response\\.\n\n' +
                '═══════════════════════════════\n' +
                '🧙 _100% Built using Babysitter by [a5c\\.ai](https://a5c.ai)_', { parse_mode: 'MarkdownV2' });
        });
        // /new - Create new session
        this.bot.command('new', async (ctx) => {
            try {
                // Parse command: /new <name> [workingDir]
                // Working dir is optional and can contain spaces if quoted
                const fullText = ctx.message.text;
                const withoutCommand = fullText.replace(/^\/new\s*/, '').trim();
                let name;
                let workingDir;
                if (!withoutCommand) {
                    // No args: /new
                    name = `session-${Date.now()}`;
                    workingDir = undefined;
                }
                else {
                    // Split by spaces, first arg is name
                    const parts = withoutCommand.split(/\s+/);
                    name = parts[0];
                    // Rest is working dir (join back in case path has spaces)
                    workingDir = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
                }
                // Only use workingDir if it's actually provided (not empty string)
                const effectiveWorkingDir = workingDir && workingDir.trim() ? workingDir.trim() : undefined;
                // Check if session with same name exists - close it first
                const existingSessions = this.sessionManager.listSessions();
                const existingSession = existingSessions.find(s => s.name === name);
                if (existingSession) {
                    // Unsubscribe from old session output
                    this.unsubscribeFromSession(existingSession.id);
                    await this.sessionManager.closeSession(existingSession.id);
                    await ctx.reply(`Closed existing session "${name}"`);
                }
                const session = await this.sessionManager.createSession(name, effectiveWorkingDir);
                // Reset waiting state for new session
                this.waitingForUserResponse = false;
                this.suppressedMessages = [];
                // Subscribe to session output
                this.subscribeToSessionOutput(session.id);
                await ctx.reply(`Session created!\n\n` +
                    `ID: \`${session.id}\`\n` +
                    `Name: ${session.name}\n` +
                    `Directory: ${session.workingDir}\n` +
                    `Status: ${session.status}`, { parse_mode: 'Markdown' });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                await ctx.reply(`Error creating session: ${message}`);
            }
        });
        // /cd - Change directory for current session
        this.bot.command('cd', async (ctx) => {
            try {
                const newDir = ctx.message.text.split(' ').slice(1).join(' ');
                if (!newDir) {
                    await ctx.reply('Usage: /cd <path>');
                    return;
                }
                const currentSession = this.sessionManager.getActiveSession();
                if (!currentSession) {
                    await ctx.reply('No active session. Use /new to create one.');
                    return;
                }
                // Change directory (this restarts the process)
                const updatedSession = await this.sessionManager.changeDirectory(currentSession.id, newDir);
                // Re-subscribe to output
                this.subscribeToSessionOutput(updatedSession.id);
                await ctx.reply(`Directory changed!\n\n` +
                    `Session: ${updatedSession.name}\n` +
                    `New directory: ${updatedSession.workingDir}`, { parse_mode: 'Markdown' });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                await ctx.reply(`Error changing directory: ${message}`);
            }
        });
        // /list - List sessions
        this.bot.command('list', async (ctx) => {
            const sessions = this.sessionManager.listSessions();
            const activeSession = this.sessionManager.getActiveSession();
            if (sessions.length === 0) {
                await ctx.reply('No active sessions. Use /new to create one.');
                return;
            }
            let message = 'Sessions:\n\n';
            for (const session of sessions) {
                const isActive = activeSession?.id === session.id;
                const marker = isActive ? '✓ ' : '  ';
                message += `${marker}\`${session.id}\`\n`;
                message += `   Name: ${session.name}\n`;
                message += `   Status: ${session.status}\n`;
                message += `   Dir: ${session.workingDir}\n\n`;
            }
            await ctx.reply(message, { parse_mode: 'Markdown' });
        });
        // /switch - Switch session
        this.bot.command('switch', async (ctx) => {
            try {
                const sessionId = ctx.message.text.split(' ')[1];
                if (!sessionId) {
                    await ctx.reply('Usage: /switch <sessionId>');
                    return;
                }
                const session = this.sessionManager.switchSession(sessionId);
                await ctx.reply(`Switched to session: ${session.name} (\`${session.id}\`)`, {
                    parse_mode: 'Markdown',
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Session not found';
                await ctx.reply(`Error: ${message}`);
            }
        });
        // /close - Close session
        this.bot.command('close', async (ctx) => {
            try {
                const sessionId = ctx.message.text.split(' ')[1];
                if (!sessionId) {
                    await ctx.reply('Usage: /close <sessionId>');
                    return;
                }
                await this.sessionManager.closeSession(sessionId);
                await ctx.reply(`Session \`${sessionId}\` closed.`, { parse_mode: 'Markdown' });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Session not found';
                await ctx.reply(`Error: ${message}`);
            }
        });
        // /status - Current session status
        this.bot.command('status', async (ctx) => {
            const session = this.sessionManager.getActiveSession();
            if (!session) {
                await ctx.reply('No active session. Use /new to create one.');
                return;
            }
            await ctx.reply(`Current Session:\n\n` +
                `ID: \`${session.id}\`\n` +
                `Name: ${session.name}\n` +
                `Status: ${session.status}\n` +
                `Directory: ${session.workingDir}\n` +
                `Created: ${session.createdAt.toISOString()}\n` +
                `Last Activity: ${session.lastActivity.toISOString()}`, { parse_mode: 'Markdown' });
        });
        // /abort - Abort current operation (sends Ctrl+C equivalent)
        this.bot.command('abort', async (ctx) => {
            try {
                // Send special abort signal or message
                this.sessionManager.sendToActiveSession('\x03'); // Ctrl+C
                await ctx.reply('Abort signal sent to active session.');
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'No active session';
                await ctx.reply(`Error: ${message}`);
            }
        });
        // /kill - Force kill the current Claude process (hard stop)
        this.bot.command('kill', async (ctx) => {
            try {
                const activeSession = this.sessionManager.getActiveSession();
                if (!activeSession) {
                    await ctx.reply('No active session to kill.');
                    return;
                }
                // Kill the process forcefully
                this.sessionManager.killActiveProcess();
                await ctx.reply('🔪 Killed! Claude/Babysitter process terminated.');
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to kill process';
                await ctx.reply(`Error: ${message}`);
            }
        });
        // /sessions - List existing Claude sessions on the system
        this.bot.command('sessions', async (ctx) => {
            try {
                const recentSessions = this.sessionScanner.getRecentSessions(10);
                if (recentSessions.length === 0) {
                    await ctx.reply('No recent Claude sessions found on this system.');
                    return;
                }
                let message = '🗂️ *Recent Claude Sessions*\n\n';
                message += '_Use /attach <session-id> to connect_\n\n';
                for (const session of recentSessions) {
                    message += this.sessionScanner.formatSession(session) + '\n\n';
                }
                await ctx.reply(message, { parse_mode: 'Markdown' });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to list sessions';
                await ctx.reply(`Error: ${message}`);
            }
        });
        // /attach - Attach to an existing Claude session
        this.bot.command('attach', async (ctx) => {
            try {
                const args = ctx.message.text.split(' ').slice(1);
                if (args.length === 0) {
                    await ctx.reply('Usage: /attach <session-id> [working-dir]\n\n' +
                        'Use /sessions to see available sessions.\n' +
                        'You can use partial session IDs (first 8 characters).');
                    return;
                }
                const partialId = args[0];
                const workingDir = args.slice(1).join(' ') || undefined;
                // Find matching session
                const recentSessions = this.sessionScanner.getRecentSessions(100);
                const matchingSession = recentSessions.find(s => s.sessionId.startsWith(partialId) || s.sessionId === partialId);
                if (!matchingSession) {
                    await ctx.reply(`No session found matching "${partialId}". Use /sessions to see available sessions.`);
                    return;
                }
                // Use the session's project directory if no working dir specified
                const effectiveWorkingDir = workingDir || matchingSession.project;
                // Attach to the session
                const session = await this.sessionManager.attachToSession(matchingSession.projectName, matchingSession.sessionId, effectiveWorkingDir);
                // Reset waiting state for new session
                this.waitingForUserResponse = false;
                this.suppressedMessages = [];
                // Subscribe to session output
                this.subscribeToSessionOutput(session.id);
                await ctx.reply(`🔗 *Attached to existing session!*\n\n` +
                    `Session ID: \`${matchingSession.sessionId.substring(0, 8)}...\`\n` +
                    `Project: ${matchingSession.projectName}\n` +
                    `Directory: ${effectiveWorkingDir}\n\n` +
                    `Send a message to continue this session.`, { parse_mode: 'Markdown' });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to attach';
                await ctx.reply(`Error: ${message}`);
            }
        });
    }
    /**
     * Set up callback query handlers for inline buttons
     */
    setupCallbackHandlers() {
        // Handle answer selections
        this.bot.action(/^answer:(.+)$/, async (ctx) => {
            const match = ctx.match;
            if (!match)
                return;
            const selection = match[1];
            const chatId = ctx.chat?.id;
            if (!chatId) {
                await ctx.answerCbQuery('Error: Could not identify chat');
                return;
            }
            try {
                if (selection === 'custom') {
                    // User wants to type custom response
                    this.awaitingCustomInput.add(chatId);
                    await ctx.answerCbQuery('Type your custom response');
                    await ctx.reply('Please type your custom response:');
                }
                else {
                    // User selected a numbered option
                    const optionIndex = parseInt(selection, 10);
                    const question = this.pendingQuestions.get(chatId);
                    if (question && question.options[optionIndex]) {
                        const selectedOption = question.options[optionIndex];
                        // Resume normal message forwarding now that user has responded
                        this.waitingForUserResponse = false;
                        console.log('[Answer] User responded, resuming message forwarding');
                        // Send the answer as a new message to Claude using --resume
                        // This continues the conversation with the user's answer
                        console.log(`[Answer] Sending answer as new message: "${selectedOption.label}"`);
                        this.sessionManager.sendToActiveSession(selectedOption.label);
                        await ctx.answerCbQuery(`Selected: ${selectedOption.label}`);
                        await ctx.editMessageText(`You selected: *${selectedOption.label}*`, { parse_mode: 'Markdown' });
                        // Clear pending question
                        this.pendingQuestions.delete(chatId);
                    }
                    else {
                        await ctx.answerCbQuery('Invalid selection');
                    }
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Error processing selection';
                await ctx.answerCbQuery(message);
            }
        });
    }
    /**
     * Check if a message is a bot command (vs a Claude skill invocation)
     */
    isBotCommand(text) {
        if (!text.startsWith('/'))
            return false;
        // Extract command name from "/command" or "/command@botname" or "/command args"
        const match = text.match(/^\/([a-zA-Z0-9_]+)/);
        if (!match)
            return false;
        const commandName = match[1].toLowerCase();
        return BOT_COMMANDS.has(commandName);
    }
    /**
     * Set up message handlers for text input
     */
    setupMessageHandlers() {
        this.bot.on('text', async (ctx) => {
            const text = ctx.message.text;
            // Skip only if it's a registered bot command (like /new, /list, etc.)
            // Other slash commands (like /babysitter:call, /commit) are Claude skills
            // and should be forwarded to Claude
            if (this.isBotCommand(text))
                return;
            const chatId = ctx.chat.id;
            try {
                // Check if we're awaiting custom input for a question
                if (this.awaitingCustomInput.has(chatId)) {
                    this.awaitingCustomInput.delete(chatId);
                    this.pendingQuestions.delete(chatId);
                    // Resume normal message forwarding now that user has responded
                    this.waitingForUserResponse = false;
                    console.log('[CustomAnswer] User responded, resuming message forwarding');
                    // Send custom response as a new message to Claude
                    console.log(`[CustomAnswer] Sending as new message: "${text}"`);
                    this.sessionManager.sendToActiveSession(text);
                    await ctx.reply(`Sent: "${text}"`);
                }
                else {
                    // If user sends a new message while a question was pending, clear the waiting state
                    // This handles the case where user ignores the question and sends something else
                    if (this.waitingForUserResponse) {
                        console.log('[Message] User sent new message, clearing pending question state');
                        this.waitingForUserResponse = false;
                        this.pendingQuestions.delete(chatId);
                    }
                    // Send to Claude session
                    this.sessionManager.sendToActiveSession(text);
                    // Provide appropriate feedback based on what was sent
                    if (text.startsWith('/babysitter:call')) {
                        await ctx.reply('🤹 Sent to the Babysitter.');
                    }
                    else {
                        await ctx.reply('Sent to Claude session.');
                    }
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'No active session';
                await ctx.reply(`Error: ${message}. Use /new to create a session.`);
            }
        });
    }
    /**
     * Set up output forwarding from Claude sessions
     */
    setupOutputForwarding() {
        // Listen for questions from OutputParser
        this.outputParser.on('question', (question) => {
            console.log('[OutputParser] Question event received:', question.question.substring(0, 50));
            // Set flag to suppress subsequent messages until user responds
            this.waitingForUserResponse = true;
            this.suppressedMessages = []; // Clear any previously suppressed messages
            this.forwardQuestionToUsers(question);
        });
        // Listen for text output (accumulated from streaming deltas)
        this.outputParser.on('text', (text) => {
            // Skip if waiting for user to respond to a question
            if (this.waitingForUserResponse) {
                console.log('[OutputParser] Suppressing text while waiting for user response');
                // Optionally buffer important messages (but for now, just log)
                if (text && text.trim()) {
                    this.suppressedMessages.push(text.trim());
                }
                return;
            }
            // Forward assistant text messages to users
            if (text && text.trim()) {
                this.forwardTextToUsers(text);
            }
        });
        // Listen for progress events (tool executions)
        // Only show failures to reduce noise - successes are implied
        this.outputParser.on('progress', (progress) => {
            // Skip if waiting for user to respond to a question
            if (this.waitingForUserResponse) {
                console.log('[OutputParser] Suppressing progress while waiting for user response');
                return;
            }
            if (progress.type === 'tool_end' && !progress.success) {
                this.forwardProgressToUsers('❌ Tool execution failed');
            }
            // Skip tool_start and success messages to reduce noise
        });
        // Skip thinking events - they add too much noise
        // this.outputParser.on('thinking', () => { ... });
        // Skip 'started' event - the user knows they sent a message
        // this.outputParser.on('started', () => { ... });
    }
    /**
     * Subscribe to a session's output and pipe it to the OutputParser
     */
    subscribeToSessionOutput(sessionId) {
        // Unsubscribe from any previous subscription for this session
        this.unsubscribeFromSession(sessionId);
        try {
            // Get the session's process output and pipe it to the parser
            // NOTE: ClaudeCodeProcess emits lines WITHOUT trailing newlines,
            // but OutputParser.parseStreamOutput() buffers and splits by '\n',
            // so we must add the newline for lines to be processed.
            const unsubscribe = this.sessionManager.onSessionOutput(sessionId, (data) => {
                this.outputParser.parseStreamOutput(data + '\n');
            });
            this.outputUnsubscribers.set(sessionId, unsubscribe);
            // Subscribe to error events
            const errorUnsubscribe = this.sessionManager.onSessionError(sessionId, (error) => {
                this.forwardErrorToUsers(error.message);
            });
            this.errorUnsubscribers.set(sessionId, errorUnsubscribe);
            // Subscribe to close events
            const closeUnsubscribe = this.sessionManager.onSessionClose(sessionId, (code) => {
                if (code !== 0 && code !== null) {
                    this.forwardErrorToUsers(`Session crashed (exit code: ${code}) - use /new to restart`);
                }
                else {
                    this.forwardStatusToUsers('Session ended gracefully');
                }
            });
            this.closeUnsubscribers.set(sessionId, closeUnsubscribe);
        }
        catch (error) {
            console.error(`Failed to subscribe to session ${sessionId} output:`, error);
        }
    }
    /**
     * Unsubscribe from a session's output
     */
    unsubscribeFromSession(sessionId) {
        const unsubscribe = this.outputUnsubscribers.get(sessionId);
        if (unsubscribe) {
            unsubscribe();
            this.outputUnsubscribers.delete(sessionId);
        }
        const errorUnsubscribe = this.errorUnsubscribers.get(sessionId);
        if (errorUnsubscribe) {
            errorUnsubscribe();
            this.errorUnsubscribers.delete(sessionId);
        }
        const closeUnsubscribe = this.closeUnsubscribers.get(sessionId);
        if (closeUnsubscribe) {
            closeUnsubscribe();
            this.closeUnsubscribers.delete(sessionId);
        }
    }
    /**
     * Forward text output to all connected users
     */
    async forwardTextToUsers(text) {
        // Skip empty or very short messages
        if (!text || text.trim().length === 0) {
            return;
        }
        // Truncate very long messages
        const maxLength = 4000;
        const truncatedText = text.length > maxLength
            ? text.slice(0, maxLength) + '\n...(truncated)'
            : text;
        for (const [_userId, chatId] of this.userChatIds.entries()) {
            try {
                await this.bot.telegram.sendMessage(chatId, truncatedText);
            }
            catch (error) {
                console.error(`Failed to send text to chat ${chatId}:`, error);
            }
        }
    }
    /**
     * Forward error messages to all connected users with emoji indicator
     */
    async forwardErrorToUsers(errorMessage) {
        if (!errorMessage || errorMessage.trim().length === 0) {
            return;
        }
        const formattedError = `⚠️ ${errorMessage}`;
        for (const [_userId, chatId] of this.userChatIds.entries()) {
            try {
                await this.bot.telegram.sendMessage(chatId, formattedError);
            }
            catch (error) {
                console.error(`Failed to send error to chat ${chatId}:`, error);
            }
        }
    }
    /**
     * Forward status messages to all connected users with emoji indicator
     */
    async forwardStatusToUsers(statusMessage) {
        if (!statusMessage || statusMessage.trim().length === 0) {
            return;
        }
        const formattedStatus = `ℹ️ ${statusMessage}`;
        for (const [_userId, chatId] of this.userChatIds.entries()) {
            try {
                await this.bot.telegram.sendMessage(chatId, formattedStatus);
            }
            catch (error) {
                console.error(`Failed to send status to chat ${chatId}:`, error);
            }
        }
    }
    /**
     * Forward progress messages to all connected users (tool execution progress)
     */
    async forwardProgressToUsers(progressMessage) {
        if (!progressMessage || progressMessage.trim().length === 0) {
            return;
        }
        for (const [_userId, chatId] of this.userChatIds.entries()) {
            try {
                await this.bot.telegram.sendMessage(chatId, progressMessage);
            }
            catch (error) {
                console.error(`Failed to send progress to chat ${chatId}:`, error);
            }
        }
    }
    /**
     * Forward a question to all connected users
     */
    async forwardQuestionToUsers(question) {
        console.log(`[Question] Detected question: "${question.question.substring(0, 50)}..."`);
        console.log(`[Question] Connected users: ${this.userChatIds.size}`);
        if (this.userChatIds.size === 0) {
            console.warn('[Question] No users connected to receive the question!');
            return;
        }
        const formatted = this.outputParser.formatForTelegram(question);
        for (const [userId, chatId] of this.userChatIds.entries()) {
            try {
                console.log(`[Question] Sending to user ${userId} (chat ${chatId})`);
                // Store pending question for this chat
                this.pendingQuestions.set(chatId, question);
                await this.bot.telegram.sendMessage(chatId, formatted.text, {
                    parse_mode: formatted.parseMode,
                    reply_markup: formatted.replyMarkup,
                });
                console.log(`[Question] Successfully sent to chat ${chatId}`);
            }
            catch (error) {
                console.error(`Failed to send question to chat ${chatId}:`, error);
            }
        }
    }
    /**
     * Start the bot
     */
    async start() {
        console.log('Starting Telegram bot...');
        await this.bot.launch();
        console.log('Telegram bot started successfully');
        // Enable graceful stop
        process.once('SIGINT', () => this.stop());
        process.once('SIGTERM', () => this.stop());
    }
    /**
     * Stop the bot
     */
    async stop() {
        console.log('Stopping Telegram bot...');
        // Close all sessions
        const sessions = this.sessionManager.listSessions();
        for (const session of sessions) {
            try {
                await this.sessionManager.closeSession(session.id);
            }
            catch (error) {
                console.error(`Error closing session ${session.id}:`, error);
            }
        }
        this.bot.stop('SIGTERM');
        console.log('Telegram bot stopped');
    }
    /**
     * Get the underlying Telegraf instance (for testing)
     */
    getBot() {
        return this.bot;
    }
    /**
     * Get the session manager (for testing)
     */
    getSessionManager() {
        return this.sessionManager;
    }
    /**
     * Get the output parser (for testing)
     */
    getOutputParser() {
        return this.outputParser;
    }
    /**
     * Check if a user is authorized
     */
    isUserAuthorized(userId) {
        return this.allowedUsers.has(userId);
    }
}
//# sourceMappingURL=TelegramBot.js.map