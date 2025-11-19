/**
 * Chat Configuration Tests - PART 1: Configuring the Chat
 *
 * Tests user interactions for configuring chat before first message:
 * - AI model selection
 * - Role assignment
 * - Mode selection
 * - Participant ordering (drag and drop)
 *
 * COVERAGE:
 * - Opening model selection modal
 * - Selecting/deselecting models
 * - Assigning roles to participants
 * - Changing conversation mode
 * - Reordering participants
 *
 * PATTERN: User interaction tests using userEvent
 * Following: /docs/TESTING_SETUP.md best practices
 */

import ChatOverviewScreen from '@/containers/screens/chat/ChatOverviewScreen';
import { render, screen, userEvent, waitFor } from '@/lib/testing';

// Mock setup (same as rendering tests)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: unknown; locale?: string; messages?: unknown }) => children,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        subscriptionTier: 'pro',
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
            order: 1,
          },
          {
            id: 'claude-3',
            name: 'Claude 3',
            description: 'Anthropic Claude',
            subscriptionTier: 'pro',
            isEnabled: true,
            order: 2,
          },
          {
            id: 'gemini-pro',
            name: 'Gemini Pro',
            description: 'Google Gemini',
            subscriptionTier: 'power',
            isEnabled: true,
            order: 3,
          },
        ],
      },
    },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/queries/chat', () => ({
  useCustomRolesQuery: () => ({
    data: {
      success: true,
      data: {
        items: [
          {
            id: 'custom-role-1',
            name: 'The Critic',
            description: 'Critical analysis role',
          },
        ],
      },
    },
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

describe('chat Configuration - Model Selection', () => {
  /**
   * TEST: Model selection modal opens when clicking AI Models button
   */
  it('should open model selection modal', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    // Modal should be visible
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  /**
   * TEST: Available models are displayed in modal
   */
  it('should display available models in selection modal', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    // Models should be listed
    await waitFor(() => {
      expect(screen.getByText('GPT-4')).toBeInTheDocument();
      expect(screen.getByText('Claude 3')).toBeInTheDocument();
    });
  });

  /**
   * TEST: User can select a model
   */
  it('should allow selecting a model', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    // Find and click model checkbox
    await waitFor(async () => {
      const gpt4Checkbox = screen.getByRole('checkbox', { name: /gpt-4/i });
      await user.click(gpt4Checkbox);
    });

    // Model should be selected
    await waitFor(() => {
      const gpt4Checkbox = screen.getByRole('checkbox', { name: /gpt-4/i });
      expect(gpt4Checkbox).toBeChecked();
    });
  });

  /**
   * TEST: Selected model appears as chip below input
   */
  it('should show selected model as chip', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    // Open modal and select model
    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    await waitFor(async () => {
      const gpt4Checkbox = screen.getByRole('checkbox', { name: /gpt-4/i });
      await user.click(gpt4Checkbox);
    });

    // Close modal
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    // Chip should appear
    await waitFor(() => {
      expect(screen.getByText(/gpt-4/i)).toBeInTheDocument();
    });
  });

  /**
   * TEST: User can deselect a model
   */
  it('should allow deselecting a model', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    // Select and then deselect
    await waitFor(async () => {
      const gpt4Checkbox = screen.getByRole('checkbox', { name: /gpt-4/i });
      await user.click(gpt4Checkbox);
      await user.click(gpt4Checkbox);
    });

    // Should be unchecked
    await waitFor(() => {
      const gpt4Checkbox = screen.getByRole('checkbox', { name: /gpt-4/i });
      expect(gpt4Checkbox).not.toBeChecked();
    });
  });

  /**
   * TEST: Locked models show upgrade badge
   */
  it('should show upgrade badge for locked models', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    // Power tier model should show upgrade required
    await waitFor(() => {
      const geminiModel = screen.getByText('Gemini Pro');
      expect(geminiModel.closest('[role="checkbox"]')).toHaveAttribute('aria-disabled', 'true');
    });
  });
});

