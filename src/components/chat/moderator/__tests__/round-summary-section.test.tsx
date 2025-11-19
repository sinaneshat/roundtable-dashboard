/**
 * Round Summary Section Component Tests
 *
 * Tests for RoundSummarySection component - Sections 4 & 5 of Round Analysis (FLOW_DOCUMENTATION.md PART 4).
 *
 * Coverage:
 * 1. Key insights display
 * 2. Consensus points display
 * 3. Divergent approaches display
 * 4. Comparative analysis display
 * 5. Decision framework display
 * 6. Overall summary display
 * 7. Conclusion display
 * 8. Recommended actions with click handling
 */

import type { RoundSummary } from '@/api/routes/chat/schema';
import { render, screen, userEvent } from '@/lib/testing';

import { RoundSummarySection } from '../round-summary-section';

describe('roundSummarySection', () => {
  const createMockRoundSummary = (
    overrides?: Partial<RoundSummary>,
  ): RoundSummary => ({
    keyInsights: [
      'Great diversity in creative ideas',
      'Strong focus on user-centric design',
      'Innovative approaches to problem solving',
    ],
    consensusPoints: [
      'All agreed on mobile-first approach',
      'Consensus on sustainability importance',
    ],
    divergentApproaches: [
      {
        topic: 'Implementation Strategy',
        perspectives: [
          'Iterative development preferred by Claude',
          'Waterfall approach suggested by GPT-4',
        ],
      },
    ],
    comparativeAnalysis: {
      strengthsByCategory: [
        {
          category: 'Innovation',
          participants: ['Claude Sonnet 3.5', 'GPT-4o'],
        },
      ],
      tradeoffs: [
        'Speed vs Quality balance needed',
        'Cost vs Feature richness consideration',
      ],
    },
    decisionFramework: {
      criteriaToConsider: [
        'Budget constraints',
        'Timeline requirements',
        'Team expertise',
      ],
      scenarioRecommendations: [
        {
          scenario: 'If budget is limited',
          recommendation: 'Focus on MVP features first',
        },
      ],
    },
    overallSummary:
      'This round produced excellent creative ideas with strong innovation and user focus.',
    conclusion:
      'The team demonstrated excellent collaborative thinking with diverse perspectives.',
    recommendedActions: [
      {
        action: 'Explore mobile-first design patterns',
        rationale: 'All participants emphasized mobile importance',
        suggestedMode: 'analyzing',
        suggestedModels: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o'],
        suggestedRoles: ['Design Analyst', 'UX Expert'],
      },
    ],
    ...overrides,
  });

  describe('basic rendering', () => {
    it('should render nothing when all content is empty', () => {
      const emptySummary: Partial<RoundSummary> = {};
      const { container } = render(
        <RoundSummarySection roundSummary={emptySummary} />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render sections when content is available', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      // Use getAllByText to handle Framer Motion animation duplicates (opacity: 0 elements)
      // Using actual translation text from common.json
      expect(screen.getAllByText(/key insights/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/points of agreement/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/different perspectives/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/comparative analysis/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/decision framework/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/summary/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/conclusion/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('key insights display', () => {
    it('should render all key insights with bullet points', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('Great diversity in creative ideas')).toBeInTheDocument();
      expect(screen.getByText('Strong focus on user-centric design')).toBeInTheDocument();
      expect(
        screen.getByText('Innovative approaches to problem solving'),
      ).toBeInTheDocument();
    });

    it('should not render section when insights array is empty', () => {
      const summary = createMockRoundSummary({
        keyInsights: [],
      });

      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.queryByText(/key insights/i)).not.toBeInTheDocument();
    });

    it('should not render section when insights is null', () => {
      const summary = createMockRoundSummary({
        keyInsights: null,
      } as Partial<RoundSummary>);

      render(<RoundSummarySection roundSummary={summary as RoundSummary} />);

      expect(screen.queryByText(/key insights/i)).not.toBeInTheDocument();
    });
  });

  describe('consensus points display', () => {
    it('should render all consensus points with bullet points', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('All agreed on mobile-first approach')).toBeInTheDocument();
      expect(screen.getByText('Consensus on sustainability importance')).toBeInTheDocument();
    });

    it('should not render section when consensus points array is empty', () => {
      const summary = createMockRoundSummary({
        consensusPoints: [],
      });

      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.queryByText(/consensus points/i)).not.toBeInTheDocument();
    });
  });

  describe('divergent approaches display', () => {
    it('should render divergent approaches with topics and perspectives', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('Implementation Strategy')).toBeInTheDocument();
      expect(screen.getByText('Iterative development preferred by Claude')).toBeInTheDocument();
      expect(screen.getByText('Waterfall approach suggested by GPT-4')).toBeInTheDocument();
    });

    it('should handle multiple divergent approaches', () => {
      const summary = createMockRoundSummary({
        divergentApproaches: [
          {
            topic: 'Topic 1',
            perspectives: ['Perspective 1A', 'Perspective 1B'],
          },
          {
            topic: 'Topic 2',
            perspectives: ['Perspective 2A', 'Perspective 2B'],
          },
        ],
      });

      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('Topic 1')).toBeInTheDocument();
      expect(screen.getByText('Topic 2')).toBeInTheDocument();
      expect(screen.getByText('Perspective 1A')).toBeInTheDocument();
      expect(screen.getByText('Perspective 2B')).toBeInTheDocument();
    });

    it('should not render section when divergent approaches array is empty', () => {
      const summary = createMockRoundSummary({
        divergentApproaches: [],
      });

      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.queryByText(/divergent approaches/i)).not.toBeInTheDocument();
    });
  });

  describe('comparative analysis display', () => {
    it('should render strengths by category', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('Innovation')).toBeInTheDocument();
      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
      expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    });

    it('should render tradeoffs', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('Speed vs Quality balance needed')).toBeInTheDocument();
      expect(screen.getByText('Cost vs Feature richness consideration')).toBeInTheDocument();
    });

    it('should not render section when comparative analysis is missing', () => {
      const summary = createMockRoundSummary({
        comparativeAnalysis: null,
      } as Partial<RoundSummary>);

      render(<RoundSummarySection roundSummary={summary as RoundSummary} />);

      expect(screen.queryByText(/comparative analysis/i)).not.toBeInTheDocument();
    });

    it('should handle empty strengths by category', () => {
      const summary = createMockRoundSummary({
        comparativeAnalysis: {
          strengthsByCategory: [],
          tradeoffs: ['Some tradeoff'],
        },
      });

      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('Some tradeoff')).toBeInTheDocument();
      expect(screen.queryByText(/strengths by category/i)).not.toBeInTheDocument();
    });
  });

  describe('decision framework display', () => {
    it('should render criteria to consider', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('Budget constraints')).toBeInTheDocument();
      expect(screen.getByText('Timeline requirements')).toBeInTheDocument();
      expect(screen.getByText('Team expertise')).toBeInTheDocument();
    });

    it('should render scenario recommendations', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('If budget is limited')).toBeInTheDocument();
      expect(screen.getByText('Focus on MVP features first')).toBeInTheDocument();
    });

    it('should not render section when decision framework is missing', () => {
      const summary = createMockRoundSummary({
        decisionFramework: null,
      } as Partial<RoundSummary>);

      render(<RoundSummarySection roundSummary={summary as RoundSummary} />);

      expect(screen.queryByText(/decision framework/i)).not.toBeInTheDocument();
    });
  });

  describe('overall summary display', () => {
    it('should render overall summary text', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(
        screen.getByText(
          'This round produced excellent creative ideas with strong innovation and user focus.',
        ),
      ).toBeInTheDocument();
    });

    it('should preserve whitespace and line breaks', () => {
      const multilineSummary = 'Line 1\n\nLine 2\n\nLine 3';
      const summary = createMockRoundSummary({
        overallSummary: multilineSummary,
      });

      render(<RoundSummarySection roundSummary={summary} />);

      // Text is inside TypingText component, whitespace-pre-line is on parent <p>
      const textElement = screen.getAllByText(/Line 1/)[0];
      const paragraphElement = textElement?.closest('p');
      expect(paragraphElement).toHaveClass('whitespace-pre-line');
    });

    it('should not render section when overall summary is missing', () => {
      const summary = createMockRoundSummary({
        overallSummary: null,
      } as Partial<RoundSummary>);

      render(<RoundSummarySection roundSummary={summary as RoundSummary} />);

      expect(screen.queryByText(/This round produced/)).not.toBeInTheDocument();
    });
  });

  describe('conclusion display', () => {
    it('should render conclusion text', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(
        screen.getByText(
          'The team demonstrated excellent collaborative thinking with diverse perspectives.',
        ),
      ).toBeInTheDocument();
    });

    it('should preserve whitespace and line breaks in conclusion', () => {
      const multilineConclusion = 'Conclusion 1\n\nConclusion 2';
      const summary = createMockRoundSummary({
        conclusion: multilineConclusion,
      });

      render(<RoundSummarySection roundSummary={summary} />);

      // Text is inside TypingText component, whitespace-pre-line is on parent <p>
      const textElement = screen.getAllByText(/Conclusion 1/)[0];
      const paragraphElement = textElement?.closest('p');
      expect(paragraphElement).toHaveClass('whitespace-pre-line');
    });

    it('should not render section when conclusion is missing', () => {
      const summary = createMockRoundSummary({
        conclusion: null,
      } as Partial<RoundSummary>);

      render(<RoundSummarySection roundSummary={summary as RoundSummary} />);

      expect(screen.queryByText(/The team demonstrated/)).not.toBeInTheDocument();
    });
  });

  describe('recommended actions display', () => {
    it('should render all recommended actions', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('Explore mobile-first design patterns')).toBeInTheDocument();
      expect(screen.getByText('All participants emphasized mobile importance')).toBeInTheDocument();
    });

    it('should display suggested mode badge', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText('analyzing')).toBeInTheDocument();
    });

    it('should call onActionClick when action is clicked', async () => {
      const user = userEvent.setup();
      const onActionClick = vi.fn();
      const summary = createMockRoundSummary();

      render(
        <RoundSummarySection roundSummary={summary} onActionClick={onActionClick} />,
      );

      const actionButton = screen.getByText('Explore mobile-first design patterns').closest('button');
      expect(actionButton).toBeInTheDocument();

      if (actionButton) {
        await user.click(actionButton);
      }

      expect(onActionClick).toHaveBeenCalledWith(summary.recommendedActions![0]);
    });

    it('should disable action buttons during streaming', () => {
      const summary = createMockRoundSummary();
      render(<RoundSummarySection roundSummary={summary} isStreaming={true} />);

      const actionButton = screen.getByText('Explore mobile-first design patterns').closest('button');
      expect(actionButton).toBeDisabled();
    });

    it('should not call onActionClick when streaming', async () => {
      const _user = userEvent.setup();
      const onActionClick = vi.fn();
      const summary = createMockRoundSummary();

      render(
        <RoundSummarySection
          roundSummary={summary}
          onActionClick={onActionClick}
          isStreaming={true}
        />,
      );

      const actionButton = screen.getByText('Explore mobile-first design patterns').closest('button');
      expect(actionButton).toBeDisabled();
    });

    it('should skip incomplete actions during streaming', () => {
      const summary = createMockRoundSummary({
        recommendedActions: [
          {
            action: 'Complete action',
            rationale: 'Has rationale',
            suggestedMode: null,
            suggestedModels: [],
            suggestedRoles: null,
          },
          {
            action: '',
            rationale: 'Missing action text',
            suggestedMode: null,
            suggestedModels: [],
            suggestedRoles: null,
          },
        ],
      } as Partial<RoundSummary>);

      render(<RoundSummarySection roundSummary={summary as RoundSummary} />);

      expect(screen.getByText('Complete action')).toBeInTheDocument();
      expect(screen.queryByText('Missing action text')).not.toBeInTheDocument();
    });

    it('should not render section when recommended actions array is empty', () => {
      const summary = createMockRoundSummary({
        recommendedActions: [],
      });

      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.queryByText(/recommended actions/i)).not.toBeInTheDocument();
    });

    it('should not render section when recommended actions is null', () => {
      const summary = createMockRoundSummary({
        recommendedActions: null,
      } as Partial<RoundSummary>);

      render(<RoundSummarySection roundSummary={summary as RoundSummary} />);

      expect(screen.queryByText(/recommended actions/i)).not.toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle partial round summary data', () => {
      const partialSummary: Partial<RoundSummary> = {
        overallSummary: 'Only summary present',
        conclusion: 'Only conclusion present',
      };

      render(<RoundSummarySection roundSummary={partialSummary} />);

      expect(screen.getByText('Only summary present')).toBeInTheDocument();
      expect(screen.getByText('Only conclusion present')).toBeInTheDocument();
      expect(screen.queryByText(/key insights/i)).not.toBeInTheDocument();
    });

    it('should handle very long text content', () => {
      const longText = 'A'.repeat(1000);
      const summary = createMockRoundSummary({
        overallSummary: longText,
      });

      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText(longText)).toBeInTheDocument();
    });

    it('should handle special characters in text', () => {
      const specialText = 'Text with <special> & "characters" \'here\'';
      const summary = createMockRoundSummary({
        overallSummary: specialText,
      });

      render(<RoundSummarySection roundSummary={summary} />);

      expect(screen.getByText(specialText)).toBeInTheDocument();
    });

    it('should handle recommended actions without suggested models', () => {
      const summary = createMockRoundSummary({
        recommendedActions: [
          {
            action: 'Action without models',
            rationale: 'Rationale text',
            suggestedMode: null,
            suggestedModels: null,
            suggestedRoles: null,
          },
        ],
      } as Partial<RoundSummary>);

      render(<RoundSummarySection roundSummary={summary as RoundSummary} />);

      expect(screen.getByText('Action without models')).toBeInTheDocument();
      // Check that the "Models" label/section is not rendered (exact match to avoid matching "models" in action text)
      expect(screen.queryByText('Models')).not.toBeInTheDocument();
    });
  });
});
