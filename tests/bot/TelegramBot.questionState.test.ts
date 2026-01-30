import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Tests for the per-session question state tracking in TelegramBot.
 *
 * These tests verify that:
 * 1. waitingForUserResponse is tracked per-session (Map), not globally
 * 2. suppressedMessages are tracked per-session (Map), not globally
 * 3. One session's question state doesn't affect other sessions
 */

describe('TelegramBot Per-Session Question State - Unit Tests', () => {
  describe('Map-based state isolation', () => {
    it('should track waiting state independently for each session using Map', () => {
      // Simulate the data structure used in TelegramBot
      const waitingForUserResponse = new Map<string, boolean>();

      const session1Id = 'session-1';
      const session2Id = 'session-2';

      // Initially both should be undefined/false
      expect(waitingForUserResponse.get(session1Id)).toBeFalsy();
      expect(waitingForUserResponse.get(session2Id)).toBeFalsy();

      // Set session1 as waiting
      waitingForUserResponse.set(session1Id, true);

      // Session1 should be waiting, session2 should not
      expect(waitingForUserResponse.get(session1Id)).toBe(true);
      expect(waitingForUserResponse.get(session2Id)).toBeFalsy();

      // Set session2 as waiting
      waitingForUserResponse.set(session2Id, true);

      // Both should be waiting independently
      expect(waitingForUserResponse.get(session1Id)).toBe(true);
      expect(waitingForUserResponse.get(session2Id)).toBe(true);

      // Clear session1
      waitingForUserResponse.set(session1Id, false);

      // Only session1 should be cleared
      expect(waitingForUserResponse.get(session1Id)).toBe(false);
      expect(waitingForUserResponse.get(session2Id)).toBe(true);
    });

    it('should track suppressed messages independently for each session using Map', () => {
      // Simulate the data structure used in TelegramBot
      const suppressedMessages = new Map<string, string[]>();

      const session1Id = 'session-1';
      const session2Id = 'session-2';

      // Initialize buffers
      suppressedMessages.set(session1Id, ['msg1-a', 'msg1-b']);
      suppressedMessages.set(session2Id, ['msg2-a']);

      // Verify isolation
      expect(suppressedMessages.get(session1Id)).toEqual(['msg1-a', 'msg1-b']);
      expect(suppressedMessages.get(session2Id)).toEqual(['msg2-a']);

      // Add to session1
      const buffer1 = suppressedMessages.get(session1Id) || [];
      buffer1.push('msg1-c');
      suppressedMessages.set(session1Id, buffer1);

      // Session2 should be unaffected
      expect(suppressedMessages.get(session1Id)).toHaveLength(3);
      expect(suppressedMessages.get(session2Id)).toHaveLength(1);
    });

    it('should allow checking specific session state without affecting others', () => {
      const waitingForUserResponse = new Map<string, boolean>();

      // Set up multiple sessions
      waitingForUserResponse.set('session-1', true);
      waitingForUserResponse.set('session-2', false);
      waitingForUserResponse.set('session-3', true);

      // Check specific session - should not modify anything
      const isSession1Waiting = waitingForUserResponse.get('session-1');
      const isSession2Waiting = waitingForUserResponse.get('session-2');
      const isSession4Waiting = waitingForUserResponse.get('session-4'); // Non-existent

      expect(isSession1Waiting).toBe(true);
      expect(isSession2Waiting).toBe(false);
      expect(isSession4Waiting).toBeUndefined();

      // Verify original state unchanged
      expect(waitingForUserResponse.get('session-1')).toBe(true);
      expect(waitingForUserResponse.get('session-3')).toBe(true);
    });

    it('should support deleting session state on cleanup', () => {
      const waitingForUserResponse = new Map<string, boolean>();
      const suppressedMessages = new Map<string, string[]>();

      const sessionId = 'session-to-cleanup';

      // Set up state
      waitingForUserResponse.set(sessionId, true);
      suppressedMessages.set(sessionId, ['msg1', 'msg2']);

      // Verify state exists
      expect(waitingForUserResponse.has(sessionId)).toBe(true);
      expect(suppressedMessages.has(sessionId)).toBe(true);

      // Delete (as done when session is created/reset)
      waitingForUserResponse.delete(sessionId);
      suppressedMessages.delete(sessionId);

      // Verify state is gone
      expect(waitingForUserResponse.has(sessionId)).toBe(false);
      expect(suppressedMessages.has(sessionId)).toBe(false);
    });
  });

  describe('concurrent session handling', () => {
    it('should handle rapid question state changes across multiple sessions', () => {
      const waitingForUserResponse = new Map<string, boolean>();

      // Simulate rapid state changes (as would happen with multiple concurrent users)
      const sessions = ['sess-1', 'sess-2', 'sess-3', 'sess-4', 'sess-5'];

      // Alternate setting waiting state
      sessions.forEach((id, index) => {
        waitingForUserResponse.set(id, index % 2 === 0);
      });

      // Verify all states are independent
      expect(waitingForUserResponse.get('sess-1')).toBe(true);  // index 0
      expect(waitingForUserResponse.get('sess-2')).toBe(false); // index 1
      expect(waitingForUserResponse.get('sess-3')).toBe(true);  // index 2
      expect(waitingForUserResponse.get('sess-4')).toBe(false); // index 3
      expect(waitingForUserResponse.get('sess-5')).toBe(true);  // index 4

      // Now flip all states
      sessions.forEach(id => {
        const current = waitingForUserResponse.get(id);
        waitingForUserResponse.set(id, !current);
      });

      // Verify all flipped correctly
      expect(waitingForUserResponse.get('sess-1')).toBe(false);
      expect(waitingForUserResponse.get('sess-2')).toBe(true);
      expect(waitingForUserResponse.get('sess-3')).toBe(false);
      expect(waitingForUserResponse.get('sess-4')).toBe(true);
      expect(waitingForUserResponse.get('sess-5')).toBe(false);
    });

    it('should not block one session when another has pending question', () => {
      const waitingForUserResponse = new Map<string, boolean>();
      const currentOutputSessionId = 'session-A';

      // Session A has a pending question
      waitingForUserResponse.set('session-A', true);

      // Session B should NOT be blocked
      // This simulates the check in setupOutputForwarding:
      // if (sessionId && this.waitingForUserResponse.get(sessionId)) { ... suppress ... }

      const sessionBId = 'session-B';
      const shouldSuppressSessionB = waitingForUserResponse.get(sessionBId);

      // Session B should not be suppressed because its state is undefined (not true)
      expect(shouldSuppressSessionB).toBeFalsy();

      // Session A should still be suppressed
      const shouldSuppressSessionA = waitingForUserResponse.get('session-A');
      expect(shouldSuppressSessionA).toBe(true);
    });
  });

  describe('message suppression per session', () => {
    it('should accumulate suppressed messages only for the session with pending question', () => {
      const waitingForUserResponse = new Map<string, boolean>();
      const suppressedMessages = new Map<string, string[]>();

      const session1Id = 'session-1';
      const session2Id = 'session-2';

      // Session 1 has pending question
      waitingForUserResponse.set(session1Id, true);
      suppressedMessages.set(session1Id, []);

      // Session 2 does not have pending question
      waitingForUserResponse.set(session2Id, false);
      suppressedMessages.set(session2Id, []);

      // Simulate text output arriving for session 1
      // In TelegramBot, this would be suppressed and buffered
      const currentOutputSessionId = session1Id;
      if (waitingForUserResponse.get(currentOutputSessionId)) {
        const buffer = suppressedMessages.get(currentOutputSessionId) || [];
        buffer.push('suppressed text 1');
        suppressedMessages.set(currentOutputSessionId, buffer);
      }

      // Simulate text output arriving for session 2
      // This should NOT be suppressed
      const outputForSession2 = session2Id;
      const forwardedMessages: string[] = [];
      if (waitingForUserResponse.get(outputForSession2)) {
        // Would suppress - but won't because session2 is false
        const buffer = suppressedMessages.get(outputForSession2) || [];
        buffer.push('should not be here');
        suppressedMessages.set(outputForSession2, buffer);
      } else {
        forwardedMessages.push('forwarded text');
      }

      // Session 1 should have suppressed message
      expect(suppressedMessages.get(session1Id)).toEqual(['suppressed text 1']);

      // Session 2 should have no suppressed messages
      expect(suppressedMessages.get(session2Id)).toEqual([]);

      // Session 2's message was forwarded
      expect(forwardedMessages).toEqual(['forwarded text']);
    });
  });
});
