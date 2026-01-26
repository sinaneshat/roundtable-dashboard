import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  banExpires: integer('ban_expires', { mode: 'timestamp_ms' }),
  banned: integer('banned', { mode: 'boolean' }).default(false),
  banReason: text('ban_reason'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  id: text('id').primaryKey(),
  image: text('image'),
  name: text('name').notNull(),
  role: text('role'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable('session', {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  id: text('id').primaryKey(),
  impersonatedBy: text('impersonated_by'),
  ipAddress: text('ip_address'),
  token: text('token').notNull().unique(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = sqliteTable('account', {
  accessToken: text('access_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', {
    mode: 'timestamp_ms',
  }),
  accountId: text('account_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
  id: text('id').primaryKey(),
  idToken: text('id_token'),
  password: text('password'),
  providerId: text('provider_id').notNull(),
  refreshToken: text('refresh_token'),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', {
    mode: 'timestamp_ms',
  }),
  scope: text('scope'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const verification = sqliteTable('verification', {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  value: text('value').notNull(),
});

/**
 * API Key Table
 * Better Auth API Key plugin schema
 * Allows users to create and manage API keys for programmatic access
 */
export const apiKey = sqliteTable('api_key', {
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
  // Status and limits
  enabled: integer('enabled', { mode: 'boolean' }).default(true).notNull(),
  // Expiration
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  id: text('id').primaryKey(),
  key: text('key').notNull(), // Hashed API key
  lastRefillAt: integer('last_refill_at', { mode: 'timestamp_ms' }), // Last refill timestamp

  lastRequest: integer('last_request', { mode: 'timestamp_ms' }),
  // Metadata (stored as JSON string)
  metadata: text('metadata'),
  name: text('name'),

  // Permissions (stored as JSON string)
  permissions: text('permissions'),
  prefix: text('prefix'), // API key prefix (e.g., "rpnd_")

  // Rate limiting
  rateLimitEnabled: integer('rate_limit_enabled', { mode: 'boolean' }).default(true).notNull(),
  rateLimitMax: integer('rate_limit_max'), // Max requests in window
  rateLimitTimeWindow: integer('rate_limit_time_window'), // Time window in ms
  refillAmount: integer('refill_amount'), // Amount to refill
  // Refill configuration
  refillInterval: integer('refill_interval'), // Interval to refill in milliseconds

  remaining: integer('remaining'), // Remaining API calls (null = unlimited)

  requestCount: integer('request_count').default(0).notNull(),
  start: text('start'), // First few characters of key for display

  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),

  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});
