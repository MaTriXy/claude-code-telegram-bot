import { EventEmitter } from 'events';
import type { ParsedQuestion, ClaudeOutput, ToolUseOutput, TelegramFormattedMessage } from '../types/index.js';
/**
 * Parses Claude Code stream-json output
 */
export declare class OutputParser extends EventEmitter {
    private buffer;
    private currentTextContent;
    /**
     * Detect if output contains an AskUserQuestion tool call
     */
    detectQuestion(output: ClaudeOutput): boolean;
    /**
     * Parse a question from tool_use output
     */
    parseQuestion(output: ToolUseOutput): ParsedQuestion | null;
    /**
     * Format a question for Telegram
     */
    formatForTelegram(question: ParsedQuestion): TelegramFormattedMessage;
    /**
     * Escape special Markdown characters
     */
    private escapeMarkdown;
    /**
     * Truncate description to max length
     */
    private truncateDescription;
    /**
     * Detect if output is a tool call
     */
    detectToolCall(output: ClaudeOutput): boolean;
    /**
     * Parse stream output chunk
     * Returns array of parsed outputs and emits events
     */
    parseStreamOutput(chunk: string): ClaudeOutput[];
    /**
     * Reset the internal buffer and accumulated text content
     */
    resetBuffer(): void;
}
//# sourceMappingURL=OutputParser.d.ts.map