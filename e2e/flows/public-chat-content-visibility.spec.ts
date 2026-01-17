import { expect, test } from '@playwright/test';

/**
 * Public Chat Content Visibility E2E Tests
 *
 * Verifies that public chat page content is visible IMMEDIATELY after page load.
 * SSR should render content server-side, so there should be no delay in
 * content visibility after hydration.
 *
 * Issue: Text content shows late despite SSR data being present.
 * The root cause is opacity transitions or animations causing invisible content
 * during the initial render, then fading in after hydration.
 */
test.describe('Public Chat Content Visibility', () => {
  const PUBLIC_CHAT_SLUG = 'ava-excels-at-data-analysis-j1duv2';
  const PUBLIC_CHAT_URL = `/public/chat/${PUBLIC_CHAT_SLUG}`;

  test('message content is visible immediately after load (no delayed fade-in)', async ({ page }) => {
    // Track when content becomes visible (reserved for future timing analysis)
    const _visibilityTimestamps: { selector: string; timestamp: number }[] = [];
    const _pageLoadTime = Date.now();

    await page.goto(PUBLIC_CHAT_URL);

    // Measure time to first visible message content
    const messageContentSelector = '[data-message-content]';

    // Wait for content to be present in DOM
    const messageContent = page.locator(messageContentSelector).first();
    await expect(messageContent).toBeAttached({ timeout: 5000 });

    // Check if content has opacity: 0 (indicating delayed visibility)
    const initialOpacity = await messageContent.evaluate((el) => {
      const parent = el.closest('[style*="opacity"]') || el.parentElement;
      if (parent) {
        return window.getComputedStyle(parent).opacity;
      }
      return window.getComputedStyle(el).opacity;
    });

    // Content should NOT start with opacity 0 (would indicate fade-in delay)
    expect(
      Number.parseFloat(initialOpacity),
      'Message content should not have opacity:0 on initial render (causes visibility delay)',
    ).toBeGreaterThan(0.5);

    // Verify actual text is visible, not just the container
    const textContent = await messageContent.textContent();
    expect(textContent?.length, 'Message content should have text immediately').toBeGreaterThan(10);
  });

  test('message cards do not have transition-opacity class on read-only pages', async ({ page }) => {
    await page.goto(PUBLIC_CHAT_URL);

    // Wait for content
    await page.waitForSelector('[data-message-content]', { timeout: 5000 });

    // Find elements with transition-opacity that are inside message containers
    // These should NOT exist on read-only pages
    const transitionElements = await page.locator('[data-message-content] .transition-opacity').count();

    // On read-only pages, skipTransitions should be true, removing transition classes
    expect(
      transitionElements,
      'Read-only pages should not have transition-opacity classes (causes delayed visibility)',
    ).toBe(0);
  });

  test('text content is rendered server-side (present in initial HTML)', async ({ browser }) => {
    // Create a context with JavaScript disabled to see pure SSR HTML
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto(PUBLIC_CHAT_URL);

    // Even without JS, message content should be ATTACHED to DOM (SSR rendered)
    // Note: visibility may be affected by CSS without JS, but content should exist
    const messageContent = page.locator('[data-message-content]').first();
    await expect(messageContent).toBeAttached({ timeout: 5000 });

    // Check that actual markdown content exists in the HTML (not just loading text)
    const textContent = await messageContent.textContent();

    // Exclude shimmer/loading text patterns from the check
    const actualContent = textContent?.replace(/Generating response.*?\.\.\./g, '')
      .replace(/Observing.*?\.\.\./g, '')
      .replace(/Waiting.*?\.\.\./g, '')
      .trim();

    expect(
      actualContent?.length,
      'SSR should render message text without requiring JavaScript',
    ).toBeGreaterThan(10);

    await context.close();
  });

  test('measures time from DOMContentLoaded to visible content', async ({ page }) => {
    const measurements: { event: string; time: number }[] = [];
    const startTime = Date.now();

    // Track DOM events
    page.on('domcontentloaded', () => {
      measurements.push({ event: 'domcontentloaded', time: Date.now() - startTime });
    });

    page.on('load', () => {
      measurements.push({ event: 'load', time: Date.now() - startTime });
    });

    await page.goto(PUBLIC_CHAT_URL);

    // Wait for message content to be visible
    const messageContent = page.locator('[data-message-content]').first();
    await expect(messageContent).toBeVisible({ timeout: 5000 });

    measurements.push({ event: 'content-visible', time: Date.now() - startTime });

    // Log timing for debugging
    // eslint-disable-next-line no-console
    console.log('Visibility timing:', measurements);

    // Content should be visible within 500ms of domcontentloaded
    const domContentLoadedTime = measurements.find(m => m.event === 'domcontentloaded')?.time ?? 0;
    const contentVisibleTime = measurements.find(m => m.event === 'content-visible')?.time ?? 0;
    const delayAfterDom = contentVisibleTime - domContentLoadedTime;

    expect(
      delayAfterDom,
      `Content visibility delay after DOMContentLoaded should be < 500ms (was ${delayAfterDom}ms)`,
    ).toBeLessThan(500);
  });

  test('no opacity:0 elements inside message cards after hydration (excluding shimmer)', async ({ page }) => {
    await page.goto(PUBLIC_CHAT_URL);
    await page.waitForLoadState('networkidle');

    // After hydration, check for any opacity:0 elements that contain ACTUAL content
    // Note: Shimmer placeholders ("Generating response...", "Observing...") are intentionally
    // hidden with opacity:0 when real content is present - this is expected behavior.
    const hiddenActualContent = await page.evaluate(() => {
      const messageContainers = document.querySelectorAll('[data-message-content]');
      const hiddenWithText: string[] = [];

      messageContainers.forEach((container) => {
        const allElements = container.querySelectorAll('*');
        allElements.forEach((el) => {
          const style = window.getComputedStyle(el);
          const text = el.textContent?.trim() || '';

          // Skip if no text or not hidden
          if (style.opacity !== '0' || text.length === 0)
            return;

          // Skip shimmer placeholders (expected to be hidden with opacity:0)
          // These show loading states like "Generating response...", "Observing..."
          // The shimmer uses TextShimmer component which creates pulsing "..." text
          const lowerText = text.toLowerCase();
          if (
            lowerText.includes('generating')
            || lowerText.includes('observing')
            || lowerText.includes('waiting')
            || lowerText.includes('gathering')
            || lowerText.includes('...')
          ) {
            return;
          }

          hiddenWithText.push(`${el.tagName}: "${text.slice(0, 50)}..."`);
        });
      });

      return hiddenWithText;
    });

    expect(
      hiddenActualContent,
      'Actual message content should not be hidden with opacity:0 after hydration',
    ).toHaveLength(0);
  });
});
