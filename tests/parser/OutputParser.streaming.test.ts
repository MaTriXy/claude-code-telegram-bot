import { describe, it, expect, beforeEach } from '@jest/globals';
import { OutputParser } from '../../src/parser/OutputParser.js';
import type {
  StreamingStartEvent,
  StreamingDeltaEvent,
  StreamingCompleteEvent,
} from '../../src/types/index.js';

describe('OutputParser Streaming', () => {
  let parser: OutputParser;

  beforeEach(() => {
    parser = new OutputParser();
  });

  describe('streaming configuration', () => {
    it('should have streaming disabled by default', () => {
      expect(parser.isStreamingEnabled()).toBe(false);
    });

    it('should enable streaming when setStreamingEnabled(true) is called', () => {
      parser.setStreamingEnabled(true);
      expect(parser.isStreamingEnabled()).toBe(true);
    });

    it('should disable streaming when setStreamingEnabled(false) is called', () => {
      parser.setStreamingEnabled(true);
      parser.setStreamingEnabled(false);
      expect(parser.isStreamingEnabled()).toBe(false);
    });

    it('should accept streaming option in constructor', () => {
      const streamingParser = new OutputParser({ streamingEnabled: true });
      expect(streamingParser.isStreamingEnabled()).toBe(true);
    });

    it('should default to streaming disabled in constructor', () => {
      const defaultParser = new OutputParser({});
      expect(defaultParser.isStreamingEnabled()).toBe(false);
    });
  });

  describe('streaming state methods', () => {
    it('should report stream not in progress initially', () => {
      expect(parser.isStreamInProgress()).toBe(false);
    });

    it('should return empty string for accumulated text initially', () => {
      expect(parser.getStreamingAccumulatedText()).toBe('');
    });

    it('should report stream in progress after content_block_start', () => {
      parser.setStreamingEnabled(true);
      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      expect(parser.isStreamInProgress()).toBe(true);
    });

    it('should accumulate text during streaming', () => {
      parser.setStreamingEnabled(true);
      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      expect(parser.getStreamingAccumulatedText()).toBe('Hello');
    });
  });

  describe('streaming_start event', () => {
    it('should emit streaming_start when streaming is enabled and content_block_start is received', (done) => {
      parser.setStreamingEnabled(true);

      parser.on('streaming_start', (event: StreamingStartEvent) => {
        expect(event.timestamp).toBeDefined();
        expect(typeof event.timestamp).toBe('number');
        done();
      });

      const chunk = '{"type":"content_block_start"}\n';
      parser.parseStreamOutput(chunk);
    });

    it('should NOT emit streaming_start when streaming is disabled', () => {
      let streamingStartEmitted = false;
      parser.on('streaming_start', () => {
        streamingStartEmitted = true;
      });

      const chunk = '{"type":"content_block_start"}\n';
      parser.parseStreamOutput(chunk);

      expect(streamingStartEmitted).toBe(false);
    });

    it('should still emit thinking event regardless of streaming mode', (done) => {
      parser.setStreamingEnabled(true);

      parser.on('thinking', () => {
        done();
      });

      const chunk = '{"type":"content_block_start"}\n';
      parser.parseStreamOutput(chunk);
    });

    it('should not emit streaming_start if already streaming', () => {
      parser.setStreamingEnabled(true);

      let streamingStartCount = 0;
      parser.on('streaming_start', () => {
        streamingStartCount++;
      });

      // First content_block_start should emit
      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      // Second one should not (already streaming)
      parser.parseStreamOutput('{"type":"content_block_start"}\n');

      expect(streamingStartCount).toBe(1);
    });
  });

  describe('streaming_delta event', () => {
    it('should emit streaming_delta with text and accumulated text when streaming is enabled', (done) => {
      parser.setStreamingEnabled(true);

      const deltas: StreamingDeltaEvent[] = [];

      parser.on('streaming_delta', (event: StreamingDeltaEvent) => {
        deltas.push(event);
        if (deltas.length === 2) {
          expect(deltas[0].text).toBe('Hello');
          expect(deltas[0].accumulatedText).toBe('Hello');
          expect(deltas[0].timestamp).toBeDefined();
          expect(deltas[1].text).toBe(' World');
          expect(deltas[1].accumulatedText).toBe('Hello World');
          done();
        }
      });

      // First start a content block
      parser.parseStreamOutput('{"type":"content_block_start"}\n');

      // Then send delta events
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":" World"}}\n');
    });

    it('should NOT emit streaming_delta when streaming is disabled', () => {
      let streamingDeltaEmitted = false;
      parser.on('streaming_delta', () => {
        streamingDeltaEmitted = true;
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');

      expect(streamingDeltaEmitted).toBe(false);
    });

    it('should still accumulate text for text event when streaming is enabled', (done) => {
      parser.setStreamingEnabled(true);

      parser.on('text', (text: string) => {
        expect(text).toBe('Hello World');
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":" World"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });
  });

  describe('streaming_complete event', () => {
    it('should emit streaming_complete with final text and stats when streaming is enabled', (done) => {
      parser.setStreamingEnabled(true);

      parser.on('streaming_complete', (event: StreamingCompleteEvent) => {
        expect(event.finalText).toBe('Hello World');
        expect(event.totalChunks).toBe(2);
        expect(event.durationMs).toBeDefined();
        expect(event.durationMs).toBeGreaterThanOrEqual(0);
        expect(event.timestamp).toBeDefined();
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":" World"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });

    it('should NOT emit streaming_complete when streaming is disabled', () => {
      let streamingCompleteEmitted = false;
      parser.on('streaming_complete', () => {
        streamingCompleteEmitted = true;
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');

      expect(streamingCompleteEmitted).toBe(false);
    });

    it('should emit streaming_complete before text event', (done) => {
      parser.setStreamingEnabled(true);

      const eventOrder: string[] = [];

      parser.on('streaming_complete', () => {
        eventOrder.push('streaming_complete');
      });

      parser.on('text', () => {
        eventOrder.push('text');
        expect(eventOrder).toEqual(['streaming_complete', 'text']);
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });
  });

  describe('complete streaming flow', () => {
    it('should emit events in correct order: streaming_start -> streaming_delta(s) -> streaming_complete -> text', (done) => {
      parser.setStreamingEnabled(true);

      const eventOrder: string[] = [];

      parser.on('streaming_start', () => {
        eventOrder.push('streaming_start');
      });

      parser.on('streaming_delta', () => {
        eventOrder.push('streaming_delta');
      });

      parser.on('streaming_complete', () => {
        eventOrder.push('streaming_complete');
      });

      parser.on('text', () => {
        eventOrder.push('text');
        expect(eventOrder).toEqual([
          'streaming_start',
          'streaming_delta',
          'streaming_delta',
          'streaming_complete',
          'text',
        ]);
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":" World"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });

    it('should handle multiple content blocks with streaming', (done) => {
      parser.setStreamingEnabled(true);

      let streamingStartCount = 0;
      let streamingCompleteCount = 0;
      let textCount = 0;

      parser.on('streaming_start', () => {
        streamingStartCount++;
      });

      parser.on('streaming_complete', () => {
        streamingCompleteCount++;
      });

      parser.on('text', () => {
        textCount++;
        if (textCount === 2) {
          expect(streamingStartCount).toBe(2);
          expect(streamingCompleteCount).toBe(2);
          done();
        }
      });

      // First content block
      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"First"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');

      // Second content block
      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Second"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });
  });

  describe('resetBuffer with streaming', () => {
    it('should reset streaming accumulator when resetBuffer is called', () => {
      parser.setStreamingEnabled(true);

      // Start streaming and accumulate some text
      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');

      expect(parser.getStreamingAccumulatedText()).toBe('Hello');
      expect(parser.isStreamInProgress()).toBe(true);

      // Reset
      parser.resetBuffer();

      expect(parser.getStreamingAccumulatedText()).toBe('');
      expect(parser.isStreamInProgress()).toBe(false);
    });

    it('should allow fresh streaming after reset', (done) => {
      parser.setStreamingEnabled(true);

      // Start streaming and accumulate some text
      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');

      // Reset
      parser.resetBuffer();

      // Start new stream
      const deltas: StreamingDeltaEvent[] = [];
      parser.on('streaming_delta', (event: StreamingDeltaEvent) => {
        deltas.push(event);
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"New"}}\n');

      // Accumulated should start fresh, not include "Hello"
      expect(deltas[0].accumulatedText).toBe('New');
      done();
    });

    it('should not affect streaming enabled state when resetBuffer is called', () => {
      parser.setStreamingEnabled(true);
      parser.resetBuffer();
      expect(parser.isStreamingEnabled()).toBe(true);
    });
  });

  describe('backward compatibility', () => {
    it('should continue to emit text event when streaming is disabled', (done) => {
      // Ensure streaming is disabled (default)
      expect(parser.isStreamingEnabled()).toBe(false);

      parser.on('text', (text: string) => {
        expect(text).toBe('Hello World');
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":" World"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });

    it('should continue to emit thinking event when streaming is disabled', (done) => {
      expect(parser.isStreamingEnabled()).toBe(false);

      parser.on('thinking', () => {
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
    });

    it('should continue to emit output event for all outputs regardless of streaming mode', (done) => {
      parser.setStreamingEnabled(true);

      const outputs: string[] = [];

      parser.on('output', (output: { type: string }) => {
        outputs.push(output.type);
        if (outputs.length === 3) {
          expect(outputs).toEqual([
            'content_block_start',
            'content_block_delta',
            'content_block_stop',
          ]);
          done();
        }
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });
  });

  describe('edge cases', () => {
    it('should handle empty text deltas gracefully', () => {
      parser.setStreamingEnabled(true);

      const deltas: StreamingDeltaEvent[] = [];
      parser.on('streaming_delta', (event: StreamingDeltaEvent) => {
        deltas.push(event);
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      // Empty text delta should not emit streaming_delta (text is undefined/empty)
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta"}}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');

      expect(deltas.length).toBe(1);
      expect(deltas[0].text).toBe('Hello');
    });

    it('should handle content_block_stop without prior content_block_start gracefully', () => {
      parser.setStreamingEnabled(true);

      let streamingCompleteEmitted = false;
      parser.on('streaming_complete', () => {
        streamingCompleteEmitted = true;
      });

      // Send stop without start - should not emit streaming_complete since isCurrentlyStreaming is false
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');

      expect(streamingCompleteEmitted).toBe(false);
    });

    it('should handle non-text_delta types in content_block_delta', () => {
      parser.setStreamingEnabled(true);

      const deltas: StreamingDeltaEvent[] = [];
      parser.on('streaming_delta', (event: StreamingDeltaEvent) => {
        deltas.push(event);
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      // Non-text_delta type should not emit streaming_delta
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"tool_use_delta"}}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');

      expect(deltas.length).toBe(1);
      expect(deltas[0].text).toBe('Hello');
    });

    it('should toggle streaming mode mid-stream correctly', (done) => {
      // Start with streaming enabled
      parser.setStreamingEnabled(true);

      let streamingDeltaCount = 0;
      parser.on('streaming_delta', () => {
        streamingDeltaCount++;
      });

      parser.on('text', () => {
        // Should have received 1 delta before disabling, and none after
        expect(streamingDeltaCount).toBe(1);
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"First"}}\n');

      // Disable streaming mid-stream
      parser.setStreamingEnabled(false);

      // This delta should NOT emit streaming_delta
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":" Second"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });

    it('should handle result event as fallback when content_block_stop is missing', (done) => {
      parser.setStreamingEnabled(true);

      let streamingCompleteEmitted = false;
      parser.on('streaming_complete', () => {
        streamingCompleteEmitted = true;
      });

      parser.on('text', () => {
        // streaming_complete should have been emitted via fallback
        expect(streamingCompleteEmitted).toBe(true);
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      // Skip content_block_stop, go directly to result
      parser.parseStreamOutput('{"type":"result"}\n');
    });
  });

  describe('streaming statistics', () => {
    it('should track chunk count correctly', (done) => {
      parser.setStreamingEnabled(true);

      parser.on('streaming_complete', (event: StreamingCompleteEvent) => {
        expect(event.totalChunks).toBe(3);
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"A"}}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"B"}}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"C"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });

    it('should track duration correctly', (done) => {
      parser.setStreamingEnabled(true);

      const startTime = Date.now();

      parser.on('streaming_complete', (event: StreamingCompleteEvent) => {
        const elapsed = Date.now() - startTime;
        // Duration should be reasonable (within a few ms of actual elapsed time)
        expect(event.durationMs).toBeGreaterThanOrEqual(0);
        expect(event.durationMs).toBeLessThanOrEqual(elapsed + 100);
        done();
      });

      parser.parseStreamOutput('{"type":"content_block_start"}\n');
      parser.parseStreamOutput('{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n');
      parser.parseStreamOutput('{"type":"content_block_stop"}\n');
    });
  });
});
