import type { EventEmitter } from 'events';
/**
 * Session status types
 */
export type SessionStatus = 'active' | 'idle' | 'waiting_input' | 'error';
/**
 * Represents a Claude Code session
 */
export interface Session {
    id: string;
    name: string;
    workingDir: string;
    status: SessionStatus;
    createdAt: Date;
    lastActivity: Date;
}
/**
 * Session with process reference (internal use)
 */
export interface SessionWithProcess extends Session {
    process: ClaudeCodeProcessInterface;
}
/**
 * Interface for ClaudeCodeProcess
 */
export interface ClaudeCodeProcessInterface extends EventEmitter {
    readonly isRunning: boolean;
    send(input: string): void;
    kill(): void;
}
/**
 * Configuration for SessionManager
 */
export interface SessionManagerConfig {
    claudeCliPath?: string;
    defaultWorkingDir?: string;
}
/**
 * Configuration for TelegramBot
 */
export interface TelegramBotConfig {
    token: string;
    allowedUserIds: number[];
    sessionManagerConfig?: SessionManagerConfig;
}
/**
 * Question option from Claude Code
 */
export interface QuestionOption {
    label: string;
    description?: string;
}
/**
 * Parsed question from Claude Code output
 */
export interface ParsedQuestion {
    question: string;
    header?: string;
    options: QuestionOption[];
    multiSelect: boolean;
}
/**
 * Claude Code output event types
 */
export type ClaudeOutputType = 'assistant' | 'user' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_start' | 'message_delta' | 'message_stop' | 'result';
/**
 * Base Claude Code output message
 */
export interface ClaudeOutputBase {
    type: ClaudeOutputType;
    timestamp?: string;
}
/**
 * Assistant text output
 */
export interface AssistantOutput extends ClaudeOutputBase {
    type: 'assistant';
    content: string;
}
/**
 * Tool use output
 */
export interface ToolUseOutput extends ClaudeOutputBase {
    type: 'tool_use';
    name: string;
    input: Record<string, unknown>;
}
/**
 * Tool result output
 */
export interface ToolResultOutput extends ClaudeOutputBase {
    type: 'tool_result';
    name: string;
    result: unknown;
    error?: string;
}
/**
 * Union type for all Claude outputs
 */
export type ClaudeOutput = AssistantOutput | ToolUseOutput | ToolResultOutput | ClaudeOutputBase;
/**
 * Events emitted by OutputParser
 */
export interface OutputParserEvents {
    'question': (question: ParsedQuestion, sessionId: string) => void;
    'output': (output: ClaudeOutput, sessionId: string) => void;
    'tool_call': (tool: ToolUseOutput, sessionId: string) => void;
    'error': (error: Error, sessionId: string) => void;
}
/**
 * Telegram inline keyboard button
 */
export interface InlineButton {
    text: string;
    callback_data: string;
}
/**
 * Formatted message for Telegram
 */
export interface TelegramFormattedMessage {
    text: string;
    parseMode: 'Markdown' | 'HTML';
    replyMarkup?: {
        inline_keyboard: InlineButton[][];
    };
}
//# sourceMappingURL=index.d.ts.map