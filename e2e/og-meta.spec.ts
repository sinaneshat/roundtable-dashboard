import { expect, test } from '@playwright/test';

/**
 * OG Image and Meta Tag Tests
 * Comprehensive E2E tests for Open Graph images and meta tags across all pages
 *
 * Tests verify:
 * - OG image endpoints return valid PNG images
 * - Required meta tags are present in page HTML
 * - OG tags have correct content
 * - Twitter card tags are present
 * - Dynamic OG images generate correctly
 *
 * Uses chromium-no-auth project (no stored auth state)
 */

// Standard OG image dimensions
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

// Helper to extract meta tag content from page
async function getMetaContent(page: import('@playwright/test').Page, property: string): Promise<string | null> {
  const meta = page.locator(`meta[property="${property}"], meta[name="${property}"]`);
  const count = await meta.count();
  if (count === 0)
    return null;
  return meta.first().getAttribute('content');
}

// Helper to check if URL returns a valid image
async function isValidImageResponse(page: import('@playwright/test').Page, url: string): Promise<{
  status: number;
  contentType: string | null;
  isImage: boolean;
}> {
  const response = await page.request.get(url);
  const contentType = response.headers()['content-type'];
  return {
    status: response.status(),
    contentType,
    isImage: contentType?.startsWith('image/') ?? false,
  };
}

test.describe('Static Page OG Images', () => {
  test.describe('Homepage OG Image', () => {
    test('og image endpoint returns valid PNG', async ({ page }) => {
      const result = await isValidImageResponse(page, '/opengraph-image');

      expect(result.status).toBe(200);
      expect(result.isImage).toBe(true);
      expect(result.contentType).toContain('image/png');
    });

    test('homepage has required OG meta tags', async ({ page }) => {
      await page.goto('/');

      // Required OG tags
      const ogTitle = await getMetaContent(page, 'og:title');
      const ogDescription = await getMetaContent(page, 'og:description');
      const ogImage = await getMetaContent(page, 'og:image');
      const ogType = await getMetaContent(page, 'og:type');
      const ogUrl = await getMetaContent(page, 'og:url');

      expect(ogTitle).toBeTruthy();
      expect(ogDescription).toBeTruthy();
      expect(ogImage).toBeTruthy();
      expect(ogImage).toContain('opengraph-image');
      expect(ogType).toBeTruthy();
      expect(ogUrl).toBeTruthy();
    });

    test('homepage has Twitter card meta tags', async ({ page }) => {
      await page.goto('/');

      const twitterCard = await getMetaContent(page, 'twitter:card');
      const twitterTitle = await getMetaContent(page, 'twitter:title');
      const twitterDescription = await getMetaContent(page, 'twitter:description');
      const twitterImage = await getMetaContent(page, 'twitter:image');

      expect(twitterCard).toBeTruthy();
      expect(twitterTitle).toBeTruthy();
      expect(twitterDescription).toBeTruthy();
      expect(twitterImage).toBeTruthy();
    });
  });

  test.describe('Privacy Page OG Image', () => {
    test('og image endpoint returns valid PNG', async ({ page }) => {
      const result = await isValidImageResponse(page, '/privacy/opengraph-image');

      expect(result.status).toBe(200);
      expect(result.isImage).toBe(true);
      expect(result.contentType).toContain('image/png');
    });

    test('privacy page has required OG meta tags', async ({ page }) => {
      await page.goto('/privacy');

      const ogTitle = await getMetaContent(page, 'og:title');
      const ogDescription = await getMetaContent(page, 'og:description');
      const ogImage = await getMetaContent(page, 'og:image');

      expect(ogTitle).toBeTruthy();
      expect(ogTitle?.toLowerCase()).toContain('privacy');
      expect(ogDescription).toBeTruthy();
      expect(ogImage).toBeTruthy();
      expect(ogImage).toContain('opengraph-image');
    });

    test('privacy page has correct canonical URL', async ({ page }) => {
      await page.goto('/privacy');

      const canonical = page.locator('link[rel="canonical"]');
      const href = await canonical.getAttribute('href');

      expect(href).toBeTruthy();
      expect(href).toContain('/privacy');
    });
  });

  test.describe('Terms Page OG Image', () => {
    test('og image endpoint returns valid PNG', async ({ page }) => {
      const result = await isValidImageResponse(page, '/terms/opengraph-image');

      expect(result.status).toBe(200);
      expect(result.isImage).toBe(true);
      expect(result.contentType).toContain('image/png');
    });

    test('terms page has required OG meta tags', async ({ page }) => {
      await page.goto('/terms');

      const ogTitle = await getMetaContent(page, 'og:title');
      const ogDescription = await getMetaContent(page, 'og:description');
      const ogImage = await getMetaContent(page, 'og:image');

      expect(ogTitle).toBeTruthy();
      expect(ogTitle?.toLowerCase()).toContain('terms');
      expect(ogDescription).toBeTruthy();
      expect(ogImage).toBeTruthy();
      expect(ogImage).toContain('opengraph-image');
    });
  });

  test.describe('Sign In Page OG Image', () => {
    test('og image endpoint returns valid PNG', async ({ page }) => {
      const result = await isValidImageResponse(page, '/auth/sign-in/opengraph-image');

      expect(result.status).toBe(200);
      expect(result.isImage).toBe(true);
      expect(result.contentType).toContain('image/png');
    });

    test('sign in page has required OG meta tags', async ({ page }) => {
      await page.goto('/auth/sign-in');

      const ogTitle = await getMetaContent(page, 'og:title');
      const ogDescription = await getMetaContent(page, 'og:description');
      const ogImage = await getMetaContent(page, 'og:image');

      expect(ogTitle).toBeTruthy();
      expect(ogDescription).toBeTruthy();
      expect(ogImage).toBeTruthy();
    });
  });

  test.describe('Sign Up Page OG Image', () => {
    test('og image endpoint returns valid PNG', async ({ page }) => {
      const result = await isValidImageResponse(page, '/auth/sign-up/opengraph-image');

      expect(result.status).toBe(200);
      expect(result.isImage).toBe(true);
      expect(result.contentType).toContain('image/png');
    });

    test('sign up page has required OG meta tags', async ({ page }) => {
      await page.goto('/auth/sign-up');

      const ogTitle = await getMetaContent(page, 'og:title');
      const ogDescription = await getMetaContent(page, 'og:description');
      const ogImage = await getMetaContent(page, 'og:image');

      expect(ogTitle).toBeTruthy();
      expect(ogDescription).toBeTruthy();
      expect(ogImage).toBeTruthy();
    });
  });
});

