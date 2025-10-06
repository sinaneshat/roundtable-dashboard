import { eq } from 'drizzle-orm';
import type { MetadataRoute } from 'next';

import { getDbAsync } from '@/db';
import { chatThread } from '@/db/schema';
import { getBaseUrl } from '@/utils/helpers';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();
  const currentDate = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: currentDate.toISOString(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];

  // Fetch all public chat threads for sitemap
  let publicThreadPages: MetadataRoute.Sitemap = [];

  try {
    const db = await getDbAsync();

    // Query all public threads (only active ones, not archived or deleted)
    const publicThreads = await db
      .select()
      .from(chatThread)
      .where(eq(chatThread.isPublic, true))
      .limit(1000); // Limit to prevent sitemap from getting too large

    publicThreadPages = publicThreads.map(thread => ({
      url: `${baseUrl}/public/chat/${thread.slug}`,
      lastModified: thread.updatedAt.toISOString(),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
  } catch (error) {
    console.error('Error fetching public threads for sitemap:', error);
    // Continue without public threads if there's an error
  }

  return [
    ...staticPages,
    ...publicThreadPages,
  ];
}
