/**
 * LoaderFive Component Unit Tests
 *
 * Tests the actual LoaderFive animation component behavior:
 * - Character splitting and rendering
 * - Space handling (non-breaking spaces)
 * - Empty/edge case handling
 * - Animation prop application
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock framer-motion to render static elements for testing
vi.mock('motion/react', () => ({
  motion: {
    span: ({
      children,
      initial,
      animate,
      transition,
      ...props
    }: {
      children: React.ReactNode;
      initial?: object;
      animate?: object;
      transition?: object;
      className?: string;
    }) => <span data-testid="animated-char" {...props}>{children}</span>,
  },
}));

// Import after mock
import { LoaderFive } from '../loader';

describe('loaderFive Component', () => {
  describe('character Rendering', () => {
    it('renders each character as a separate animated span', () => {
      render(<LoaderFive text="Hello" />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(5); // H, e, l, l, o
    });

    it('converts spaces to non-breaking spaces', () => {
      render(<LoaderFive text="Hi there" />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(8); // H, i, space, t, h, e, r, e

      // Find the space character (should be non-breaking space)
      const spaceChar = chars[2];
      expect(spaceChar.textContent).toBe('\u00A0');
    });

    it('handles multiple spaces correctly', () => {
      render(<LoaderFive text="A  B" />); // Two spaces

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(4); // A, space, space, B

      expect(chars[1].textContent).toBe('\u00A0');
      expect(chars[2].textContent).toBe('\u00A0');
    });
  });

  describe('text Content', () => {
    it('renders "Generating response from..." text correctly', () => {
      const text = 'Generating response from Claude...';
      render(<LoaderFive text={text} />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(text.length);

      // Verify first few characters
      expect(chars[0].textContent).toBe('G');
      expect(chars[1].textContent).toBe('e');
      expect(chars[2].textContent).toBe('n');
    });

    it('renders "Searching the web..." text correctly', () => {
      const text = 'Searching the web...';
      render(<LoaderFive text={text} />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(text.length);

      // Check the dots at the end
      expect(chars[text.length - 1].textContent).toBe('.');
      expect(chars[text.length - 2].textContent).toBe('.');
      expect(chars[text.length - 3].textContent).toBe('.');
    });

    it('renders "Analyzing participant responses..." text correctly', () => {
      const text = 'Analyzing participant responses...';
      render(<LoaderFive text={text} />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(text.length);
    });
  });

  describe('edge Cases', () => {
    it('handles empty string', () => {
      const { container } = render(<LoaderFive text="" />);

      // Should render container but no chars
      expect(container.firstChild).toBeInTheDocument();
      expect(screen.queryAllByTestId('animated-char')).toHaveLength(0);
    });

    it('handles single character', () => {
      render(<LoaderFive text="X" />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(1);
      expect(chars[0].textContent).toBe('X');
    });

    it('handles special characters', () => {
      render(<LoaderFive text="Hello! @#$" />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(10);

      // Verify special chars are rendered
      expect(chars[5].textContent).toBe('!');
      expect(chars[7].textContent).toBe('@');
      expect(chars[8].textContent).toBe('#');
      expect(chars[9].textContent).toBe('$');
    });

    it('handles unicode characters', () => {
      render(<LoaderFive text="Hello 👋" />);

      const chars = screen.getAllByTestId('animated-char');
      // Note: emoji is a single character in this context
      expect(chars.length).toBeGreaterThanOrEqual(7);
    });

    it('handles very long text', () => {
      const longText = 'A'.repeat(100);
      render(<LoaderFive text={longText} />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(100);
    });
  });

  describe('styling', () => {
    it('applies font-bold class to container', () => {
      const { container } = render(<LoaderFive text="Test" />);

      const div = container.firstChild as HTMLElement;
      expect(div.className).toContain('font-bold');
    });

    it('applies font-sans class to container', () => {
      const { container } = render(<LoaderFive text="Test" />);

      const div = container.firstChild as HTMLElement;
      expect(div.className).toContain('font-sans');
    });

    it('applies CSS custom properties for shadow color', () => {
      const { container } = render(<LoaderFive text="Test" />);

      const div = container.firstChild as HTMLElement;
      // Check for CSS variable classes
      expect(div.className).toContain('--shadow-color');
    });

    it('each character span has inline-block class', () => {
      render(<LoaderFive text="AB" />);

      const chars = screen.getAllByTestId('animated-char');
      chars.forEach((char) => {
        expect(char.className).toContain('inline-block');
      });
    });
  });

  describe('dynamic Text Changes', () => {
    it('updates when text prop changes', () => {
      const { rerender } = render(<LoaderFive text="First" />);

      let chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(5);
      expect(chars[0].textContent).toBe('F');

      rerender(<LoaderFive text="Second" />);

      chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(6);
      expect(chars[0].textContent).toBe('S');
    });

    it('handles text change from empty to non-empty', () => {
      const { rerender } = render(<LoaderFive text="" />);

      expect(screen.queryAllByTestId('animated-char')).toHaveLength(0);

      rerender(<LoaderFive text="Now visible" />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars).toHaveLength(11);
    });

    it('handles text change from non-empty to empty', () => {
      const { rerender } = render(<LoaderFive text="Visible" />);

      expect(screen.getAllByTestId('animated-char')).toHaveLength(7);

      rerender(<LoaderFive text="" />);

      expect(screen.queryAllByTestId('animated-char')).toHaveLength(0);
    });
  });

  describe('model Name Variations', () => {
    it('renders with Claude model name', () => {
      render(<LoaderFive text="Generating response from Claude 3.5 Sonnet..." />);

      const chars = screen.getAllByTestId('animated-char');
      expect(chars.length).toBeGreaterThan(0);

      // Reconstruct text to verify
      const text = chars.map(c => c.textContent === '\u00A0' ? ' ' : c.textContent).join('');
      expect(text).toBe('Generating response from Claude 3.5 Sonnet...');
    });

    it('renders with GPT model name', () => {
      render(<LoaderFive text="Generating response from GPT-4..." />);

      const chars = screen.getAllByTestId('animated-char');
      const text = chars.map(c => c.textContent === '\u00A0' ? ' ' : c.textContent).join('');
      expect(text).toBe('Generating response from GPT-4...');
    });

    it('renders with Gemini model name', () => {
      render(<LoaderFive text="Generating response from Gemini Pro..." />);

      const chars = screen.getAllByTestId('animated-char');
      const text = chars.map(c => c.textContent === '\u00A0' ? ' ' : c.textContent).join('');
      expect(text).toBe('Generating response from Gemini Pro...');
    });

    it('renders with AI Assistant fallback', () => {
      render(<LoaderFive text="Generating response from AI Assistant..." />);

      const chars = screen.getAllByTestId('animated-char');
      const text = chars.map(c => c.textContent === '\u00A0' ? ' ' : c.textContent).join('');
      expect(text).toBe('Generating response from AI Assistant...');
    });
  });
});
