export const STATIC_CACHE_TAGS = {
  ACTIVE_PRODUCTS: 'active-products',
  ACTIVE_PRICES: 'active-prices',
} as const;

const UserCacheTags = {
  tier: (userId: string) => `user-tier-${userId}`,
  usage: (userId: string) => `user-usage-${userId}`,
  record: (userId: string) => `user-${userId}`,
  all: (userId: string) => [
    UserCacheTags.tier(userId),
    UserCacheTags.usage(userId),
    UserCacheTags.record(userId),
  ],
} as const;

const CustomerCacheTags = {
  byUserId: (userId: string) => `customer-${userId}`,
  byCustomerId: (customerId: string) => `customer-id-${customerId}`,
  all: (userId: string, customerId?: string) => {
    const tags = [CustomerCacheTags.byUserId(userId)];
    if (customerId) {
      tags.push(CustomerCacheTags.byCustomerId(customerId));
    }
    return tags;
  },
} as const;

const SubscriptionCacheTags = {
  active: (userId: string) => `active-subscription-${userId}`,
  all: (userId: string) => [SubscriptionCacheTags.active(userId)],
} as const;

const CreditCacheTags = {
  balance: (userId: string) => `credit-balance-${userId}`,
  hasActiveSubscription: (userId: string) => `has-active-sub-${userId}`,
  all: (userId: string) => [
    CreditCacheTags.balance(userId),
    CreditCacheTags.hasActiveSubscription(userId),
  ],
} as const;

const PriceCacheTags = {
  single: (priceId: string) => `price-${priceId}`,
  byProduct: (productId: string) => `product-prices-${productId}`,
  all: (priceId: string, productId?: string) => {
    const tags = [PriceCacheTags.single(priceId), STATIC_CACHE_TAGS.ACTIVE_PRICES];
    if (productId) {
      tags.push(PriceCacheTags.byProduct(productId));
    }
    return tags;
  },
} as const;

const ProductCacheTags = {
  single: (productId: string) => `product-${productId}`,
  all: (productId: string) => [
    ProductCacheTags.single(productId),
    STATIC_CACHE_TAGS.ACTIVE_PRODUCTS,
  ],
} as const;

const ThreadCacheTags = {
  list: (userId: string) => `threads-list-${userId}`,
  sidebar: (userId: string) => `threads-sidebar-${userId}`,
  single: (threadId: string) => `thread-${threadId}`,
  bySlug: (slug: string) => `thread-slug-${slug}`,
  participants: (threadId: string) => `thread-participants-${threadId}`,
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
} as const;

const MessageCacheTags = {
  byThread: (threadId: string) => `messages-${threadId}`,
  changelog: (threadId: string) => `changelog-${threadId}`,
  all: (threadId: string) => [
    MessageCacheTags.byThread(threadId),
    MessageCacheTags.changelog(threadId),
  ],
} as const;

const PublicThreadCacheTags = {
  single: (slug: string) => `public-thread-${slug}`,
  slugsList: 'public-slugs-list',
  owner: (threadId: string) => `public-thread-owner-${threadId}`,
  changelog: (threadId: string) => `public-changelog-${threadId}`,
  feedback: (threadId: string) => `public-feedback-${threadId}`,
  preSearch: (threadId: string) => `public-presearch-${threadId}`,
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
} as const;

const ModelsCacheTags = {
  byTier: (tier: string) => `models-tier-${tier}`,
  static: 'models-static',
  enrichedResponse: (tier: string) => `models-enriched-${tier}`,
  all: (tier?: string) => {
    const tags: string[] = [ModelsCacheTags.static];
    if (tier) {
      tags.push(ModelsCacheTags.byTier(tier), ModelsCacheTags.enrichedResponse(tier));
    }
    return tags;
  },
} as const;

const PublicSlugsListCacheTags = {
  list: 'public-thread-slugs-list',
  all: () => [PublicSlugsListCacheTags.list, PublicThreadCacheTags.slugsList],
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
  PublicSlugsListCacheTags,
  PublicThreadCacheTags,
  SubscriptionCacheTags,
  ThreadCacheTags,
  UserCacheTags,
};
