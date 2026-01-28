import { Telegraf } from 'telegraf';
import type { TelegramBotConfig, ExtendedTelegramBotConfig } from '../types/index.js';
import { SessionManager } from '../session/SessionManager.js';
import { OutputParser } from '../parser/OutputParser.js';
/**
 * Telegram bot for remote Claude Code operation
 */
export declare class TelegramBot {
    private bot;
    private sessionManager;
    private outputParser;
    private sessionScanner;
    private allowedUsers;
    private userChatIds;
    private pendingQuestions;
    private awaitingCustomInput;
    private outputUnsubscribers;
    private errorUnsubscribers;
    private closeUnsubscribers;
    private lastThinkingMessageTime;
    private static readonly THINKING_DEBOUNCE_MS;
    private waitingForUserResponse;
    private suppressedMessages;
    private voiceHandler;
    private fileHandler;
    private notificationManager;
    private voiceConfig;
    private fileUploadConfig;
    private userVoiceEnabled;
    private userUploadEnabled;
    private userVerbosityLevel;
    private userNotificationPrefs;
    private defaultVerbosity;
    private defaultNotificationPrefs;
    private outputHistory;
    private static readonly MAX_OUTPUT_HISTORY;
    private userBookmarks;
    private messageQueue;
    private isProcessingQueue;
    private lastMessageTime;
    private static readonly RATE_LIMIT_MS;
    private static readonly MAX_QUEUE_SIZE;
    private static readonly MAX_MESSAGE_LENGTH;
    private messageBatchBuffer;
    private messageBatchTimer;
    private static readonly BATCH_DELAY_MS;
    private lastContextInfo;
    private pendingCostCallback;
    constructor(config: TelegramBotConfig | ExtendedTelegramBotConfig);
    /**
     * Set up authorization middleware
     */
    private setupMiddleware;
    /**
     * Set up command handlers
     */
    private setupCommands;
    /**
     * Build a directory tree string
     */
    private buildDirectoryTree;
    /**
     * Format and send cost information to user
     */
    private formatAndSendCostInfo;
    /**
     * Set up callback query handlers for inline buttons
     */
    private setupCallbackHandlers;
    /**
     * Check if a message is a bot command (vs a Claude skill invocation)
     */
    private isBotCommand;
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
     * Add a line to output history for /log command
     */
    private addToOutputHistory;
    /**
     * Parse context information from Claude output
     */
    private parseContextInfo;
    /**
     * Notify users about session crash (auto-reconnect feature)
     */
    private notifySessionCrash;
    /**
     * Unsubscribe from a session's output
     */
    private unsubscribeFromSession;
    /**
     * Forward text output to all connected users with message batching
     */
    private forwardTextToUsers;
    /**
     * Add message to batch buffer and schedule flush
     */
    private batchMessage;
    /**
     * Flush batched messages for a chat
     */
    private flushMessageBatch;
    /**
     * Queue a message for later sending (when rate limited)
     */
    private queueMessage;
    /**
     * Process queued messages respecting rate limits
     */
    private processMessageQueue;
    /**
     * Send message and track rate limit
     */
    private sendMessageWithRateLimit;
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