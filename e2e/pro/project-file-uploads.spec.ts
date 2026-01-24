/**
 * Project File Upload E2E Tests (Pro User)
 *
 * Tests verify:
 * 1. Project creation and navigation
 * 2. File upload in project thread doesn't create duplicates
 * 3. Thread-sourced files show "From chat" badge
 * 4. Thread-sourced files have delete button disabled
 *
 * Run with: bun run exec playwright test e2e/pro/project-file-uploads.spec.ts --project=chromium-pro
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { getMessageInput, waitForThreadNavigation } from '../helpers';

const TEMP_DIR = path.join(process.cwd(), 'e2e', '.tmp');
const TEST_PROJECT_NAME = `E2E Test Project ${Date.now()}`;

// Ensure temp directory exists
test.beforeAll(async () => {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
});

// Clean up temp files after tests
test.afterAll(async () => {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true });
  }
});

/**
 * Create a simple test file
 */
function createTestFile(name: string, content: string): string {
  const filePath = path.join(TEMP_DIR, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

test.describe('Project File Uploads', () => {
  test.setTimeout(300000); // 5 minutes for project tests

  let projectId: string | null = null;

  test('can create a new project', async ({ page }) => {
    // Navigate to chat page
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Wait for sidebar Projects button to be visible (exact match)
    const projectsButton = page.getByRole('button', { name: 'Projects' });
    await expect(projectsButton).toBeVisible({ timeout: 15000 });

    // Click the Projects button to expand the section and see the + button
    await projectsButton.click();
    await page.waitForTimeout(500);

    // Find the "+" button to create a new project
    // Look for button with plus icon or aria-label containing "create" or "add"
    const addButton = page.locator('button[aria-label*="project" i]')
      .or(page.locator('button').filter({ has: page.locator('svg[class*="plus"]') }))
      .first();

    const addBtnVisible = await addButton.isVisible().catch(() => false);

    if (addBtnVisible) {
      await addButton.click();
    } else {
      // Fallback: Look for any button near the Projects section with + icon
      const projectsSection = page.locator('div').filter({ has: projectsButton });
      const plusButton = projectsSection.locator('button').filter({ has: page.locator('svg') }).first();

      const plusBtnVisible = await plusButton.isVisible().catch(() => false);
      if (plusBtnVisible) {
        await plusButton.click();
      } else {
        // Final fallback: Navigate directly to projects route
        await page.goto('/chat/projects');
        await page.waitForLoadState('networkidle');

        const projectsPageCreateBtn = page.getByRole('button', { name: /create|new/i }).first();
        await expect(projectsPageCreateBtn).toBeVisible({ timeout: 10000 });
        await projectsPageCreateBtn.click();
      }
    }

    // Wait for dialog to appear
    await page.waitForTimeout(500);

    // Fill in project details in the dialog/form
    const nameInput = page.getByLabel(/name/i)
      .or(page.locator('input[name="name"]'))
      .or(page.locator('[role="dialog"] input').first());

    await expect(nameInput).toBeVisible({ timeout: 10000 });
    await nameInput.fill(TEST_PROJECT_NAME);

    // Submit the form
    const submitButton = page.getByRole('button', { name: /create|save/i }).last();
    await expect(submitButton).toBeEnabled({ timeout: 5000 });
    await submitButton.click();

    // Wait for navigation to project detail page
    await page.waitForURL(/\/chat\/projects\/[\w-]+/, { timeout: 30000 });

    // Extract project ID from URL
    const url = page.url();
    const match = url.match(/\/chat\/projects\/([\w-]+)/);
    if (match) {
      projectId = match[1];
    }

    // Verify project was created
    await expect(page.getByText(TEST_PROJECT_NAME)).toBeVisible({ timeout: 10000 });
  });

  test('can upload file in project thread without duplicates', async ({ page }) => {
    test.skip(!projectId, 'Project ID not available from previous test');

    // Navigate to project and create new thread
    await page.goto(`/chat/projects/${projectId}/new`);
    await page.waitForLoadState('networkidle');

    // Wait for chat input
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });

    // Create a test file
    const testFilePath = createTestFile('test-upload.txt', 'This is a test file for E2E testing.');

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFilePath);

    // Wait for file to appear in attachments
    await expect(page.getByText(/test-upload\.txt/i)).toBeVisible({ timeout: 10000 });

    // Type a message and send
    const input = getMessageInput(page);
    await expect(input).toBeEnabled({ timeout: 10000 });
    await input.fill('Please acknowledge this file upload. Brief response.');

    // Send the message
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(sendButton).toBeEnabled({ timeout: 10000 });
    await sendButton.click();

    // Wait for thread navigation (streaming completes)
    await waitForThreadNavigation(page);

    // Wait for response to complete
    await expect(page.locator('textarea')).toBeEnabled({ timeout: 180000 });

    // Now navigate to project files tab to verify no duplicates
    await page.goto(`/chat/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Click on Files tab
    const filesTab = page.getByRole('tab', { name: /files/i });
    await expect(filesTab).toBeVisible({ timeout: 10000 });
    await filesTab.click();

    // Wait for files to load
    await page.waitForTimeout(2000);

    // Count occurrences of the file - should be exactly 1
    const fileItems = page.locator('[class*="rounded-lg"]').filter({ hasText: 'test-upload.txt' });
    const fileCount = await fileItems.count();

    // CRITICAL: File should appear only once (no duplicates)
    expect(fileCount).toBe(1);
  });

  test('thread-sourced files show badge and have delete disabled', async ({ page }) => {
    test.skip(!projectId, 'Project ID not available from previous test');

    // Navigate to project files tab
    await page.goto(`/chat/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Click on Files tab
    const filesTab = page.getByRole('tab', { name: /files/i });
    await expect(filesTab).toBeVisible({ timeout: 10000 });
    await filesTab.click();

    // Wait for files to load
    await page.waitForTimeout(2000);

    // Find the file item
    const fileItem = page.locator('[class*="rounded-lg"]').filter({ hasText: 'test-upload.txt' });
    await expect(fileItem).toBeVisible({ timeout: 10000 });

    // Check for "From chat" badge
    const fromChatBadge = fileItem.getByText(/from chat/i);
    await expect(fromChatBadge).toBeVisible({ timeout: 5000 });

    // Check that delete button is disabled/greyed out
    // The delete button should have cursor-not-allowed class for thread files
    const deleteButton = fileItem.locator('[class*="cursor-not-allowed"]')
      .or(fileItem.locator('span[title*="Cannot delete"]'));

    const hasDisabledDelete = await deleteButton.isVisible().catch(() => false);
    expect(hasDisabledDelete).toBe(true);
  });

  test('can manually upload file to project (not from thread)', async ({ page }) => {
    test.skip(!projectId, 'Project ID not available from previous test');

    // Navigate to project files tab
    await page.goto(`/chat/projects/${projectId}`);
    await page.waitForLoadState('networkidle');

    // Click on Files tab
    const filesTab = page.getByRole('tab', { name: /files/i });
    await expect(filesTab).toBeVisible({ timeout: 10000 });
    await filesTab.click();

    // Wait for files section to load
    await page.waitForTimeout(1000);

    // Create another test file
    const manualFilePath = createTestFile('manual-upload.txt', 'This file was manually uploaded.');

    // Find file input in the files section
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(manualFilePath);

    // Wait for file to appear
    await expect(page.getByText(/manual-upload\.txt/i)).toBeVisible({ timeout: 30000 });

    // This file should NOT have the "From chat" badge
    const manualFileItem = page.locator('[class*="rounded-lg"]').filter({ hasText: 'manual-upload.txt' });
    const fromChatBadge = manualFileItem.getByText(/from chat/i);

    // Manual uploads should not have the badge
    const hasBadge = await fromChatBadge.isVisible().catch(() => false);
    expect(hasBadge).toBe(false);

    // Manual uploads should have working delete button
    const deleteButton = manualFileItem.locator('button').filter({ has: page.locator('svg') }).last();
    const isClickable = await deleteButton.isEnabled().catch(() => false);
    expect(isClickable).toBe(true);
  });

  // Cleanup: Delete the test project
  test.afterAll(async ({ browser }) => {
    if (!projectId)
      return;

    const context = await browser.newContext({
      storageState: '.playwright/auth/pro-user.json',
    });
    const page = await context.newPage();

    try {
      // Navigate to project settings
      await page.goto(`/chat/projects/${projectId}`);
      await page.waitForLoadState('networkidle');

      // Click Settings tab
      const settingsTab = page.getByRole('tab', { name: /settings/i });
      await settingsTab.click();

      // Find and click delete button
      const deleteButton = page.getByRole('button', { name: /delete/i });
      await deleteButton.click();

      // Confirm deletion in dialog
      const confirmButton = page.getByRole('button', { name: /delete|confirm/i }).last();
      await confirmButton.click();

      // Wait for navigation back to chat
      await page.waitForURL(/\/chat/, { timeout: 10000 });
    } catch {
      // Cleanup failed - not critical for test results
    } finally {
      await context.close();
    }
  });
});
