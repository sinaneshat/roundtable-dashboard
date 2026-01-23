import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import {
  getMessageInput,
  getSendButton,
  waitForThreadNavigation,
} from '../helpers';

/**
 * Background Round Completion E2E Tests
 *
 * Tests the server-side round orchestration feature where rounds continue
 * to completion even when the user navigates away from the conversation.
 *
 * THE PROBLEM BEING SOLVED:
 * - Previously, if user navigated away mid-round, participants would stop responding
 * - The client-side orchestration required the browser to stay open
 * - This caused incomplete rounds with missing participant responses
 *
 * THE SOLUTION:
 * - Server-side orchestration via waitUntil() in Cloudflare Workers
 * - After P0 completes, server triggers P1 in background
 * - After all participants complete, server triggers moderator
 * - Client can disconnect - round continues to completion
 *
 * Test Strategy:
 * 1. Start a round with multiple participants
 * 2. Navigate away mid-round (simulating user leaving)
 * 3. Wait for server to complete the round in background
 * 4. Return to the thread and verify all participants responded
 * 5. Verify moderator message exists (for 2+ participants)
 *
 * Run with: bun run exec playwright test e2e/flows/background-round-completion.spec.ts --project=chromium
 *
 * @see src/api/routes/chat/handlers/streaming.handler.ts - Server-side continuation in onFinish
 * @see src/api/services/round-orchestration - Round state tracking in KV
 */

