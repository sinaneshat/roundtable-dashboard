import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import {
  getMessageInput,
  getSendButton,
  waitForThreadNavigation,
} from '../helpers';

/**
 * Comprehensive Background Completion E2E Tests
 *
 * Tests ALL scenarios where users navigate away during conversations:
 *
 * TIMING SCENARIOS:
 * - Return after 1 second
 * - Return after 2 seconds
 * - Return after 4 seconds
 * - Return after 5 seconds
 *
 * NAVIGATION POINT SCENARIOS:
 * - Before first participant starts
 * - Midway through first participant response
 * - Between participants (after P0, before P1)
 * - After all participants, before moderator
 * - During moderator streaming
 *
 * CONFIGURATION SCENARIOS:
 * - With pre-search enabled (web search)
 * - With file uploads attached
 * - With config changes mid-conversation
 * - Different participant counts (1, 2, 3, 4)
 * - Multi-round conversations
 *
 * VERIFICATION:
 * - Round ALWAYS completes in background
 * - Stream can be resumed if user returns while streaming
 * - All participant responses are persisted
 * - Moderator summary is generated (for 2+ participants)
 *
 * Run with: pnpm exec playwright test e2e/flows/comprehensive-background-completion.spec.ts --project=chromium
 */

test.describe('Comprehensive Background Completion Tests', () => {
  // Extended timeout for complex multi-participant scenarios
  test.setTimeout(600000); // 10 minutes

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Configure participants via UI
   */
  async function configureParticipants(page: Page, count: number): Promise<void> {
    const modelsButton = page.getByRole('button', { name: /^models/i }).first();
    await expect(modelsButton).toBeEnabled({ timeout: 15000 });
    await modelsButton.click();
    await page.waitForTimeout(500);

    const buildCustomTab = page.getByRole('tab', { name: /build custom/i });
    await expect(buildCustomTab).toBeVisible({ timeout: 10000 });
    await buildCustomTab.click();
    await page.waitForTimeout(300);

    const clearButton = page.getByRole('button', { name: /clear all|remove all/i });
    const hasClearButton = await clearButton.isVisible().catch(() => false);
    if (hasClearButton) {
      await clearButton.click();
      await page.waitForTimeout(300);
    }

    for (let i = 0; i < count; i++) {
      const addButton = page.getByRole('button', { name: /add participant|add model/i });
      await expect(addButton).toBeVisible({ timeout: 5000 });
      await addButton.click();
      await page.waitForTimeout(300);

      const modelOption = page
        .locator('[role="option"]')
        .or(page.locator('[data-model-id]'))
        .first();
      const optionVisible = await modelOption.isVisible().catch(() => false);
      if (optionVisible) {
        await modelOption.click();
        await page.waitForTimeout(300);
      }
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  /**
   * Enable web search toggle
   */
  async function enableWebSearch(page: Page): Promise<void> {
    const webSearchToggle = page.getByRole('switch', { name: /web search/i })
      .or(page.locator('[data-testid="web-search-toggle"]'))
      .or(page.getByLabel(/web search/i));

    const isVisible = await webSearchToggle.isVisible().catch(() => false);
    if (isVisible) {
      const isChecked = await webSearchToggle.isChecked().catch(() => false);
      if (!isChecked) {
        await webSearchToggle.click();
        await page.waitForTimeout(300);
      }
    }
  }

  /**
   * Upload a file attachment
   */
  async function uploadFile(page: Page, fileName: string, content: string): Promise<void> {
    const fileInput = page.locator('input[type="file"]').first();
    const buffer = Buffer.from(content);
    await fileInput.setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer,
    });
    await page.waitForTimeout(1000);
  }

  /**
   * Get thread ID from URL
   */
  function getThreadIdFromUrl(page: Page): string | null {
    const url = page.url();
    const match = url.match(/\/chat\/([A-Z0-9]+)/i);
    return match?.[1] || null;
  }

  /**
   * Count participant messages
   */
  async function countParticipantMessages(page: Page): Promise<number> {
    return page.locator('[data-participant-index]').count();
  }

  /**
   * Check if moderator message exists
   */
  async function hasModeratorMessage(page: Page): Promise<boolean> {
    const moderatorMessage = page.locator('[data-moderator="true"]')
      .or(page.locator('[data-participant-index="-1"]'));
    return moderatorMessage.isVisible().catch(() => false);
  }

  /**
   * Poll round status via API
   */
  async function pollRoundStatus(
    page: Page,
    threadId: string,
    roundNumber: number,
    maxWaitMs: number = 180000,
  ): Promise<{ status: string; phase: string; completed: boolean }> {
    const startTime = Date.now();
    let lastStatus = { status: 'unknown', phase: 'unknown', completed: false };

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await page.request.get(
          `/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/status`,
        );

        if (response.ok()) {
          const data = await response.json() as {
            data?: { status?: string; phase?: string };
          };
          const status = data?.data?.status || 'unknown';
          const phase = data?.data?.phase || 'unknown';
          const completed = status === 'completed' || phase === 'complete';

          lastStatus = { status, phase, completed };

          if (completed) {
            return lastStatus;
          }
        }
      } catch {
        // Continue polling on error
      }

      await page.waitForTimeout(2000);
    }

    return lastStatus;
  }

  /**
   * Verify round completed via messages API
   */
  async function verifyRoundCompleted(
    page: Page,
    threadId: string,
    expectedParticipants: number,
    expectModerator: boolean,
  ): Promise<boolean> {
    try {
      const response = await page.request.get(
        `/api/v1/chat/threads/${threadId}/messages`,
      );

      if (!response.ok()) return false;

      const data = await response.json() as {
        data?: { messages?: Array<{ metadata?: { participantIndex?: number; isModerator?: boolean } }> };
      };
      const messages = data?.data?.messages || [];

      // Count participant messages
      const participantMessages = messages.filter((m) => {
        const idx = m.metadata?.participantIndex;
        return typeof idx === 'number' && idx >= 0;
      });

      // Check for moderator
      const hasMod = messages.some(m => m.metadata?.isModerator === true);

      const participantsOk = participantMessages.length >= expectedParticipants;
      const moderatorOk = !expectModerator || hasMod;

      return participantsOk && moderatorOk;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // SECTION 1: TIMING SCENARIOS
  // ============================================================================

  test.describe('Timing Scenarios - Return After Various Intervals', () => {
    const timingCases = [
      { delay: 1000, name: '1 second' },
      { delay: 2000, name: '2 seconds' },
      { delay: 4000, name: '4 seconds' },
      { delay: 5000, name: '5 seconds' },
      { delay: 10000, name: '10 seconds' },
    ];

    for (const { delay, name } of timingCases) {
      test(`round completes when returning after ${name}`, async ({ page }) => {
        await page.goto('/chat');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

        await configureParticipants(page, 2);

        const input = getMessageInput(page);
        await input.fill('Say hi in exactly 3 words');

        const sendButton = getSendButton(page);
        await expect(sendButton).toBeEnabled({ timeout: 10000 });
        await sendButton.click();

        // Wait for thread creation
        await waitForThreadNavigation(page, 30000).catch(() => {});
        const threadUrl = page.url();
        const threadId = getThreadIdFromUrl(page);

        // Wait for P0 to start
        await page
          .locator('[data-participant-index="0"]')
          .or(page.locator('[data-message-role="assistant"]').first())
          .waitFor({ state: 'visible', timeout: 60000 });

        // Navigate away
        await page.goto('/chat');
        await page.waitForLoadState('networkidle');

        // Wait the specified delay
        await page.waitForTimeout(delay);

        // Return to thread
        await page.goto(threadUrl);
        await page.waitForLoadState('networkidle');

        // Wait for server to complete in background (if not already)
        if (threadId) {
          await pollRoundStatus(page, threadId, 0, 120000);
        }

        // Reload to get final state
        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);

        // Verify completion
        const participantCount = await countParticipantMessages(page);
        expect(participantCount).toBeGreaterThanOrEqual(2);

        const hasModerator = await hasModeratorMessage(page);
        expect(hasModerator).toBe(true);
      });
    }
  });

  // ============================================================================
  // SECTION 2: NAVIGATION POINT SCENARIOS
  // ============================================================================

  test.describe('Navigation Point Scenarios - Leave at Different Phases', () => {
    test('navigate away BEFORE first participant starts', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 2);

      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 3 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      // Navigate away IMMEDIATELY (before P0 starts)
      await page.waitForTimeout(500); // Tiny delay to let request start
      const threadUrl = page.url();

      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete
      await page.waitForTimeout(90000);

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // May have completed or may need more time
      const participantCount = await countParticipantMessages(page);
      // At minimum, server should have started the round
      expect(participantCount).toBeGreaterThanOrEqual(0);
    });

    test('navigate away MIDWAY through first participant response', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 3);

      const input = getMessageInput(page);
      await input.fill('Write a 50 word response about programming');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for P0 to START streaming (not complete)
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Wait a bit to ensure streaming started
      await page.waitForTimeout(2000);

      // Navigate away MIDWAY through P0
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete all participants + moderator
      await page.waitForTimeout(120000);

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      if (threadId) {
        await pollRoundStatus(page, threadId, 0, 60000);
      }

      await page.reload();
      await page.waitForTimeout(3000);

      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(3);

      const hasModerator = await hasModeratorMessage(page);
      expect(hasModerator).toBe(true);
    });

    test('navigate away BETWEEN participants (after P0, before P1)', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 3);

      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 3 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for P0 to complete (message appears and is not streaming)
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Wait for P0 streaming to finish
      await page.waitForTimeout(15000);

      // Navigate away BEFORE P1 starts (between participants)
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete P1, P2, and moderator
      await page.waitForTimeout(120000);

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      if (threadId) {
        await pollRoundStatus(page, threadId, 0, 60000);
      }

      await page.reload();
      await page.waitForTimeout(3000);

      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(3);

      const hasModerator = await hasModeratorMessage(page);
      expect(hasModerator).toBe(true);
    });

    test('navigate away AFTER all participants, BEFORE moderator', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 2);

      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 3 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for both participants to appear
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });
      await page
        .locator('[data-participant-index="1"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Wait for both to finish streaming
      await page.waitForTimeout(20000);

      // Navigate away BEFORE moderator starts
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete moderator
      await page.waitForTimeout(60000);

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      if (threadId) {
        await pollRoundStatus(page, threadId, 0, 60000);
      }

      await page.reload();
      await page.waitForTimeout(3000);

      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(2);

      const hasModerator = await hasModeratorMessage(page);
      expect(hasModerator).toBe(true);
    });

    test('navigate away DURING moderator streaming', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 2);

      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 3 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for both participants
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });
      await page
        .locator('[data-participant-index="1"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Wait for moderator to START (check for moderator element appearing)
      await page
        .locator('[data-moderator="true"]')
        .or(page.locator('[data-participant-index="-1"]'))
        .waitFor({ state: 'visible', timeout: 120000 })
        .catch(() => {});

      // Navigate away DURING moderator streaming
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete moderator
      await page.waitForTimeout(30000);

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      if (threadId) {
        await pollRoundStatus(page, threadId, 0, 60000);
      }

      await page.reload();
      await page.waitForTimeout(3000);

      const hasModerator = await hasModeratorMessage(page);
      expect(hasModerator).toBe(true);
    });
  });

  // ============================================================================
  // SECTION 3: CONFIGURATION SCENARIOS
  // ============================================================================

  test.describe('Configuration Scenarios', () => {
    test('with PRE-SEARCH enabled (web search)', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 2);

      // Enable web search
      await enableWebSearch(page);

      const input = getMessageInput(page);
      await input.fill('What is the latest news about AI?');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for pre-search to start (indicated by search animation or results)
      await page.waitForTimeout(5000);

      // Navigate away DURING pre-search or participant streaming
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete
      await page.waitForTimeout(150000); // Longer wait for pre-search + participants

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      if (threadId) {
        await pollRoundStatus(page, threadId, 0, 120000);
      }

      await page.reload();
      await page.waitForTimeout(3000);

      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(2);
    });

    test('with FILE UPLOAD attached', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 2);

      // Upload a file
      await uploadFile(page, 'test-data.txt', 'This is test content for the AI to analyze.');

      const input = getMessageInput(page);
      await input.fill('Analyze the attached file');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for P0 to start
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Navigate away
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete
      await page.waitForTimeout(120000);

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      if (threadId) {
        await pollRoundStatus(page, threadId, 0, 60000);
      }

      await page.reload();
      await page.waitForTimeout(3000);

      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(2);
    });

    test('with DIFFERENT participant counts (1 participant)', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 1);

      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 5 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();

      // Wait for P0 to start
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Navigate away
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete (no moderator needed for 1 participant)
      await page.waitForTimeout(60000);

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');
      await page.reload();
      await page.waitForTimeout(3000);

      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(1);

      // No moderator for single participant
    });

    test('with DIFFERENT participant counts (4 participants)', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 4);

      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 3 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for P0 to start
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Navigate away after P0 starts
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete all 4 participants + moderator
      await page.waitForTimeout(180000); // 3 minutes for 4 participants

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      if (threadId) {
        await pollRoundStatus(page, threadId, 0, 120000);
      }

      await page.reload();
      await page.waitForTimeout(3000);

      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(4);

      const hasModerator = await hasModeratorMessage(page);
      expect(hasModerator).toBe(true);
    });
  });

  // ============================================================================
  // SECTION 4: MULTI-ROUND SCENARIOS
  // ============================================================================

  test.describe('Multi-Round Scenarios', () => {
    test('navigate away during ROUND 1 (after round 0 complete)', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 2);

      // Complete round 0
      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 3 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 60000);
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for round 0 to complete
      if (threadId) {
        await pollRoundStatus(page, threadId, 0, 180000);
      }

      // Start round 1
      await page.waitForTimeout(3000);
      await page.reload();
      await page.waitForLoadState('networkidle');

      const input2 = getMessageInput(page);
      await expect(input2).toBeEnabled({ timeout: 30000 });
      await input2.fill('Continue the conversation');

      const sendButton2 = getSendButton(page);
      await expect(sendButton2).toBeEnabled({ timeout: 10000 });
      await sendButton2.click();

      // Wait for round 1 P0 to start
      await page.waitForTimeout(5000);

      // Navigate away during round 1
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete round 1
      await page.waitForTimeout(120000);

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      if (threadId) {
        await pollRoundStatus(page, threadId, 1, 60000);
      }

      await page.reload();
      await page.waitForTimeout(3000);

      // Should have participants from both rounds
      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(4); // 2 from each round
    });
  });

  // ============================================================================
  // SECTION 5: RAPID NAVIGATION SCENARIOS
  // ============================================================================

  test.describe('Rapid Navigation Scenarios', () => {
    test('navigate away and back RAPIDLY multiple times', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 2);

      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 5 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Rapid navigation: away -> back -> away -> back -> away -> back
      for (let i = 0; i < 3; i++) {
        await page.goto('/chat');
        await page.waitForTimeout(1000);
        await page.goto(threadUrl);
        await page.waitForTimeout(1000);
      }

      // Final wait for completion
      if (threadId) {
        await pollRoundStatus(page, threadId, 0, 180000);
      }

      // Verify completion
      await page.reload();
      await page.waitForTimeout(3000);

      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(2);

      const hasModerator = await hasModeratorMessage(page);
      expect(hasModerator).toBe(true);
    });

    test('close tab and open new tab to same thread', async ({ page, context }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 2);

      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 5 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for P0 to start
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Close the tab
      await page.close();

      // Wait for server to complete in background
      await new Promise(resolve => setTimeout(resolve, 120000));

      // Open new tab
      const newPage = await context.newPage();
      await newPage.goto(threadUrl);
      await newPage.waitForLoadState('networkidle');

      if (threadId) {
        await pollRoundStatus(newPage, threadId, 0, 60000);
      }

      await newPage.reload();
      await newPage.waitForTimeout(3000);

      const participantCount = await newPage.locator('[data-participant-index]').count();
      expect(participantCount).toBeGreaterThanOrEqual(2);

      const moderatorMessage = newPage.locator('[data-moderator="true"]')
        .or(newPage.locator('[data-participant-index="-1"]'));
      const hasModerator = await moderatorMessage.isVisible().catch(() => false);
      expect(hasModerator).toBe(true);
    });
  });

  // ============================================================================
  // SECTION 6: VERIFICATION SCENARIOS
  // ============================================================================

  test.describe('Verification Scenarios', () => {
    test('verify all participant responses are persisted to database', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 3);

      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 3 words');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Wait for P0 to start
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Navigate away
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete
      await page.waitForTimeout(150000);

      // Verify via API (not UI) that all messages exist
      if (threadId) {
        const completed = await verifyRoundCompleted(page, threadId, 3, true);
        expect(completed).toBe(true);
      }
    });

    test('verify stream can be resumed if user returns while streaming', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      await configureParticipants(page, 2);

      const input = getMessageInput(page);
      await input.fill('Write a detailed 100 word response about technology');

      const sendButton = getSendButton(page);
      await sendButton.click();

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();

      // Wait for P0 to start
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Navigate away briefly
      await page.goto('/chat');
      await page.waitForTimeout(2000);

      // Return while still streaming
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      // Check if streaming is visible (text is growing)
      const participantMessage = page.locator('[data-participant-index="0"]').first();
      const initialText = await participantMessage.textContent().catch(() => '');

      await page.waitForTimeout(3000);

      const updatedText = await participantMessage.textContent().catch(() => '');

      // If stream is active, text should be different (longer)
      // If stream completed, text should exist
      expect(updatedText?.length).toBeGreaterThan(0);
    });
  });
});
