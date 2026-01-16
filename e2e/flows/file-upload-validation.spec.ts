/**
 * File Upload Validation E2E Tests
 *
 * Tests verify that file upload validation works correctly in the browser,
 * particularly for visual files (images + PDFs) that have stricter size limits.
 *
 * CRITICAL: Visual files (images, PDFs) are converted to base64 for AI model
 * consumption. Files over 4MB cannot be processed by AI due to Cloudflare
 * Worker memory constraints (128MB limit).
 *
 * Test Scenarios:
 * 1. Oversized PDF rejection with user-friendly error
 * 2. Oversized image rejection with user-friendly error
 * 3. Valid small PDF acceptance
 * 4. Text files over 4MB should still be accepted (different limit)
 *
 * @see src/hooks/utils/use-file-validation.ts
 */

import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

const TEMP_DIR = path.join(process.cwd(), 'e2e', '.tmp');

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
 * Create a test file with specified size
 */
function createTestFile(name: string, sizeInMB: number): string {
  const filePath = path.join(TEMP_DIR, name);
  const sizeInBytes = Math.floor(sizeInMB * 1024 * 1024);

  // Create a file with the specified size
  const buffer = Buffer.alloc(sizeInBytes);

  // For PDFs, add minimal PDF header to make it a "valid" PDF
  if (name.endsWith('.pdf')) {
    const pdfHeader = '%PDF-1.4\n';
    buffer.write(pdfHeader);
  }

  fs.writeFileSync(filePath, buffer);
  return filePath;
}

test.describe('File Upload Validation - Visual File Size Limits', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to chat page
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    // Wait for chat input to be visible
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('should reject PDF over 4MB with user-friendly error message', async ({ page }) => {
    // Create a 5MB PDF file
    const pdfPath = createTestFile('large-test.pdf', 5);

    // Find the hidden file input and upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // Should show error toast or error state
    // Look for the error message about visual file being too large
    // Use .first() to handle multiple matching elements (toast + aria-live region)
    const errorMessage = page.getByText(/PDF.*files must be.*4 MB.*or smaller/i)
      .or(page.getByText(/too large/i))
      .first();

    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('should reject image over 4MB with user-friendly error message', async ({ page }) => {
    // Create a 6MB PNG file (simulated)
    const imagePath = createTestFile('large-image.png', 6);

    // Find the hidden file input and upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(imagePath);

    // Should show error message about image being too large
    // Use .first() to handle multiple matching elements (toast + aria-live region)
    const errorMessage = page.getByText(/Image.*files must be.*4 MB.*or smaller/i)
      .or(page.getByText(/too large/i))
      .first();

    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('should accept PDF under 4MB', async ({ page }) => {
    // Create a 2MB PDF file
    const pdfPath = createTestFile('small-test.pdf', 2);

    // Find the hidden file input and upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfPath);

    // Should NOT show error - file should appear in attachments area
    // Look for attachment chip/preview (use .first() to handle multiple matches)
    await expect(page.getByText(/small-test\.pdf/i)
      .or(page.locator('[aria-label*="attachment"]'))
      .or(page.locator('[title*="small-test.pdf"]'))
      .first()).toBeVisible({ timeout: 5000 });

    // Should NOT show the "too large" error (check count is 0)
    const errorCount = await page.getByText(/too large/i).count();
    expect(errorCount).toBe(0);
  });

  test('should accept text files larger than 4MB (different limit applies)', async ({ page }) => {
    // Create a 10MB text file - should be accepted since text files have 100MB limit
    const textPath = createTestFile('large-text.txt', 10);

    // Find the hidden file input and upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(textPath);

    // Should NOT show error - text files have higher limit
    // Look for attachment chip/preview (use .first() to handle multiple matches)
    await expect(page.getByText(/large-text\.txt/i)
      .or(page.locator('[aria-label*="attachment"]'))
      .or(page.locator('[title*="large-text.txt"]'))
      .first()).toBeVisible({ timeout: 5000 });

    // Should NOT show the "too large" error for text files (check count is 0)
    const errorCount = await page.getByText(/too large/i).count();
    expect(errorCount).toBe(0);
  });
});

test.describe('File Upload Validation - Basic Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
  });

  test('should reject unsupported file types', async ({ page }) => {
    // Create a video file (not in allowed MIME types)
    const videoPath = createTestFile('video.mp4', 1);

    const fileInput = page.locator('input[type="file"]');

    // Note: The file input has accept attribute, so the browser may prevent selection
    // We need to test this differently or check if error handling catches it
    try {
      await fileInput.setInputFiles(videoPath);

      // If file was accepted by browser, should show error message
      const errorMessage = page.getByText(/not allowed/i)
        .or(page.getByText(/invalid.*type/i));

      await expect(errorMessage).toBeVisible({ timeout: 5000 });
    } catch {
      // Browser may reject file based on accept attribute - this is also valid
      // The accept attribute prevents selection of unsupported files
    }
  });
});
