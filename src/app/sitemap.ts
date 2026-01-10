import { eq } from 'drizzle-orm';
import type { MetadataRoute } from 'next';

import { ThreadStatuses } from '@/api/core/enums';
import { chatThread, getDbAsync } from '@/db';
import { getAppBaseUrl } from '@/lib/config/base-urls';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppBaseUrl();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/chat/pricing`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/auth/sign-in`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/auth/sign-up`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];

  let publicThreadPages: MetadataRoute.Sitemap = [];

  try {
    const db = await getDbAsync();

    const publicThreads = await db
      .select()
      .from(chatThread)
      .where(eq(chatThread.isPublic, true))
      .limit(50000);

    const activeThreads = publicThreads.filter(
      thread => thread.status === ThreadStatuses.ACTIVE,
    );

    publicThreadPages = activeThreads.map(thread => ({
      url: `${baseUrl}/public/chat/${thread.slug}`,
      lastModified: thread.updatedAt.toISOString(),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch (error) {
    console.error('[Sitemap] Failed to fetch public threads:', error);
  }

  return [
    ...staticPages,
    ...publicThreadPages,
  ];
}
