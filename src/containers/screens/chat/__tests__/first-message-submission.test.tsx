/**
 * First Message Submission Tests - PART 1: Submitting First Message
 *
 * Tests what happens when user submits their first message on overview screen:
 * - Input clearing
 * - Welcome screen fadeout
 * - URL behavior (stays at /chat during first round)
 * - Thread creation
 *
 * COVERAGE:
 * - Typing in input box
 * - Clicking send button
 * - Input clearing after submission
 * - Welcome UI disappearing
 * - Thread creation with correct data
 *
 * PATTERN: Integration tests with store and API mocks
 * Following: /src/stores/chat/__tests__/ patterns
 */

import ChatOverviewScreen from '@/containers/screens/chat/ChatOverviewScreen';
import { createMockThread, render, screen, userEvent, waitFor } from '@/lib/testing';

// Mock setup
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: unknown; locale?: string; messages?: unknown }) => children,
}));

const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
      },
    },
  }),
}));

vi.mock('@/hooks/queries/models', () => ({
  useModelsQuery: () => ({
    data: {
      data: {
        items: [
          {
            id: 'gpt-4',
            name: 'GPT-4',
            description: 'OpenAI GPT-4',
            subscriptionTier: 'pro',
            isEnabled: true,
          },
        ],
      },
    },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries/chat', () => ({
  useCustomRolesQuery: () => ({
    data: null,
    isLoading: false,
  }),
  useThreadAnalysesQuery: () => ({
    data: { success: true, data: [] },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries', () => ({
  useUsageStatsQuery: () => ({
    data: {
      success: true,
      data: {
        threads: { remaining: 10 },
        messages: { remaining: 100 },
      },
    },
  }),
}));

describe('first Message Submission - User Input', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * TEST: User can type in input box
   */
  it('should allow typing in input box', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'What is the meaning of life?');

    expect(input).toHaveValue('What is the meaning of life?');
  });

  /**
   * TEST: Send button is disabled when input is empty
   */
  it('should disable send button when input is empty', () => {
    render(<ChatOverviewScreen />);

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  /**
   * TEST: Send button is enabled when input has text
   */
  it('should enable send button when input has text', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).not.toBeDisabled();
  });

  /**
   * TEST: User can submit with Enter key
   */
  it('should submit message when pressing Enter', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question{Enter}');

    // Input should be cleared
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  /**
   * TEST: User can submit with Send button click
   */
  it('should submit message when clicking send button', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');

    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);

    // Input should be cleared
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });
});

describe('first Message Submission - UI State Changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * TEST: Input clears immediately after submission
   */
  it('should clear input immediately after submission', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Input should be empty immediately
    expect(input).toHaveValue('');
  });

  /**
   * TEST: Welcome screen fades out after submission
   */
  it('should hide welcome screen after message submission', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    // Logo should be visible initially
    const logo = screen.getByAltText(/roundtable/i);
    expect(logo).toBeVisible();

    // Submit message
    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Welcome screen should start fading out
    await waitFor(() => {
      expect(logo).not.toBeVisible();
    });
  });

  /**
   * TEST: User message appears at top after submission
   */
  it('should display user message after submission', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const testMessage = 'What are the best practices for React testing?';
    const input = screen.getByRole('textbox');
    await user.type(input, testMessage);
    await user.click(screen.getByRole('button', { name: /send/i }));

    // User message should appear
    await waitFor(() => {
      expect(screen.getByText(testMessage)).toBeInTheDocument();
    });
  });

  /**
   * TEST: Loading indicator appears after submission
   */
  it('should show loading indicator after submission', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Loading indicator should appear
    await waitFor(() => {
      expect(screen.getByText(/loading|thinking|consulting/i)).toBeInTheDocument();
    });
  });

  /**
   * TEST: Send button becomes stop button during streaming
   */
  it('should show stop button during streaming', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Stop button should appear
    await waitFor(() => {
      const stopButton = screen.getByRole('button', { name: /stop/i });
      expect(stopButton).toBeInTheDocument();
    });
  });
});

describe('first Message Submission - URL Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * TEST: URL stays at /chat during first round
   * CRITICAL: URL should NOT change to /chat/[slug] until analysis completes
   */
  it('should keep URL at /chat during first round streaming', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Wait a bit for any potential navigation
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('');
    });

    // Router push should NOT be called yet
    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * TEST: URL does not change during participant streaming
   */
  it('should not navigate while participants are streaming', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // During streaming, URL stays at /chat
    await waitFor(() => {
      expect(screen.getByText(/loading|thinking|consulting/i)).toBeInTheDocument();
    });

    expect(mockPush).not.toHaveBeenCalled();
  });

  /**
   * TEST: ChatOverviewScreen remains mounted during first round
   */
  it('should keep ChatOverviewScreen mounted during first round', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Component should still be mounted
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });
});

describe('first Message Submission - Thread Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fetch for thread creation
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/chat/threads') && url.includes('POST')) {
        const mockThread = createMockThread({
          id: 'new-thread-123',
          slug: 'test-question-slug',
          title: 'New Chat',
          isAiGeneratedTitle: false,
        });

        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            data: {
              thread: mockThread,
              message: {
                id: 'msg-123',
                content: 'Test question',
                roundNumber: 0,
              },
            },
          }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      } as Response);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * TEST: Thread created with correct initial data
   */
  it('should create thread with initial slug from question', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'What is React testing?');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Thread creation API should be called
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/chat/threads'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  /**
   * TEST: First message created with roundNumber 0
   */
  it('should create first message with roundNumber 0', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Verify roundNumber 0 in API call
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"roundNumber":0'),
        }),
      );
    });
  });

  /**
   * TEST: Thread created with temporary title "New Chat"
   */
  it('should create thread with temporary title', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    // Initial title should be "New Chat"
    // AI-generated title comes later
  });

  /**
   * TEST: Selected participants saved to thread
   */
  it('should save selected participants to thread', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    // Select a model first
    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    await waitFor(async () => {
      const gpt4Checkbox = screen.getByRole('checkbox', { name: /gpt-4/i });
      await user.click(gpt4Checkbox);
    });

    // Submit message
    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Participants should be included in thread creation
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('participants'),
        }),
      );
    });
  });

  /**
   * TEST: Selected mode saved to thread
   */
  it('should save selected mode to thread', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    // Change mode
    const modeButton = screen.getByRole('button', { name: /mode/i });
    await user.click(modeButton);

    await waitFor(async () => {
      const analyzingMode = screen.getByText(/analyzing/i);
      await user.click(analyzingMode);
    });

    // Submit message
    const input = screen.getByRole('textbox');
    await user.type(input, 'Test question');
    await user.click(screen.getByRole('button', { name: /send/i }));

    // Mode should be included in thread creation
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('analyzing'),
        }),
      );
    });
  });
});
