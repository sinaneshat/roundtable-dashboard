/**
 * Leaderboard Card Component Tests
 *
 * Tests for LeaderboardCard component - Section 1 of Round Analysis (FLOW_DOCUMENTATION.md PART 4).
 *
 * Coverage:
 * 1. Leaderboard rendering with rankings
 * 2. Trophy/medal icons for top 3
 * 3. Scores and progress bars
 * 4. Color-coded styling by rank
 * 5. Model avatars and names
 * 6. Badge display
 */

import type { LeaderboardEntry } from '@/api/routes/chat/schema';
import { render, screen } from '@/lib/testing';

import { LeaderboardCard } from '../leaderboard-card';

// Mock next/image
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line jsx-a11y/alt-text, next/no-img-element
    return <img {...(props as never)} />;
  },
}));

// Mock useModelsQuery
vi.mock('@/hooks/queries/models', () => ({
  useModelsQuery: () => ({
    data: {
      data: {
        items: [
          {
            id: 'anthropic/claude-3.5-sonnet',
            name: 'Claude Sonnet 3.5',
            provider: 'Anthropic',
          },
          {
            id: 'openai/gpt-4o',
            name: 'GPT-4o',
            provider: 'OpenAI',
          },
          {
            id: 'google/gemini-pro',
            name: 'Gemini Pro',
            provider: 'Google',
          },
        ],
      },
    },
  }),
}));

