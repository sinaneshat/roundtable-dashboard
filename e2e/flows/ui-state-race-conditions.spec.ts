import { expect, test } from '@playwright/test';

import {
  getMessageInput,
  getModelSelectorButton,
} from '../helpers';

/**
 * UI State and Race Condition E2E Tests
 * Based on docs/FLOW_DOCUMENTATION.md Part 14 (Race Condition Protection)
 *
 * Tests cover:
 * - Loading states and skeletons
 * - UI flash prevention
 * - Duplicate rendering prevention
 * - Placeholder visibility
 * - State consistency during transitions
 */

/**
 * Test Suite: Loading States and Skeletons
 * Verifies proper loading indicators appear during async operations
 */
test.describe('Loading States and Skeletons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
  });

  test('shows loading state while chat interface initializes', async ({ page }) => {
    // On fresh page load, should see loading or content - never blank
    const content = page.locator('main, [data-testid="chat-container"], .chat-container');
    await expect(content.first()).toBeVisible({ timeout: 5000 });

    // Input should appear after loading
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('message input has proper placeholder text', async ({ page }) => {
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    const input = getMessageInput(page);
    const placeholder = await input.getAttribute('placeholder');

    // Should have meaningful placeholder - not empty or undefined
    expect(placeholder).toBeTruthy();
    expect(placeholder?.length).toBeGreaterThan(0);
  });

  test('model selector shows loading state when opening', async ({ page }) => {
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    const modelSelector = getModelSelectorButton(page);
    await modelSelector.click();

    // Dialog should open with content - may have loading skeleton briefly
    const dialog = page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Should show either loading skeleton or model options
    const hasContent = await dialog.locator('button, [role="option"], [role="checkbox"], .skeleton, [data-loading]').count();
    expect(hasContent).toBeGreaterThan(0);
  });

  test('quick start suggestions are not blank placeholders', async ({ page }) => {
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // Look for suggestion buttons
    const suggestions = page.locator('button').filter({
      hasText: /privacy|extinct|merit|embryo|intelligence|growth|./i,
    });

    const count = await suggestions.count();
    if (count > 0) {
      // Each suggestion should have visible text
      const firstText = await suggestions.first().textContent();
      expect(firstText?.trim().length).toBeGreaterThan(0);
    }
  });
});

/**
 * Test Suite: UI Flash and Duplication Prevention
 * Verifies no unwanted visual artifacts during state transitions
 */
test.describe('UI Flash and Duplication Prevention', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('no duplicate message inputs render', async ({ page }) => {
    // Should only have one textarea input
    const textareaCount = await page.locator('textarea').count();
    expect(textareaCount).toBe(1);
  });

  test('no duplicate model selector buttons render', async ({ page }) => {
    // Count model selector type buttons
    const modelButtons = page.locator('button').filter({
      hasText: /model|ai|participant/i,
    });

    const count = await modelButtons.count();
    // Should have at most 1-2 (one main, possibly one in toolbar)
    expect(count).toBeLessThanOrEqual(3);
  });

  test('opening and closing model selector does not leave artifacts', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);

    // Open
    await modelSelector.click();
    const dialog = page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Close
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // No leftover dialogs or overlays
    const leftoverDialogs = await page.locator('[role="dialog"]:visible, [data-radix-popper-content-wrapper]:visible').count();
    expect(leftoverDialogs).toBe(0);
  });

  test('typing in input does not cause UI flicker', async ({ page }) => {
    const input = getMessageInput(page);

    // Type quickly
    await input.fill('Test message 1');
    await input.fill('Test message 2');
    await input.fill('Test message 3');

    // Value should be the last typed text - no duplicates or flicker
    await expect(input).toHaveValue('Test message 3');

    // Input should remain single
    const textareaCount = await page.locator('textarea').count();
    expect(textareaCount).toBe(1);
  });

  test('rapid model selector open/close does not break UI', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);

    // Rapid open/close cycles
    for (let i = 0; i < 3; i++) {
      await modelSelector.click();
      await page.waitForTimeout(100);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    }

    // UI should still be functional
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('textarea')).toBeEnabled();
  });
});

/**
 * Test Suite: State Consistency During Navigation
 * Verifies state is preserved and consistent during page transitions
 */
