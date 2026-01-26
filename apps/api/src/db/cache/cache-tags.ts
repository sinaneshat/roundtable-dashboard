export const STATIC_CACHE_TAGS = {
  ACTIVE_PRICES: 'active-prices',
  ACTIVE_PRODUCTS: 'active-products',
} as const;

const UserCacheTags = {
  all: (userId: string) => [
    UserCacheTags.tier(userId),
    UserCacheTags.usage(userId),
    UserCacheTags.record(userId),
  ],
  record: (userId: string) => `user-${userId}`,
  tier: (userId: string) => `user-tier-${userId}`,
  usage: (userId: string) => `user-usage-${userId}`,
} as const;

const CustomerCacheTags = {
  all: (userId: string, customerId?: string) => {
    const tags = [CustomerCacheTags.byUserId(userId)];
    if (customerId) {
      tags.push(CustomerCacheTags.byCustomerId(customerId));
    }
    return tags;
  },
  byCustomerId: (customerId: string) => `customer-id-${customerId}`,
  byUserId: (userId: string) => `customer-${userId}`,
} as const;

const SubscriptionCacheTags = {
  active: (userId: string) => `active-subscription-${userId}`,
  all: (userId: string) => [SubscriptionCacheTags.active(userId)],
} as const;

const CreditCacheTags = {
  all: (userId: string) => [
    CreditCacheTags.balance(userId),
    CreditCacheTags.hasActiveSubscription(userId),
  ],
  balance: (userId: string) => `credit-balance-${userId}`,
  hasActiveSubscription: (userId: string) => `has-active-sub-${userId}`,
} as const;

const PriceCacheTags = {
  all: (priceId: string, productId?: string) => {
    const tags = [PriceCacheTags.single(priceId), STATIC_CACHE_TAGS.ACTIVE_PRICES];
    if (productId) {
      tags.push(PriceCacheTags.byProduct(productId));
    }
    return tags;
  },
  byProduct: (productId: string) => `product-prices-${productId}`,
  single: (priceId: string) => `price-${priceId}`,
} as const;

const ProductCacheTags = {
  all: (productId: string) => [
    ProductCacheTags.single(productId),
    STATIC_CACHE_TAGS.ACTIVE_PRODUCTS,
  ],
  single: (productId: string) => `product-${productId}`,
} as const;

const ThreadCacheTags = {
  all: (userId: string, threadId?: string, slug?: string) => {
    const tags = [ThreadCacheTags.list(userId), ThreadCacheTags.sidebar(userId)];
    if (threadId) {
      tags.push(
        ThreadCacheTags.single(threadId),
        ThreadCacheTags.participants(threadId),
      );
    }
    if (slug) {
      tags.push(ThreadCacheTags.bySlug(slug));
    }
    return tags;
  },
  bySlug: (slug: string) => `thread-slug-${slug}`,
  list: (userId: string) => `threads-list-${userId}`,
  participants: (threadId: string) => `thread-participants-${threadId}`,
  sidebar: (userId: string) => `threads-sidebar-${userId}`,
  single: (threadId: string) => `thread-${threadId}`,
} as const;

const MessageCacheTags = {
  all: (threadId: string) => [
    MessageCacheTags.byThread(threadId),
    MessageCacheTags.changelog(threadId),
  ],
  byThread: (threadId: string) => `messages-${threadId}`,
  changelog: (threadId: string) => `changelog-${threadId}`,
} as const;

const PublicThreadCacheTags = {
  all: (slug?: string, threadId?: string) => {
    const tags: string[] = [PublicThreadCacheTags.slugsList];
    if (slug) {
      tags.push(PublicThreadCacheTags.single(slug));
    }
    if (threadId) {
      tags.push(
        PublicThreadCacheTags.owner(threadId),
        PublicThreadCacheTags.changelog(threadId),
        PublicThreadCacheTags.feedback(threadId),
        PublicThreadCacheTags.preSearch(threadId),
      );
    }
    return tags;
  },
  changelog: (threadId: string) => `public-changelog-${threadId}`,
  feedback: (threadId: string) => `public-feedback-${threadId}`,
  owner: (threadId: string) => `public-thread-owner-${threadId}`,
  preSearch: (threadId: string) => `public-presearch-${threadId}`,
  single: (slug: string) => `public-thread-${slug}`,
  slugsList: 'public-slugs-list',
} as const;

const ModelsCacheTags = {
  all: (tier?: string) => {
    const tags: string[] = [ModelsCacheTags.static];
    if (tier) {
      tags.push(ModelsCacheTags.byTier(tier), ModelsCacheTags.enrichedResponse(tier));
    }
    return tags;
  },
  byTier: (tier: string) => `models-tier-${tier}`,
  enrichedResponse: (tier: string) => `models-enriched-${tier}`,
  static: 'models-static',
} as const;

const PublicSlugsListCacheTags = {
  all: () => [PublicSlugsListCacheTags.list, PublicThreadCacheTags.slugsList],
  list: 'public-thread-slugs-list',
} as const;

const ProjectCacheTags = {
  all: (projectId: string) => [
    ProjectCacheTags.detail(projectId),
    ProjectCacheTags.threads(projectId),
    ProjectCacheTags.memories(projectId),
    ProjectCacheTags.attachments(projectId),
    ProjectCacheTags.context(projectId),
  ],
  attachments: (projectId: string) => `project-attachments-${projectId}`,
  context: (projectId: string) => `project-context-${projectId}`,
  detail: (projectId: string) => `project-${projectId}`,
  memories: (projectId: string) => `project-memories-${projectId}`,
  threads: (projectId: string) => `project-threads-${projectId}`,
} as const;

export function getUserSubscriptionCacheTags(
  userId: string,
  customerId?: string,
  priceId?: string,
): string[] {
  const tags = [
    ...UserCacheTags.all(userId),
    ...SubscriptionCacheTags.all(userId),
    ...CustomerCacheTags.all(userId, customerId),
    // CRITICAL: Include credit balance cache - subscription changes affect planType
    // Without this, stale planType=FREE may cause incorrect free user limit enforcement
    ...CreditCacheTags.all(userId),
  ];

  if (priceId) {
    tags.push(PriceCacheTags.single(priceId));
  }

  return tags;
}

export function getBillingDataCacheTags(productId?: string, priceId?: string): string[] {
  const tags: string[] = [STATIC_CACHE_TAGS.ACTIVE_PRODUCTS, STATIC_CACHE_TAGS.ACTIVE_PRICES];

  if (productId) {
    tags.push(...ProductCacheTags.all(productId));
  }

  if (priceId) {
    tags.push(PriceCacheTags.single(priceId));
    if (productId) {
      tags.push(PriceCacheTags.byProduct(productId));
    }
  }

  return tags;
}

export {
  CreditCacheTags,
  CustomerCacheTags,
  MessageCacheTags,
  ModelsCacheTags,
  PriceCacheTags,
  ProductCacheTags,
  ProjectCacheTags,
  PublicSlugsListCacheTags,
  PublicThreadCacheTags,
  SubscriptionCacheTags,
  ThreadCacheTags,
  UserCacheTags,
};
