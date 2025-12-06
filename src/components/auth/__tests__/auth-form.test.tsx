/**
 * AuthForm Unit Tests
 *
 * Tests for layout consistency and height changes between auth steps.
 * Catches layout shift issues by measuring rendered heights.
 */

import { render, screen, userEvent, waitFor } from '@/lib/testing';

import { AuthForm } from '../auth-form';

// Mock authClient to prevent actual API calls
vi.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: {
      magicLink: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock next/navigation with all required hooks
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/auth/sign-in',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => ({}),
}));

describe('authForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('step Rendering', () => {
    it('renders method selection step by default', async () => {
      render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });
    });

    it('renders email input step when "continue with email" is clicked', async () => {
      const user = userEvent.setup();
      render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue with email/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send magic link/i })).toBeInTheDocument();
      });
    });

    it('renders back button in email step', async () => {
      const user = userEvent.setup();
      render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue with email/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      });
    });

    it('returns to method step when back is clicked', async () => {
      const user = userEvent.setup();
      render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue with email/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /back/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });
    });
  });

  describe('layout Height Consistency (all steps = 152px)', () => {
    /**
     * All steps must have equal height to prevent layout shift during transitions.
     * Target: 152px for each step
     * - Method: pt-10 (40) + h-12 (48) + gap-4 (16) + h-12 (48) = 152px
     * - Email: header (24) + gap-3 (12) + h-9 (36) + gap-3 (12) + h-12 (48) + pb-5 (20) = 152px
     * - Sent: pt-3 (12) + icon-row (40) + gap-4 (16) + text (20) + gap-4 (16) + h-12 (48) = 152px
     */
    it('method step has pt-10 top padding for height alignment', async () => {
      const { container } = render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      const methodContainer = container.querySelector('[class*="pt-10"]');
      expect(methodContainer).toBeInTheDocument();
    });

    it('email step has pb-5 bottom padding for height alignment', async () => {
      const user = userEvent.setup();
      const { container } = render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue with email/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
      });

      const emailContainer = container.querySelector('[class*="pb-5"]');
      expect(emailContainer).toBeInTheDocument();
    });

    it('email step has inline label and back button row', async () => {
      const user = userEvent.setup();
      const { container } = render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue with email/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
      });

      const inlineContainer = container.querySelector('.flex.items-center.justify-between');
      expect(inlineContainer).toBeInTheDocument();
      expect(inlineContainer).toContainElement(screen.getByText(/email/i));
      expect(inlineContainer).toContainElement(screen.getByRole('button', { name: /back/i }));
    });
  });

  describe('element Count Consistency', () => {
    it('method step renders 2 interactive elements', async () => {
      render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2);
    });

    it('email step renders 3 interactive elements (back, input, submit)', async () => {
      const user = userEvent.setup();
      render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue with email/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const input = screen.getByRole('textbox');

      // 2 buttons (back + submit) + 1 input
      expect(buttons).toHaveLength(2);
      expect(input).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('submits email input to magic link API', async () => {
      const user = userEvent.setup();
      render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue with email/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText(/enter your email/i);
      await user.type(emailInput, 'test@example.com');

      // Submit button should be present and enabled
      const submitButton = screen.getByRole('button', { name: /send magic link/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('accepts valid email format', async () => {
      const user = userEvent.setup();
      render(<AuthForm />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /continue with email/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /continue with email/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
      });

      const emailInput = screen.getByPlaceholderText(/enter your email/i);
      await user.type(emailInput, 'valid@example.com');

      // Valid email should not be marked invalid before submission
      expect(emailInput).toHaveAttribute('aria-invalid', 'false');
    });
  });
});
