/**
 * ChatOverviewScreen Rendering Tests - PART 1: Landing on /chat
 *
 * Tests the initial rendering state when users land on /chat overview screen.
 *
 * COVERAGE:
 * - Logo and animated background visibility
 * - Input box rendering at bottom
 * - Quick start suggestion cards (optional - depends on feature)
 * - Initial UI state (showInitialUI = true)
 * - Empty message list on initial load
 *
 * PATTERN: Component rendering tests using React Testing Library
 * Following: /docs/TESTING_SETUP.md and /src/__tests__/README.md
 */

import ChatOverviewScreen from '@/containers/screens/chat/ChatOverviewScreen';
import { render, screen } from '@/lib/testing';

// Mock next-intl for translations
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: unknown; locale?: string; messages?: unknown }) => children,
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock auth client
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

// Mock data queries
vi.mock('@/hooks/queries/models', () => ({
  useModelsQuery: () => ({
    data: {
      data: {
        items: [
          {
            id: 'model-1',
            name: 'GPT-4',
            description: 'Test model',
            subscriptionTier: 'pro',
            isEnabled: true,
          },
        ],
        default_model_id: 'model-1',
        user_tier_config: {
          tier: 'free',
          tier_name: 'Free',
          max_models: 2,
          can_upgrade: true,
        },
      },
    },
    isLoading: false,
  }),
}));

// Don't mock @/hooks/utils - let real implementations run
// The hooks will use the mocked queries which is sufficient

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

// Don't mock @/stores/chat - let the real implementation run
// The store providers are properly set up in TestProviders

describe('chatOverviewScreen - Landing on /chat', () => {
  /**
   * TEST: Overview screen renders without crashing
   * Baseline test to ensure component mounts correctly
   */
  it('should render without crashing', () => {
    render(<ChatOverviewScreen />);

    // Component should mount successfully
    expect(document.body).toBeTruthy();
  });

  /**
   * TEST: Logo is visible on initial load
   * Users should see the Roundtable logo when landing on /chat
   */
  it('should display Roundtable logo', () => {
    render(<ChatOverviewScreen />);

    // Logo should be present
    const logo = screen.getByAltText(/roundtable/i);
    expect(logo).toBeInTheDocument();
  });

  /**
   * TEST: Input box renders at bottom
   * Users need the input box to type their first message
   */
  it('should render chat input box', () => {
    render(<ChatOverviewScreen />);

    // Input should be present (as textarea)
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder');
  });

  /**
   * TEST: Input box is enabled and ready for user input
   * Users should be able to type immediately
   */
  it('should have enabled input box on initial load', () => {
    render(<ChatOverviewScreen />);

    const input = screen.getByRole('textbox');
    expect(input).not.toBeDisabled();
  });

  /**
   * TEST: Send button is present
   * Users need the send button to submit their message
   */
  it('should display send button', () => {
    render(<ChatOverviewScreen />);

    // Send button should be visible
    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeInTheDocument();
  });

  /**
   * TEST: Initial UI state is visible
   * Welcome screen should be visible before first message
   */
  it('should show initial welcome UI', () => {
    render(<ChatOverviewScreen />);

    // Logo should be visible (part of initial UI)
    const logo = screen.getByAltText(/roundtable/i);
    expect(logo).toBeVisible();
  });

  /**
   * TEST: No messages displayed on initial load
   * Message list should be empty before user sends first message
   */
  it('should not display messages initially', () => {
    render(<ChatOverviewScreen />);

    // No message elements should be present
    const messages = screen.queryAllByRole('article');
    expect(messages).toHaveLength(0);
  });

  /**
   * TEST: Toolbar menu buttons are present
   * Users should see AI Models and Mode selection buttons
   */
  it('should display toolbar menu buttons', () => {
    render(<ChatOverviewScreen />);

    // AI Models button
    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    expect(modelsButton).toBeInTheDocument();

    // Mode button
    const modeButton = screen.getByRole('button', { name: /mode/i });
    expect(modeButton).toBeInTheDocument();
  });

  /**
   * TEST: Initial mode is set to default
   * Default mode should be selected (from getDefaultChatMode)
   */
  it('should have default conversation mode selected', () => {
    render(<ChatOverviewScreen />);

    // Mode button should show default mode
    const modeButton = screen.getByRole('button', { name: /mode/i });
    expect(modeButton).toHaveTextContent(/brainstorming|analyzing|debating|problem solving/i);
  });

  /**
   * TEST: No participants selected initially
   * Users start with empty participant selection
   */
  it('should have no participants selected initially', () => {
    render(<ChatOverviewScreen />);

    // No participant chips should be visible
    const participantChips = screen.queryAllByTestId('participant-chip');
    expect(participantChips).toHaveLength(0);
  });
});
