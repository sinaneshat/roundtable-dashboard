import { expect, test } from '../fixtures';

/**
 * SSR Content Flash Detection E2E Tests
 *
 * Detects the "content flash" issue where:
 * 1. SSR renders content
 * 2. Client hydrates and shows skeleton (loading state)
 * 3. Content reappears after client fetch
 *
 * Root cause: TanStack Query data not properly dehydrated/hydrated
 * - Using prefetchQuery instead of ensureQueryData
 * - Different queryFn between server and client
 * - staleTime: 0 causing immediate refetch
 */
test.describe('SSR Content Flash Detection', () => {
  test('chat page should not flash skeleton after initial content render', async ({
    page,
    authenticatedPage,
  }) => {
    const stateTransitions: Array<{
      timestamp: number;
      state: 'content' | 'skeleton' | 'loading';
      element: string;
    }> = [];

    // Expose function to page context
    await page.exposeFunction(
      'recordStateTransition',
      (state: 'content' | 'skeleton' | 'loading', element: string) => {
        stateTransitions.push({
          timestamp: Date.now(),
          state,
          element,
        });
      },
    );

    // Set up mutation observer before navigation
    await page.addInitScript(() => {
      let hasSeenContent = false;
      let hasSeenSkeleton = false;

      const checkForFlash = () => {
        // Check for main content indicators
        const mainContent = document.querySelector('[data-testid="chat-overview"]')
          || document.querySelector('h1')
          || document.querySelector('.chat-input');

        // Check for skeleton indicators
        const skeletons = document.querySelectorAll('[data-skeleton], .animate-pulse, [class*="skeleton"]');

        if (mainContent && !hasSeenContent) {
          hasSeenContent = true;
          (window as unknown as { recordStateTransition?: (state: string, element: string) => void }).recordStateTransition?.('content', mainContent.tagName);
        }

        if (skeletons.length > 0 && hasSeenContent && !hasSeenSkeleton) {
          hasSeenSkeleton = true;
          (window as unknown as { recordStateTransition?: (state: string, element: string) => void }).recordStateTransition?.('skeleton', `${skeletons.length} skeletons`);
        }
      };

      // Run check on DOM mutations
      const observer = new MutationObserver(checkForFlash);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });

      // Initial check
      if (document.readyState !== 'loading') {
        checkForFlash();
      }
      document.addEventListener('DOMContentLoaded', checkForFlash);
    });

    // Navigate and wait for hydration
    await authenticatedPage.goto('/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Wait for potential flash

    // Check for content-then-skeleton pattern (the bug)
    const contentThenSkeleton = stateTransitions.some((t, i) => {
      if (t.state !== 'skeleton')
        return false;
      const previousContent = stateTransitions.slice(0, i).find(p => p.state === 'content');
      return previousContent && previousContent.timestamp < t.timestamp;
    });

    expect(
      contentThenSkeleton,
      `Content should not flash to skeleton after initial render. State transitions: ${JSON.stringify(stateTransitions, null, 2)}`,
    ).toBe(false);
  });

  test('sidebar threads should not show loading state after SSR content', async ({
    page,
    authenticatedPage,
  }) => {
    let sawSidebarContent = false;
    let sawSidebarLoading = false;
    let contentBeforeLoading = false;

    await page.exposeFunction('recordSidebarState', (state: string) => {
      if (state === 'content') {
        sawSidebarContent = true;
        if (!sawSidebarLoading) {
          contentBeforeLoading = false; // Content came first without loading - good!
        }
      }
      if (state === 'loading' && sawSidebarContent) {
        sawSidebarLoading = true;
        contentBeforeLoading = true; // Content showed, then loading - BAD!
      }
    });

    await page.addInitScript(() => {
      let seenContent = false;

      const checkSidebar = () => {
        const sidebar = document.querySelector('[data-testid="chat-sidebar"]')
          || document.querySelector('[class*="sidebar"]');
        if (!sidebar)
          return;

        // Check for actual thread items
        const threadItems = sidebar.querySelectorAll('[data-testid="thread-item"], a[href*="/chat/"]');
        const loadingIndicators = sidebar.querySelectorAll('.animate-pulse, [data-skeleton]');

        if (threadItems.length > 0 && !seenContent) {
          seenContent = true;
          (window as unknown as { recordSidebarState?: (state: string) => void }).recordSidebarState?.('content');
        }

        if (loadingIndicators.length > 0 && seenContent) {
          (window as unknown as { recordSidebarState?: (state: string) => void }).recordSidebarState?.('loading');
        }
      };

      const observer = new MutationObserver(checkSidebar);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });

      document.addEventListener('DOMContentLoaded', checkSidebar);
    });

    await authenticatedPage.goto('/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(
      contentBeforeLoading,
      'Sidebar should not show loading state after thread content was visible',
    ).toBe(false);
  });

  test('models data should be immediately available after SSR', async ({
    page,
    authenticatedPage,
  }) => {
    let _modelsLoadedFromCache = false;
    let modelsRefetched = false;

    // Intercept API calls to detect refetch
    await page.route('**/api/v1/chat/models**', async (route) => {
      modelsRefetched = true;
      await route.continue();
    });

    await page.exposeFunction('recordModelsState', (state: string) => {
      if (state === 'loaded')
        _modelsLoadedFromCache = true;
    });

    await page.addInitScript(() => {
      // Check if models are available immediately (from SSR cache)
      const checkModels = () => {
        // Look for model selection UI or model indicators
        const modelElements = document.querySelectorAll(
          '[data-testid="model-item"], [data-model-id], .model-avatar',
        );
        if (modelElements.length > 0) {
          (window as unknown as { recordModelsState?: (state: string) => void }).recordModelsState?.('loaded');
        }
      };

      const observer = new MutationObserver(checkModels);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });

      // Check after a short delay to see if data was hydrated
      setTimeout(checkModels, 100);
    });

    await authenticatedPage.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    // Wait a short time - data should be immediately available from SSR
    await page.waitForTimeout(500);

    // The API should NOT be called if data was properly hydrated from SSR
    // This test will fail if there's a refetch happening
    expect(
      modelsRefetched,
      'Models API should not be refetched on client - data should come from SSR hydration',
    ).toBe(false);
  });

  test('usage stats should not trigger loading state on hydration', async ({
    page,
    authenticatedPage,
  }) => {
    let usageRefetched = false;

    // Intercept usage API calls
    await page.route('**/api/v1/usage/stats**', async (route) => {
      usageRefetched = true;
      await route.continue();
    });

    await authenticatedPage.goto('/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Usage API should not be called on initial hydration
    expect(
      usageRefetched,
      'Usage stats should not refetch on hydration - should come from SSR cache',
    ).toBe(false);
  });

  test('subscriptions should not refetch on hydration', async ({
    page,
    authenticatedPage,
  }) => {
    let subscriptionsRefetched = false;

    await page.route('**/api/v1/billing/subscriptions**', async (route) => {
      subscriptionsRefetched = true;
      await route.continue();
    });

    await authenticatedPage.goto('/chat');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    expect(
      subscriptionsRefetched,
      'Subscriptions should not refetch on hydration - should come from SSR cache',
    ).toBe(false);
  });
});
