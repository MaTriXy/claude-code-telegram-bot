import { Telegraf } from 'telegraf';
import { SessionManager } from '../session/SessionManager.js';
import { OutputParser } from '../parser/OutputParser.js';
/**
 * Telegram bot for remote Claude Code operation
 */
export class TelegramBot {
    bot;
    sessionManager;
    outputParser;
    allowedUsers;
    userChatIds = new Map(); // userId -> chatId
    pendingQuestions = new Map(); // chatId -> question
    awaitingCustomInput = new Set(); // chatIds awaiting custom input
    outputUnsubscribers = new Map(); // sessionId -> unsubscribe function
    constructor(config) {
        this.bot = new Telegraf(config.token);
        this.sessionManager = new SessionManager(config.sessionManagerConfig);
        this.outputParser = new OutputParser();
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
                this.userChatIds.set(userId, ctx.chat.id);
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
            await ctx.reply('Welcome to Claude Code Bot!\n\n' +
                'Commands:\n' +
                '/new <name> [dir] - Create new session\n' +
                '/cd <path> - Change directory\n' +
                '/list - List all sessions\n' +
                '/switch <id> - Switch to session\n' +
                '/close <id> - Close session\n' +
                '/status - Current session info\n' +
                '/help - Show this message\n\n' +
                'Send any text to interact with the active Claude session.');
        });
        // /help - Show help
        this.bot.command('help', async (ctx) => {
            await ctx.reply('Claude Code Bot Commands:\n\n' +
                '/new <name> [workingDir] - Create a new Claude Code session\n' +
                '/cd <path> - Change working directory of current session\n' +
                '/list - List all active sessions\n' +
                '/switch <sessionId> - Switch to a different session\n' +
                '/close <sessionId> - Close and terminate a session\n' +
                '/status - Show current session details\n' +
                '/abort - Abort current Claude operation\n\n' +
                'When Claude asks questions, use the inline buttons or type a custom response.');
        });
        // /new - Create new session
        this.bot.command('new', async (ctx) => {
            try {
                const args = ctx.message.text.split(' ').slice(1);
                const name = args[0] || `session-${Date.now()}`;
                const workingDir = args[1];
                // Check if session with same name exists - close it first
                const existingSessions = this.sessionManager.listSessions();
                const existingSession = existingSessions.find(s => s.name === name);
                if (existingSession) {
                    // Unsubscribe from old session output
                    this.unsubscribeFromSession(existingSession.id);
                    await this.sessionManager.closeSession(existingSession.id);
                    await ctx.reply(`Closed existing session "${name}"`);
                }
                const session = await this.sessionManager.createSession(name, workingDir);
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
                        // Send the selection to Claude
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
     * Set up message handlers for text input
     */
    setupMessageHandlers() {
        this.bot.on('text', async (ctx) => {
            const text = ctx.message.text;
            // Skip if it's a command
            if (text.startsWith('/'))
                return;
            const chatId = ctx.chat.id;
            try {
                // Check if we're awaiting custom input for a question
                if (this.awaitingCustomInput.has(chatId)) {
                    this.awaitingCustomInput.delete(chatId);
                    this.pendingQuestions.delete(chatId);
                    // Send custom response to Claude
                    this.sessionManager.sendToActiveSession(text);
                    await ctx.reply(`Sent: "${text}"`);
                }
                else {
                    // Regular prompt to Claude
                    this.sessionManager.sendToActiveSession(text);
                    await ctx.reply('Sent to Claude session.');
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
            this.forwardQuestionToUsers(question);
        });
        // Listen for general output (assistant messages)
        this.outputParser.on('output', (output) => {
            // Forward assistant text messages to users
            if (output.type === 'assistant' && output.message) {
                this.forwardTextToUsers(output.message);
            }
        });
    }
    /**
     * Subscribe to a session's output and pipe it to the OutputParser
     */
    subscribeToSessionOutput(sessionId) {
        // Unsubscribe from any previous subscription for this session
        this.unsubscribeFromSession(sessionId);
        try {
            // Get the session's process output and pipe it to the parser
            const unsubscribe = this.sessionManager.onSessionOutput(sessionId, (data) => {
                this.outputParser.parseStreamOutput(data);
            });
            this.outputUnsubscribers.set(sessionId, unsubscribe);
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
     * Forward a question to all connected users
     */
    async forwardQuestionToUsers(question) {
        const formatted = this.outputParser.formatForTelegram(question);
        for (const [userId, chatId] of this.userChatIds.entries()) {
            try {
                // Store pending question for this chat
                this.pendingQuestions.set(chatId, question);
                await this.bot.telegram.sendMessage(chatId, formatted.text, {
                    parse_mode: formatted.parseMode,
                    reply_markup: formatted.replyMarkup,
                });
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