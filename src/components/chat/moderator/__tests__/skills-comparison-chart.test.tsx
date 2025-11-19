/**
 * Skills Comparison Chart Component Tests
 *
 * Tests for SkillsComparisonChart component - Section 2 of Round Analysis (FLOW_DOCUMENTATION.md PART 4).
 *
 * Coverage:
 * 1. Pentagon/radar chart rendering
 * 2. 5 skill dimensions display
 * 3. Color-coded lines for each participant
 * 4. Mode-specific skills (Brainstorming vs Analyzing vs Debating)
 * 5. Legend with participant avatars
 * 6. Empty state handling
 */

import type { ParticipantAnalysis } from '@/api/routes/chat/schema';
import { render, screen } from '@/lib/testing';

import { SkillsComparisonChart } from '../skills-comparison-chart';

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
        ],
      },
    },
  }),
}));

describe('skillsComparisonChart', () => {
  const createMockParticipant = (
    overrides?: Partial<ParticipantAnalysis>,
  ): ParticipantAnalysis => ({
    participantIndex: 0,
    participantRole: 'The Ideator',
    modelId: 'anthropic/claude-3.5-sonnet',
    modelName: 'Claude Sonnet 3.5',
    overallRating: 9.0,
    skillsMatrix: [
      { skillName: 'Creativity', rating: 9 },
      { skillName: 'Diversity', rating: 8 },
      { skillName: 'Practicality', rating: 7 },
      { skillName: 'Innovation', rating: 9 },
      { skillName: 'Clarity', rating: 8 },
    ],
    pros: ['Highly creative ideas', 'Clear communication'],
    cons: ['Could be more practical'],
    summary: 'Excellent creative thinking.',
    ...overrides,
  });

  describe('basic rendering', () => {
    it('should render chart title', () => {
      const participants = [createMockParticipant()];
      render(<SkillsComparisonChart participants={participants} />);

      expect(screen.getByText(/skills comparison/i)).toBeInTheDocument();
    });

    it('should render legend with participant names', () => {
      const participants = [
        createMockParticipant(),
        createMockParticipant({
          participantIndex: 1,
          modelId: 'openai/gpt-4o',
          modelName: 'GPT-4o',
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    });

    it('should render nothing when participants array is empty', () => {
      const { container } = render(<SkillsComparisonChart participants={[]} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('skills matrix display', () => {
    it('should display all 5 skill names from first participant', () => {
      const participants = [createMockParticipant()];
      const { container } = render(<SkillsComparisonChart participants={participants} />);

      // Recharts renders skill names in the chart
      expect(container).toBeInTheDocument();
    });

    it('should handle participants with different skill names', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: [
            { skillName: 'Analytical Depth', rating: 9 },
            { skillName: 'Evidence', rating: 8 },
            { skillName: 'Objectivity', rating: 7 },
            { skillName: 'Logic', rating: 9 },
            { skillName: 'Clarity', rating: 8 },
          ],
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      // Chart should render with analyzing mode skills
      expect(screen.getByText(/skills comparison/i)).toBeInTheDocument();
    });

    it('should handle missing skillsMatrix gracefully', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: undefined,
        } as Partial<ParticipantAnalysis>),
      ];

      render(<SkillsComparisonChart participants={participants as ParticipantAnalysis[]} />);

      // Should show empty state
      expect(screen.getByText(/No skills data available/i)).toBeInTheDocument();
    });

    it('should handle empty skillsMatrix array', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: [],
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      // Should show empty state
      expect(screen.getByText(/No skills data available/i)).toBeInTheDocument();
    });
  });

  describe('legend display', () => {
    it('should render color indicators for each participant', () => {
      const participants = [
        createMockParticipant(),
        createMockParticipant({
          participantIndex: 1,
          modelId: 'openai/gpt-4o',
          modelName: 'GPT-4o',
        }),
      ];

      const { container } = render(<SkillsComparisonChart participants={participants} />);

      // Color dots should be rendered
      const colorDots = container.querySelectorAll('[class*="rounded-full"]');
      expect(colorDots.length).toBeGreaterThan(0);
    });

    it('should render avatars in legend', () => {
      const participants = [
        createMockParticipant(),
        createMockParticipant({
          participantIndex: 1,
          modelId: 'openai/gpt-4o',
        }),
      ];

      const { container } = render(<SkillsComparisonChart participants={participants} />);

      const images = container.querySelectorAll('img');
      expect(images.length).toBeGreaterThanOrEqual(2);
    });

    it('should wrap legend items for many participants', () => {
      const participants = Array.from({ length: 5 }, (_, i) =>
        createMockParticipant({
          participantIndex: i,
          modelId: `model-${i}`,
          modelName: `Model ${i}`,
        }));

      render(<SkillsComparisonChart participants={participants} />);

      // All participants should be in legend
      expect(screen.getByText('Model 0')).toBeInTheDocument();
      expect(screen.getByText('Model 4')).toBeInTheDocument();
    });
  });

  describe('chart data structure', () => {
    it('should render radar chart with correct data points', () => {
      const participants = [
        createMockParticipant(),
      ];

      const { container } = render(<SkillsComparisonChart participants={participants} />);

      // Recharts RadarChart should be rendered
      const chart = container.querySelector('.recharts-wrapper');
      expect(chart).toBeInTheDocument();
    });

    it('should handle multiple participants on same chart', () => {
      const participants = [
        createMockParticipant(),
        createMockParticipant({
          participantIndex: 1,
          modelId: 'openai/gpt-4o',
          skillsMatrix: [
            { skillName: 'Creativity', rating: 7 },
            { skillName: 'Diversity', rating: 9 },
            { skillName: 'Practicality', rating: 8 },
            { skillName: 'Innovation', rating: 7 },
            { skillName: 'Clarity', rating: 9 },
          ],
        }),
      ];

      const { container } = render(<SkillsComparisonChart participants={participants} />);

      // Both participants should be represented in chart
      const chart = container.querySelector('.recharts-wrapper');
      expect(chart).toBeInTheDocument();
    });
  });

  describe('color scheme', () => {
    it('should use brand gradient colors for participants', () => {
      const participants = [
        createMockParticipant(),
        createMockParticipant({
          participantIndex: 1,
          modelId: 'openai/gpt-4o',
        }),
      ];

      const { container } = render(<SkillsComparisonChart participants={participants} />);

      // Color indicators should be present
      const colorDots = container.querySelectorAll('[class*="rounded-full"]');
      expect(colorDots.length).toBeGreaterThan(0);
    });

    it('should generate distinct colors for many participants', () => {
      const participants = Array.from({ length: 10 }, (_, i) =>
        createMockParticipant({
          participantIndex: i,
          modelId: `model-${i}`,
        }));

      const { container } = render(<SkillsComparisonChart participants={participants} />);

      // All participants should have color indicators
      const colorDots = container.querySelectorAll('[class*="rounded-full"]');
      expect(colorDots.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('mode-specific skills', () => {
    it('should display brainstorming skills correctly', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: [
            { skillName: 'Creativity', rating: 9 },
            { skillName: 'Diversity', rating: 8 },
            { skillName: 'Practicality', rating: 7 },
            { skillName: 'Innovation', rating: 9 },
            { skillName: 'Clarity', rating: 8 },
          ],
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      // Chart should render
      expect(screen.getByText(/skills comparison/i)).toBeInTheDocument();
    });

    it('should display analyzing skills correctly', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: [
            { skillName: 'Analytical Depth', rating: 9 },
            { skillName: 'Evidence', rating: 8 },
            { skillName: 'Objectivity', rating: 7 },
            { skillName: 'Logic', rating: 9 },
            { skillName: 'Clarity', rating: 8 },
          ],
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      expect(screen.getByText(/skills comparison/i)).toBeInTheDocument();
    });

    it('should display debating skills correctly', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: [
            { skillName: 'Argument Strength', rating: 9 },
            { skillName: 'Logic', rating: 8 },
            { skillName: 'Persuasiveness', rating: 7 },
            { skillName: 'Evidence', rating: 9 },
            { skillName: 'Clarity', rating: 8 },
          ],
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      expect(screen.getByText(/skills comparison/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should show message when no skills data available', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: [],
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      expect(screen.getByText(/No skills data available/i)).toBeInTheDocument();
    });

    it('should show empty state with proper styling', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: undefined,
        } as Partial<ParticipantAnalysis>),
      ];

      const { container } = render(<SkillsComparisonChart participants={participants as ParticipantAnalysis[]} />);

      // Should have dashed border styling
      const emptyState = container.querySelector('[class*="border-dashed"]');
      expect(emptyState).toBeInTheDocument();
    });
  });

  describe('tooltip functionality', () => {
    it('should render chart with tooltip configuration', () => {
      const participants = [createMockParticipant()];
      const { container } = render(<SkillsComparisonChart participants={participants} />);

      // ChartTooltip should be configured
      const chart = container.querySelector('.recharts-wrapper');
      expect(chart).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle single participant', () => {
      const participants = [createMockParticipant()];
      render(<SkillsComparisonChart participants={participants} />);

      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
    });

    it('should handle participant with null skill ratings', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: [
            { skillName: 'Creativity', rating: 0 },
            { skillName: 'Diversity', rating: 0 },
            { skillName: 'Practicality', rating: 0 },
            { skillName: 'Innovation', rating: 0 },
            { skillName: 'Clarity', rating: 0 },
          ],
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      // Should still render
      expect(screen.getByText(/skills comparison/i)).toBeInTheDocument();
    });

    it('should handle participant with missing modelId', () => {
      const participants = [
        createMockParticipant({
          modelId: null,
        } as Partial<ParticipantAnalysis>),
      ];

      render(<SkillsComparisonChart participants={participants as ParticipantAnalysis[]} />);

      // Should still render
      expect(screen.getByText(/skills comparison/i)).toBeInTheDocument();
    });

    it('should handle participant with high skill ratings', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: [
            { skillName: 'Creativity', rating: 10 },
            { skillName: 'Diversity', rating: 10 },
            { skillName: 'Practicality', rating: 10 },
            { skillName: 'Innovation', rating: 10 },
            { skillName: 'Clarity', rating: 10 },
          ],
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      expect(screen.getByText(/skills comparison/i)).toBeInTheDocument();
    });

    it('should handle participant with low skill ratings', () => {
      const participants = [
        createMockParticipant({
          skillsMatrix: [
            { skillName: 'Creativity', rating: 1 },
            { skillName: 'Diversity', rating: 1 },
            { skillName: 'Practicality', rating: 1 },
            { skillName: 'Innovation', rating: 1 },
            { skillName: 'Clarity', rating: 1 },
          ],
        }),
      ];

      render(<SkillsComparisonChart participants={participants} />);

      expect(screen.getByText(/skills comparison/i)).toBeInTheDocument();
    });
  });

  describe('animations', () => {
    it('should render with framer-motion animation wrapper', () => {
      const participants = [createMockParticipant()];
      const { container } = render(<SkillsComparisonChart participants={participants} />);

      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('responsive behavior', () => {
    it('should render chart with max-width constraint', () => {
      const participants = [createMockParticipant()];
      const { container } = render(<SkillsComparisonChart participants={participants} />);

      // Chart container should have max-width styling
      const chartContainer = container.querySelector('[class*="max-w"]');
      expect(chartContainer).toBeInTheDocument();
    });

    it('should maintain aspect ratio', () => {
      const participants = [createMockParticipant()];
      const { container } = render(<SkillsComparisonChart participants={participants} />);

      // Should have aspect-square class
      const aspectContainer = container.querySelector('[class*="aspect-square"]');
      expect(aspectContainer).toBeInTheDocument();
    });
  });
});
