/**
 * Slug Generator Service
 *
 * Generates SEO-friendly, unique slugs for chat threads
 * Format: {title-kebab-case}-{short-id}
 * Example: "product-strategy-brainstorm-abc123"
 */

import { eq } from 'drizzle-orm';

import { getDbAsync } from '@/db';
import * as tables from '@/db';

const MAX_SLUG_LENGTH = 50;
const SHORT_ID_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function toKebabCase(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/g, '');
}

function generateShortId() {
  return Math.random().toString(36).substring(2, 2 + SHORT_ID_LENGTH);
}

/**
 * Generate unique slug from title
 * Format: {title-kebab}-{short-id}
 * Ensures uniqueness by checking database
 */
export async function generateUniqueSlug(title: string): Promise<string> {
  const baseSlug = toKebabCase(title);
  const db = await getDbAsync();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const shortId = generateShortId();
    const slug = `${baseSlug}-${shortId}`;

    try {
      const existing = await db.query.chatThread.findFirst({
        where: eq(tables.chatThread.slug, slug),
      });

      if (!existing) {
        return slug;
      }
    } catch {
      // Continue to next attempt on error
    }
  }

  const timestamp = Date.now().toString(36);
  return `${baseSlug}-${timestamp}`;
}

export async function updateThreadSlug(threadId: string, newTitle: string): Promise<string> {
  const db = await getDbAsync();
  const newSlug = await generateUniqueSlug(newTitle);

  await db
    .update(tables.chatThread)
    .set({
      slug: newSlug,
      updatedAt: new Date(),
    })
    .where(eq(tables.chatThread.id, threadId));

  return newSlug;
}
