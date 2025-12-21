import { eq } from 'drizzle-orm';
import type { MetadataRoute } from 'next';

import { ThreadStatuses } from '@/api/core/enums';
import { chatThread, getDbAsync } from '@/db';
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
    // SEO Best Practice: Exclude archived/deleted threads to keep sitemap clean
    const publicThreads = await db
      .select()
      .from(chatThread)
      .where(eq(chatThread.isPublic, true))
      .limit(50000); // Sitemap limit per Google guidelines

    // Filter out archived and deleted threads for SEO optimization
    const activeThreads = publicThreads.filter(
      thread => thread.status === ThreadStatuses.ACTIVE,
    );

    publicThreadPages = activeThreads.map(thread => ({
      url: `${baseUrl}/public/chat/${thread.slug}`,
      lastModified: thread.updatedAt.toISOString(),
      changeFrequency: 'weekly' as const, // More realistic than 'daily'
      priority: 0.8, // Higher priority for public content
    }));
  } catch (error) {
    console.error('[Sitemap] Failed to fetch public threads:', error);
    // Continue without public threads if there's an error
  }

  return [
    ...staticPages,
    ...publicThreadPages,
  ];
}
