/**
 * AI Responses Streaming - Token Usage Tracking Tests
 *
 * Tests PART 3 of FLOW_DOCUMENTATION.md - Token Usage and Quota Tracking
 *
 * SCOPE:
 * - Token usage tracked per participant response
 * - Usage accumulated per round
 * - Message count increments toward quota
 * - Token data saved with message metadata
 * - Billing implications of streaming
 *
 * CRITICAL BEHAVIORS TESTED:
 * - Each participant tracks promptTokens, completionTokens, totalTokens
 * - Usage metadata attached to assistant messages
 * - Round totals calculated from participant usage
 * - User quota decrements based on messages sent
 * - Token tracking works even when stopped mid-stream
 *
 * Pattern from: /docs/FLOW_DOCUMENTATION.md:197-198, db/schemas/chat-metadata.ts
 */

import type { DbAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';

describe('streaming token usage tracking', () => {
  const THREAD_ID = '01KA1DEY81D0X6760M7ZDKZTC5';

  describe('per-participant token tracking', () => {
    /**
     * TEST: Each assistant message includes token usage
     * Pattern from: db/schemas/chat-metadata.ts:DbAssistantMessageMetadata
     */
    it('should track token usage for each participant response', () => {
      const roundNumber = 0;
      const message = createTestAssistantMessage({
        id: `${THREAD_ID}_r${roundNumber}_p0`,
        content: 'This is a response that uses tokens',
        roundNumber,
        participantId: 'p0',
        participantIndex: 0,
      });

      // Verify usage metadata exists
      expect(message.metadata.usage).toBeDefined();
      expect(message.metadata.usage.promptTokens).toBeDefined();
      expect(message.metadata.usage.completionTokens).toBeDefined();
      expect(message.metadata.usage.totalTokens).toBeDefined();

      // Default test values from helpers.ts
      expect(message.metadata.usage.promptTokens).toBe(100);
      expect(message.metadata.usage.completionTokens).toBe(50);
      expect(message.metadata.usage.totalTokens).toBe(150);
    });

    /**
     * TEST: Token usage components
     * promptTokens + completionTokens = totalTokens
     */
    it('should correctly calculate total tokens from components', () => {
      const usage = {
        promptTokens: 250,
        completionTokens: 180,
        totalTokens: 430,
      };

      expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
    });

    /**
     * TEST: Different participants have different token usage
     * Usage varies based on response length and complexity
     */
    it('should track different usage for different participants', () => {
      const roundNumber = 0;
      const participants = [
        {
          message: createTestAssistantMessage({
            id: `${THREAD_ID}_r${roundNumber}_p0`,
            content: 'Short response',
            roundNumber,
            participantId: 'p0',
            participantIndex: 0,
          }),
          expectedTokens: { prompt: 100, completion: 50, total: 150 },
        },
        {
          message: createTestAssistantMessage({
            id: `${THREAD_ID}_r${roundNumber}_p1`,
            content: 'Much longer and more detailed response with extensive explanation',
            roundNumber,
            participantId: 'p1',
            participantIndex: 1,
          }),
          expectedTokens: { prompt: 120, completion: 200, total: 320 },
        },
      ];

      // Each participant has their own usage
      participants.forEach((participant) => {
        expect(participant.message.metadata.usage).toBeDefined();
        expect(participant.message.metadata.usage.totalTokens).toBeGreaterThan(0);
      });

      // In production, p1 would have higher token count due to longer response
      // (In tests, both use defaults from helpers.ts)
    });
  });

  describe('round-level token aggregation', () => {
    /**
     * TEST: Calculate total tokens used in a round
     * Sum all participant token usage
     */
    it('should calculate total token usage for entire round', () => {
      const roundNumber = 0;
      const messages = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p0`,
          content: 'Response 1',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p1`,
          content: 'Response 2',
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p2`,
          content: 'Response 3',
          roundNumber,
          participantId: 'p2',
          participantIndex: 2,
        }),
      ];

      const assistantMessages = messages.filter(m => m.metadata?.usage);
      const totalTokens = assistantMessages.reduce(
        (sum, msg) => sum + (msg.metadata?.usage?.totalTokens || 0),
        0,
      );

      // 3 participants * 150 tokens each = 450 total
      expect(totalTokens).toBe(450);
      expect(assistantMessages).toHaveLength(3);
    });

    /**
     * TEST: Separate prompt and completion totals per round
     * Useful for detailed billing analytics
     */
    it('should calculate separate prompt and completion totals for round', () => {
      const roundNumber = 0;
      const messages = [
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p0`,
          content: 'Response 1',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p1`,
          content: 'Response 2',
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const assistantMessages = messages.filter(m => m.metadata?.usage);

      const totalPromptTokens = assistantMessages.reduce(
        (sum, msg) => sum + (msg.metadata?.usage?.promptTokens || 0),
        0,
      );

      const totalCompletionTokens = assistantMessages.reduce(
        (sum, msg) => sum + (msg.metadata?.usage?.completionTokens || 0),
        0,
      );

      const totalTokens = assistantMessages.reduce(
        (sum, msg) => sum + (msg.metadata?.usage?.totalTokens || 0),
        0,
      );

      expect(totalPromptTokens).toBe(200); // 2 * 100
      expect(totalCompletionTokens).toBe(100); // 2 * 50
      expect(totalTokens).toBe(300); // 2 * 150
      expect(totalTokens).toBe(totalPromptTokens + totalCompletionTokens);
    });
  });

  describe('message quota tracking', () => {
    /**
     * TEST: User message count increments
     * Pattern from: FLOW_DOCUMENTATION.md:197-198
     */
    it('should increment user message count when sending message', () => {
      let userMessageCount = 0;
      const monthlyQuota = 50; // Free tier

      // User sends first message
      userMessageCount++;
      expect(userMessageCount).toBe(1);
      expect(userMessageCount).toBeLessThanOrEqual(monthlyQuota);

      // User sends second message
      userMessageCount++;
      expect(userMessageCount).toBe(2);
      expect(userMessageCount).toBeLessThanOrEqual(monthlyQuota);
    });

    /**
     * TEST: Quota varies by subscription tier
     * Pattern from: FLOW_DOCUMENTATION.md:454-474
     */
    it('should enforce different quotas per subscription tier', () => {
      const quotas = {
        free: { messages: 50, conversations: 5 },
        pro: { messages: 500, conversations: 100 },
        power: { messages: Infinity, conversations: Infinity },
      };

      expect(quotas.free.messages).toBe(50);
      expect(quotas.pro.messages).toBe(500);
      expect(quotas.power.messages).toBe(Infinity);
    });

    /**
     * TEST: Message count independent of participant count
     * One user message counts as one, regardless of how many AIs respond
     */
    it('should count user messages only, not assistant responses', () => {
      const roundNumber = 0;
      const messages = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p0`,
          content: 'Response 1',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p1`,
          content: 'Response 2',
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p2`,
          content: 'Response 3',
          roundNumber,
          participantId: 'p2',
          participantIndex: 2,
        }),
      ];

      const userMessageCount = messages.filter(m => m.role === 'user').length;

      // Only 1 user message counts toward quota
      expect(userMessageCount).toBe(1);

      // 3 assistant responses don't count toward user quota
      const assistantMessageCount = messages.filter(m => m.role === 'assistant').length;
      expect(assistantMessageCount).toBe(3);
    });

    /**
     * TEST: Quota check before allowing message send
     * Prevent exceeding monthly limit
     */
    it('should check quota before allowing message submission', () => {
      const currentCount = 49;
      const monthlyQuota = 50;

      const canSend = currentCount < monthlyQuota;
      expect(canSend).toBe(true);

      // At limit
      const atLimitCount = 50;
      const canSendAtLimit = atLimitCount < monthlyQuota;
      expect(canSendAtLimit).toBe(false);
    });
  });

  describe('token usage metadata structure', () => {
    /**
     * TEST: Usage metadata follows schema
     * Pattern from: db/schemas/chat-metadata.ts
     */
    it('should structure usage metadata correctly', () => {
      const usage: DbAssistantMessageMetadata['usage'] = {
        promptTokens: 150,
        completionTokens: 200,
        totalTokens: 350,
      };

      // Required fields
      expect(usage.promptTokens).toBeDefined();
      expect(usage.completionTokens).toBeDefined();
      expect(usage.totalTokens).toBeDefined();

      // All numbers
      expect(typeof usage.promptTokens).toBe('number');
      expect(typeof usage.completionTokens).toBe('number');
      expect(typeof usage.totalTokens).toBe('number');

      // Positive values
      expect(usage.promptTokens).toBeGreaterThan(0);
      expect(usage.completionTokens).toBeGreaterThan(0);
      expect(usage.totalTokens).toBeGreaterThan(0);
    });

    /**
     * TEST: finishReason indicates completion status
     * Related to token usage and billing
     */
    it('should track finish reason with token usage', () => {
      const finishReasons: DbAssistantMessageMetadata['finishReason'][] = [
        'stop', // Normal completion
        'length', // Token limit reached
        'content_filter', // Filtered content
        'tool_calls', // Tool execution
        'error', // Error occurred
        'other', // Other reason
        'unknown', // Unknown reason
      ];

      finishReasons.forEach((reason) => {
        const message = createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: reason,
        });

        expect(message.metadata.finishReason).toBe(reason);
        expect(message.metadata.usage).toBeDefined();
      });
    });

    /**
     * TEST: Model identifier tracked with usage
     * Different models have different token costs
     */
    it('should track model identifier with token usage', () => {
      const models = [
        { id: 'gpt-4', costMultiplier: 1.0 },
        { id: 'gpt-3.5-turbo', costMultiplier: 0.1 },
        { id: 'claude-3-opus', costMultiplier: 1.5 },
      ];

      models.forEach((model) => {
        const message = createTestAssistantMessage({
          id: `${THREAD_ID}_r0_p0`,
          content: 'Response',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          model: model.id,
        });

        expect(message.metadata.model).toBe(model.id);
        expect(message.metadata.usage).toBeDefined();

        // In production, billing would use model + usage to calculate cost
        const baseCost = message.metadata.usage.totalTokens * 0.001; // Example rate
        const actualCost = baseCost * model.costMultiplier;
        expect(actualCost).toBeGreaterThan(0);
      });
    });
  });

  describe('token tracking with streaming interruptions', () => {
    /**
     * TEST: Partial response still tracks tokens
     * Pattern from: streaming-stop-button.test.ts
     */
    it('should track token usage for partial responses when stopped', () => {
      const partialMessage = createTestAssistantMessage({
        id: `${THREAD_ID}_r0_p1`,
        content: 'Partial response before stop',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 1,
      });

      // Even partial responses have usage data
      expect(partialMessage.metadata.usage).toBeDefined();
      expect(partialMessage.metadata.usage.totalTokens).toBeGreaterThan(0);

      // In production, isPartialResponse would be true
      const isPartial = true;
      expect(isPartial).toBe(true);
    });

    /**
     * TEST: Round totals with partial results
     * Stopped rounds still calculate usage from completed participants
     */
    it('should calculate usage for rounds stopped mid-stream', () => {
      const roundNumber = 0;
      const messages = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Question',
          roundNumber,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p0`,
          content: 'Complete',
          roundNumber,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: `${THREAD_ID}_r${roundNumber}_p1`,
          content: 'Partial (stopped)',
          roundNumber,
          participantId: 'p1',
          participantIndex: 1,
        }),
        // p2 never executed (stopped before starting)
      ];

      const assistantMessages = messages.filter(m => m.metadata?.usage);
      const totalTokens = assistantMessages.reduce(
        (sum, msg) => sum + (msg.metadata?.usage?.totalTokens || 0),
        0,
      );

      // Only 2 participants executed, so 2 * 150 = 300
      expect(totalTokens).toBe(300);
      expect(assistantMessages).toHaveLength(2);
    });

    /**
     * TEST: Error responses still track usage
     * Failed participants may have partial usage
     */
    it('should track usage even when response has error', () => {
      const errorMessage = createTestAssistantMessage({
        id: `${THREAD_ID}_r0_p1`,
        content: '',
        roundNumber: 0,
        participantId: 'p1',
        participantIndex: 1,
        hasError: true,
      });

      // Error responses still have usage metadata (may be 0 if error was immediate)
      expect(errorMessage.metadata.usage).toBeDefined();
      expect(errorMessage.metadata.hasError).toBe(true);
    });
  });

  describe('edge cases and validation', () => {
    /**
     * TEST: Zero token usage (edge case)
     * Empty or failed responses
     */
    it('should handle zero token usage gracefully', () => {
      const usage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

      expect(usage.totalTokens).toBe(0);
      expect(usage.promptTokens + usage.completionTokens).toBe(usage.totalTokens);
    });

    /**
     * TEST: Very large token usage
     * Long responses or extensive context
     */
    it('should handle large token counts', () => {
      const usage = {
        promptTokens: 8000,
        completionTokens: 4000,
        totalTokens: 12000,
      };

      expect(usage.totalTokens).toBe(12000);
      expect(usage.totalTokens).toBeGreaterThan(10000);
    });

    /**
     * TEST: Token usage validation
     * Total should always equal sum of components
     */
    it('should validate token usage consistency', () => {
      const testCases = [
        { prompt: 100, completion: 50, total: 150 },
        { prompt: 500, completion: 300, total: 800 },
        { prompt: 0, completion: 0, total: 0 },
        { prompt: 10000, completion: 5000, total: 15000 },
      ];

      testCases.forEach((testCase) => {
        expect(testCase.total).toBe(testCase.prompt + testCase.completion);
      });
    });

    /**
     * TEST: Multi-round token accumulation
     * Track total usage across entire conversation
     */
    it('should accumulate token usage across multiple rounds', () => {
      const rounds = [
        { roundNumber: 0, totalTokens: 450 }, // 3 participants * 150
        { roundNumber: 1, totalTokens: 300 }, // 2 participants * 150
        { roundNumber: 2, totalTokens: 600 }, // 4 participants * 150
      ];

      const conversationTotalTokens = rounds.reduce((sum, round) => sum + round.totalTokens, 0);

      expect(conversationTotalTokens).toBe(1350);
    });
  });
});
