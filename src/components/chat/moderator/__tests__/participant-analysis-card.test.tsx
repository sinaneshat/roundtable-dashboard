/**
 * Participant Analysis Card Component Tests
 *
 * Tests for ParticipantAnalysisCard component - Section 3 of Round Analysis (FLOW_DOCUMENTATION.md PART 4).
 *
 * Coverage:
 * 1. Participant card rendering with avatar and name
 * 2. Strengths display with green checkmarks
 * 3. Areas for improvement with orange warnings
 * 4. Summary text display
 * 5. Overall rating display with color coding
 * 6. Rank badge for top 3 performers
 */

import type { ParticipantAnalysis } from '@/api/routes/chat/schema';
import { render, screen } from '@/lib/testing';

import { ParticipantAnalysisCard } from '../participant-analysis-card';

// Mock next/image
vi.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line jsx-a11y/alt-text, next/no-img-element
    return <img {...(props as never)} />;
  },
}));

describe('participantAnalysisCard', () => {
  const createMockAnalysis = (
    overrides?: Partial<ParticipantAnalysis>,
  ): ParticipantAnalysis => ({
    participantIndex: 0,
    participantRole: 'The Ideator',
    modelId: 'anthropic/claude-3.5-sonnet',
    modelName: 'Claude Sonnet 3.5',
    overallRating: 9.2,
    skillsMatrix: [
      { skillName: 'Creativity', rating: 9 },
      { skillName: 'Diversity', rating: 10 },
      { skillName: 'Practicality', rating: 8 },
      { skillName: 'Innovation', rating: 9 },
      { skillName: 'Clarity', rating: 9 },
    ],
    pros: [
      'Highly creative and innovative ideas',
      'Excellent diversity in perspectives',
      'Clear and articulate communication',
    ],
    cons: [
      'Could use more practical examples',
      'Some ideas need further development',
    ],
    summary: 'Excellent creative thinking with innovative approaches and clear communication.',
    ...overrides,
  });

  describe('basic rendering', () => {
    it('should render participant name', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
    });

    it('should render participant role when available', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      // Multiple elements may exist due to Framer Motion animations (opacity: 0 duplicates)
      const roleElements = screen.getAllByText((_content, element) => {
        return element?.textContent === '• The Ideator';
      });
      expect(roleElements.length).toBeGreaterThanOrEqual(1);
      // Find the visible element (without opacity: 0)
      const visibleElement = roleElements.find((el) => {
        const style = window.getComputedStyle(el);
        return style.opacity !== '0';
      }) || roleElements[roleElements.length - 1];
      expect(visibleElement).toBeInTheDocument();
    });

    it('should render without role when null', () => {
      const analysis = createMockAnalysis({
        participantRole: null,
      });

      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
      expect(screen.queryByText('The Ideator')).not.toBeInTheDocument();
    });

    it('should render avatar image', () => {
      const analysis = createMockAnalysis();
      const { container } = render(<ParticipantAnalysisCard analysis={analysis} />);

      const images = container.querySelectorAll('img');
      expect(images.length).toBeGreaterThan(0);
    });
  });

  describe('overall rating display', () => {
    it('should display rating with one decimal place', () => {
      const analysis = createMockAnalysis({ overallRating: 9.25 });
      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('9.3')).toBeInTheDocument();
    });

    it('should display /10 suffix', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('/10')).toBeInTheDocument();
    });

    it('should apply green color for high ratings (>= 8)', () => {
      const analysis = createMockAnalysis({ overallRating: 8.5 });
      render(<ParticipantAnalysisCard analysis={analysis} />);

      const ratingElement = screen.getByText('8.5');
      expect(ratingElement).toHaveClass('text-green-500');
    });

    it('should apply yellow color for medium ratings (6-7.9)', () => {
      const analysis = createMockAnalysis({ overallRating: 7.0 });
      render(<ParticipantAnalysisCard analysis={analysis} />);

      const ratingElement = screen.getByText('7.0');
      expect(ratingElement).toHaveClass('text-yellow-500');
    });

    it('should apply orange color for low ratings (< 6)', () => {
      const analysis = createMockAnalysis({ overallRating: 5.5 });
      render(<ParticipantAnalysisCard analysis={analysis} />);

      const ratingElement = screen.getByText('5.5');
      expect(ratingElement).toHaveClass('text-orange-500');
    });

    it('should handle null rating gracefully', () => {
      const analysis = createMockAnalysis({ overallRating: null } as Partial<ParticipantAnalysis>);
      render(<ParticipantAnalysisCard analysis={analysis as ParticipantAnalysis} />);

      expect(screen.getByText('–')).toBeInTheDocument();
    });

    it('should handle undefined rating gracefully', () => {
      const analysis = createMockAnalysis({ overallRating: undefined } as Partial<ParticipantAnalysis>);
      render(<ParticipantAnalysisCard analysis={analysis as ParticipantAnalysis} />);

      expect(screen.getByText('–')).toBeInTheDocument();
    });
  });

  describe('rank badge display', () => {
    it('should display gold badge for 1st place', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} rank={1} />);

      const badge = screen.getByText('1');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-yellow-500');
    });

    it('should display silver badge for 2nd place', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} rank={2} />);

      const badge = screen.getByText('2');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-gray-400');
    });

    it('should display bronze badge for 3rd place', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} rank={3} />);

      const badge = screen.getByText('3');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('bg-orange-600');
    });

    it('should not display badge for ranks > 3', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} rank={4} />);

      expect(screen.queryByText('4')).not.toBeInTheDocument();
    });

    it('should not display badge when rank is not provided', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      const { container } = render(<ParticipantAnalysisCard analysis={analysis} />);
      const badges = container.querySelectorAll('[class*="absolute"]');
      // Avatar is absolute positioned, but no rank badge
      expect(badges.length).toBeLessThan(2);
    });
  });

  describe('strengths display', () => {
    it('should render strengths section header', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText(/strengths/i)).toBeInTheDocument();
    });

    it('should display all strengths with checkmarks', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('Highly creative and innovative ideas')).toBeInTheDocument();
      expect(screen.getByText('Excellent diversity in perspectives')).toBeInTheDocument();
      expect(screen.getByText('Clear and articulate communication')).toBeInTheDocument();

      // Checkmarks should be present
      const checkmarks = screen.getAllByText('✓');
      expect(checkmarks.length).toBeGreaterThanOrEqual(3);
    });

    it('should limit displayed strengths to 3', () => {
      const analysis = createMockAnalysis({
        pros: [
          'Strength 1',
          'Strength 2',
          'Strength 3',
          'Strength 4',
          'Strength 5',
        ],
      });

      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('Strength 1')).toBeInTheDocument();
      expect(screen.getByText('Strength 2')).toBeInTheDocument();
      expect(screen.getByText('Strength 3')).toBeInTheDocument();
      expect(screen.getByText('+2 more')).toBeInTheDocument();
    });

    it('should handle empty strengths array', () => {
      const analysis = createMockAnalysis({
        pros: [],
      });

      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText(/strengths/i)).toBeInTheDocument();
      // No checkmarks should be present
      const checkmarks = screen.queryAllByText('✓');
      expect(checkmarks).toHaveLength(0);
    });

    it('should handle null strengths', () => {
      const analysis = createMockAnalysis({
        pros: null,
      } as Partial<ParticipantAnalysis>);

      render(<ParticipantAnalysisCard analysis={analysis as ParticipantAnalysis} />);

      expect(screen.getByText(/strengths/i)).toBeInTheDocument();
    });
  });

  describe('areas for improvement display', () => {
    it('should render areas for improvement section header', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText(/areas for improvement/i)).toBeInTheDocument();
    });

    it('should display all areas for improvement with warning icons', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('Could use more practical examples')).toBeInTheDocument();
      expect(screen.getByText('Some ideas need further development')).toBeInTheDocument();

      // Warning icons should be present
      const warnings = screen.getAllByText('!');
      expect(warnings.length).toBeGreaterThanOrEqual(2);
    });

    it('should limit displayed improvements to 3', () => {
      const analysis = createMockAnalysis({
        cons: [
          'Improvement 1',
          'Improvement 2',
          'Improvement 3',
          'Improvement 4',
        ],
      });

      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('Improvement 1')).toBeInTheDocument();
      expect(screen.getByText('Improvement 2')).toBeInTheDocument();
      expect(screen.getByText('Improvement 3')).toBeInTheDocument();
      expect(screen.getByText('+1 more')).toBeInTheDocument();
    });

    it('should handle empty improvements array', () => {
      const analysis = createMockAnalysis({
        cons: [],
      });

      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText(/areas for improvement/i)).toBeInTheDocument();
      // No warning icons should be present
      const warnings = screen.queryAllByText('!');
      expect(warnings).toHaveLength(0);
    });

    it('should handle null improvements', () => {
      const analysis = createMockAnalysis({
        cons: null,
      } as Partial<ParticipantAnalysis>);

      render(<ParticipantAnalysisCard analysis={analysis as ParticipantAnalysis} />);

      expect(screen.getByText(/areas for improvement/i)).toBeInTheDocument();
    });
  });

  describe('summary display', () => {
    it('should render summary section header', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText(/summary/i)).toBeInTheDocument();
    });

    it('should display summary text', () => {
      const analysis = createMockAnalysis();
      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(
        screen.getByText(
          'Excellent creative thinking with innovative approaches and clear communication.',
        ),
      ).toBeInTheDocument();
    });

    it('should not render summary section when summary is null', () => {
      const analysis = createMockAnalysis({
        summary: null,
      } as Partial<ParticipantAnalysis>);

      render(<ParticipantAnalysisCard analysis={analysis as ParticipantAnalysis} />);

      // Summary header should not be present when no summary
      const summaryHeaders = screen.queryAllByText(/summary/i);
      expect(summaryHeaders).toHaveLength(0);
    });

    it('should not render summary section when summary is empty', () => {
      const analysis = createMockAnalysis({
        summary: '',
      });

      render(<ParticipantAnalysisCard analysis={analysis} />);

      const summaryHeaders = screen.queryAllByText(/summary/i);
      expect(summaryHeaders).toHaveLength(0);
    });
  });

  describe('layout and styling', () => {
    it('should use grid layout for strengths and improvements', () => {
      const analysis = createMockAnalysis();
      const { container } = render(<ParticipantAnalysisCard analysis={analysis} />);

      const gridContainer = container.querySelector('[class*="grid-cols-2"]');
      expect(gridContainer).toBeInTheDocument();
    });

    it('should apply proper spacing between sections', () => {
      const analysis = createMockAnalysis();
      const { container } = render(<ParticipantAnalysisCard analysis={analysis} />);

      const spacedContainers = container.querySelectorAll('[class*="space-y"]');
      expect(spacedContainers.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle missing modelId', () => {
      const analysis = createMockAnalysis({
        modelId: null,
        modelName: null,
      } as Partial<ParticipantAnalysis>);

      render(<ParticipantAnalysisCard analysis={analysis as ParticipantAnalysis} />);

      // Should still render without crashing (renders AI as fallback)
      expect(screen.getByText('AI')).toBeInTheDocument();
      // Multiple elements may exist due to Framer Motion animations
      const roleElements = screen.getAllByText((_content, element) => {
        return element?.textContent === '• The Ideator';
      });
      expect(roleElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle missing modelName', () => {
      const analysis = createMockAnalysis({
        modelName: null,
      } as Partial<ParticipantAnalysis>);

      render(<ParticipantAnalysisCard analysis={analysis as ParticipantAnalysis} />);

      // Should still render with modelId display name
      expect(screen.getByText('claude-3.5-sonnet')).toBeInTheDocument();
      // Multiple elements may exist due to Framer Motion animations
      const roleElements = screen.getAllByText((_content, element) => {
        return element?.textContent === '• The Ideator';
      });
      expect(roleElements.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle very long summary text', () => {
      const longSummary = 'A'.repeat(500);
      const analysis = createMockAnalysis({
        summary: longSummary,
      });

      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText(longSummary)).toBeInTheDocument();
    });

    it('should handle very long strength text', () => {
      const longStrength = 'This is a very long strength description '.repeat(10);
      const analysis = createMockAnalysis({
        pros: [longStrength],
      });

      const { container } = render(<ParticipantAnalysisCard analysis={analysis} />);

      // Text should be present (check that strengths section has the long text)
      const strengthsSection = container.querySelector('ul.space-y-0\\.5');
      expect(strengthsSection?.textContent).toContain('This is a very long strength description');
    });

    it('should handle participant with no data', () => {
      const analysis = createMockAnalysis({
        pros: [],
        cons: [],
        summary: null,
      } as Partial<ParticipantAnalysis>);

      render(<ParticipantAnalysisCard analysis={analysis as ParticipantAnalysis} />);

      // Should still render name and rating
      expect(screen.getByText('Claude Sonnet 3.5')).toBeInTheDocument();
      expect(screen.getByText('9.2')).toBeInTheDocument();
    });

    it('should handle perfect 10 rating', () => {
      const analysis = createMockAnalysis({
        overallRating: 10.0,
      });

      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('10.0')).toBeInTheDocument();
      const ratingElement = screen.getByText('10.0');
      expect(ratingElement).toHaveClass('text-green-500');
    });

    it('should handle minimum 1 rating', () => {
      const analysis = createMockAnalysis({
        overallRating: 1.0,
      });

      render(<ParticipantAnalysisCard analysis={analysis} />);

      expect(screen.getByText('1.0')).toBeInTheDocument();
      const ratingElement = screen.getByText('1.0');
      expect(ratingElement).toHaveClass('text-orange-500');
    });
  });
});
