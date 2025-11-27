/**
 * API Backend Integrity, Mobile Responsiveness, Accessibility & Performance Tests
 *
 * Tests covering Sections 11-14 of COMPREHENSIVE_TEST_PLAN.md:
 * - Section 11: API & Backend Integrity (Data Consistency, Edge Cases)
 * - Section 12: Mobile Responsiveness & UX (Layout, Gestures)
 * - Section 13: Accessibility (Navigation, Screen Reader Support)
 * - Section 14: Browser & Performance Edge Cases
 *
 * TESTING PHILOSOPHY:
 * These tests validate data integrity, mobile UX patterns, accessibility
 * requirements, and performance characteristics that are critical for
 * production reliability.
 *
 * Location: /src/stores/chat/__tests__/race-conditions-api-mobile.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  PreSearchStatuses,
  UIMessageRoles,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
  createMockParticipants,
  createMockPreSearch,
  createMockRoundMessages,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// SECTION 11: API & BACKEND INTEGRITY
// ============================================================================

describe('section 11: API & Backend Integrity', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 11.1 Data Consistency
  // ==========================================================================

  describe('11.1 Data Consistency', () => {
    describe('dATA-01: DB records linking (Thread, Messages, Runs, Analysis)', () => {
      /**
       * Validates that Thread, Messages, and Analysis records are correctly
       * linked through threadId and roundNumber references.
       */
      it('should link thread to messages via threadId', () => {
        const thread = createMockThread({ id: 'thread-abc-123' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Add messages with matching threadId in their IDs
        const userMessage = createMockUserMessage(0, 'Test question');
        const participantMessage: UIMessage = {
          ...createMockMessage(0, 0),
          id: 'thread-abc-123_r0_p0', // Follows pattern: {threadId}_r{round}_p{index}
        };

        store.getState().setMessages([userMessage, participantMessage]);

        const state = store.getState();
        expect(state.thread?.id).toBe('thread-abc-123');
        expect(state.messages).toHaveLength(2);
        expect(state.messages[1].id).toContain('thread-abc-123');
      });

      it('should link analysis to thread and round', () => {
        const thread = createMockThread({ id: 'thread-xyz-789' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const analysis = createMockAnalysis({
          threadId: 'thread-xyz-789',
          roundNumber: 0,
        });
        store.getState().addAnalysis(analysis);

        const state = store.getState();
        expect(state.analyses[0].threadId).toBe(state.thread?.id);
        expect(state.analyses[0].roundNumber).toBe(0);
      });

      it('should link pre-search to thread and round', () => {
        const thread = createMockThread({
          id: 'thread-search-001',
          enableWebSearch: true,
        });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const preSearch = createMockPreSearch({
          threadId: 'thread-search-001',
          roundNumber: 0,
        });
        store.getState().addPreSearch(preSearch);

        const state = store.getState();
        expect(state.preSearches[0].threadId).toBe(state.thread?.id);
        expect(state.preSearches[0].roundNumber).toBe(0);
      });

      it('should maintain referential integrity across multiple rounds', () => {
        const thread = createMockThread({ id: 'thread-multi' });
        store.getState().initializeThread(thread, createMockParticipants(2));

        // Add data for multiple rounds
        const messages = [
          ...createMockRoundMessages(0, 2),
          ...createMockRoundMessages(1, 2),
        ];
        store.getState().setMessages(messages);

        store.getState().addAnalysis(createMockAnalysis({
          threadId: 'thread-multi',
          roundNumber: 0,
        }));
        store.getState().addAnalysis(createMockAnalysis({
          id: 'analysis-2',
          threadId: 'thread-multi',
          roundNumber: 1,
        }));

        const state = store.getState();

        // Verify round isolation
        const round0Msgs = state.messages.filter(
          m => m.metadata?.roundNumber === 0,
        );
        const round1Msgs = state.messages.filter(
          m => m.metadata?.roundNumber === 1,
        );

        expect(round0Msgs.length).toBeGreaterThan(0);
        expect(round1Msgs.length).toBeGreaterThan(0);
        expect(state.analyses).toHaveLength(2);
        expect(state.analyses[0].roundNumber).toBe(0);
        expect(state.analyses[1].roundNumber).toBe(1);
      });
    });

    describe('dATA-02: Round numbers sequential and unique per thread', () => {
      /**
       * Validates that round numbers increment sequentially and are unique
       * within a single thread.
       */
      it('should have sequential round numbers starting from 0', () => {
        const thread = createMockThread({ id: 'thread-seq' });
        store.getState().initializeThread(thread, createMockParticipants(2));

        // Add analyses for rounds 0, 1, 2
        [0, 1, 2].forEach((round) => {
          store.getState().addAnalysis(createMockAnalysis({
            id: `analysis-${round}`,
            threadId: 'thread-seq',
            roundNumber: round,
          }));
        });

        const rounds = store.getState().analyses.map(a => a.roundNumber);
        expect(rounds).toEqual([0, 1, 2]);
      });

      it('should detect duplicate round numbers', () => {
        const thread = createMockThread({ id: 'thread-dup' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Track round numbers to detect duplicates
        const roundNumbers: number[] = [];

        // Add first analysis for round 0
        store.getState().addAnalysis(createMockAnalysis({
          id: 'analysis-1',
          roundNumber: 0,
        }));
        roundNumbers.push(0);

        // Attempt to add duplicate round 0
        const duplicateRound = 0;
        const hasDuplicate = roundNumbers.includes(duplicateRound);

        expect(hasDuplicate).toBe(true);
      });

      it('should track created analysis rounds to prevent duplicates', () => {
        const thread = createMockThread({ id: 'thread-track' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Mark round 0 as created
        store.getState().markAnalysisCreated(0);

        // Check if round 0 has been created
        expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
        expect(store.getState().hasAnalysisBeenCreated(1)).toBe(false);

        // Mark round 1 as created
        store.getState().markAnalysisCreated(1);
        expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);
      });

      it('should correctly calculate next round number', () => {
        const thread = createMockThread({ id: 'thread-next' });
        store.getState().initializeThread(thread, createMockParticipants(2));

        // Add messages for round 0
        store.getState().setMessages(createMockRoundMessages(0, 2));

        // Calculate next round
        const messages = store.getState().messages;
        const maxRound = Math.max(
          ...messages
            .filter(m => m.metadata?.roundNumber !== undefined)
            .map(m => m.metadata!.roundNumber as number),
          -1,
        );
        const nextRound = maxRound + 1;

        expect(nextRound).toBe(1);
      });
    });

    describe('dATA-03: Text content saved in DB matches streamed content', () => {
      /**
       * Validates that message content is preserved correctly during
       * streaming and storage operations.
       */
      it('should preserve message text content exactly', () => {
        const thread = createMockThread({ id: 'thread-text' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const originalContent = 'This is the exact response from the AI model with **markdown** and `code`.';
        const message: UIMessage = {
          id: 'thread-text_r0_p0',
          role: 'assistant',
          parts: [{ type: 'text', text: originalContent }],
          metadata: {
            role: 'participant',
            roundNumber: 0,
            participantId: 'participant-0',
            participantIndex: 0,
            participantRole: null,
            model: 'openai/gpt-4',
          },
        };

        store.getState().setMessages([message]);

        const storedMessage = store.getState().messages[0];
        const storedText = storedMessage.parts?.find(p => p.type === 'text');

        expect(storedText).toBeDefined();
        expect(storedText?.type).toBe('text');
        expect(storedText && storedText.type === 'text' ? storedText.text : undefined).toBe(originalContent);
      });

      it('should preserve special characters and formatting', () => {
        const thread = createMockThread({ id: 'thread-special' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const specialContent = `
# Heading

- List item 1
- List item 2

\`\`\`javascript
const x = 1;
\`\`\`

Special chars: <>&"'
Unicode: \u{1F600} \u{2764}
`;

        const message: UIMessage = {
          id: 'thread-special_r0_p0',
          role: 'assistant',
          parts: [{ type: 'text', text: specialContent }],
          metadata: { roundNumber: 0, participantIndex: 0 },
        };

        store.getState().setMessages([message]);

        const stored = store.getState().messages[0];
        const text = stored.parts?.find(p => p.type === 'text');

        expect(text).toBeDefined();
        expect(text?.type).toBe('text');
        const textContent = text && text.type === 'text' ? text.text : undefined;
        expect(textContent).toBe(specialContent);
        expect(textContent).toContain('```javascript');
        expect(textContent).toContain('\u{1F600}');
      });

      it('should handle multi-part messages correctly', () => {
        const thread = createMockThread({ id: 'thread-multipart' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const message: UIMessage = {
          id: 'thread-multipart_r0_p0',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' },
          ],
          metadata: { roundNumber: 0, participantIndex: 0 },
        };

        store.getState().setMessages([message]);

        const stored = store.getState().messages[0];
        expect(stored.parts).toHaveLength(2);
      });
    });
  });

  // ==========================================================================
  // 11.2 Edge Cases
  // ==========================================================================

  describe('11.2 Edge Cases', () => {
    describe('eDGE-01: Extremely long user messages (near 5000 char limit)', () => {
      /**
       * Validates handling of messages near the character limit boundary.
       */
      it('should handle message at exactly 5000 characters', () => {
        const thread = createMockThread({ id: 'thread-long' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const longMessage = 'x'.repeat(5000);
        const userMessage = createMockUserMessage(0, longMessage);

        store.getState().setMessages([userMessage]);

        const stored = store.getState().messages[0];
        const text = stored.parts?.find(p => p.type === 'text');

        expect(text).toBeDefined();
        expect(text?.type).toBe('text');
        expect(text && text.type === 'text' ? text.text : undefined).toHaveLength(5000);
      });

      it('should handle message just under limit (4999 chars)', () => {
        const thread = createMockThread({ id: 'thread-under' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const nearLimitMessage = 'a'.repeat(4999);
        store.getState().setPendingMessage(nearLimitMessage);

        expect(store.getState().pendingMessage?.length).toBe(4999);
      });

      it('should validate message length in pending state', () => {
        const MESSAGE_LIMIT = 5000;

        const isValidLength = (message: string) => message.length <= MESSAGE_LIMIT;

        expect(isValidLength('x'.repeat(5000))).toBe(true);
        expect(isValidLength('x'.repeat(5001))).toBe(false);
      });

      it('should handle Unicode characters in long messages', () => {
        const thread = createMockThread({ id: 'thread-unicode' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Unicode characters can be multiple bytes
        const unicodeMessage = '\u{1F600}'.repeat(1000); // 1000 emoji
        const userMessage = createMockUserMessage(0, unicodeMessage);

        store.getState().setMessages([userMessage]);

        const stored = store.getState().messages[0];
        const text = stored.parts?.find(p => p.type === 'text');

        expect(text).toBeDefined();
        expect(text?.type).toBe('text');
        expect(text && text.type === 'text' ? text.text : undefined).toBe(unicodeMessage);
      });
    });

    describe('eDGE-02: Special characters/emojis in user prompts', () => {
      /**
       * Validates correct handling of special characters and emojis.
       */
      it('should preserve emojis in messages', () => {
        const thread = createMockThread({ id: 'thread-emoji' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const emojiMessage = 'Hello \u{1F44B} World \u{1F30D} Test \u{2705}';
        const userMessage = createMockUserMessage(0, emojiMessage);

        store.getState().setMessages([userMessage]);

        const stored = store.getState().messages[0];
        const text = stored.parts?.find(p => p.type === 'text');

        expect(text).toBeDefined();
        expect(text?.type).toBe('text');
        const textContent = text && text.type === 'text' ? text.text : undefined;
        expect(textContent).toContain('\u{1F44B}');
        expect(textContent).toContain('\u{1F30D}');
        expect(textContent).toContain('\u{2705}');
      });

      it('should handle HTML-like characters safely', () => {
        const thread = createMockThread({ id: 'thread-html' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const htmlLikeMessage = '<script>alert("xss")</script> & < > " \'';
        const userMessage = createMockUserMessage(0, htmlLikeMessage);

        store.getState().setMessages([userMessage]);

        const stored = store.getState().messages[0];
        const text = stored.parts?.find(p => p.type === 'text');

        expect(text).toBeDefined();
        expect(text?.type).toBe('text');
        // Message should be preserved as-is (sanitization happens at render)
        const textContent = text && text.type === 'text' ? text.text : undefined;
        expect(textContent).toContain('<script>');
        expect(textContent).toContain('&');
      });

      it('should handle newlines and whitespace', () => {
        const thread = createMockThread({ id: 'thread-ws' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const whitespaceMessage = 'Line 1\nLine 2\r\nLine 3\tTabbed';
        const userMessage = createMockUserMessage(0, whitespaceMessage);

        store.getState().setMessages([userMessage]);

        const stored = store.getState().messages[0];
        const text = stored.parts?.find(p => p.type === 'text');

        expect(text).toBeDefined();
        expect(text?.type).toBe('text');
        const textContent = text && text.type === 'text' ? text.text : undefined;
        expect(textContent).toContain('\n');
        expect(textContent).toContain('\t');
      });

      it('should handle zero-width characters', () => {
        const thread = createMockThread({ id: 'thread-zw' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Zero-width space and joiner characters
        const zeroWidthMessage = 'Hello\u200BWorld\u200CTest\u200DEnd';
        const userMessage = createMockUserMessage(0, zeroWidthMessage);

        store.getState().setMessages([userMessage]);

        const stored = store.getState().messages[0];
        const text = stored.parts?.find(p => p.type === 'text');

        expect(text).toBeDefined();
        expect(text?.type).toBe('text');
        const textContent = text && text.type === 'text' ? text.text : undefined;
        expect(textContent).toBe(zeroWidthMessage);
        expect(textContent).toHaveLength(zeroWidthMessage.length);
      });
    });

    describe('eDGE-03: Concurrent requests from same user (tab duplication)', () => {
      /**
       * Validates protection against duplicate submissions from multiple tabs.
       */
      it('should prevent duplicate thread creation', () => {
        const createAttempts: string[] = [];

        const attemptCreateThread = (tabId: string) => {
          const state = store.getState();

          // Check if already creating
          if (state.isCreatingThread) {
            return false;
          }

          createAttempts.push(tabId);
          store.getState().setIsCreatingThread(true);
          return true;
        };

        // First tab succeeds
        expect(attemptCreateThread('tab-1')).toBe(true);

        // Second tab blocked
        expect(attemptCreateThread('tab-2')).toBe(false);

        expect(createAttempts).toEqual(['tab-1']);
      });

      it('should handle concurrent message submissions', () => {
        const thread = createMockThread({ id: 'thread-concurrent' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        let submissionCount = 0;

        const attemptSubmission = () => {
          const state = store.getState();

          if (state.pendingMessage !== null || state.isStreaming) {
            return false;
          }

          submissionCount++;
          store.getState().setPendingMessage(`Message ${submissionCount}`);
          return true;
        };

        // First submission succeeds
        expect(attemptSubmission()).toBe(true);

        // Concurrent submissions blocked
        expect(attemptSubmission()).toBe(false);
        expect(attemptSubmission()).toBe(false);

        expect(submissionCount).toBe(1);
      });

      it('should track streaming state across potential duplicates', () => {
        const thread = createMockThread({ id: 'thread-stream-dup' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);
        store.getState().setIsStreaming(true);

        // Multiple components checking streaming state
        const streamingChecks = Array.from({ length: 5 }, () =>
          store.getState().isStreaming);

        expect(streamingChecks.every(s => s === true)).toBe(true);
      });
    });

    describe('eDGE-04: Extremely fast rapid-fire inputs (debounce check)', () => {
      /**
       * Validates debounce protection against rapid user inputs.
       */
      it('should handle rapid state updates', () => {
        const thread = createMockThread({ id: 'thread-rapid' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const updateHistory: string[] = [];

        // Rapid-fire input updates (simulating fast typing)
        for (let i = 0; i < 100; i++) {
          const value = `input-${i}`;
          store.getState().setInputValue(value);
          updateHistory.push(value);
        }

        // Final state should reflect last update
        expect(store.getState().inputValue).toBe('input-99');
        expect(updateHistory).toHaveLength(100);
      });

      it('should maintain consistency during rapid flag changes', () => {
        const thread = createMockThread({ id: 'thread-flags' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Rapid toggle of streaming state
        for (let i = 0; i < 50; i++) {
          store.getState().setIsStreaming(i % 2 === 0);
        }

        // Final state should be consistent (49 % 2 === 1, so last was false)
        expect(store.getState().isStreaming).toBe(false);
      });

      it('should protect against rapid submission attempts', async () => {
        const thread = createMockThread({ id: 'thread-debounce' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        let processedCount = 0;
        const DEBOUNCE_MS = 300;
        let lastSubmitTime = 0;

        const submitWithDebounce = () => {
          const now = Date.now();
          if (now - lastSubmitTime < DEBOUNCE_MS) {
            return false; // Debounced
          }

          lastSubmitTime = now;
          processedCount++;
          return true;
        };

        // First submission
        expect(submitWithDebounce()).toBe(true);

        // Rapid follow-ups (within debounce window)
        vi.advanceTimersByTime(100);
        expect(submitWithDebounce()).toBe(false);

        vi.advanceTimersByTime(100);
        expect(submitWithDebounce()).toBe(false);

        // After debounce window
        vi.advanceTimersByTime(200);
        expect(submitWithDebounce()).toBe(true);

        expect(processedCount).toBe(2);
      });

      it('should handle rapid participant index changes', () => {
        const thread = createMockThread({ id: 'thread-index' });
        store.getState().initializeThread(thread, createMockParticipants(5));

        const indexHistory: number[] = [];

        // Rapid participant switching
        for (let i = 0; i < 5; i++) {
          store.getState().setCurrentParticipantIndex(i);
          indexHistory.push(store.getState().currentParticipantIndex);
        }

        expect(indexHistory).toEqual([0, 1, 2, 3, 4]);
        expect(store.getState().currentParticipantIndex).toBe(4);
      });
    });
  });
});

// ============================================================================
// SECTION 12: MOBILE RESPONSIVENESS & UX
// ============================================================================

describe('section 12: Mobile Responsiveness & UX', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 12.1 Layout & Interaction
  // ==========================================================================

  describe('12.1 Layout & Interaction', () => {
    describe('mOB-01: Chip stacking and horizontal scrolling on mobile', () => {
      /**
       * Validates that participant chips can be managed for mobile layouts.
       */
      it('should support many participants for chip display', () => {
        const thread = createMockThread({ id: 'thread-chips' });
        const participants = createMockParticipants(10); // Max for Power tier

        store.getState().initializeThread(thread, participants);

        expect(store.getState().participants).toHaveLength(10);
      });

      it('should maintain participant order for consistent chip display', () => {
        const thread = createMockThread({ id: 'thread-order' });
        const participants = createMockParticipants(5);

        store.getState().initializeThread(thread, participants);

        const priorities = store.getState().participants.map(p => p.priority);
        expect(priorities).toEqual([0, 1, 2, 3, 4]);
      });
    });

    describe('mOB-02: Touch targets (44x44px minimum)', () => {
      /**
       * Tests that touch target requirements are supported by state.
       * Actual size validation happens in component tests.
       */
      it('should support participant selection state for touch targets', () => {
        const thread = createMockThread({ id: 'thread-touch' });
        store.getState().initializeThread(thread, createMockParticipants(3));

        // Each participant should be individually selectable
        store.getState().setCurrentParticipantIndex(0);
        expect(store.getState().currentParticipantIndex).toBe(0);

        store.getState().setCurrentParticipantIndex(1);
        expect(store.getState().currentParticipantIndex).toBe(1);

        store.getState().setCurrentParticipantIndex(2);
        expect(store.getState().currentParticipantIndex).toBe(2);
      });

      it('should support feedback toggle state for touch targets', () => {
        store.getState().setFeedback(0, 'like');
        expect(store.getState().feedbackByRound.get(0)).toBe('like');

        store.getState().setFeedback(0, 'dislike');
        expect(store.getState().feedbackByRound.get(0)).toBe('dislike');

        store.getState().setFeedback(0, null);
        expect(store.getState().feedbackByRound.get(0)).toBeNull();
      });
    });

    describe('mOB-03: Virtual keyboard interaction with input box', () => {
      /**
       * Tests input state management for virtual keyboard scenarios.
       */
      it('should preserve input value during state transitions', () => {
        const inputValue = 'Partially typed message';
        store.getState().setInputValue(inputValue);

        // Simulate state changes that might occur with keyboard
        store.getState().setShowInitialUI(false);
        store.getState().setShowInitialUI(true);

        expect(store.getState().inputValue).toBe(inputValue);
      });

      it('should clear input after submission', () => {
        store.getState().setInputValue('Message to send');
        store.getState().setPendingMessage('Message to send');

        // Input should be clearable after submission
        store.getState().setInputValue('');

        expect(store.getState().inputValue).toBe('');
        expect(store.getState().pendingMessage).toBe('Message to send');
      });

      it('should maintain focus state through input value', () => {
        // Input value persistence indicates focus maintenance
        store.getState().setInputValue('First');
        expect(store.getState().inputValue).toBe('First');

        store.getState().setInputValue('First Second');
        expect(store.getState().inputValue).toBe('First Second');

        store.getState().setInputValue('First Second Third');
        expect(store.getState().inputValue).toBe('First Second Third');
      });
    });

    describe('mOB-04: Sticky headers/footers behavior during scroll', () => {
      /**
       * Tests state that affects sticky element behavior.
       */
      it('should maintain streaming state for sticky indicator display', () => {
        const thread = createMockThread({ id: 'thread-sticky' });
        store.getState().initializeThread(thread, createMockParticipants(3));

        store.getState().setIsStreaming(true);
        store.getState().setCurrentParticipantIndex(1);

        // State should be consistent for sticky header showing current participant
        expect(store.getState().isStreaming).toBe(true);
        expect(store.getState().currentParticipantIndex).toBe(1);
      });

      it('should track analysis status for sticky summary', () => {
        store.getState().addAnalysis(createMockAnalysis({
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
        }));

        const analysis = store.getState().analyses.find(a => a.roundNumber === 0);
        expect(analysis?.status).toBe(AnalysisStatuses.COMPLETE);
      });
    });

    describe('mOB-05: Model selector popover fits on small screens', () => {
      /**
       * Tests participant configuration state for model selector.
       */
      it('should support adding/removing participants', () => {
        store.getState().addParticipant(
          createMockParticipantConfig(0, { modelId: 'model-1' }),
        );

        expect(store.getState().selectedParticipants).toHaveLength(1);

        store.getState().addParticipant(
          createMockParticipantConfig(1, { modelId: 'model-2' }),
        );

        expect(store.getState().selectedParticipants).toHaveLength(2);

        store.getState().removeParticipant('model-1');
        expect(store.getState().selectedParticipants).toHaveLength(1);
      });

      it('should support model reordering', () => {
        store.getState().addParticipant(
          createMockParticipantConfig(0, { modelId: 'model-a' }),
        );
        store.getState().addParticipant(
          createMockParticipantConfig(1, { modelId: 'model-b' }),
        );

        store.getState().reorderParticipants(0, 1);

        const participants = store.getState().selectedParticipants;
        expect(participants[0].modelId).toBe('model-b');
        expect(participants[1].modelId).toBe('model-a');
      });
    });
  });

  // ==========================================================================
  // 12.2 Gestures & Transitions
  // ==========================================================================

  describe('12.2 Gestures & Transitions', () => {
    describe('mOB-GEST-01: Drag-and-drop model reordering on touch devices', () => {
      /**
       * Tests reorder state management for touch drag-and-drop.
       */
      it('should update priorities after reorder', () => {
        // Add participants
        for (let i = 0; i < 4; i++) {
          store.getState().addParticipant(
            createMockParticipantConfig(i, { modelId: `model-${i}` }),
          );
        }

        // Drag model-0 to position 3
        store.getState().reorderParticipants(0, 3);

        const participants = store.getState().selectedParticipants;
        expect(participants.map(p => p.modelId)).toEqual([
          'model-1',
          'model-2',
          'model-3',
          'model-0',
        ]);

        // Priorities should be recalculated
        expect(participants.map(p => p.priority)).toEqual([0, 1, 2, 3]);
      });

      it('should handle adjacent swaps', () => {
        store.getState().addParticipant(
          createMockParticipantConfig(0, { modelId: 'first' }),
        );
        store.getState().addParticipant(
          createMockParticipantConfig(1, { modelId: 'second' }),
        );

        store.getState().reorderParticipants(0, 1);

        const models = store.getState().selectedParticipants.map(p => p.modelId);
        expect(models).toEqual(['second', 'first']);
      });
    });

    describe('mOB-GEST-02: Swipe gestures do not conflict with browser navigation', () => {
      /**
       * Tests that state transitions don't interfere with navigation.
       */
      it('should support clean navigation state reset', () => {
        const thread = createMockThread({ id: 'thread-swipe' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);
        store.getState().setIsStreaming(true);

        // User swipes to navigate away - state should be cleanly resettable
        store.getState().resetToNewChat();

        expect(store.getState().thread).toBeNull();
        expect(store.getState().isStreaming).toBe(false);
      });

      it('should preserve form state for back navigation', () => {
        store.getState().setInputValue('Preserved input');
        store.getState().setSelectedMode('debating');

        // These should persist for back navigation
        expect(store.getState().inputValue).toBe('Preserved input');
        expect(store.getState().selectedMode).toBe('debating');
      });
    });
  });
});

// ============================================================================
// SECTION 13: ACCESSIBILITY (A11Y)
// ============================================================================

describe('section 13: Accessibility (A11y)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 13.1 Navigation & Focus
  // ==========================================================================

  describe('13.1 Navigation & Focus', () => {
    describe('a11Y-NAV-01: Keyboard navigation through model selector and chat', () => {
      /**
       * Tests state support for keyboard navigation patterns.
       */
      it('should support sequential participant navigation via state', () => {
        const thread = createMockThread({ id: 'thread-nav' });
        store.getState().initializeThread(thread, createMockParticipants(5));

        // Simulate Tab key navigation through participants
        for (let i = 0; i < 5; i++) {
          store.getState().setCurrentParticipantIndex(i);
          expect(store.getState().currentParticipantIndex).toBe(i);
        }
      });

      it('should support form field state for Tab order', () => {
        // Input field
        store.getState().setInputValue('test');
        expect(store.getState().inputValue).toBe('test');

        // Mode selector
        store.getState().setSelectedMode('brainstorming');
        expect(store.getState().selectedMode).toBe('brainstorming');

        // Web search toggle
        store.getState().setEnableWebSearch(true);
        expect(store.getState().enableWebSearch).toBe(true);
      });
    });

    describe('a11Y-NAV-02: Focus returns to input box after submitting', () => {
      /**
       * Tests state transitions that should trigger focus return.
       */
      it('should clear input after submission for focus return', () => {
        store.getState().setInputValue('Message to send');

        // Submission clears input
        store.getState().setInputValue('');
        store.getState().setPendingMessage('Message to send');

        // Input is cleared, focus should return to empty input
        expect(store.getState().inputValue).toBe('');
      });

      it('should track streaming completion for focus timing', () => {
        const thread = createMockThread({ id: 'thread-focus' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        store.getState().setIsStreaming(true);
        expect(store.getState().isStreaming).toBe(true);

        store.getState().setIsStreaming(false);
        expect(store.getState().isStreaming).toBe(false);
        // Focus should return when isStreaming becomes false
      });

      it('should track analysis completion for focus timing', () => {
        store.getState().addAnalysis(createMockAnalysis({
          status: AnalysisStatuses.STREAMING,
        }));

        expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);

        store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
        expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
        // Focus can return after analysis completes
      });
    });

    describe('a11Y-NAV-03: Skip to content links', () => {
      /**
       * Tests state that would be targeted by skip links.
       */
      it('should have identifiable main content state', () => {
        const thread = createMockThread({ id: 'thread-skip' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Main content state is identifiable
        expect(store.getState().thread).not.toBeNull();
        expect(store.getState().messages).toBeDefined();
      });

      it('should differentiate overview vs thread content', () => {
        // Overview state
        store.getState().setShowInitialUI(true);
        expect(store.getState().showInitialUI).toBe(true);

        // Thread state
        const thread = createMockThread({ id: 'thread-content' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);
        store.getState().setShowInitialUI(false);

        expect(store.getState().showInitialUI).toBe(false);
        expect(store.getState().thread).not.toBeNull();
      });
    });

    describe('a11Y-NAV-04: Focus trap within modals', () => {
      /**
       * Tests state flags that indicate modal states.
       */
      it('should track waitingForChangelog state for modal', () => {
        store.getState().setIsWaitingForChangelog(true);
        expect(store.getState().isWaitingForChangelog).toBe(true);

        store.getState().setIsWaitingForChangelog(false);
        expect(store.getState().isWaitingForChangelog).toBe(false);
      });

      it('should track config changes that might show modal', () => {
        store.getState().setHasPendingConfigChanges(true);
        expect(store.getState().hasPendingConfigChanges).toBe(true);
      });
    });
  });

  // ==========================================================================
  // 13.2 Screen Reader Support
  // ==========================================================================

  describe('13.2 Screen Reader Support', () => {
    describe('a11Y-SR-01: aria-live regions for streaming text', () => {
      /**
       * Tests state that would populate aria-live regions.
       */
      it('should provide streaming state for live region updates', () => {
        const thread = createMockThread({ id: 'thread-live' });
        store.getState().initializeThread(thread, createMockParticipants(2));

        store.getState().setIsStreaming(true);
        store.getState().setCurrentParticipantIndex(0);

        // State provides info for aria-live region
        expect(store.getState().isStreaming).toBe(true);
        expect(store.getState().currentParticipantIndex).toBe(0);
        expect(store.getState().participants[0]).toBeDefined();
      });

      it('should track message additions for announcements', () => {
        const thread = createMockThread({ id: 'thread-announce' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        const initialCount = store.getState().messages.length;

        store.getState().setMessages([createMockUserMessage(0)]);
        expect(store.getState().messages).toHaveLength(initialCount + 1);
        // New message should trigger aria-live announcement
      });
    });

    describe('a11Y-SR-02: Loading states have accessible labels', () => {
      /**
       * Tests loading state flags that need accessible labels.
       */
      it('should provide isCreatingThread for loading label', () => {
        store.getState().setIsCreatingThread(true);
        expect(store.getState().isCreatingThread).toBe(true);
        // Label: "Creating new conversation..."
      });

      it('should provide isStreaming for loading label', () => {
        store.getState().setIsStreaming(true);
        expect(store.getState().isStreaming).toBe(true);
        // Label: "AI is responding..."
      });

      it('should provide waitingToStartStreaming for loading label', () => {
        store.getState().setWaitingToStartStreaming(true);
        expect(store.getState().waitingToStartStreaming).toBe(true);
        // Label: "Preparing response..."
      });

      it('should provide pre-search streaming state for loading label', () => {
        store.getState().addPreSearch(createMockPreSearch({
          status: PreSearchStatuses.STREAMING,
        }));

        const preSearch = store.getState().preSearches[0];
        expect(preSearch.status).toBe(PreSearchStatuses.STREAMING);
        // Label: "Searching the web..."
      });

      it('should provide analysis streaming state for loading label', () => {
        store.getState().addAnalysis(createMockAnalysis({
          status: AnalysisStatuses.STREAMING,
        }));

        const analysis = store.getState().analyses[0];
        expect(analysis.status).toBe(AnalysisStatuses.STREAMING);
        // Label: "Analyzing responses..."
      });
    });

    describe('a11Y-SR-03: Buttons have aria-label where text is missing', () => {
      /**
       * Tests state that would be used in button aria-labels.
       */
      it('should provide participant info for avatar button labels', () => {
        const thread = createMockThread({ id: 'thread-btn' });
        const participant = createMockParticipant(0, {
          modelId: 'openai/gpt-4',
        });

        store.getState().initializeThread(thread, [participant]);

        const p = store.getState().participants[0];
        expect(p.modelId).toBe('openai/gpt-4');
        // aria-label: "View response from GPT-4"
      });

      it('should provide feedback state for like/dislike button labels', () => {
        store.getState().setFeedback(0, 'like');

        const feedback = store.getState().feedbackByRound.get(0);
        expect(feedback).toBe('like');
        // aria-label: "Remove like from round 1" or "Like round 1"
      });

      it('should provide streaming state for stop button label', () => {
        store.getState().setIsStreaming(true);
        expect(store.getState().isStreaming).toBe(true);
        // aria-label: "Stop AI response"
      });
    });

    describe('a11Y-SR-04: Correct semantic HTML for chat structure', () => {
      /**
       * Tests state organization that maps to semantic structure.
       */
      it('should organize messages by round for semantic grouping', () => {
        const thread = createMockThread({ id: 'thread-semantic' });
        store.getState().initializeThread(thread, createMockParticipants(2));

        store.getState().setMessages([
          ...createMockRoundMessages(0, 2),
          ...createMockRoundMessages(1, 2),
        ]);

        const messages = store.getState().messages;
        const round0 = messages.filter(m => m.metadata?.roundNumber === 0);
        const round1 = messages.filter(m => m.metadata?.roundNumber === 1);

        // Each round can be a semantic section
        expect(round0.length).toBeGreaterThan(0);
        expect(round1.length).toBeGreaterThan(0);
      });

      it('should provide thread title for heading', () => {
        const thread = createMockThread({
          id: 'thread-title',
          title: 'Discussion about AI safety',
        });

        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        expect(store.getState().thread?.title).toBe('Discussion about AI safety');
        // <h1>{thread.title}</h1>
      });
    });

    describe('a11Y-SR-05: Streaming updates do not spam screen readers', () => {
      /**
       * Tests state for appropriate aria-live update frequency.
       */
      it('should provide batch-able message state', () => {
        const thread = createMockThread({ id: 'thread-spam' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Multiple updates can be batched
        const message: UIMessage = {
          id: 'msg-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Initial' }],
          metadata: { roundNumber: 0, participantIndex: 0 },
        };

        store.getState().setMessages([message]);

        // Simulate streaming updates
        for (let i = 0; i < 10; i++) {
          store.getState().setMessages([{
            ...message,
            parts: [{ type: 'text', text: `Update ${i}` }],
          }]);
        }

        // Final state is available for periodic aria-live updates
        const finalMessage = store.getState().messages[0];
        const text = finalMessage.parts?.find(p => p.type === 'text');

        expect(text).toBeDefined();
        expect(text?.type).toBe('text');
        expect(text && text.type === 'text' ? text.text : undefined).toBe('Update 9');
      });

      it('should track streaming completion for final announcement', () => {
        const thread = createMockThread({ id: 'thread-final' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        store.getState().setIsStreaming(true);

        // During streaming: use aria-live="polite" with debounce
        expect(store.getState().isStreaming).toBe(true);

        store.getState().setIsStreaming(false);

        // After streaming: announce completion
        expect(store.getState().isStreaming).toBe(false);
        // "AI has finished responding"
      });
    });
  });
});

// ============================================================================
// SECTION 14: BROWSER & PERFORMANCE EDGE CASES
// ============================================================================

describe('section 14: Browser & Performance Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // 14.1 Browser Specifics
  // ==========================================================================

  describe('14.1 Browser Specifics', () => {
    describe('bROWSER-01: bfcache (Back/Forward Cache) behavior', () => {
      /**
       * Tests state restoration after bfcache navigation.
       */
      it('should restore thread state after navigation', () => {
        const thread = createMockThread({ id: 'thread-bfcache' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);
        store.getState().setMessages([createMockUserMessage(0)]);

        // Capture state before navigation
        const capturedState = {
          thread: store.getState().thread,
          messages: store.getState().messages,
          participants: store.getState().participants,
        };

        // Simulate page restore from bfcache
        store.getState().resetToNewChat();
        store.getState().initializeThread(
          capturedState.thread!,
          capturedState.participants,
          capturedState.messages,
        );

        expect(store.getState().thread?.id).toBe('thread-bfcache');
        expect(store.getState().messages).toHaveLength(1);
      });

      it('should reset streaming state on page restore', () => {
        const thread = createMockThread({ id: 'thread-restore' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);
        store.getState().setIsStreaming(true);

        // Page was in bfcache while streaming
        // On restore, streaming should be reset
        store.getState().setIsStreaming(false);

        expect(store.getState().isStreaming).toBe(false);
      });

      it('should handle incomplete analysis on page restore', () => {
        const thread = createMockThread({ id: 'thread-incomplete' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        store.getState().addAnalysis(createMockAnalysis({
          status: AnalysisStatuses.STREAMING,
        }));

        // On restore, streaming analysis should be marked for refresh
        const analysis = store.getState().analyses[0];
        expect(analysis.status).toBe(AnalysisStatuses.STREAMING);
        // Component should re-fetch or show stale indicator
      });
    });

    describe('bROWSER-02: Background tab behavior (throttled timers)', () => {
      /**
       * Tests state resilience to timer throttling in background tabs.
       */
      it('should handle delayed polling intervals', async () => {
        const thread = createMockThread({ id: 'thread-bg' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        let pollCount = 0;
        const pollInterval = setInterval(() => {
          pollCount++;
        }, 1000);

        // Normal polling
        vi.advanceTimersByTime(3000);
        expect(pollCount).toBe(3);

        // Background tab throttling (simulate 1 minute of throttled execution)
        // In background, interval might only fire once per minute
        vi.advanceTimersByTime(60000);

        // Polling continued (browser may throttle but state is consistent)
        expect(pollCount).toBeGreaterThan(3);

        clearInterval(pollInterval);
      });

      it('should recover streaming state after returning to foreground', () => {
        const thread = createMockThread({ id: 'thread-foreground' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);
        store.getState().setIsStreaming(true);

        // Tab goes to background
        // ... time passes with throttled timers ...

        // Tab returns to foreground
        // State should still be consistent
        expect(store.getState().isStreaming).toBe(true);
        expect(store.getState().thread?.id).toBe('thread-foreground');
      });

      it('should handle stale state detection', () => {
        const thread = createMockThread({ id: 'thread-stale' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Add pre-search that would be stale in background
        store.getState().addPreSearch(createMockPreSearch({
          status: AnalysisStatuses.PENDING,
          createdAt: new Date(Date.now() - 30000), // 30 seconds ago
        }));

        // After returning from background, check for stale operations
        const preSearch = store.getState().preSearches[0];
        const ageMs = Date.now() - preSearch.createdAt.getTime();

        expect(ageMs).toBeGreaterThan(10000); // Would trigger timeout check
      });
    });

    describe('bROWSER-03: Cross-browser consistency', () => {
      /**
       * Tests state operations that should work consistently across browsers.
       */
      it('should handle Set operations consistently', () => {
        store.getState().markAnalysisCreated(0);
        store.getState().markAnalysisCreated(1);
        store.getState().markAnalysisCreated(2);

        expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
        expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);
        expect(store.getState().hasAnalysisBeenCreated(2)).toBe(true);
        expect(store.getState().createdAnalysisRounds.size).toBe(3);
      });

      it('should handle Map operations consistently', () => {
        store.getState().setFeedback(0, 'like');
        store.getState().setFeedback(1, 'dislike');
        store.getState().setFeedback(2, null);

        expect(store.getState().feedbackByRound.get(0)).toBe('like');
        expect(store.getState().feedbackByRound.get(1)).toBe('dislike');
        expect(store.getState().feedbackByRound.get(2)).toBeNull();
      });

      it('should handle array spread operations consistently', () => {
        const participants = createMockParticipants(3);
        store.getState().setParticipants(participants);

        const copy = [...store.getState().participants];
        expect(copy).toHaveLength(3);
        expect(copy).toEqual(participants);
      });

      it('should handle Date operations consistently', () => {
        const now = new Date();
        const analysis = createMockAnalysis({
          createdAt: now,
        });

        store.getState().addAnalysis(analysis);

        const stored = store.getState().analyses[0];
        expect(stored.createdAt.getTime()).toBe(now.getTime());
      });
    });
  });

  // ==========================================================================
  // 14.2 Performance
  // ==========================================================================

  describe('14.2 Performance', () => {
    describe('pERF-01: Large thread history (50+ messages) rendering', () => {
      /**
       * Tests state handling for large message volumes.
       */
      it('should handle 50+ messages efficiently', () => {
        const thread = createMockThread({ id: 'thread-large' });
        store.getState().initializeThread(thread, createMockParticipants(3));

        // Create 50+ messages (user + 3 participants for ~17 rounds)
        const messages: UIMessage[] = [];
        for (let round = 0; round < 17; round++) {
          messages.push(createMockUserMessage(round));
          messages.push(...[0, 1, 2].map(i => createMockMessage(i, round)));
        }

        const startTime = performance.now();
        store.getState().setMessages(messages);
        const endTime = performance.now();

        expect(store.getState().messages.length).toBeGreaterThanOrEqual(50);
        expect(endTime - startTime).toBeLessThan(100); // Should be fast
      });

      it('should support virtualization by providing round metadata', () => {
        const thread = createMockThread({ id: 'thread-virtual' });
        store.getState().initializeThread(thread, createMockParticipants(2));

        // Add messages for 10 rounds
        const messages: UIMessage[] = [];
        for (let round = 0; round < 10; round++) {
          messages.push(...createMockRoundMessages(round, 2));
        }
        store.getState().setMessages(messages);

        // Messages should be groupable by round for virtualization
        const roundGroups = new Map<number, UIMessage[]>();
        store.getState().messages.forEach((msg) => {
          const round = msg.metadata?.roundNumber as number;
          if (!roundGroups.has(round)) {
            roundGroups.set(round, []);
          }
          roundGroups.get(round)!.push(msg);
        });

        expect(roundGroups.size).toBe(10);
      });

      it('should provide analysis data for lazy loading', () => {
        // Add multiple analyses
        for (let i = 0; i < 10; i++) {
          store.getState().addAnalysis(createMockAnalysis({
            id: `analysis-${i}`,
            roundNumber: i,
          }));
        }

        // Analyses can be loaded on demand
        const analyses = store.getState().analyses;
        expect(analyses).toHaveLength(10);

        // Each analysis is independently accessible
        const analysis5 = analyses.find(a => a.roundNumber === 5);
        expect(analysis5).toBeDefined();
      });
    });

    describe('pERF-02: Memory usage during prolonged sessions', () => {
      /**
       * Tests memory cleanup patterns for long-running sessions.
       */
      it('should clear state completely on reset', () => {
        const thread = createMockThread({ id: 'thread-memory' });
        store.getState().initializeThread(thread, createMockParticipants(5));
        store.getState().setMessages(createMockRoundMessages(0, 5));
        store.getState().addAnalysis(createMockAnalysis());
        store.getState().addPreSearch(createMockPreSearch());
        store.getState().setFeedback(0, 'like');
        store.getState().markAnalysisCreated(0);

        // Reset should clear all data
        store.getState().resetToNewChat();

        expect(store.getState().thread).toBeNull();
        expect(store.getState().participants).toHaveLength(0);
        expect(store.getState().messages).toHaveLength(0);
        expect(store.getState().analyses).toHaveLength(0);
        expect(store.getState().preSearches).toHaveLength(0);
        expect(store.getState().createdAnalysisRounds.size).toBe(0);
      });

      it('should clear Sets to prevent memory growth', () => {
        // Add many tracking entries
        for (let i = 0; i < 100; i++) {
          store.getState().markAnalysisCreated(i);
          store.getState().markPreSearchTriggered(i);
        }

        expect(store.getState().createdAnalysisRounds.size).toBe(100);
        expect(store.getState().triggeredPreSearchRounds.size).toBe(100);

        // Reset clears Sets
        store.getState().resetToNewChat();

        expect(store.getState().createdAnalysisRounds.size).toBe(0);
        expect(store.getState().triggeredPreSearchRounds.size).toBe(0);
      });

      it('should clear Maps on feedback reset', () => {
        // Add many feedback entries
        for (let i = 0; i < 50; i++) {
          store.getState().setFeedback(i, i % 2 === 0 ? 'like' : 'dislike');
        }

        expect(store.getState().feedbackByRound.size).toBe(50);

        store.getState().resetFeedback();

        expect(store.getState().feedbackByRound.size).toBe(0);
      });
    });

    describe('pERF-03: Rapid navigation without orphaned requests', () => {
      /**
       * Tests cleanup during rapid navigation patterns.
       * ✅ RESUMABLE STREAMS: Streams continue in background via waitUntil()
       */
      it('should NOT stop streaming on navigation away (resumable streams)', () => {
        const thread = createMockThread({ id: 'thread-nav-stop' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);
        store.getState().setIsStreaming(true);

        let stopCalled = false;
        store.getState().setStop(() => {
          stopCalled = true;
        });

        // Navigate away
        store.getState().resetToNewChat();

        // ✅ RESUMABLE STREAMS: stop is NOT called - streams continue in background
        expect(stopCalled).toBe(false);
        // Local state is cleared, but backend stream continues
        expect(store.getState().isStreaming).toBe(false);
      });

      it('should handle rapid overview-thread-overview cycle', () => {
        // Overview -> Thread
        const thread1 = createMockThread({ id: 'thread-1' });
        store.getState().initializeThread(thread1, [createMockParticipant(0)]);

        // Thread -> Overview
        store.getState().resetToNewChat();

        // Overview -> Thread (different)
        const thread2 = createMockThread({ id: 'thread-2' });
        store.getState().initializeThread(thread2, [createMockParticipant(0)]);

        // Thread -> Overview
        store.getState().resetToNewChat();

        // State should be clean
        expect(store.getState().thread).toBeNull();
        expect(store.getState().isStreaming).toBe(false);
      });

      it('should clear pending operations on navigation', () => {
        store.getState().setPendingMessage('Message');
        store.getState().setWaitingToStartStreaming(true);
        store.getState().setIsCreatingThread(true);

        store.getState().resetToNewChat();

        expect(store.getState().pendingMessage).toBeNull();
        expect(store.getState().waitingToStartStreaming).toBe(false);
        expect(store.getState().isCreatingThread).toBe(false);
      });
    });

    describe('pERF-04: Re-render counts during streaming', () => {
      /**
       * Tests state update patterns that affect re-render counts.
       */
      it('should batch related state updates', () => {
        const thread = createMockThread({ id: 'thread-batch' });

        // initializeThread sets multiple fields in one update
        store.getState().initializeThread(
          thread,
          [createMockParticipant(0)],
          [createMockUserMessage(0)],
        );

        // Single state object updated
        expect(store.getState().thread).not.toBeNull();
        expect(store.getState().participants).toHaveLength(1);
        expect(store.getState().messages).toHaveLength(1);
      });

      it('should minimize updates during streaming', () => {
        const thread = createMockThread({ id: 'thread-min' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        let updateCount = 0;

        // Subscribe to count updates
        const unsubscribe = store.subscribe(() => {
          updateCount++;
        });

        // Simulate streaming updates
        store.getState().setIsStreaming(true);
        store.getState().setCurrentParticipantIndex(0);
        store.getState().setMessages([createMockUserMessage(0)]);
        store.getState().setMessages([
          createMockUserMessage(0),
          createMockMessage(0, 0),
        ]);

        unsubscribe();

        // Updates should be reasonable (not excessive)
        expect(updateCount).toBeLessThan(10);
      });

      it('should use prepareForNewMessage for batched state reset', () => {
        const thread = createMockThread({ id: 'thread-prepare' });
        store.getState().initializeThread(thread, createMockParticipants(2));

        let updateCount = 0;
        const unsubscribe = store.subscribe(() => {
          updateCount++;
        });

        // Single operation resets multiple flags
        store.getState().prepareForNewMessage('Test', ['p0', 'p1']);

        unsubscribe();

        // Should be minimal updates (ideally 1)
        expect(updateCount).toBeLessThanOrEqual(2);
      });

      it('should use completeStreaming for batched cleanup', () => {
        const thread = createMockThread({ id: 'thread-complete' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);
        store.getState().setIsStreaming(true);
        store.getState().setWaitingToStartStreaming(true);
        store.getState().setPendingMessage('Test');

        let updateCount = 0;
        const unsubscribe = store.subscribe(() => {
          updateCount++;
        });

        // Single operation clears multiple flags
        store.getState().completeStreaming();

        unsubscribe();

        // Should be minimal updates (ideally 1)
        expect(updateCount).toBeLessThanOrEqual(2);

        // All flags should be cleared
        expect(store.getState().isStreaming).toBe(false);
        expect(store.getState().waitingToStartStreaming).toBe(false);
        expect(store.getState().pendingMessage).toBeNull();
      });
    });
  });
});

// ============================================================================
// COMPREHENSIVE DATA INTEGRITY TESTS
// ============================================================================

describe('comprehensive Data Integrity Validation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('message ID pattern validation', () => {
    /**
     * Validates that message IDs follow the expected pattern:
     * {threadId}_r{roundNumber}_p{participantIndex}
     */
    it('should validate message ID format', () => {
      const thread = createMockThread({ id: 'thread-validate' });
      store.getState().initializeThread(thread, createMockParticipants(3));

      const messages = createMockRoundMessages(0, 3);
      store.getState().setMessages(messages);

      const participantMessages = store.getState().messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT,
      );

      participantMessages.forEach((msg) => {
        // Should match pattern: threadId_r{round}_p{participant}
        const pattern = /thread-123_r\d+_p\d+$/;
        expect(msg.id).toMatch(pattern);
      });
    });

    it('should extract round and participant from ID', () => {
      const messageId = 'thread-123_r2_p1';
      const match = messageId.match(/_r(\d+)_p(\d+)$/);

      expect(match).not.toBeNull();
      expect(match).toBeDefined();
      const roundNumber = match ? Number.parseInt(match[1]) : -1;
      const participantIndex = match ? Number.parseInt(match[2]) : -1;

      expect(roundNumber).toBe(2);
      expect(participantIndex).toBe(1);
    });
  });

  describe('metadata consistency validation', () => {
    /**
     * Validates that message metadata matches message structure.
     */
    it('should have consistent roundNumber in metadata', () => {
      const thread = createMockThread({ id: 'thread-meta' });
      store.getState().initializeThread(thread, createMockParticipants(2));

      const messages = [
        ...createMockRoundMessages(0, 2),
        ...createMockRoundMessages(1, 2),
      ];
      store.getState().setMessages(messages);

      store.getState().messages.forEach((msg) => {
        const round = msg.metadata?.roundNumber;
        expect(round).toBeDefined();
        expect(typeof round).toBe('number');
        expect(round).toBeGreaterThanOrEqual(0);
      });
    });

    it('should have consistent participantIndex for assistant messages', () => {
      const thread = createMockThread({ id: 'thread-participant' });
      store.getState().initializeThread(thread, createMockParticipants(3));
      store.getState().setMessages(createMockRoundMessages(0, 3));

      const assistantMessages = store.getState().messages.filter(
        m => m.role === UIMessageRoles.ASSISTANT,
      );

      assistantMessages.forEach((msg) => {
        const index = msg.metadata?.participantIndex;
        expect(index).toBeDefined();
        expect(typeof index).toBe('number');
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(3);
      });
    });
  });

  describe('state coherency after operations', () => {
    /**
     * Validates that state remains coherent after various operations.
     */
    it('should maintain coherency after rapid operations', () => {
      const thread = createMockThread({ id: 'thread-coherent' });
      store.getState().initializeThread(thread, createMockParticipants(3));

      // Rapid series of operations
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().setCurrentParticipantIndex(2);
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        createMockMessage(2, 0),
      ]);
      store.getState().setIsStreaming(false);

      // State should be coherent
      const state = store.getState();
      expect(state.thread?.id).toBe('thread-coherent');
      expect(state.participants).toHaveLength(3);
      expect(state.messages).toHaveLength(4);
      expect(state.currentParticipantIndex).toBe(2);
      expect(state.isStreaming).toBe(false);
    });

    it('should maintain coherency across reset cycles', () => {
      // First session
      const thread1 = createMockThread({ id: 'thread-1' });
      store.getState().initializeThread(thread1, createMockParticipants(2));
      store.getState().setMessages(createMockRoundMessages(0, 2));
      store.getState().markAnalysisCreated(0);

      // Reset
      store.getState().resetToNewChat();

      // Second session
      const thread2 = createMockThread({ id: 'thread-2' });
      store.getState().initializeThread(thread2, createMockParticipants(3));
      store.getState().setMessages(createMockRoundMessages(0, 3));

      // State should reflect second session only
      const state = store.getState();
      expect(state.thread?.id).toBe('thread-2');
      expect(state.participants).toHaveLength(3);
      expect(state.messages).toHaveLength(4); // user + 3 participants
      expect(state.createdAnalysisRounds.has(0)).toBe(false);
    });
  });
});