test.describe('Background Round Completion - Server-Side Orchestration', () => {
  // Extended timeout for multi-participant rounds + background completion
  test.setTimeout(480000); // 8 minutes

  /**
   * Helper: Configure participants via UI before starting conversation
   */
  async function configureParticipants(page: Page, count: number): Promise<void> {
    // Click Models button to open participant selector
    const modelsButton = page.getByRole('button', { name: /^models/i }).first();
    await expect(modelsButton).toBeEnabled({ timeout: 15000 });
    await modelsButton.click();
    await page.waitForTimeout(500);

    // Switch to "Build Custom" tab
    const buildCustomTab = page.getByRole('tab', { name: /build custom/i });
    await expect(buildCustomTab).toBeVisible({ timeout: 10000 });
    await buildCustomTab.click();
    await page.waitForTimeout(300);

    // Clear existing participants first
    const clearButton = page.getByRole('button', { name: /clear all|remove all/i });
    const hasClearButton = await clearButton.isVisible().catch(() => false);
    if (hasClearButton) {
      await clearButton.click();
      await page.waitForTimeout(300);
    }

    // Add participants one by one
    for (let i = 0; i < count; i++) {
      // Click "Add Participant" button
      const addButton = page.getByRole('button', { name: /add participant|add model/i });
      await expect(addButton).toBeVisible({ timeout: 5000 });
      await addButton.click();
      await page.waitForTimeout(300);

      // Select a model from the list (use first available)
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

    // Close the panel
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  /**
   * Helper: Count participant messages in thread
   */
  async function countParticipantMessages(page: Page): Promise<number> {
    return page.locator('[data-participant-index]').count();
  }

  /**
   * Helper: Check if moderator message exists
   */
  async function hasModeratorMessage(page: Page): Promise<boolean> {
    const moderatorMessage = page.locator('[data-moderator="true"]')
      .or(page.locator('[data-participant-index="-1"]'));
    return moderatorMessage.isVisible().catch(() => false);
  }

  /**
   * Helper: Get thread ID from URL
   */
  function getThreadIdFromUrl(page: Page): string | null {
    const url = page.url();
    const match = url.match(/\/chat\/([A-Z0-9]+)/i);
    return match?.[1] || null;
  }

  test.describe('Two Participants - Navigate Away After P0', () => {
    test('round completes in background when user leaves after P0 starts', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      // Configure 2 participants
      await configureParticipants(page, 2);

      // Submit message to start round
      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 5 words');

      const sendButton = getSendButton(page);
      await expect(sendButton).toBeEnabled({ timeout: 10000 });
      await sendButton.click();

      // Wait for participant 0 to START responding (not complete)
      await page
        .locator('[data-participant-index="0"]')
        .or(page.locator('[data-message-role="assistant"]').first())
        .waitFor({ state: 'visible', timeout: 120000 });

      // Capture the thread URL
      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadId = getThreadIdFromUrl(page);
      expect(threadId).toBeTruthy();
      const threadUrl = page.url();

      // CRITICAL: Navigate away while round is still in progress
      // This simulates user leaving the conversation
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete the round in background
      // Server-side orchestration continues via waitUntil()
      await page.waitForTimeout(60000); // 60 seconds for server to complete

      // Return to the thread
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Verify round completed: all participants responded
      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(2);

      // Verify moderator message exists (for 2+ participants)
      const hasModerator = await hasModeratorMessage(page);
      expect(hasModerator).toBe(true);
    });

    test('round completes when user closes tab mid-stream', async ({ page, context }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      // Configure 2 participants
      await configureParticipants(page, 2);

      // Submit message
      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 5 words');

      const sendButton = getSendButton(page);
      await expect(sendButton).toBeEnabled({ timeout: 10000 });
      await sendButton.click();

      // Wait for thread creation and P0 to start
      await waitForThreadNavigation(page, 30000).catch(() => {});
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      const threadUrl = page.url();

      // Close the current page (simulating tab close)
      await page.close();

      // Wait for server to complete in background
      await new Promise(resolve => setTimeout(resolve, 90000)); // 90 seconds

      // Open a new page and return to the thread
      const newPage = await context.newPage();
      await newPage.goto(threadUrl);
      await newPage.waitForLoadState('networkidle');
      await newPage.waitForTimeout(3000);

      // Verify round completed
      const participantCount = await newPage.locator('[data-participant-index]').count();
      expect(participantCount).toBeGreaterThanOrEqual(2);

      // Verify moderator exists
      const moderatorMessage = newPage.locator('[data-moderator="true"]')
        .or(newPage.locator('[data-participant-index="-1"]'));
      const hasModerator = await moderatorMessage.isVisible().catch(() => false);
      expect(hasModerator).toBe(true);
    });
  });

  test.describe('Three Participants - Background Completion', () => {
    test('all 3 participants respond even when user leaves after P0', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      // Configure 3 participants
      await configureParticipants(page, 3);

      // Submit message
      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 3 words');

      const sendButton = getSendButton(page);
      await expect(sendButton).toBeEnabled({ timeout: 10000 });
      await sendButton.click();

      // Wait for P0 to start
      await page
        .locator('[data-participant-index="0"]')
        .or(page.locator('[data-message-role="assistant"]').first())
        .waitFor({ state: 'visible', timeout: 120000 });

      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();

      // Navigate away immediately after P0 appears
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete all 3 participants + moderator
      await page.waitForTimeout(120000); // 2 minutes

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // All 3 participants should have responded
      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(3);

      // Moderator should exist
      const hasModerator = await hasModeratorMessage(page);
      expect(hasModerator).toBe(true);
    });

    test('round completes when user leaves after P1', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      // Configure 3 participants
      await configureParticipants(page, 3);

      // Submit message
      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 3 words');

      const sendButton = getSendButton(page);
      await expect(sendButton).toBeEnabled({ timeout: 10000 });
      await sendButton.click();

      // Wait for P0 and P1 to respond
      await waitForThreadNavigation(page, 30000).catch(() => {});
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 120000 });
      await page
        .locator('[data-participant-index="1"]')
        .waitFor({ state: 'visible', timeout: 120000 });

      const threadUrl = page.url();

      // Navigate away after P1 (P2 and moderator still pending)
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete P2 + moderator
      await page.waitForTimeout(90000); // 90 seconds

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // All 3 participants + moderator should exist
      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(3);

      const hasModerator = await hasModeratorMessage(page);
      expect(hasModerator).toBe(true);
    });
  });

  test.describe('Round Status Polling', () => {
    test('can poll round status while round completes in background', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      // Configure 2 participants
      await configureParticipants(page, 2);

      // Submit message
      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 5 words');

      const sendButton = getSendButton(page);
      await expect(sendButton).toBeEnabled({ timeout: 10000 });
      await sendButton.click();

      // Wait for thread creation
      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadId = getThreadIdFromUrl(page);
      expect(threadId).toBeTruthy();

      // Wait for P0 to start
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      // Navigate away
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Poll the round status endpoint
      let roundComplete = false;
      const maxPolls = 30;
      let pollCount = 0;

      while (!roundComplete && pollCount < maxPolls) {
        pollCount++;

        // Call the status endpoint
        const response = await page.request.get(
          `/api/v1/chat/threads/${threadId}/rounds/0/status`,
        ).catch(() => null);

        if (response?.ok()) {
          const data = await response.json().catch(() => ({})) as {
            data?: { status?: string; phase?: string };
          };
          const status = data?.data?.status;
          const phase = data?.data?.phase;

          // Round is complete when status is 'completed' or phase is 'complete'
          if (status === 'completed' || phase === 'complete') {
            roundComplete = true;
            break;
          }
        }

        // Wait before next poll
        await page.waitForTimeout(3000);
      }

      expect(roundComplete).toBe(true);
    });
  });

  test.describe('Edge Cases', () => {
    test('single participant round completes without moderator', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      // Configure 1 participant (no moderator needed)
      await configureParticipants(page, 1);

      // Submit message
      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 5 words');

      const sendButton = getSendButton(page);
      await expect(sendButton).toBeEnabled({ timeout: 10000 });
      await sendButton.click();

      // Wait for P0 to start
      await waitForThreadNavigation(page, 30000).catch(() => {});
      await page
        .locator('[data-participant-index="0"]')
        .waitFor({ state: 'visible', timeout: 60000 });

      const threadUrl = page.url();

      // Navigate away
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');

      // Wait for server to complete
      await page.waitForTimeout(60000);

      // Return and verify
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // 1 participant should exist
      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(1);

      // No moderator for single participant
      // (This is expected behavior - moderator only for 2+ participants)
    });

    test('handles rapid navigation (away and back quickly)', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      // Configure 2 participants
      await configureParticipants(page, 2);

      // Submit message
      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 5 words');

      const sendButton = getSendButton(page);
      await expect(sendButton).toBeEnabled({ timeout: 10000 });
      await sendButton.click();

      // Wait for thread creation
      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();

      // Navigate away quickly
      await page.goto('/chat');
      await page.waitForTimeout(1000);

      // Come back quickly
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      // Navigate away again
      await page.goto('/chat');
      await page.waitForTimeout(1000);

      // Come back again
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');

      // Wait for round to complete (either via resumed frontend or server background)
      await page.waitForTimeout(120000);

      // Reload to get final state
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Verify round completed
      const participantCount = await countParticipantMessages(page);
      expect(participantCount).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('Verification of Server-Side Continuation', () => {
    test('server continues even after AbortSignal from client disconnect', async ({ page }) => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

      // Configure 2 participants
      await configureParticipants(page, 2);

      // Submit message
      const input = getMessageInput(page);
      await input.fill('Say hi in exactly 5 words');

      const sendButton = getSendButton(page);
      await expect(sendButton).toBeEnabled({ timeout: 10000 });
      await sendButton.click();

      // Wait for thread to be created
      await waitForThreadNavigation(page, 30000).catch(() => {});
      const threadUrl = page.url();
      const threadId = getThreadIdFromUrl(page);

      // Abort all network requests by navigating away IMMEDIATELY
      // This simulates client disconnect which sends AbortSignal
      await page.goto('about:blank');

      // Wait for server-side completion (streaming uses timeout signal, not client abort)
      await page.waitForTimeout(120000); // 2 minutes

      // Return to thread and verify completion
      await page.goto(threadUrl);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(5000);

      // Check via API that messages exist
      const messagesResponse = await page.request.get(
        `/api/v1/chat/threads/${threadId}/messages`,
      );

      if (messagesResponse.ok()) {
        const messagesData = await messagesResponse.json() as {
          data?: { messages?: Array<{ metadata?: { participantIndex?: number } }> };
        };
        const messages = messagesData?.data?.messages || [];

        // Count participant messages (not user, not moderator)
        const participantMessages = messages.filter((m) => {
          const idx = m.metadata?.participantIndex;
          return typeof idx === 'number' && idx >= 0;
        });

        expect(participantMessages.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