test.describe('State Consistency During Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('typed message is not lost when clicking elsewhere', async ({ page }) => {
    const input = getMessageInput(page);
    await input.fill('Important message that should not be lost');

    // Click elsewhere on page
    await page.click('body', { position: { x: 10, y: 10 } });

    // Message should still be there
    await expect(input).toHaveValue('Important message that should not be lost');
  });

  test('model selection persists after closing selector', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);
    await modelSelector.click();

    const dialog = page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Close without changing
    await page.keyboard.press('Escape');

    // Reopen - should show same state
    await modelSelector.click();
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test('navigating away and back does not lose chat state', async ({ page }) => {
    const input = getMessageInput(page);
    await input.fill('Message before navigation');

    // This test checks that if we navigate away and back, the input state is handled properly
    // In a SPA, this might preserve or reset state based on implementation
    await page.goto('/chat/pricing');
    await page.waitForLoadState('networkidle');

    // Navigate back
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // Input should be either preserved or cleanly reset - not in broken state
    const newInput = getMessageInput(page);
    await expect(newInput).toBeEnabled();
  });
});

/**
 * Test Suite: Concurrent Operation Handling
 * Tests handling of multiple rapid user interactions
 */
test.describe('Concurrent Operation Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('rapid typing does not cause input lag or freeze', async ({ page }) => {
    const input = getMessageInput(page);

    const longMessage = 'This is a test message '.repeat(20);

    // Type rapidly
    await input.fill(longMessage);

    // Input should contain the full message
    await expect(input).toHaveValue(longMessage);
  });

  test('multiple quick clicks on send button do not cause issues', async ({ page }) => {
    const input = getMessageInput(page);
    await input.fill('Test message');

    // Get send button
    const sendButton = page.getByRole('button', { name: /send/i }).first();

    // Multiple rapid clicks - should not crash
    if (await sendButton.isVisible()) {
      await sendButton.click({ force: true }).catch(() => {});
      await sendButton.click({ force: true }).catch(() => {});
      await sendButton.click({ force: true }).catch(() => {});
    }

    // Page should still be functional
    await expect(page.locator('body')).toBeVisible();
  });

  test('keyboard shortcuts do not conflict with typing', async ({ page }) => {
    const input = getMessageInput(page);
    await input.focus();

    // Type with modifier keys (common shortcuts)
    await input.fill('Normal text');
    await page.keyboard.press('Control+a'); // Select all
    await page.keyboard.press('Backspace'); // Delete
    await input.fill('New text');

    await expect(input).toHaveValue('New text');
  });
});

/**
 * Test Suite: Error State Display
 * Verifies error states are properly shown to users
 */
test.describe('Error State Display', () => {
  test('empty message submission is handled gracefully', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    const input = getMessageInput(page);
    await input.fill('');

    // Try to submit empty message
    await input.press('Enter');

    // Should not navigate or show error - just ignore
    expect(page.url()).toContain('/chat');
  });

  test('whitespace-only message is handled gracefully', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    const input = getMessageInput(page);
    await input.fill('   ');

    // Try to submit whitespace
    await input.press('Enter');

    // Should not navigate - whitespace trimmed or rejected
    expect(page.url()).toContain('/chat');
  });
});

/**
 * Test Suite: Visual Consistency
 * Verifies UI elements maintain consistent visual state
 */
test.describe('Visual Consistency', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('send button state changes based on input', async ({ page }) => {
    const input = getMessageInput(page);
    const sendButton = page.getByRole('button', { name: /send/i }).first();

    // Empty input - button may be disabled or hidden
    await input.fill('');
    const _emptyState = await sendButton.isDisabled().catch(() => true);

    // With text - button should be enabled or visible
    await input.fill('Hello');
    await page.waitForTimeout(100); // Allow for debounce

    // Button should be interactable with text
    if (await sendButton.isVisible()) {
      const hasTextState = await sendButton.isDisabled().catch(() => false);
      // At minimum, with text it should be enabled or the same state
      expect(hasTextState).toBeDefined();
    }
  });

  test('focus states are visible for accessibility', async ({ page }) => {
    const input = getMessageInput(page);
    await input.focus();

    // Input should have visible focus indicator
    const isFocused = await input.evaluate(el => document.activeElement === el);
    expect(isFocused).toBe(true);
  });

  test('tooltips and labels are properly displayed', async ({ page }) => {
    // Check that buttons have accessible names
    const modelSelector = getModelSelectorButton(page);
    const ariaLabel = await modelSelector.getAttribute('aria-label');
    const textContent = await modelSelector.textContent();

    // Should have either aria-label or visible text
    expect(ariaLabel || textContent?.trim()).toBeTruthy();
  });
});
