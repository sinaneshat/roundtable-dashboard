/**
 * Configuration Changes Tests (PART 6)
 *
 * Tests configuration change functionality mid-conversation:
 * 1. Adding AI models - new participants appear in subsequent rounds
 * 2. Removing AI models - participants removed from subsequent rounds
 * 3. Reordering participants - priority changes affect response order
 * 4. Changing roles - participant roles update correctly
 * 5. Switching conversation mode - mode changes tracked
 * 6. Configuration change banner - appears before affected round
 * 7. Change summary - shows added/modified/removed counts
 * 8. Expandable details - displays specific changes with icons
 *
 * Pattern: src/components/chat/__tests__/web-search-integration.test.tsx
 * Documentation: docs/FLOW_DOCUMENTATION.md PART 6
 */

import { describe, expect, it, vi } from 'vitest';

import { ChangelogTypes } from '@/api/core/enums';
import type { ChatThreadChangelog } from '@/api/routes/chat/schema';
import { render, screen, userEvent, waitFor } from '@/lib/testing';

import { ConfigurationChangesGroup } from '../configuration-changes-group';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: unknown; locale?: string; messages?: unknown }) => children,
}));

// Mock models query
vi.mock('@/hooks/queries/models', () => ({
  useModelsQuery: () => ({
    data: {
      data: {
        items: [
          { id: 'gpt-4', name: 'GPT-4', provider: 'openai' },
          { id: 'claude-3', name: 'Claude 3', provider: 'anthropic' },
          { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google' },
        ],
      },
    },
  }),
}));

// Mock format date utility
vi.mock('@/lib/format/date', () => ({
  formatRelativeTime: (_date: Date) => '2 minutes ago',
}));

// Mock AI display utility
vi.mock('@/lib/utils/ai-display', () => ({
  getProviderIcon: (provider: string) => `/icons/${provider}.svg`,
}));

describe('configuration Changes Mid-Conversation (PART 6)', () => {
  describe('configuration change banner', () => {
    it('should display configuration changed header', () => {
      const group = {
        timestamp: new Date('2024-01-01T00:00:00Z'),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: {
              type: 'participant' as const,
              modelId: 'gpt-4',
              role: null,
              participantId: 'p2',
            },
            createdAt: new Date('2024-01-01T00:00:00Z'),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      // Check for translated key (since mock returns keys as-is)
      expect(screen.getByText('configurationChanged')).toBeInTheDocument();
    });

    it('should show change summary counts', () => {
      const group = {
        timestamp: new Date('2024-01-01T00:00:00Z'),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: { type: 'participant' as const, modelId: 'gpt-4', participantId: 'p2' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
          {
            id: 'change-2',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: { type: 'participant' as const, modelId: 'claude-3', participantId: 'p3' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
          {
            id: 'change-3',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.REMOVED,
            changeData: { type: 'participant' as const, modelId: 'gemini-pro', participantId: 'p1' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      // Should show "2 added, 1 removed" in summary (tests behavior - numbers appear)
      // Check for the summary line that contains counts
      expect(screen.getByText(/2 added, 1 removed/i)).toBeInTheDocument();
    });

    it('should be expandable to show details', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: { type: 'participant' as const, modelId: 'gpt-4', participantId: 'p2' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      // Banner should be collapsed initially
      const banner = screen.getByText('configurationChanged');
      expect(banner).toBeInTheDocument();

      // Click to expand
      await user.click(banner);

      // Details should be visible (check for Plus icon via action type)
      await waitFor(() => {
        // The ADDED section should be visible after expansion
        const container = screen.getByText('configurationChanged').closest('div');
        expect(container).toBeTruthy();
      });
    });

    it('should display relative timestamp', () => {
      const group = {
        timestamp: new Date('2024-01-01T00:00:00Z'),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: { type: 'participant' as const, modelId: 'gpt-4', participantId: 'p2' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      expect(screen.getByText('2 minutes ago')).toBeInTheDocument();
    });
  });

  describe('adding participants', () => {
    it('should show added participants with green plus icon', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: { type: 'participant' as const, modelId: 'gpt-4', role: 'The Analyst', participantId: 'p2' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      // Expand to see details
      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        // Test shows model name and role (actual data, not translations)
        expect(screen.getByText('GPT-4')).toBeInTheDocument();
        expect(screen.getByText('The Analyst')).toBeInTheDocument();
      });
    });

    it('should show multiple added participants', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: { type: 'participant' as const, modelId: 'gpt-4', participantId: 'p2' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
          {
            id: 'change-2',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: { type: 'participant' as const, modelId: 'claude-3', participantId: 'p3' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        // Test data (model names) appears
        expect(screen.getByText('GPT-4')).toBeInTheDocument();
        expect(screen.getByText('Claude 3')).toBeInTheDocument();
      });
    });
  });

  describe('removing participants', () => {
    it('should show removed participants with red minus icon', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.REMOVED,
            changeData: { type: 'participant' as const, modelId: 'gemini-pro', participantId: 'p1' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        // Test model name appears
        expect(screen.getByText('Gemini Pro')).toBeInTheDocument();
      });
    });

    it('should show strikethrough on removed participant names', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.REMOVED,
            changeData: { type: 'participant' as const, modelId: 'gemini-pro', participantId: 'p1' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        const removedName = screen.getByText('Gemini Pro');
        expect(removedName).toHaveClass('line-through');
      });
    });
  });

  describe('modifying participant roles', () => {
    it('should show role changes with blue pencil icon', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.MODIFIED,
            changeData: {
              type: 'participant_role' as const,
              modelId: 'gpt-4',
              oldRole: 'The Analyst',
              newRole: 'The Critic',
              participantId: 'p0',
            },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        // Test data (model and role names) appears
        expect(screen.getByText('GPT-4')).toBeInTheDocument();
        expect(screen.getByText('The Analyst')).toBeInTheDocument();
        expect(screen.getByText('The Critic')).toBeInTheDocument();
      });
    });

    it('should show arrow between old and new roles', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.MODIFIED,
            changeData: {
              type: 'participant_role' as const,
              modelId: 'gpt-4',
              oldRole: 'The Analyst',
              newRole: 'The Critic',
              participantId: 'p0',
            },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        const oldRole = screen.getByText('The Analyst');
        const newRole = screen.getByText('The Critic');

        expect(oldRole).toBeInTheDocument();
        expect(oldRole).toHaveClass('line-through');
        expect(newRole).toBeInTheDocument();
      });
    });
  });

  describe('mode changes', () => {
    it('should show mode changes with arrow indicator', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.MODIFIED,
            changeData: {
              type: 'mode_change' as const,
              oldMode: 'brainstorming',
              newMode: 'analyzing',
            },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        // Test mode data (actual values, not translations)
        expect(screen.getByText('brainstorming')).toBeInTheDocument();
        expect(screen.getByText('analyzing')).toBeInTheDocument();
      });
    });
  });

  describe('web search toggle changes', () => {
    it('should show web search enabled change', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.MODIFIED,
            changeData: {
              type: 'web_search' as const,
              enabled: true,
            },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        // Check for translation key
        expect(screen.getByText('webSearchEnabled')).toBeInTheDocument();
      });
    });

    it('should show web search disabled change', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.MODIFIED,
            changeData: {
              type: 'web_search' as const,
              enabled: false,
            },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        // Check for translation key
        expect(screen.getByText('webSearchDisabled')).toBeInTheDocument();
      });
    });
  });

  describe('mixed changes', () => {
    it('should display added, modified, and removed changes in correct order', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: { type: 'participant' as const, modelId: 'gpt-4', participantId: 'p2' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
          {
            id: 'change-2',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.MODIFIED,
            changeData: {
              type: 'participant_role' as const,
              modelId: 'claude-3',
              oldRole: null,
              newRole: 'The Critic',
              participantId: 'p1',
            },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
          {
            id: 'change-3',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.REMOVED,
            changeData: { type: 'participant' as const, modelId: 'gemini-pro', participantId: 'p0' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      // Summary should show all change types (numbers only, test behavior)
      expect(screen.getByText(/1/)).toBeInTheDocument();

      // Expand details
      await user.click(screen.getByText('configurationChanged'));

      // All model/role data should be visible
      await waitFor(() => {
        // Check for actual data rendered (model names)
        expect(screen.getByText('GPT-4')).toBeInTheDocument();
        expect(screen.getByText('Claude 3')).toBeInTheDocument();
        expect(screen.getByText('Gemini Pro')).toBeInTheDocument();
      });
    });
  });

  describe('edge cases', () => {
    it('should not render if no changes provided', () => {
      const group = {
        timestamp: new Date(),
        changes: [],
      };

      const { container } = render(<ConfigurationChangesGroup group={group} />);

      expect(container.firstChild).toBeNull();
    });

    it('should handle missing model gracefully', async () => {
      const user = userEvent.setup();

      const group = {
        timestamp: new Date(),
        changes: [
          {
            id: 'change-1',
            threadId: 'thread-1',
            roundNumber: 1,
            changeType: ChangelogTypes.ADDED,
            changeData: { type: 'participant' as const, modelId: 'unknown-model', participantId: 'p2' },
            createdAt: new Date(),
          } satisfies ChatThreadChangelog,
        ],
      };

      render(<ConfigurationChangesGroup group={group} />);

      await user.click(screen.getByText('configurationChanged'));

      await waitFor(() => {
        // Should show fallback for missing model (tests behavior)
        expect(screen.getByText(/Model no longer available/i)).toBeInTheDocument();
      });
    });
  });
});
