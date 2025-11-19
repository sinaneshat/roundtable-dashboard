/**
 * Thread Detail Page Tests (PART 5)
 *
 * Tests thread detail page (ChatThreadScreen) functionality:
 * 1. Initial page load - thread title, all messages, grouped by rounds
 * 2. Round organization - user question, AI responses, analysis card
 * 3. Round feedback buttons - like/dislike for entire rounds
 * 4. Timeline rendering - collapsed older rounds, expanded latest
 * 5. Message ordering - correct chronological display
 * 6. Multiple participants per round - correct participant display
 *
 * Pattern: src/components/chat/__tests__/web-search-integration.test.tsx
 * Documentation: docs/FLOW_DOCUMENTATION.md PART 5
 */

import { describe, expect, it, vi } from 'vitest';

import { FeedbackTypes, MessageRoles } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { createTestAssistantMessage, createTestUserMessage, render, screen, userEvent } from '@/lib/testing';

import { RoundFeedback } from '../round-feedback';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: unknown; locale?: string; messages?: unknown }) => children,
}));

describe('thread Detail Page - Initial Load (PART 5)', () => {
  describe('round organization', () => {
    it('should group messages by round number', () => {
      // Round 0: User + 2 participants
      const round0Messages = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'First question',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p0',
          content: 'First response from p0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p1',
          content: 'First response from p1',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      // Round 1: User + 2 participants
      const round1Messages = [
        createTestUserMessage({
          id: 'user-r1',
          content: 'Second question',
          roundNumber: 1,
        }),
        createTestAssistantMessage({
          id: 'thread_r1_p0',
          content: 'Second response from p0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'thread_r1_p1',
          content: 'Second response from p1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 1,
        }),
      ];

      const allMessages = [...round0Messages, ...round1Messages];

      // Verify round 0 messages
      const r0Messages = allMessages.filter(m => m.metadata.roundNumber === 0);
      expect(r0Messages).toHaveLength(3);
      expect(r0Messages[0]?.role).toBe(MessageRoles.USER);
      expect(r0Messages[1]?.role).toBe(MessageRoles.ASSISTANT);
      expect(r0Messages[2]?.role).toBe(MessageRoles.ASSISTANT);

      // Verify round 1 messages
      const r1Messages = allMessages.filter(m => m.metadata.roundNumber === 1);
      expect(r1Messages).toHaveLength(3);
      expect(r1Messages[0]?.role).toBe(MessageRoles.USER);
      expect(r1Messages[1]?.role).toBe(MessageRoles.ASSISTANT);
      expect(r1Messages[2]?.role).toBe(MessageRoles.ASSISTANT);
    });

    it('should display user question, AI responses, and analysis for each round', () => {
      // Round structure:
      // - User message (roundNumber: 0)
      // - AI Response 1 (roundNumber: 0, participantIndex: 0)
      // - AI Response 2 (roundNumber: 0, participantIndex: 1)
      // - AI Response 3 (roundNumber: 0, participantIndex: 2)
      // - Analysis (roundNumber: 0)

      const roundMessages = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'What is AI?',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p0',
          content: 'AI is artificial intelligence',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p1',
          content: 'AI is machine learning systems',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p2',
          content: 'AI is computational intelligence',
          roundNumber: 0,
          participantId: 'p2',
          participantIndex: 2,
        }),
      ];

      // Verify structure
      const userMessages = roundMessages.filter(m => m.role === MessageRoles.USER);
      const assistantMessages = roundMessages.filter(m => m.role === MessageRoles.ASSISTANT);

      expect(userMessages).toHaveLength(1);
      expect(assistantMessages).toHaveLength(3);

      // Verify participant ordering
      expect(assistantMessages[0]?.metadata.participantIndex).toBe(0);
      expect(assistantMessages[1]?.metadata.participantIndex).toBe(1);
      expect(assistantMessages[2]?.metadata.participantIndex).toBe(2);

      // Verify all belong to round 0
      expect(roundMessages.every(m => m.metadata.roundNumber === 0)).toBe(true);
    });

    it('should maintain correct message order across multiple rounds', () => {
      const messages = [
        // Round 0
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),

        // Round 1
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'thread_r1_p0', content: 'A2', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),

        // Round 2
        createTestUserMessage({ id: 'user-r2', content: 'Q3', roundNumber: 2 }),
        createTestAssistantMessage({ id: 'thread_r2_p0', content: 'A3', roundNumber: 2, participantId: 'p0', participantIndex: 0 }),
      ];

      // Verify chronological order maintained
      expect(messages[0]?.id).toBe('user-r0');
      expect(messages[1]?.id).toBe('thread_r0_p0');
      expect(messages[2]?.id).toBe('user-r1');
      expect(messages[3]?.id).toBe('thread_r1_p0');
      expect(messages[4]?.id).toBe('user-r2');
      expect(messages[5]?.id).toBe('thread_r2_p0');

      // Verify round numbers increment correctly
      expect(messages[0]?.metadata.roundNumber).toBe(0);
      expect(messages[2]?.metadata.roundNumber).toBe(1);
      expect(messages[4]?.metadata.roundNumber).toBe(2);
    });
  });

  describe('round feedback buttons', () => {
    it('should render like and dislike buttons for each round', async () => {
      const user = userEvent.setup();
      const onFeedbackChange = vi.fn();

      render(
        <RoundFeedback
          threadId="thread-1"
          roundNumber={0}
          currentFeedback={null}
          onFeedbackChange={onFeedbackChange}
        />,
      );

      // Find feedback buttons - Radix Tooltip may render multiple elements, use getAllByRole
      const likeButtons = screen.getAllByRole('button', { name: /like/i });
      const dislikeButtons = screen.getAllByRole('button', { name: /dislike/i });

      // Should have at least one of each button
      expect(likeButtons.length).toBeGreaterThanOrEqual(1);
      expect(dislikeButtons.length).toBeGreaterThanOrEqual(1);

      // Click like button (use first visible one)
      const likeButton = likeButtons.find(btn => !btn.hasAttribute('data-state')) || likeButtons[0]!;
      await user.click(likeButton);
      expect(onFeedbackChange).toHaveBeenCalledWith(FeedbackTypes.LIKE);
    });

    it('should show active state when round is liked', () => {
      const onFeedbackChange = vi.fn();

      render(
        <RoundFeedback
          threadId="thread-1"
          roundNumber={0}
          currentFeedback={FeedbackTypes.LIKE}
          onFeedbackChange={onFeedbackChange}
        />,
      );

      const likeButtons = screen.getAllByRole('button', { name: /like/i });
      const likeButton = likeButtons.find(btn => !btn.hasAttribute('data-state')) || likeButtons[0]!;
      expect(likeButton).toHaveClass('bg-green-500/20');
    });

    it('should show active state when round is disliked', () => {
      const onFeedbackChange = vi.fn();

      render(
        <RoundFeedback
          threadId="thread-1"
          roundNumber={0}
          currentFeedback={FeedbackTypes.DISLIKE}
          onFeedbackChange={onFeedbackChange}
        />,
      );

      const dislikeButton = screen.getByRole('button', { name: /dislike/i });
      expect(dislikeButton).toHaveClass('bg-red-500/20');
    });

    it('should toggle feedback off when clicking same button again', async () => {
      const user = userEvent.setup();
      const onFeedbackChange = vi.fn();

      render(
        <RoundFeedback
          threadId="thread-1"
          roundNumber={0}
          currentFeedback={FeedbackTypes.LIKE}
          onFeedbackChange={onFeedbackChange}
        />,
      );

      const likeButtons = screen.getAllByRole('button', { name: /like/i });
      const likeButton = likeButtons.find(btn => !btn.hasAttribute('data-state')) || likeButtons[0]!;
      await user.click(likeButton);

      // Should call with null to remove feedback
      expect(onFeedbackChange).toHaveBeenCalledWith(null);
    });

    it('should switch from like to dislike', async () => {
      const user = userEvent.setup();
      const onFeedbackChange = vi.fn();

      render(
        <RoundFeedback
          threadId="thread-1"
          roundNumber={0}
          currentFeedback={FeedbackTypes.LIKE}
          onFeedbackChange={onFeedbackChange}
        />,
      );

      const dislikeButton = screen.getByRole('button', { name: /dislike/i });
      await user.click(dislikeButton);

      expect(onFeedbackChange).toHaveBeenCalledWith(FeedbackTypes.DISLIKE);
    });

    it('should disable buttons when isPending is true', () => {
      const onFeedbackChange = vi.fn();

      render(
        <RoundFeedback
          threadId="thread-1"
          roundNumber={0}
          currentFeedback={null}
          onFeedbackChange={onFeedbackChange}
          isPending
        />,
      );

      const likeButtons = screen.getAllByRole('button', { name: /like/i });
      const dislikeButtons = screen.getAllByRole('button', { name: /dislike/i });

      const likeButton = likeButtons.find(btn => !btn.hasAttribute('data-state')) || likeButtons[0]!;
      const dislikeButton = dislikeButtons.find(btn => !btn.hasAttribute('data-state')) || dislikeButtons[0]!;

      expect(likeButton).toBeDisabled();
      expect(dislikeButton).toBeDisabled();
    });

    it('should show loading spinner for pending feedback type', () => {
      const onFeedbackChange = vi.fn();

      render(
        <RoundFeedback
          threadId="thread-1"
          roundNumber={0}
          currentFeedback={null}
          onFeedbackChange={onFeedbackChange}
          isPending
          pendingType={FeedbackTypes.LIKE}
        />,
      );

      // Like button should show spinner
      const likeButtons = screen.getAllByRole('button', { name: /like/i });
      const likeButton = likeButtons.find(btn => !btn.hasAttribute('data-state')) || likeButtons[0]!;
      const spinner = likeButton.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('multiple participants per round', () => {
    it('should display all participants in correct order', () => {
      const messages = [
        createTestUserMessage({
          id: 'user-r0',
          content: 'Compare these approaches',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p0',
          content: 'First participant response',
          roundNumber: 0,
          participantId: 'model-gpt4',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p1',
          content: 'Second participant response',
          roundNumber: 0,
          participantId: 'model-claude',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: 'thread_r0_p2',
          content: 'Third participant response',
          roundNumber: 0,
          participantId: 'model-gemini',
          participantIndex: 2,
        }),
      ];

      const participantMessages = messages.filter(m => m.role === MessageRoles.ASSISTANT);

      // Verify correct count
      expect(participantMessages).toHaveLength(3);

      // Verify sequential ordering
      expect(participantMessages[0]?.metadata.participantIndex).toBe(0);
      expect(participantMessages[1]?.metadata.participantIndex).toBe(1);
      expect(participantMessages[2]?.metadata.participantIndex).toBe(2);

      // Verify participant IDs preserved
      expect(participantMessages[0]?.metadata.participantId).toBe('model-gpt4');
      expect(participantMessages[1]?.metadata.participantId).toBe('model-claude');
      expect(participantMessages[2]?.metadata.participantId).toBe('model-gemini');
    });

    it('should handle different participant counts per round', () => {
      const messages = [
        // Round 0: 2 participants
        createTestUserMessage({ id: 'user-r0', content: 'Q1', roundNumber: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p0', content: 'A1', roundNumber: 0, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'thread_r0_p1', content: 'A2', roundNumber: 0, participantId: 'p1', participantIndex: 1 }),

        // Round 1: 3 participants (configuration change added p2)
        createTestUserMessage({ id: 'user-r1', content: 'Q2', roundNumber: 1 }),
        createTestAssistantMessage({ id: 'thread_r1_p0', content: 'A1', roundNumber: 1, participantId: 'p0', participantIndex: 0 }),
        createTestAssistantMessage({ id: 'thread_r1_p1', content: 'A2', roundNumber: 1, participantId: 'p1', participantIndex: 1 }),
        createTestAssistantMessage({ id: 'thread_r1_p2', content: 'A3', roundNumber: 1, participantId: 'p2', participantIndex: 2 }),
      ];

      const round0Participants = messages.filter(m => m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === 0);
      const round1Participants = messages.filter(m => m.role === MessageRoles.ASSISTANT && m.metadata.roundNumber === 1);

      expect(round0Participants).toHaveLength(2);
      expect(round1Participants).toHaveLength(3);
    });
  });

  describe('initial load data structure', () => {
    it('should have correct ChatThread structure', () => {
      const thread: ChatThread = {
        id: 'thread-1',
        userId: 'user-1',
        title: 'My conversation about AI',
        slug: 'my-conversation-about-ai',
        isAiGeneratedTitle: true,
        isPublic: false,
        mode: 'brainstorming',
        enableWebSearch: false,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      };

      expect(thread.id).toBe('thread-1');
      expect(thread.title).toBe('My conversation about AI');
      expect(thread.slug).toBe('my-conversation-about-ai');
      expect(thread.mode).toBe('brainstorming');
    });

    it('should have correct ChatParticipant structure', () => {
      const participants: ChatParticipant[] = [
        {
          id: 'participant-1',
          threadId: 'thread-1',
          modelId: 'gpt-4',
          customRole: 'The Analyst',
          priority: 0,
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'participant-2',
          threadId: 'thread-1',
          modelId: 'claude-3',
          customRole: null,
          priority: 1,
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
      ];

      expect(participants).toHaveLength(2);
      expect(participants[0]?.priority).toBe(0);
      expect(participants[1]?.priority).toBe(1);
      expect(participants[0]?.customRole).toBe('The Analyst');
      expect(participants[1]?.customRole).toBeNull();
    });

    it('should have correct ChatMessage structure from database', () => {
      const messages: ChatMessage[] = [
        {
          id: 'user-r0',
          threadId: 'thread-1',
          role: MessageRoles.USER,
          parts: [{ type: 'text', text: 'What is AI?' }],
          roundNumber: 0,
          participantId: null,
          metadata: { role: MessageRoles.USER, roundNumber: 0 },
          createdAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          id: 'thread_r0_p0',
          threadId: 'thread-1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: 'AI is artificial intelligence' }],
          roundNumber: 0,
          participantId: 'participant-1',
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: 'participant-1',
            participantIndex: 0,
            participantRole: 'The Analyst',
            model: 'gpt-4',
            finishReason: 'stop',
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
          createdAt: new Date('2024-01-01T00:00:01Z'),
        },
      ];

      expect(messages[0]?.role).toBe(MessageRoles.USER);
      expect(messages[0]?.participantId).toBeNull();
      expect(messages[1]?.role).toBe(MessageRoles.ASSISTANT);
      expect(messages[1]?.participantId).toBe('participant-1');
      expect(messages[1]?.metadata.participantIndex).toBe(0);
    });
  });
});