describe('chat Configuration - Role Assignment', () => {
  /**
   * TEST: User can assign role to participant
   */
  it('should allow assigning role to participant', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    // Select a model first
    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    await waitFor(async () => {
      const gpt4Checkbox = screen.getByRole('checkbox', { name: /gpt-4/i });
      await user.click(gpt4Checkbox);
    });

    // Find role assignment button
    await waitFor(async () => {
      const roleButton = screen.getByRole('button', { name: /\+ role/i });
      await user.click(roleButton);
    });

    // Select a role
    await waitFor(async () => {
      const criticRole = screen.getByText('The Critic');
      await user.click(criticRole);
    });

    // Role should be assigned
    await waitFor(() => {
      expect(screen.getByText('The Critic')).toBeInTheDocument();
    });
  });

  /**
   * TEST: Custom role can only be used by one model at a time
   */
  it('should prevent duplicate custom role assignments', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    // Select two models
    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    await waitFor(async () => {
      const gpt4 = screen.getByRole('checkbox', { name: /gpt-4/i });
      const claude = screen.getByRole('checkbox', { name: /claude/i });
      await user.click(gpt4);
      await user.click(claude);
    });

    // Assign custom role to first participant
    await waitFor(async () => {
      const roleButtons = screen.getAllByRole('button', { name: /\+ role/i });
      await user.click(roleButtons[0]!);
      const criticRole = screen.getByText('The Critic');
      await user.click(criticRole);
    });

    // Try to assign same role to second participant
    await waitFor(async () => {
      const roleButtons = screen.getAllByRole('button', { name: /\+ role/i });
      await user.click(roleButtons[1]!);
    });

    // Custom role should be disabled for second participant
    await waitFor(() => {
      const criticRole = screen.getByText('The Critic');
      expect(criticRole.closest('button')).toBeDisabled();
    });
  });
});

describe('chat Configuration - Mode Selection', () => {
  /**
   * TEST: Mode selection modal opens
   */
  it('should open mode selection modal', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const modeButton = screen.getByRole('button', { name: /mode/i });
    await user.click(modeButton);

    // Modal should be visible
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  /**
   * TEST: All conversation modes are displayed
   */
  it('should display all conversation modes', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const modeButton = screen.getByRole('button', { name: /mode/i });
    await user.click(modeButton);

    // Check for all modes
    await waitFor(() => {
      expect(screen.getByText(/brainstorming/i)).toBeInTheDocument();
      expect(screen.getByText(/analyzing/i)).toBeInTheDocument();
      expect(screen.getByText(/debating/i)).toBeInTheDocument();
      expect(screen.getByText(/problem solving/i)).toBeInTheDocument();
    });
  });

  /**
   * TEST: User can select a different mode
   */
  it('should allow changing conversation mode', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const modeButton = screen.getByRole('button', { name: /mode/i });
    await user.click(modeButton);

    // Select analyzing mode
    await waitFor(async () => {
      const analyzingMode = screen.getByText(/analyzing/i);
      await user.click(analyzingMode);
    });

    // Mode button should update
    await waitFor(() => {
      const modeButton = screen.getByRole('button', { name: /mode/i });
      expect(modeButton).toHaveTextContent(/analyzing/i);
    });
  });

  /**
   * TEST: Selected mode shows visual indicator
   */
  it('should highlight selected mode', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    const modeButton = screen.getByRole('button', { name: /mode/i });
    await user.click(modeButton);

    // Default mode should be highlighted
    await waitFor(() => {
      const defaultMode = screen.getByRole('button', { name: /brainstorming/i });
      expect(defaultMode).toHaveClass(/border-blue/i);
    });
  });
});

describe('chat Configuration - Participant Ordering', () => {
  /**
   * TEST: Participants show drag handles
   */
  it('should show drag handles for reordering', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    // Select two models
    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    await waitFor(async () => {
      const gpt4 = screen.getByRole('checkbox', { name: /gpt-4/i });
      const claude = screen.getByRole('checkbox', { name: /claude/i });
      await user.click(gpt4);
      await user.click(claude);
    });

    // Drag handles should be visible
    await waitFor(() => {
      const dragHandles = screen.getAllByTestId('drag-handle');
      expect(dragHandles.length).toBeGreaterThan(0);
    });
  });

  /**
   * TEST: First participant responds first
   */
  it('should indicate first participant responds first', async () => {
    const user = userEvent.setup();
    render(<ChatOverviewScreen />);

    // Select models
    const modelsButton = screen.getByRole('button', { name: /ai models/i });
    await user.click(modelsButton);

    await waitFor(async () => {
      const gpt4 = screen.getByRole('checkbox', { name: /gpt-4/i });
      await user.click(gpt4);
    });

    // First participant should have priority 0
    await waitFor(() => {
      const firstParticipant = screen.getByTestId('participant-chip-0');
      expect(firstParticipant).toBeInTheDocument();
    });
  });
});
