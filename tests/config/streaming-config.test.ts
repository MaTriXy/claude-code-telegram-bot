import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getStreamingEnabled,
  getStreamingMode,
  getStreamingBlockSize,
  getStreamingUpdateInterval,
  buildStreamingConfig,
  getThreadedModeEnabled,
  getThreadedAutoCreate,
  getThreadedDefaultTopic,
  buildThreadedModeConfig,
} from '../../src/config/index.js';
import type { StreamingMode } from '../../src/types/index.js';

describe('Streaming Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getStreamingEnabled', () => {
    it('should return true by default', () => {
      delete process.env['STREAMING_ENABLED'];
      expect(getStreamingEnabled()).toBe(true);
    });

    it('should return true when set to "true"', () => {
      process.env['STREAMING_ENABLED'] = 'true';
      expect(getStreamingEnabled()).toBe(true);
    });

    it('should return true when set to "1"', () => {
      process.env['STREAMING_ENABLED'] = '1';
      expect(getStreamingEnabled()).toBe(true);
    });

    it('should return false when set to "false"', () => {
      process.env['STREAMING_ENABLED'] = 'false';
      expect(getStreamingEnabled()).toBe(false);
    });

    it('should return false when set to "0"', () => {
      process.env['STREAMING_ENABLED'] = '0';
      expect(getStreamingEnabled()).toBe(false);
    });

    it('should return false for any other string value', () => {
      process.env['STREAMING_ENABLED'] = 'yes';
      expect(getStreamingEnabled()).toBe(false);
    });
  });

  describe('getStreamingMode', () => {
    it('should return "partial" by default', () => {
      delete process.env['STREAMING_MODE'];
      expect(getStreamingMode()).toBe('partial');
    });

    it('should return "partial" when set to "partial"', () => {
      process.env['STREAMING_MODE'] = 'partial';
      expect(getStreamingMode()).toBe('partial');
    });

    it('should return "block" when set to "block"', () => {
      process.env['STREAMING_MODE'] = 'block';
      expect(getStreamingMode()).toBe('block');
    });

    it('should return "off" when set to "off"', () => {
      process.env['STREAMING_MODE'] = 'off';
      expect(getStreamingMode()).toBe('off');
    });

    it('should be case-insensitive', () => {
      process.env['STREAMING_MODE'] = 'PARTIAL';
      expect(getStreamingMode()).toBe('partial');

      process.env['STREAMING_MODE'] = 'Block';
      expect(getStreamingMode()).toBe('block');

      process.env['STREAMING_MODE'] = 'OFF';
      expect(getStreamingMode()).toBe('off');
    });

    it('should return default for invalid values', () => {
      process.env['STREAMING_MODE'] = 'invalid';
      expect(getStreamingMode()).toBe('partial');
    });

    it('should return default for empty string', () => {
      process.env['STREAMING_MODE'] = '';
      expect(getStreamingMode()).toBe('partial');
    });
  });

  describe('getStreamingBlockSize', () => {
    it('should return 50 by default', () => {
      delete process.env['STREAMING_BLOCK_SIZE'];
      expect(getStreamingBlockSize()).toBe(50);
    });

    it('should return the configured value', () => {
      process.env['STREAMING_BLOCK_SIZE'] = '100';
      expect(getStreamingBlockSize()).toBe(100);
    });

    it('should return default for invalid number', () => {
      process.env['STREAMING_BLOCK_SIZE'] = 'abc';
      expect(getStreamingBlockSize()).toBe(50);
    });

    it('should handle decimal values', () => {
      process.env['STREAMING_BLOCK_SIZE'] = '75.5';
      expect(getStreamingBlockSize()).toBe(75.5);
    });
  });

  describe('getStreamingUpdateInterval', () => {
    it('should return 200 by default', () => {
      delete process.env['STREAMING_UPDATE_INTERVAL_MS'];
      expect(getStreamingUpdateInterval()).toBe(200);
    });

    it('should return the configured value', () => {
      process.env['STREAMING_UPDATE_INTERVAL_MS'] = '500';
      expect(getStreamingUpdateInterval()).toBe(500);
    });

    it('should return default for invalid number', () => {
      process.env['STREAMING_UPDATE_INTERVAL_MS'] = 'invalid';
      expect(getStreamingUpdateInterval()).toBe(200);
    });

    it('should handle zero value', () => {
      process.env['STREAMING_UPDATE_INTERVAL_MS'] = '0';
      expect(getStreamingUpdateInterval()).toBe(0);
    });
  });

  describe('buildStreamingConfig', () => {
    it('should return default config when no env vars are set', () => {
      delete process.env['STREAMING_ENABLED'];
      delete process.env['STREAMING_MODE'];
      delete process.env['STREAMING_BLOCK_SIZE'];
      delete process.env['STREAMING_UPDATE_INTERVAL_MS'];

      const config = buildStreamingConfig();

      expect(config).toEqual({
        enabled: true,
        mode: 'partial',
        blockSize: 50,
        updateIntervalMs: 200,
      });
    });

    it('should return configured values from env vars', () => {
      process.env['STREAMING_ENABLED'] = 'false';
      process.env['STREAMING_MODE'] = 'block';
      process.env['STREAMING_BLOCK_SIZE'] = '100';
      process.env['STREAMING_UPDATE_INTERVAL_MS'] = '300';

      const config = buildStreamingConfig();

      expect(config).toEqual({
        enabled: false,
        mode: 'block',
        blockSize: 100,
        updateIntervalMs: 300,
      });
    });

    it('should return correct type for StreamingConfig', () => {
      const config = buildStreamingConfig();

      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.mode).toBe('string');
      expect(typeof config.blockSize).toBe('number');
      expect(typeof config.updateIntervalMs).toBe('number');
    });

    it('should return valid streaming mode values', () => {
      const validModes: StreamingMode[] = ['partial', 'block', 'off'];
      const config = buildStreamingConfig();

      expect(validModes).toContain(config.mode);
    });
  });
});

