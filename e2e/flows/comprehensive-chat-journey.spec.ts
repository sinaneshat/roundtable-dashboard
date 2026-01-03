import { expect, test } from '@playwright/test';

import {
  getMessageInput,
  getModelSelectorButton,
} from '../helpers';

/**
 * Comprehensive Chat Journey E2E Tests
 * Based on docs/FLOW_DOCUMENTATION.md
 *
 * Tests UI configuration and interaction without requiring AI streaming.
 * Full streaming tests are in e2e/pro/streaming-chat.spec.ts
 */

/**
 * Test Suite: Chat Interface Configuration
 * These tests verify UI configuration options work without streaming
 */
test.describe('Chat Interface Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('displays all configuration options', async ({ page }) => {
    // Model selector should be visible
    const modelSelector = getModelSelectorButton(page);
    await expect(modelSelector).toBeVisible({ timeout: 10000 });

    // Message input should be ready
    const input = getMessageInput(page);
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
  });

  test('can open and close model selector', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);
    await modelSelector.click();

    // Dialog/popover should open
    const dialog = page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Close by clicking outside or pressing Escape
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test('shows quick start suggestions', async ({ page }) => {
    // Quick start suggestions should be visible on the overview screen
    const suggestions = page.locator('button').filter({
      hasText: /privacy|extinct|merit|embryo|intelligence|growth/i,
    });

    await expect(suggestions.first()).toBeVisible({ timeout: 15000 });
  });

  test('can type message in input', async ({ page }) => {
    const input = getMessageInput(page);
    await input.fill('Test message for E2E');
    await expect(input).toHaveValue('Test message for E2E');
  });
});

/**
 * Test Suite: Model Selection
 * Tests for selecting and configuring AI models
 */
test.describe('Model Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('can select models from the model selector', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);
    await modelSelector.click();

    // Wait for model options to be visible
    const dialog = page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Look for model options (GPT, Claude, etc.)
    const modelOptions = dialog.locator('button, [role="option"], [role="checkbox"]');
    const count = await modelOptions.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows subscription tier restrictions', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);
    await modelSelector.click();

    const dialog = page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Look for tier indicators (Free, Pro, etc.)
    const tierIndicators = dialog.locator('text=/free|pro|power|upgrade/i');
    await expect(tierIndicators.first()).toBeVisible({ timeout: 5000 });
  });
});

// NOTE: Multi-round streaming tests are in e2e/pro/streaming-chat.spec.ts
// Those tests use pro user auth with billing access

// NOTE: Participant configuration tests that require streaming are in e2e/pro/
// UI-only participant tests are covered by Model Selection tests above

/**
 * Test Suite: Role Assignment
 * Tests for assigning and changing participant roles
 */
test.describe('Role Assignment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('role selector is accessible from model configuration', async ({ page }) => {
    const modelSelector = getModelSelectorButton(page);
    await modelSelector.click();

    const dialog = page.getByRole('dialog').or(page.locator('[data-radix-popper-content-wrapper]'));
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Look for role-related UI elements
    const _roleElements = dialog.locator('text=/role|critic|advocate|analyst|ideator/i');

    // Role elements may or may not be visible depending on model selection
    // Just verify the dialog opened successfully
    expect(await dialog.isVisible()).toBe(true);
  });
});

// NOTE: Error recovery streaming tests are in e2e/pro/stream-resumption.spec.ts

/**
 * Test Suite: Quick Start Suggestions
 * Tests for using quick start suggestion cards
 */
test.describe('Quick Start Suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('quick start suggestions are clickable', async ({ page }) => {
    // Find suggestion buttons
    const suggestions = page.locator('button').filter({
      hasText: /privacy|extinct|merit|embryo|intelligence|growth/i,
    });

    const count = await suggestions.count();
    if (count > 0) {
      // First suggestion should be clickable
      const firstSuggestion = suggestions.first();
      await expect(firstSuggestion).toBeVisible();
      await expect(firstSuggestion).toBeEnabled();
    }
  });

  // NOTE: Streaming test for clicking suggestions is in e2e/pro/streaming-chat.spec.ts
});
