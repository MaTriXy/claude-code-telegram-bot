import { describe, it, expect, beforeEach } from '@jest/globals';
import { OutputParser } from '../../src/parser/OutputParser.js';
import type {
  ClaudeOutput,
  ToolUseOutput,
  ParsedQuestion,
  TelegramFormattedMessage,
} from '../../src/types/index.js';

describe('OutputParser', () => {
  let parser: OutputParser;

  beforeEach(() => {
    parser = new OutputParser();
  });

  describe('detectQuestion', () => {
    it('should return true when output contains AskUserQuestion pattern', () => {
      const output: ToolUseOutput = {
        type: 'tool_use',
        name: 'AskUserQuestion',
        input: {
          questions: [
            {
              question: 'Which option?',
              options: [{ label: 'A' }, { label: 'B' }],
            },
          ],
        },
      };

      expect(parser.detectQuestion(output)).toBe(true);
    });

    it('should return false for regular assistant output', () => {
      const output: ClaudeOutput = {
        type: 'assistant',
        content: 'Hello, how can I help you?',
      };

      expect(parser.detectQuestion(output)).toBe(false);
    });

    it('should return false for other tool calls', () => {
      const output: ToolUseOutput = {
        type: 'tool_use',
        name: 'Bash',
        input: { command: 'ls -la' },
      };

      expect(parser.detectQuestion(output)).toBe(false);
    });

    it('should return false for tool results', () => {
      const output: ClaudeOutput = {
        type: 'tool_result',
        name: 'Bash',
        result: 'file1.txt\nfile2.txt',
      };

      expect(parser.detectQuestion(output)).toBe(false);
    });
  });

  describe('parseQuestion', () => {
    it('should extract question text', () => {
      const output: ToolUseOutput = {
        type: 'tool_use',
        name: 'AskUserQuestion',
        input: {
          questions: [
            {
              question: 'What is your preferred language?',
              options: [
                { label: 'TypeScript' },
                { label: 'JavaScript' },
              ],
            },
          ],
        },
      };

      const result = parser.parseQuestion(output);

      expect(result?.question).toBe('What is your preferred language?');
    });

    it('should extract options array with labels', () => {
      const output: ToolUseOutput = {
        type: 'tool_use',
        name: 'AskUserQuestion',
        input: {
          questions: [
            {
              question: 'Choose one',
              options: [
                { label: 'Option A', description: 'First option' },
                { label: 'Option B', description: 'Second option' },
              ],
            },
          ],
        },
      };

      const result = parser.parseQuestion(output);

      expect(result?.options).toHaveLength(2);
      expect(result?.options[0].label).toBe('Option A');
      expect(result?.options[0].description).toBe('First option');
      expect(result?.options[1].label).toBe('Option B');
    });

    it('should handle multiSelect questions', () => {
      const output: ToolUseOutput = {
        type: 'tool_use',
        name: 'AskUserQuestion',
        input: {
          questions: [
            {
              question: 'Select features',
              multiSelect: true,
              options: [
                { label: 'Feature A' },
                { label: 'Feature B' },
              ],
            },
          ],
        },
      };

      const result = parser.parseQuestion(output);

      expect(result?.multiSelect).toBe(true);
    });

    it('should default multiSelect to false if not specified', () => {
      const output: ToolUseOutput = {
        type: 'tool_use',
        name: 'AskUserQuestion',
        input: {
          questions: [
            {
              question: 'Choose one',
              options: [{ label: 'A' }],
            },
          ],
        },
      };

      const result = parser.parseQuestion(output);

      expect(result?.multiSelect).toBe(false);
    });

    it('should extract header if present', () => {
      const output: ToolUseOutput = {
        type: 'tool_use',
        name: 'AskUserQuestion',
        input: {
          questions: [
            {
              question: 'Which option?',
              header: 'Selection',
              options: [{ label: 'A' }],
            },
          ],
        },
      };

      const result = parser.parseQuestion(output);

      expect(result?.header).toBe('Selection');
    });

    it('should return null for non-question tool calls', () => {
      const output: ToolUseOutput = {
        type: 'tool_use',
        name: 'Bash',
        input: { command: 'ls' },
      };

      const result = parser.parseQuestion(output);

      expect(result).toBeNull();
    });
  });

  describe('formatForTelegram', () => {
    it('should create formatted markdown message', () => {
      const question: ParsedQuestion = {
        question: 'What is your choice?',
        options: [
          { label: 'Option A', description: 'First' },
          { label: 'Option B', description: 'Second' },
        ],
        multiSelect: false,
      };

      const result = parser.formatForTelegram(question);

      expect(result.text).toContain('What is your choice?');
      expect(result.parseMode).toBe('Markdown');
    });

    it('should generate inline keyboard markup for options', () => {
      const question: ParsedQuestion = {
        question: 'Choose',
        options: [
          { label: 'A' },
          { label: 'B' },
          { label: 'C' },
        ],
        multiSelect: false,
      };

      const result = parser.formatForTelegram(question);

      expect(result.replyMarkup).toBeDefined();
      expect(result.replyMarkup?.inline_keyboard).toBeDefined();
      // 3 options + 1 "Other" button = 4 total
      expect(result.replyMarkup?.inline_keyboard.flat()).toHaveLength(4);
    });

    it('should include callback_data for each option', () => {
      const question: ParsedQuestion = {
        question: 'Choose',
        options: [{ label: 'Option A' }],
        multiSelect: false,
      };

      const result = parser.formatForTelegram(question);
      const button = result.replyMarkup?.inline_keyboard[0][0];

      expect(button?.callback_data).toBe('answer:0');
    });

    it('should truncate long descriptions', () => {
      const longDesc = 'A'.repeat(200);
      const question: ParsedQuestion = {
        question: 'Choose',
        options: [{ label: 'Option', description: longDesc }],
        multiSelect: false,
      };

      const result = parser.formatForTelegram(question);

      // Description should be truncated in the message
      expect(result.text.length).toBeLessThan(longDesc.length + 50);
    });

    it('should include header in message if present', () => {
      const question: ParsedQuestion = {
        question: 'Choose',
        header: 'Important Selection',
        options: [{ label: 'A' }],
        multiSelect: false,
      };

      const result = parser.formatForTelegram(question);

      expect(result.text).toContain('Important Selection');
    });

    it('should add "Other" option for custom input', () => {
      const question: ParsedQuestion = {
        question: 'Choose',
        options: [{ label: 'A' }],
        multiSelect: false,
      };

      const result = parser.formatForTelegram(question);
      const buttons = result.replyMarkup?.inline_keyboard.flat() || [];
      const otherButton = buttons.find((b) => b.callback_data === 'answer:custom');

      expect(otherButton).toBeDefined();
      expect(otherButton?.text).toContain('Other');
    });
  });

  describe('detectToolCall', () => {
    it('should return true for tool_use output', () => {
      const output: ToolUseOutput = {
        type: 'tool_use',
        name: 'Bash',
        input: { command: 'ls' },
      };

      expect(parser.detectToolCall(output)).toBe(true);
    });

    it('should return false for assistant output', () => {
      const output: ClaudeOutput = {
        type: 'assistant',
        content: 'Hello',
      };

      expect(parser.detectToolCall(output)).toBe(false);
    });

    it('should return false for tool_result output', () => {
      const output: ClaudeOutput = {
        type: 'tool_result',
        name: 'Bash',
        result: 'output',
      };

      expect(parser.detectToolCall(output)).toBe(false);
    });
  });

  describe('parseStreamOutput', () => {
    it('should parse complete JSON line', () => {
      const chunk = '{"type":"assistant","content":"Hello"}\n';

      const results = parser.parseStreamOutput(chunk);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('assistant');
    });

    it('should handle partial JSON chunks', () => {
      // First chunk is incomplete
      const chunk1 = '{"type":"assistan';
      const results1 = parser.parseStreamOutput(chunk1);
      expect(results1).toHaveLength(0);

      // Second chunk completes it
      const chunk2 = 't","content":"Hi"}\n';
      const results2 = parser.parseStreamOutput(chunk2);
      expect(results2).toHaveLength(1);
      expect(results2[0].type).toBe('assistant');
    });

    it('should accumulate and parse multiple complete messages', () => {
      const chunk = '{"type":"assistant","content":"Hello"}\n{"type":"tool_use","name":"Bash","input":{"command":"ls"}}\n';

      const results = parser.parseStreamOutput(chunk);

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('assistant');
      expect(results[1].type).toBe('tool_use');
    });

    it('should handle empty chunks', () => {
      const results = parser.parseStreamOutput('');

      expect(results).toHaveLength(0);
    });

    it('should skip empty lines', () => {
      const chunk = '\n\n{"type":"assistant","content":"Hi"}\n\n';

      const results = parser.parseStreamOutput(chunk);

      expect(results).toHaveLength(1);
    });

    it('should emit parsed events', (done) => {
      const chunk = '{"type":"assistant","content":"Hello"}\n';

      parser.on('output', (output: ClaudeOutput) => {
        expect(output.type).toBe('assistant');
        done();
      });

      parser.parseStreamOutput(chunk);
    });

    it('should emit question event when detecting AskUserQuestion', (done) => {
      const chunk = '{"type":"tool_use","name":"AskUserQuestion","input":{"questions":[{"question":"Test?","options":[{"label":"A"}]}]}}\n';

      parser.on('question', (question: ParsedQuestion) => {
        expect(question.question).toBe('Test?');
        done();
      });

      parser.parseStreamOutput(chunk);
    });
  });
});