describe('Threaded Mode Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getThreadedModeEnabled', () => {
    it('should return false by default', () => {
      delete process.env['THREADED_MODE_ENABLED'];
      expect(getThreadedModeEnabled()).toBe(false);
    });

    it('should return true when set to "true"', () => {
      process.env['THREADED_MODE_ENABLED'] = 'true';
      expect(getThreadedModeEnabled()).toBe(true);
    });

    it('should return true when set to "1"', () => {
      process.env['THREADED_MODE_ENABLED'] = '1';
      expect(getThreadedModeEnabled()).toBe(true);
    });

    it('should return false when set to "false"', () => {
      process.env['THREADED_MODE_ENABLED'] = 'false';
      expect(getThreadedModeEnabled()).toBe(false);
    });
  });

  describe('getThreadedAutoCreate', () => {
    it('should return false by default', () => {
      delete process.env['THREADED_AUTO_CREATE'];
      expect(getThreadedAutoCreate()).toBe(false);
    });

    it('should return true when set to "true"', () => {
      process.env['THREADED_AUTO_CREATE'] = 'true';
      expect(getThreadedAutoCreate()).toBe(true);
    });

    it('should return true when set to "1"', () => {
      process.env['THREADED_AUTO_CREATE'] = '1';
      expect(getThreadedAutoCreate()).toBe(true);
    });

    it('should return false when set to "false"', () => {
      process.env['THREADED_AUTO_CREATE'] = 'false';
      expect(getThreadedAutoCreate()).toBe(false);
    });
  });

  describe('getThreadedDefaultTopic', () => {
    it('should return undefined by default', () => {
      delete process.env['THREADED_DEFAULT_TOPIC'];
      expect(getThreadedDefaultTopic()).toBeUndefined();
    });

    it('should return the configured value', () => {
      process.env['THREADED_DEFAULT_TOPIC'] = 'Claude Chat';
      expect(getThreadedDefaultTopic()).toBe('Claude Chat');
    });

    it('should return undefined for empty string', () => {
      process.env['THREADED_DEFAULT_TOPIC'] = '';
      expect(getThreadedDefaultTopic()).toBeUndefined();
    });

    it('should return undefined for whitespace-only string', () => {
      process.env['THREADED_DEFAULT_TOPIC'] = '   ';
      expect(getThreadedDefaultTopic()).toBeUndefined();
    });

    it('should trim whitespace from value', () => {
      process.env['THREADED_DEFAULT_TOPIC'] = '  My Topic  ';
      expect(getThreadedDefaultTopic()).toBe('My Topic');
    });
  });

  describe('buildThreadedModeConfig', () => {
    it('should return default config when no env vars are set', () => {
      delete process.env['THREADED_MODE_ENABLED'];
      delete process.env['THREADED_AUTO_CREATE'];
      delete process.env['THREADED_DEFAULT_TOPIC'];

      const config = buildThreadedModeConfig();

      expect(config).toEqual({
        enabled: false,
        autoCreateTopics: false,
        topicNamePrefix: undefined,
      });
    });

    it('should return configured values from env vars', () => {
      process.env['THREADED_MODE_ENABLED'] = 'true';
      process.env['THREADED_AUTO_CREATE'] = 'true';
      process.env['THREADED_DEFAULT_TOPIC'] = 'Session';

      const config = buildThreadedModeConfig();

      expect(config).toEqual({
        enabled: true,
        autoCreateTopics: true,
        topicNamePrefix: 'Session',
      });
    });

    it('should return correct type for ThreadedModeConfig', () => {
      const config = buildThreadedModeConfig();

      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.autoCreateTopics).toBe('boolean');
      // topicNamePrefix can be string or undefined
      expect(
        config.topicNamePrefix === undefined || typeof config.topicNamePrefix === 'string'
      ).toBe(true);
    });

    it('should handle partial configuration', () => {
      process.env['THREADED_MODE_ENABLED'] = 'true';
      delete process.env['THREADED_AUTO_CREATE'];
      delete process.env['THREADED_DEFAULT_TOPIC'];

      const config = buildThreadedModeConfig();

      expect(config.enabled).toBe(true);
      expect(config.autoCreateTopics).toBe(false);
      expect(config.topicNamePrefix).toBeUndefined();
    });
  });
});

describe('Configuration Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Streaming Mode Validation', () => {
    it('should only accept valid streaming modes', () => {
      const validModes = ['partial', 'block', 'off'];
      const invalidModes = ['stream', 'full', 'chunked', 'invalid', '123', '', ' '];

      for (const mode of validModes) {
        process.env['STREAMING_MODE'] = mode;
        expect(['partial', 'block', 'off']).toContain(getStreamingMode());
      }

      for (const mode of invalidModes) {
        process.env['STREAMING_MODE'] = mode;
        expect(getStreamingMode()).toBe('partial'); // Should return default
      }
    });
  });

  describe('Numeric Value Validation', () => {
    it('should handle negative numbers for block size', () => {
      process.env['STREAMING_BLOCK_SIZE'] = '-10';
      expect(getStreamingBlockSize()).toBe(-10); // parseNumber allows negatives
    });

    it('should handle very large numbers for update interval', () => {
      process.env['STREAMING_UPDATE_INTERVAL_MS'] = '999999999';
      expect(getStreamingUpdateInterval()).toBe(999999999);
    });
  });
});
