import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  role: text('role'),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' }),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$onUpdate(() => new Date())
    .notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonated_by'),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', {
    mode: 'timestamp',
  }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', {
    mode: 'timestamp',
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$onUpdate(() => new Date())
    .notNull(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * API Key Table
 * Better Auth API Key plugin schema
 * Allows users to create and manage API keys for programmatic access
 */
export const apiKey = sqliteTable('api_key', {
  id: text('id').primaryKey(),
  name: text('name'),
  start: text('start'), // First few characters of key for display
  prefix: text('prefix'), // API key prefix (e.g., "rpnd_")
  key: text('key').notNull(), // Hashed API key
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // Refill configuration
  refillInterval: integer('refill_interval'), // Interval to refill in milliseconds
  refillAmount: integer('refill_amount'), // Amount to refill
  lastRefillAt: integer('last_refill_at', { mode: 'timestamp' }), // Last refill timestamp

  // Status and limits
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  remaining: integer('remaining'), // Remaining API calls (null = unlimited)

  // Rate limiting
  rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' }).default(true).notNull(),
  rateLimitTimeWindow: integer('rate_limit_time_window'), // Time window in ms
  rateLimitMax: integer('rate_limit_max'), // Max requests in window
  requestCount: integer('request_count').default(0).notNull(),
  lastRequest: integer('last_request', { mode: 'timestamp' }),

  // Expiration
  expiresAt: integer('expires_at', { mode: 'timestamp' }),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),

  // Permissions (stored as JSON string)
  permissions: text('permissions'),

  // Metadata (stored as JSON string)
  metadata: text('metadata'),
});
