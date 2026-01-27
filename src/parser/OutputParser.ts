import { EventEmitter } from 'events';
import type {
  ParsedQuestion,
  ClaudeOutput,
  ToolUseOutput,
  TelegramFormattedMessage,
  QuestionOption,
  InlineButton,
} from '../types/index.js';

const MAX_DESCRIPTION_LENGTH = 100;

/**
 * Interface for AskUserQuestion input structure
 */
interface AskUserQuestionInput {
  questions: Array<{
    question: string;
    header?: string;
    options: Array<{
      label: string;
      description?: string;
    }>;
    multiSelect?: boolean;
  }>;
}

/**
 * Parses Claude Code stream-json output
 */
export class OutputParser extends EventEmitter {
  private buffer = '';
  private currentTextContent = ''; // Accumulates text from content_block_delta events

  /**
   * Detect if output contains an AskUserQuestion tool call
   */
  detectQuestion(output: ClaudeOutput): boolean {
    if (output.type !== 'tool_use') {
      return false;
    }

    const toolUse = output as ToolUseOutput;
    return toolUse.name === 'AskUserQuestion';
  }

  /**
   * Parse a question from tool_use output
   */
  parseQuestion(output: ToolUseOutput): ParsedQuestion | null {
    if (output.name !== 'AskUserQuestion') {
      return null;
    }

    const input = output.input as unknown as AskUserQuestionInput;
    if (!input.questions || input.questions.length === 0) {
      return null;
    }

    // Take the first question (Claude typically sends one at a time)
    const questionData = input.questions[0];

    const options: QuestionOption[] = questionData.options.map((opt) => ({
      label: opt.label,
      description: opt.description,
    }));

    return {
      question: questionData.question,
      header: questionData.header,
      options,
      multiSelect: questionData.multiSelect ?? false,
    };
  }

  /**
   * Format a question for Telegram
   */
  formatForTelegram(question: ParsedQuestion): TelegramFormattedMessage {
    // Build the message text
    let text = '';

    if (question.header) {
      text += `*${this.escapeMarkdown(question.header)}*\n\n`;
    }

    text += `${this.escapeMarkdown(question.question)}`;

    // Add option descriptions if present
    if (question.options.some((opt) => opt.description)) {
      text += '\n\n';
      question.options.forEach((opt, index) => {
        const desc = opt.description
          ? this.truncateDescription(opt.description)
          : '';
        text += `${index + 1}. *${this.escapeMarkdown(opt.label)}*`;
        if (desc) {
          text += ` - ${this.escapeMarkdown(desc)}`;
        }
        text += '\n';
      });
    }

    // Build inline keyboard
    const buttons: InlineButton[][] = [];

    // Add option buttons (up to 4 per row)
    for (let i = 0; i < question.options.length; i += 2) {
      const row: InlineButton[] = [];
      row.push({
        text: question.options[i].label,
        callback_data: `answer:${i}`,
      });
      if (i + 1 < question.options.length) {
        row.push({
          text: question.options[i + 1].label,
          callback_data: `answer:${i + 1}`,
        });
      }
      buttons.push(row);
    }

    // Add "Other" button for custom input
    buttons.push([
      {
        text: '✏️ Other (type custom response)',
        callback_data: 'answer:custom',
      },
    ]);

    return {
      text,
      parseMode: 'Markdown',
      replyMarkup: {
        inline_keyboard: buttons,
      },
    };
  }

  /**
   * Escape special Markdown characters
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }

  /**
   * Truncate description to max length
   */
  private truncateDescription(desc: string): string {
    if (desc.length <= MAX_DESCRIPTION_LENGTH) {
      return desc;
    }
    return desc.slice(0, MAX_DESCRIPTION_LENGTH - 3) + '...';
  }

  /**
   * Detect if output is a tool call
   */
  detectToolCall(output: ClaudeOutput): boolean {
    return output.type === 'tool_use';
  }