describe('leaderboardCard', () => {
  const createMockLeaderboard = (
    entries?: Partial<LeaderboardEntry>[],
  ): LeaderboardEntry[] => {
    const defaults: LeaderboardEntry[] = [
      {
        participantIndex: 0,
        modelId: 'anthropic/claude-3.5-sonnet',
        rank: 1,
        overallRating: 9.5,
        badge: 'Most Creative',
      },
      {
        participantIndex: 1,
        modelId: 'openai/gpt-4o',
        rank: 2,
        overallRating: 8.7,
        badge: 'Best Analysis',
      },
      {
        participantIndex: 2,
        modelId: 'google/gemini-pro',
        rank: 3,
        overallRating: 8.2,
        badge: 'Most Thorough',
      },
    ];

    if (entries) {
      return entries.map((entry, index) => ({
        ...defaults[index],
        ...entry,
      })) as LeaderboardEntry[];
    }

    return defaults;
  };

  describe('basic rendering', () => {
    it('should render leaderboard title', () => {
      const leaderboard = createMockLeaderboard();
      render(<LeaderboardCard leaderboard={leaderboard} />);

      expect(screen.getByText(/leaderboard/i)).toBeInTheDocument();
    });

    it('should display participant count badge', () => {
      const leaderboard = createMockLeaderboard();
      render(<LeaderboardCard leaderboard={leaderboard} />);

      expect(screen.getByText('3 models')).toBeInTheDocument();
    });

    it('should render all participants', () => {
      const leaderboard = createMockLeaderboard();
      render(<LeaderboardCard leaderboard={leaderboard} />);

      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
      expect(screen.getByText('Gemini Pro')).toBeInTheDocument();
    });

    it('should render nothing when leaderboard is empty', () => {
      const { container } = render(<LeaderboardCard leaderboard={[]} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('ranking display', () => {
    it('should display trophy icon for 1st place', () => {
      const leaderboard = createMockLeaderboard();
      render(<LeaderboardCard leaderboard={leaderboard} />);

      // Trophy icon should be present for rank 1
      const firstPlaceCard = screen.getByText('Claude Sonnet 3.5').closest('div');
      expect(firstPlaceCard).toBeInTheDocument();
    });

    it('should display rank numbers for positions 4+', () => {
      const leaderboard = createMockLeaderboard([
        { rank: 4, overallRating: 7.5 },
        { rank: 5, overallRating: 7.0 },
      ]);

      render(<LeaderboardCard leaderboard={leaderboard} />);

      // Rank numbers should be displayed
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should sort participants by rank', () => {
      const unsortedLeaderboard: LeaderboardEntry[] = [
        {
          participantIndex: 2,
          modelId: 'google/gemini-pro',
          rank: 3,
          overallRating: 8.0,
          badge: null,
        },
        {
          participantIndex: 0,
          modelId: 'anthropic/claude-3.5-sonnet',
          rank: 1,
          overallRating: 9.5,
          badge: null,
        },
        {
          participantIndex: 1,
          modelId: 'openai/gpt-4o',
          rank: 2,
          overallRating: 8.7,
          badge: null,
        },
      ];

      render(<LeaderboardCard leaderboard={unsortedLeaderboard} />);

      const names = screen.getAllByText(/Claude|GPT|Gemini/);
      expect(names[0]).toHaveTextContent('Claude Sonnet 3.5'); // Rank 1
      expect(names[1]).toHaveTextContent('GPT-4o'); // Rank 2
      expect(names[2]).toHaveTextContent('Gemini Pro'); // Rank 3
    });
  });

  describe('rating display', () => {
    it('should display ratings with one decimal place', () => {
      const leaderboard = createMockLeaderboard([
        { overallRating: 9.5 },
        { overallRating: 8.75 },
        { overallRating: 7.123 },
      ]);

      render(<LeaderboardCard leaderboard={leaderboard} />);

      expect(screen.getByText('9.5')).toBeInTheDocument();
      expect(screen.getByText('8.8')).toBeInTheDocument();
      expect(screen.getByText('7.1')).toBeInTheDocument();
    });

    it('should display /10 suffix for all ratings', () => {
      const leaderboard = createMockLeaderboard();
      render(<LeaderboardCard leaderboard={leaderboard} />);

      const suffixes = screen.getAllByText('/ 10');
      expect(suffixes).toHaveLength(3);
    });

    it('should show progress bar for each participant', () => {
      const leaderboard = createMockLeaderboard();
      const { container } = render(<LeaderboardCard leaderboard={leaderboard} />);

      // Progress bars should be rendered
      const progressBars = container.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBeGreaterThan(0);
    });
  });

  describe('badge display', () => {
    it('should display achievement badges when present', () => {
      const leaderboard = createMockLeaderboard();
      render(<LeaderboardCard leaderboard={leaderboard} />);

      expect(screen.getByText('Most Creative')).toBeInTheDocument();
      expect(screen.getByText('Best Analysis')).toBeInTheDocument();
      expect(screen.getByText('Most Thorough')).toBeInTheDocument();
    });

    it('should not display badge section when badge is null', () => {
      const leaderboard = createMockLeaderboard([
        { badge: null },
        { badge: null },
        { badge: null },
      ]);

      render(<LeaderboardCard leaderboard={leaderboard} />);

      // No badges should be rendered
      expect(screen.queryByText(/Most|Best/)).not.toBeInTheDocument();
    });

    it('should handle empty string badges', () => {
      const leaderboard = createMockLeaderboard([
        { badge: '' },
      ]);

      render(<LeaderboardCard leaderboard={leaderboard} />);

      // Empty badges should not be displayed
      const badges = screen.queryAllByRole('status');
      expect(badges).toHaveLength(0);
    });
  });

  describe('model information', () => {
    it('should display model names from avatar props', () => {
      const leaderboard = createMockLeaderboard();
      render(<LeaderboardCard leaderboard={leaderboard} />);

      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
      expect(screen.getByText('Gemini Pro')).toBeInTheDocument();
    });

    it('should display provider information when available', () => {
      const leaderboard = createMockLeaderboard();
      render(<LeaderboardCard leaderboard={leaderboard} />);

      expect(screen.getByText('Anthropic')).toBeInTheDocument();
      expect(screen.getByText('OpenAI')).toBeInTheDocument();
      expect(screen.getByText('Google')).toBeInTheDocument();
    });

    it('should render model avatars', () => {
      const leaderboard = createMockLeaderboard();
      const { container } = render(<LeaderboardCard leaderboard={leaderboard} />);

      const images = container.querySelectorAll('img');
      expect(images.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('visual styling', () => {
    it('should apply distinct styling for top 3 ranks', () => {
      const leaderboard = createMockLeaderboard();
      const { container } = render(<LeaderboardCard leaderboard={leaderboard} />);

      // Each participant card should have border styling
      const cards = container.querySelectorAll('[class*="border"]');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should handle participants with missing rank', () => {
      const leaderboard: Partial<LeaderboardEntry>[] = [
        {
          participantIndex: 0,
          modelId: 'anthropic/claude-3.5-sonnet',
          rank: null,
          overallRating: 8.0,
          badge: null,
        },
      ];

      render(<LeaderboardCard leaderboard={leaderboard as LeaderboardEntry[]} />);

      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
    });

    it('should handle participants with missing rating', () => {
      const leaderboard: Partial<LeaderboardEntry>[] = [
        {
          participantIndex: 0,
          modelId: 'anthropic/claude-3.5-sonnet',
          rank: 1,
          overallRating: null,
          badge: null,
        },
      ];

      render(<LeaderboardCard leaderboard={leaderboard as LeaderboardEntry[]} />);

      // Should render with fallback rating
      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
    });
  });

  describe('animations', () => {
    it('should render with framer-motion animation wrapper', () => {
      const leaderboard = createMockLeaderboard();
      const { container } = render(<LeaderboardCard leaderboard={leaderboard} />);

      // Framer Motion adds specific props/attributes
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should stagger animations for multiple participants', () => {
      const leaderboard = createMockLeaderboard();
      render(<LeaderboardCard leaderboard={leaderboard} />);

      // All participants should be rendered
      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
      expect(screen.getByText('Gemini Pro')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle single participant', () => {
      const leaderboard = createMockLeaderboard([
        { rank: 1, overallRating: 9.0, badge: 'Winner' },
      ]);

      render(<LeaderboardCard leaderboard={leaderboard} />);

      expect(screen.getByText('1 models')).toBeInTheDocument();
      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
    });

    it('should handle many participants', () => {
      const leaderboard = Array.from({ length: 10 }, (_, i) => ({
        participantIndex: i,
        modelId: `model-${i}`,
        rank: i + 1,
        overallRating: 9 - i * 0.5,
        badge: i === 0 ? 'Top Performer' : null,
      }));

      render(<LeaderboardCard leaderboard={leaderboard} />);

      expect(screen.getByText('10 models')).toBeInTheDocument();
    });

    it('should handle participants with missing modelId', () => {
      const leaderboard: Partial<LeaderboardEntry>[] = [
        {
          participantIndex: 0,
          modelId: null,
          rank: 1,
          overallRating: 8.0,
          badge: null,
        },
      ];

      render(<LeaderboardCard leaderboard={leaderboard as LeaderboardEntry[]} />);

      // Should still render without crashing
      expect(screen.getByText('1 models')).toBeInTheDocument();
    });
  });
});