test.describe('Chat Section OG Images', () => {
  test.describe('Chat Overview OG Image', () => {
    test('og image endpoint returns valid PNG', async ({ page }) => {
      // Chat OG image is served via API route to bypass auth protection
      const result = await isValidImageResponse(page, '/api/og/chat');

      expect(result.status).toBe(200);
      expect(result.isImage).toBe(true);
      expect(result.contentType).toContain('image/png');
    });
  });
});

test.describe('Public Chat Thread OG Images (Dynamic)', () => {
  // Note: These tests use mock/fallback since we don't have guaranteed public threads
  // The fallback image should still be a valid PNG

  test('public chat fallback og image returns valid PNG', async ({ page }) => {
    // Use a non-existent slug to trigger fallback
    const result = await isValidImageResponse(page, '/public/chat/non-existent-thread-slug/opengraph-image');

    // Should return 200 with fallback image, not 404
    expect(result.status).toBe(200);
    expect(result.isImage).toBe(true);
    expect(result.contentType).toContain('image/png');
  });

  test('public chat page with non-existent slug shows appropriate content', async ({ page }) => {
    const response = await page.goto('/public/chat/non-existent-thread-slug');

    // Should handle gracefully (404 or redirect)
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('OG Preview API Routes', () => {
  test('og preview route returns valid PNG', async ({ page }) => {
    const result = await isValidImageResponse(page, '/api/og-preview');

    expect(result.status).toBe(200);
    expect(result.isImage).toBe(true);
    expect(result.contentType).toContain('image/png');
  });

  test('og preview page route returns HTML', async ({ page }) => {
    const response = await page.request.get('/api/og-preview-page');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
  });
});

test.describe('Meta Tag Completeness', () => {
  const pagesToTest = [
    { path: '/', name: 'Homepage' },
    { path: '/privacy', name: 'Privacy' },
    { path: '/terms', name: 'Terms' },
    { path: '/auth/sign-in', name: 'Sign In' },
    { path: '/auth/sign-up', name: 'Sign Up' },
  ];

  for (const { path, name } of pagesToTest) {
    test(`${name} page has complete meta tags`, async ({ page }) => {
      await page.goto(path);

      // Check essential HTML meta tags
      const title = await page.title();
      expect(title).toBeTruthy();
      expect(title.length).toBeGreaterThan(0);

      // Check viewport meta
      const viewport = await getMetaContent(page, 'viewport');
      expect(viewport).toBeTruthy();

      // Check description meta
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description).toBeTruthy();

      // Check OG image dimensions (if specified)
      const ogImageWidth = await getMetaContent(page, 'og:image:width');
      const ogImageHeight = await getMetaContent(page, 'og:image:height');

      if (ogImageWidth && ogImageHeight) {
        expect(Number.parseInt(ogImageWidth)).toBe(OG_IMAGE_WIDTH);
        expect(Number.parseInt(ogImageHeight)).toBe(OG_IMAGE_HEIGHT);
      }
    });

    test(`${name} page OG image URL is absolute`, async ({ page }) => {
      await page.goto(path);

      const ogImage = await getMetaContent(page, 'og:image');

      expect(ogImage).toBeTruthy();
      // OG image URL should be absolute (start with http:// or https://)
      expect(ogImage).toMatch(/^https?:\/\//);
    });
  }
});

test.describe('OG Image Response Headers', () => {
  const ogImageEndpoints = [
    '/opengraph-image',
    '/privacy/opengraph-image',
    '/terms/opengraph-image',
    '/auth/sign-in/opengraph-image',
    '/auth/sign-up/opengraph-image',
    '/api/og/chat', // Chat OG served via API route to bypass auth
  ];

  for (const endpoint of ogImageEndpoints) {
    test(`${endpoint} has correct response headers`, async ({ page }) => {
      const response = await page.request.get(endpoint);

      expect(response.status()).toBe(200);

      const headers = response.headers();

      // Content-Type should be image/png
      expect(headers['content-type']).toContain('image/png');

      // Should have cache headers for performance
      // Note: exact cache headers depend on implementation
      const cacheControl = headers['cache-control'];
      // Static OG images should have some caching
      expect(cacheControl || headers['cdn-cache-control']).toBeTruthy();
    });
  }
});

test.describe('OG Image Content Validation', () => {
  test('og images have non-zero content length', async ({ page }) => {
    const endpoints = [
      '/opengraph-image',
      '/privacy/opengraph-image',
      '/terms/opengraph-image',
    ];

    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);
      const body = await response.body();

      expect(body.length).toBeGreaterThan(1000); // PNG should be at least 1KB
    }
  });

  test('og images start with PNG magic bytes', async ({ page }) => {
    const endpoints = [
      '/opengraph-image',
      '/privacy/opengraph-image',
      '/terms/opengraph-image',
    ];

    // PNG magic bytes: 137 80 78 71 13 10 26 10
    const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    for (const endpoint of endpoints) {
      const response = await page.request.get(endpoint);
      const body = await response.body();
      const header = Array.from(body.subarray(0, 8));

      expect(header).toEqual(PNG_MAGIC);
    }
  });
});

test.describe('Social Media Crawler Simulation', () => {
  // Simulate how social media crawlers see the page

  test('page renders meta tags without JavaScript', async ({ page }) => {
    // Disable JavaScript to simulate crawler behavior
    await page.route('**/*', (route) => {
      if (route.request().resourceType() === 'script') {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto('/');

    // Meta tags should still be present (server-rendered)
    const ogTitle = await getMetaContent(page, 'og:title');
    const ogImage = await getMetaContent(page, 'og:image');

    expect(ogTitle).toBeTruthy();
    expect(ogImage).toBeTruthy();
  });

  test('og:url matches canonical URL', async ({ page }) => {
    await page.goto('/privacy');

    const ogUrl = await getMetaContent(page, 'og:url');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');

    if (ogUrl && canonical) {
      // Both should point to the same page
      expect(ogUrl).toContain('/privacy');
      expect(canonical).toContain('/privacy');
    }
  });
});

test.describe('Error Handling', () => {
  test('invalid og image path returns graceful error', async ({ page }) => {
    const response = await page.request.get('/invalid-path/opengraph-image');

    // Should not crash the server (5xx)
    expect(response.status()).toBeLessThan(500);
  });

  test('malformed slug in public chat og image returns fallback', async ({ page }) => {
    const slugsToTest = [
      'slug-with-special-chars-!@#$%',
      `very-long-slug-${'a'.repeat(200)}`,
      '../../../etc/passwd', // Path traversal attempt
    ];

    for (const slug of slugsToTest) {
      const encodedSlug = encodeURIComponent(slug);
      const response = await page.request.get(`/public/chat/${encodedSlug}/opengraph-image`);

      // Should return 200 (fallback) or 4xx, never 5xx
      expect(response.status()).toBeLessThan(500);
    }
  });
});