  /**
   * Parse stream output chunk
   * Returns array of parsed outputs and emits events
   */
  parseStreamOutput(chunk: string): ClaudeOutput[] {
    const results: ClaudeOutput[] = [];

    if (!chunk) {
      return results;
    }

    // Add chunk to buffer
    this.buffer += chunk;

    // Process complete lines
    const lines = this.buffer.split('\n');

    // Keep the last incomplete line in buffer
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      try {
        const output = JSON.parse(trimmed) as ClaudeOutput;
        results.push(output);

        // Emit raw output event
        this.emit('output', output);

        // Handle streaming content_block_delta events (where actual text comes in)
        if (output.type === 'content_block_delta') {
          const deltaOutput = output as { type: 'content_block_delta'; delta?: { type?: string; text?: string } };
          if (deltaOutput.delta?.type === 'text_delta' && deltaOutput.delta?.text) {
            this.currentTextContent += deltaOutput.delta.text;
          }
        }

        // When content block stops, emit accumulated text
        if (output.type === 'content_block_stop') {
          if (this.currentTextContent.trim()) {
            this.emit('text', this.currentTextContent);
            this.currentTextContent = '';
          }
        }

        // Handle 'assistant' type messages from stream-json format
        // Format: {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
        // Can also contain tool_use blocks with questions
        if (output.type === 'assistant') {
          const assistantOutput = output as {
            type: 'assistant';
            message?: {
              content?: Array<{
                type?: string;
                text?: string;
                name?: string;
                input?: unknown;
              }>
            }
          };
          if (assistantOutput.message?.content) {
            for (const block of assistantOutput.message.content) {
              if (block.type === 'text' && block.text) {
                this.emit('text', block.text);
              }
              // Check for tool_use blocks (e.g., AskUserQuestion)
              if (block.type === 'tool_use' && block.name) {
                const toolUseBlock = block as ToolUseOutput;
                this.emit('tool_call', toolUseBlock);

                // Check if it's a question
                if (block.name === 'AskUserQuestion') {
                  const question = this.parseQuestion(toolUseBlock);
                  if (question) {
                    this.emit('question', question);
                  }
                } else {
                  // Emit progress event for other tool executions
                  this.emit('progress', { type: 'tool_start', toolName: block.name });
                }
              }
            }
          }
        }

        // Note: Don't emit from 'result' type to avoid duplicates
        // The 'result' contains the same text as 'assistant'

        // Check if it's a question and emit question event
        if (this.detectQuestion(output)) {
          const question = this.parseQuestion(output as ToolUseOutput);
          if (question) {
            this.emit('question', question);
          }
        }

        // Check if it's a tool call and emit tool_call event
        if (this.detectToolCall(output)) {
          this.emit('tool_call', output as ToolUseOutput);

          // Emit progress event for tool executions (not questions)
          const toolUse = output as ToolUseOutput;
          if (toolUse.name !== 'AskUserQuestion') {
            this.emit('progress', { type: 'tool_start', toolName: toolUse.name });
          }
        }

        // Emit progress event for tool results
        if (output.type === 'tool_result') {
          const toolResult = output as { type: 'tool_result'; is_error?: boolean; tool_use_id?: string };
          this.emit('progress', {
            type: 'tool_end',
            success: !toolResult.is_error,
          });
        }

        // Emit thinking event when Claude starts processing
        if (output.type === 'content_block_start') {
          this.emit('thinking');
        }

        // Emit 'started' event when Claude session initializes
        if (output.type === 'system') {
          const systemOutput = output as { type: 'system'; subtype?: string };
          if (systemOutput.subtype === 'init') {
            this.emit('started');
          }
        }

        // Fallback: emit any accumulated text when we receive a 'result' event
        // This handles cases where content_block_stop was never received
        if (output.type === 'result') {
          if (this.currentTextContent.trim()) {
            this.emit('text', this.currentTextContent);
            this.currentTextContent = '';
          }
        }
      } catch {
        // Invalid JSON line, skip it
        // This can happen with partial output or non-JSON lines
      }
    }

    return results;
  }

  /**
   * Reset the internal buffer and accumulated text content
   */
  resetBuffer(): void {
    this.buffer = '';
    this.currentTextContent = '';
  }
}
