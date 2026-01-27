import { Telegraf } from 'telegraf';
import type { TelegramBotConfig } from '../types/index.js';
import { SessionManager } from '../session/SessionManager.js';
import { OutputParser } from '../parser/OutputParser.js';
/**
 * Telegram bot for remote Claude Code operation
 */
export declare class TelegramBot {
    private bot;
    private sessionManager;
    private outputParser;
    private allowedUsers;
    private userChatIds;
    private pendingQuestions;
    private awaitingCustomInput;
    private outputUnsubscribers;
    private errorUnsubscribers;
    private closeUnsubscribers;
    private lastThinkingMessageTime;
    private static readonly THINKING_DEBOUNCE_MS;
    constructor(config: TelegramBotConfig);
    /**
     * Set up authorization middleware
     */
    private setupMiddleware;
    /**
     * Set up command handlers
     */
    private setupCommands;
    /**
     * Set up callback query handlers for inline buttons
     */
    private setupCallbackHandlers;
    /**
     * Set up message handlers for text input
     */
    private setupMessageHandlers;
    /**
     * Set up output forwarding from Claude sessions
     */
    private setupOutputForwarding;
    /**
     * Subscribe to a session's output and pipe it to the OutputParser
     */
    private subscribeToSessionOutput;
    /**
     * Unsubscribe from a session's output
     */
    private unsubscribeFromSession;
    /**
     * Forward text output to all connected users
     */
    private forwardTextToUsers;
    /**
     * Forward error messages to all connected users with emoji indicator
     */
    private forwardErrorToUsers;
    /**
     * Forward status messages to all connected users with emoji indicator
     */
    private forwardStatusToUsers;
    /**
     * Forward progress messages to all connected users (tool execution progress)
     */
    private forwardProgressToUsers;
    /**
     * Forward a question to all connected users
     */
    private forwardQuestionToUsers;
    /**
     * Start the bot
     */
    start(): Promise<void>;
    /**
     * Stop the bot
     */
    stop(): Promise<void>;
    /**
     * Get the underlying Telegraf instance (for testing)
     */
    getBot(): Telegraf;
    /**
     * Get the session manager (for testing)
     */
    getSessionManager(): SessionManager;
    /**
     * Get the output parser (for testing)
     */
    getOutputParser(): OutputParser;
    /**
     * Check if a user is authorized
     */
    isUserAuthorized(userId: number): boolean;
}
//# sourceMappingURL=TelegramBot.d.ts.map