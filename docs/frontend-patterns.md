# Frontend Patterns & Architecture Guide

**roundtable.now - Frontend Implementation Guide**

This document outlines established frontend patterns, architectural decisions, and implementation guidelines for roundtable.now. These patterns ensure consistency, maintainability, and optimal developer experience across the entire frontend codebase.

## Table of Contents

1. [Overview & Architecture](#overview--architecture)
2. [Next.js App Router Patterns](#nextjs-app-router-patterns)
3. [Component Architecture](#component-architecture)
4. [Data Fetching & State Management](#data-fetching--state-management)
5. [API Integration & Services](#api-integration--services)
6. [Internationalization (i18n)](#internationalization-i18n)
7. [Layout & Container Patterns](#layout--container-patterns)
8. [UI Library & Design System](#ui-library--design-system)
9. [Email Template System](#email-template-system)
10. [Asset & Icon Management](#asset--icon-management)
11. [Utility Libraries & Helpers](#utility-libraries--helpers)
12. [Performance & Optimization](#performance--optimization)
13. [Development Guidelines](#development-guidelines)

---

## Overview & Architecture

### Core Technology Stack

```typescript
// Primary Frontend Stack
{
  "framework": "Next.js 15 (App Router)",
  "ui": "shadcn/ui + Radix UI",
  "styling": "Tailwind CSS v4 + CVA",
  "state": "TanStack Query v5 + Zustand",
  "api": "Hono RPC Client (Type-safe)",
  "i18n": "next-intl (English-only)",
  "email": "React Email v4",
  "auth": "Better Auth Integration",
  "icons": "Lucide React + Custom SVGs",
  "forms": "React Hook Form + Zod",
  "typography": "Inter (US English)"
}
```

### Type Safety & Patterns Cross-Reference

**🚨 MANDATORY**: All type safety, enum, metadata, and validation patterns are defined in:
- **`/docs/type-inference-patterns.md`** - Single source of truth for:
  - Enum 5-part pattern (MessageRoles, ChatModes, AnalysisStatuses, etc.)
  - Metadata extraction functions (getRoundNumber, getParticipantId, etc.)
  - Query keys pattern (queryKeys.threads, invalidationPatterns)
  - Zod schema patterns and type inference
  - Type-safe data fetching and validation

**ALL frontend code MUST follow patterns defined in type-inference-patterns.md**

### Directory Structure Philosophy

```bash
src/
├── app/                    # Next.js 15 App Router (File-based routing)
│   ├── (app)/             # Route groups for layout isolation
│   │   └── dashboard/     # Protected dashboard routes
│   ├── auth/              # Authentication flow pages
│   ├── @modal/            # Parallel route for modals
│   └── globals.css        # Global styles and CSS variables
├── components/            # Reusable UI components
│   ├── ui/                # shadcn/ui base components
│   ├── dashboard/         # Domain-specific dashboard components
│   ├── auth/              # Authentication components
│   └── providers/         # Context providers and wrappers
├── containers/            # Page-level containers and screens
├── hooks/                 # Custom React hooks
│   └── utils/             # Utility hooks (useBoolean)
├── services/              # API client services and utilities
├── lib/                   # Utility functions and configurations
├── i18n/                  # Internationalization setup and locales
├── emails/                # React Email templates
├── icons/                 # Custom SVG icons and icon utilities
└── styles/                # Global styles and theme utilities
```

---

## Next.js App Router Patterns

### Route Organization Strategy

**Route Groups for Layout Isolation:**
```typescript
// File: src/app/(app)/layout.tsx
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 lg:pl-64">
        <AppHeader />
        <div className="container mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}

// Pattern: (app) route group isolates dashboard layout
// src/app/(app)/chat/page.tsx ✓
// src/app/(app)/settings/page.tsx ✓
```

**Parallel Routes for Modal Management:**
```typescript
// File: src/app/(app)/@modal/default.tsx
export default function Default() {
  return null // Default parallel route returns null
}

// File: src/app/(app)/@modal/(.)setup/page.tsx
import { Modal } from '@/components/ui/modal'

export default function SetupModal() {
  return (
    <Modal>
      <SetupForm />
    </Modal>
  )
}

// Pattern: @modal parallel route with intercepting routes
// Enables modal navigation without losing page state
```

**Intercepting Routes for UX Enhancement:**
```typescript
// File: src/app/(app)/setup/(.)modal/page.tsx
// Intercepts /setup route when navigated from dashboard
// Shows modal instead of full page navigation

// Pattern: (.) intercepts same segment level
// (..) intercepts parent segment level
// (...) intercepts from root
```

### Page Component Patterns

**Standard Page Structure:**
```typescript
// File: src/app/(app)/chat/page.tsx
import { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { DashboardContainer } from '@/containers/dashboard-container'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard')
  return {
    title: t('meta.title'),
    description: t('meta.description')
  }
}

export default function DashboardPage() {
  return <DashboardContainer />
}

// Pattern: Pages are thin wrappers around containers
// Metadata generation uses i18n translations
// Business logic stays in containers/components
```

**Loading and Error Boundaries:**
```typescript
// File: src/app/(app)/chat/loading.tsx
import { DashboardSkeleton } from '@/components/skeletons'

export default function Loading() {
  return <DashboardSkeleton />
}

// File: src/app/(app)/chat/error.tsx
'use client'

import { ErrorBoundary } from '@/components/ui/error-boundary'

export default function Error({ error, reset }: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundary error={error} reset={reset} />
}

// Pattern: Each route segment can have loading/error states
// Use typed error boundaries with reset functionality
```

---

## Component Architecture

### shadcn/ui Integration Patterns

**Base Component Extension:**
```typescript
// File: src/components/ui/button.tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }

// Pattern: All UI components use CVA for variant management
// Radix primitives for accessibility and behavior
// Forwarded refs and proper TypeScript inference
```

**Domain-Specific Component Extension:**
```typescript
// File: src/components/chat/user-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import { User } from '@/lib/types'

interface UserCardProps {
  user: User
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export function UserCard({
  user,
  onEdit,
  onDelete
}: UserCardProps) {
  const t = useTranslations('dashboard.users')

  return (
    <Card className="relative">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="text-lg font-semibold">
            {user.name}
          </span>
          <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
            {t(`status.${user.status}`)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('created')}: {new Date(user.createdAt).toLocaleDateString()}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(user.id)}>
              {t('edit')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(user.id)}>
              {t('delete')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Pattern: Domain components build on UI primitives
// Props interface for type safety
// Internationalization for all user-facing text
// Event handlers passed down from containers
```

**Provider Pattern for Global State:**
```typescript
// File: src/components/providers/app-providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/toaster'
import { useState } from 'react'

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes
      },
    },
  }))

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}

// Pattern: Single provider component wraps all global providers
// QueryClient configuration with sensible defaults
// Development tools conditionally included
```

---

## Data Fetching & State Management

### TanStack Query Patterns

**Current Implementation Status:**

The application uses TanStack Query v5 for API data fetching, with centralized configuration in `/src/lib/data/`. The hooks directory is organized into three categories:

- `/src/hooks/queries/` - Query hooks for data fetching (READ operations)
- `/src/hooks/mutations/` - Mutation hooks for data updates (CREATE/UPDATE/DELETE operations)
- `/src/hooks/utils/` - Utility hooks for UI state and common patterns

**QueryClient Configuration:**
```typescript
// File: src/lib/data/query-client.ts
import { QueryClient } from '@tanstack/react-query'

// Shared QueryClient for both server and client
export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: create fresh QueryClient for each request
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnMount: false,
          refetchOnReconnect: false,
          refetchOnWindowFocus: false,
        },
      },
    })
  } else {
    // Client: use singleton instance
    if (!clientQueryClient) {
      clientQueryClient = new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnMount: false,
            refetchOnReconnect: 'always',
            refetchOnWindowFocus: false,
          },
        },
      })
    }
    return clientQueryClient
  }
}

// Pattern: Server creates new instance per request
// Client uses singleton for cache persistence
// Minimal defaults to prevent hydration conflicts
```

**Data Fetching Architecture:**

The application follows a separation between authentication and business data, with proper hook abstraction layers:

```typescript
// For Authentication: Use Better Auth directly (NOT TanStack Query)
import { authClient } from '@/lib/auth/client'

export function UserProfile() {
  const { data: session } = authClient.useSession()
  const { data: org } = authClient.useActiveOrganization()

  return <div>User: {session?.user.name}</div>
}

// For API Data: Use Query Hooks from /src/hooks/queries
import { useProductsQuery, useModelsQuery } from '@/hooks/queries'

export function PricingScreen() {
  const { data: productsData, isLoading } = useProductsQuery()
  const products = productsData?.success ? productsData.data?.items ?? [] : []

  if (isLoading) return <div>Loading...</div>
  return <div>Products: {products.length}</div>
}

// For Mutations: Use Mutation Hooks from /src/hooks/mutations
import { useCreateCheckoutSessionMutation } from '@/hooks/mutations'

export function SubscribeButton({ priceId }: { priceId: string }) {
  const createCheckout = useCreateCheckoutSessionMutation()

  const handleClick = async () => {
    const result = await createCheckout.mutateAsync({ json: { priceId } })
    if (result.success && result.data?.url) {
      window.location.href = result.data.url
    }
  }

  return (
    <button onClick={handleClick} disabled={createCheckout.isPending}>
      {createCheckout.isPending ? 'Processing...' : 'Subscribe'}
    </button>
  )
}

// Pattern: Better Auth for auth, Query hooks for reads, Mutation hooks for writes
// Type-safe API calls with proper error handling
// Centralized configuration in /src/lib/data/
```

**Query Hooks Pattern:**
```typescript
// File: src/hooks/queries/products.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getProductsService } from '@/services/api';

/**
 * Hook to fetch all products with pricing plans
 * Public endpoint - no authentication required
 *
 * SSG/ISR: Data prefetched on server, cached on client
 * Uses STALE_TIMES.products for consistency with server prefetch
 */
export function useProductsQuery() {
  return useQuery({
    queryKey: queryKeys.products.list(),
    queryFn: () => getProductsService(),
    staleTime: STALE_TIMES.products, // 24 hours - matches server prefetch
    gcTime: Infinity, // Keep in cache forever
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

// Pattern: Query hooks encapsulate service calls
// Consistent configuration via STALE_TIMES
// Type-safe responses from API services
```

**Mutation Hooks Pattern:**
```typescript
// File: src/hooks/mutations/subscriptions.ts
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/query-keys';
import { createCheckoutSessionService } from '@/services/api';

export function useCreateCheckoutSessionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCheckoutSessionService,
    onSuccess: () => {
      // Invalidate related queries on success
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.all() });
    },
  });
}

// Pattern: Mutation hooks handle CREATE/UPDATE/DELETE
// Automatic cache invalidation on success
// Type-safe mutation parameters
```

**Utility Hooks:**
```typescript
// File: src/hooks/utils/useBoolean.ts
'use client';

import { useCallback, useState } from 'react';

export function useBoolean(defaultValue?: boolean) {
  const [value, setValue] = useState(!!defaultValue);

  const onTrue = useCallback(() => {
    setValue(true);
  }, []);

  const onFalse = useCallback(() => {
    setValue(false);
  }, []);

  const onToggle = useCallback(() => {
    setValue(prev => !prev);
  }, []);

  return {
    value,
    onTrue,
    onFalse,
    onToggle,
    setValue,
  };
}

// File: src/hooks/utils/useChatAttachments.ts - More complex utility hook
export function useChatAttachments() {
  // Manages file upload state, validation, preview URLs
  // Not for API data fetching - pure UI state management
}

// Pattern: Utility hooks for common UI state patterns
// No API data fetching - use query/mutation hooks for that
// Reusable logic for forms, modals, toggles, etc.
```

### Client-Side State Management

**Zustand Store Patterns:**
```typescript
// File: src/stores/ui-store.ts
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface UIState {
  sidebarOpen: boolean
  theme: 'light' | 'dark' | 'system'
  locale: 'en' | 'fa'
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  setLocale: (locale: 'en' | 'fa') => void
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        sidebarOpen: true,
        theme: 'system',
        locale: 'en',
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        setTheme: (theme) => set({ theme }),
        setLocale: (locale) => set({ locale }),
      }),
      {
        name: 'ui-store',
        partialize: (state) => ({
          theme: state.theme,
          locale: state.locale
        }),
      }
    ),
    { name: 'ui-store' }
  )
)

// Pattern: Zustand for client-only UI state
// Persistence for user preferences
// DevTools integration for debugging
```

---

## API Integration & Services

### Hono RPC Client Integration

**Type-Safe API Client Setup:**
```typescript
// File: src/services/api.ts
import { hc } from 'hono/client'
import type { AppType } from '@/api/routes'
import { env } from '@/lib/env'

export const api = hc<AppType>(env.NEXT_PUBLIC_API_URL, {
  headers: () => ({
    'Content-Type': 'application/json',
  }),
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    return fetch(input, {
      ...init,
      credentials: 'include', // Include cookies for session auth
    })
  },
})

// Pattern: Single API client instance with global configuration
// Type inference from backend API routes
// Automatic credential handling for authentication
```

**Service Layer Abstraction:**
```typescript
// File: src/services/user-service.ts
import { api } from './api'
import {
  CreateUserData,
  UpdateUserData,
  UserFilters
} from '@/lib/types'

export class UserService {
  static async getAll(filters?: UserFilters) {
    const response = await api.users.$get({ query: filters })
    if (!response.ok) {
      throw new Error('Failed to fetch users')
    }
    return response.json()
  }

  static async getById(id: string) {
    const response = await api.users[':id'].$get({ param: { id } })
    if (!response.ok) {
      throw new Error('Failed to fetch user')
    }
    return response.json()
  }

  static async create(data: CreateUserData) {
    const response = await api.users.$post({ json: data })
    if (!response.ok) {
      throw new Error('Failed to create user')
    }
    return response.json()
  }

  static async update(id: string, data: UpdateUserData) {
    const response = await api.users[':id'].$patch({
      param: { id },
      json: data
    })
    if (!response.ok) {
      throw new Error('Failed to update user')
    }
    return response.json()
  }

  static async delete(id: string) {
    const response = await api.users[':id'].$delete({ param: { id } })
    if (!response.ok) {
      throw new Error('Failed to delete user')
    }
    return response.json()
  }
}

// Pattern: Service classes encapsulate API operations
// Consistent error handling across all methods
// Type-safe parameter and response handling
```

### 🚨 CRITICAL RULE: Components NEVER Import Services Directly

**Frontend components must NEVER import from `@/services/api` directly.**

All data fetching and mutations MUST go through TanStack Query hooks:
- **Read operations** → `useQuery` hooks in `src/hooks/queries/`
- **Write operations** → `useMutation` hooks in `src/hooks/mutations/`
- **SSE Streaming** → Custom hooks that wrap services internally

```typescript
// ❌ WRONG: Direct service import in component
import { getDownloadUrlService } from '@/services/api';

function MyComponent() {
  const fetchUrl = async () => {
    const result = await getDownloadUrlService({ param: { id } }); // BAD
  };
}

// ✅ CORRECT: Use query hook
import { useDownloadUrlQuery } from '@/hooks/queries';

function MyComponent() {
  const { data, isLoading, isError } = useDownloadUrlQuery(id, enabled);
}
```

**Allowed Exceptions:**
1. **Server Components** (page.tsx, layout.tsx) for server-side prefetching via `queryClient.prefetchQuery`
2. **Query/Mutation hooks** in `src/hooks/` (the ONLY place services should be imported)

**Why This Matters:**
- Ensures consistent error handling and loading states
- Enables proper cache management via TanStack Query
- Prevents duplicate requests and stale data issues
- Simplifies testing by mocking hooks instead of services
- Maintains single source of truth for data fetching logic

**For SSE Streaming:**
Create custom hooks that internally use services but expose a clean React API:
```typescript
// File: src/hooks/utils/use-presearch-stream.ts
export function usePreSearchStream(options: PreSearchStreamOptions) {
  // Service calls happen INSIDE the hook
  // Component only sees the hook's return values
  return { data, isStreaming, error, start, abort };
}
```

**Request/Response Interceptors:**
```typescript
// File: src/services/api-interceptors.ts
import { api } from './api'
import { useAuthStore } from '@/stores/auth-store'
import { showApiErrorToast } from '@/lib/toast'

// Add request interceptor for authentication
const originalFetch = api.$fetch
api.$fetch = async (input, init) => {
  const token = useAuthStore.getState().token

  const headers = new Headers(init?.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  try {
    const response = await originalFetch(input, {
      ...init,
      headers,
    })

    // Handle authentication errors
    if (response.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/auth/login'
    }

    // Handle server errors
    if (response.status >= 500) {
      showApiErrorToast('Server Error', new Error('Something went wrong. Please try again.'))
    }

    return response
  } catch (error) {
    showApiErrorToast('Network Error', error)
    throw error
  }
}

// Pattern: Global request/response interceptors
// Centralized error handling and authentication
// User feedback via showApiErrorToast from @/lib/toast
```

---

## Internationalization (i18n)

### next-intl Configuration

**i18n Setup and Configuration:**
```typescript
// File: src/i18n/config.ts
import { defineRouting } from 'next-intl/routing'
import { createSharedPathnamesNavigation } from 'next-intl/navigation'

export const routing = defineRouting({
  locales: ['en'],
  defaultLocale: 'en',
  pathnames: {
    '/dashboard': {
      en: '/dashboard'
    },
    '/settings': {
      en: '/settings'
    }
  }
})

export const { Link, redirect, usePathname, useRouter } =
  createSharedPathnamesNavigation(routing)

// Pattern: Shared pathname navigation for type safety
// Localized pathnames for better UX
// Centralized routing configuration
```

**Translation Key Organization:**
```json
// File: src/i18n/locales/en.json
{
  "auth": {
    "login": {
      "title": "Sign In to Your Account",
      "subtitle": "Enter your credentials to access your dashboard",
      "form": {
        "email": "Email Address",
        "password": "Password",
        "submit": "Sign In",
        "forgotPassword": "Forgot your password?"
      },
      "validation": {
        "emailRequired": "Email is required",
        "emailInvalid": "Please enter a valid email",
        "passwordRequired": "Password is required",
        "passwordMinLength": "Password must be at least 8 characters"
      }
    }
  },
  "dashboard": {
    "home": {
      "title": "Dashboard",
      "overview": {
        "totalUsers": "Total Users",
        "activeTeams": "Active Teams",
        "recentActivity": "Recent Activity"
      }
    },
    "users": {
      "title": "Users",
      "status": {
        "active": "Active",
        "inactive": "Inactive",
        "pending": "Pending"
      },
      "actions": {
        "edit": "Edit",
        "delete": "Delete",
        "activate": "Activate",
        "deactivate": "Deactivate"
      }
    },
    "teams": {
      "title": "Teams",
      "add": "Add Team",
      "status": {
        "active": "Active",
        "archived": "Archived"
      }
    }
  },
  "common": {
    "actions": {
      "save": "Save",
      "cancel": "Cancel",
      "delete": "Delete",
      "edit": "Edit",
      "create": "Create",
      "update": "Update"
    },
    "status": {
      "loading": "Loading...",
      "error": "Error occurred",
      "success": "Success",
      "noData": "No data available"
    }
  }
}

// Pattern: Hierarchical namespace organization
// Domain-specific translation groups
// Reusable common translations
// Consistent key naming conventions
```

**English-Only Application:**
```json
// File: src/i18n/locales/en/common.json
// Translation keys maintained for consistency, but only English supported
{
  "auth": {
    "login": {
      "title": "Sign In",
      "subtitle": "Enter your credentials to access the dashboard",
      "form": {
        "email": "Email Address",
        "password": "Password",
        "submit": "Sign In",
        "forgotPassword": "Forgot your password?"
      }
    }
  },
  "dashboard": {
    "home": {
      "title": "Dashboard",
      "overview": {
        "totalUsers": "Total Users",
        "activeTeams": "Active Teams",
        "recentActivity": "Recent Activity"
      }
    }
  }
}

// Pattern: English-only translations
// Single locale: en-US
// LTR text direction only
```

**Component Translation Patterns:**
```typescript
// File: src/components/billing/payment-method-card.tsx
import { useTranslations } from 'next-intl'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PaymentMethod } from '@/lib/types'

interface PaymentMethodCardProps {
  paymentMethod: PaymentMethod
}

export function PaymentMethodCard({ paymentMethod }: PaymentMethodCardProps) {
  const t = useTranslations('paymentMethods')
  const actions = useTranslations('actions')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{paymentMethod.contractDisplayName}</span>
          <Badge variant={paymentMethod.contractStatus === 'active' ? 'default' : 'secondary'}>
            {t(`status.${paymentMethod.contractStatus}`)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t('addedOn', { date: new Date(paymentMethod.createdAt).toLocaleDateString() })}
          </p>
          <div className="flex gap-2">
            {paymentMethod.contractStatus === 'active' && (
              <Button variant="outline" size="sm">
                {t('setAsDefault')}
              </Button>
            )}
            <Button variant="destructive" size="sm">
              {actions('delete')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Pattern: Multiple translation namespaces in single component
// Dynamic translation keys based on data state
// No hardcoded strings - all text through translations
```

### Layout Direction (English-Only)

**Application uses LTR (Left-to-Right) layout only:**
- No RTL support needed (English-only)
- Standard left-aligned text
- Standard flex direction (left-to-right)
- No directional utilities required

---

## Layout & Container Patterns

### Container Architecture

**Screen Container Pattern:**
```typescript
// File: src/containers/dashboard-container.tsx
'use client'

import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { DashboardHeader } from '@/components/chat/dashboard-header'
import { OverviewCards } from '@/components/chat/overview-cards'
import { RecentActivity } from '@/components/chat/recent-activity'
import { LoadingSkeleton } from '@/components/ui/loading-skeleton'
import { ErrorState } from '@/components/ui/error-state'

export function DashboardContainer() {
  const t = useTranslations('dashboard.home')

  // Direct TanStack Query usage (NO abstraction layer exists)
  const {
    data: dashboardData,
    isLoading,
    error
  } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: async () => {
      const response = await fetch('/api/v1/dashboard')
      if (!response.ok) throw new Error('Failed to fetch dashboard data')
      return response.json()
    },
  })

  if (error) {
    return <ErrorState error={error} />
  }

  if (isLoading) {
    return <LoadingSkeleton />
  }

  return (
    <div className="space-y-8">
      <DashboardHeader title={t('title')} />

      <OverviewCards
        data={dashboardData}
        isLoading={isLoading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <RecentActivity
          activities={dashboardData?.recentActivities}
          isLoading={isLoading}
        />
        <QuickActions />
      </div>
    </div>
  )
}

// Pattern: Containers orchestrate data fetching and state management
// Direct TanStack Query usage in components (NO abstraction layer)
// Pure presentation components receive props
// Centralized loading and error state handling
// Responsive grid layouts for different screen sizes
```

**Layout Provider Pattern:**
```typescript
// File: src/components/layout/app-layout.tsx
'use client'

import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'
import { useUIStore } from '@/stores/ui-store'
import { cn } from '@/lib/utils'

interface AppLayoutProps {
  children: React.ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const { sidebarOpen } = useUIStore()

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className={cn(
        "transition-all duration-300",
        sidebarOpen ? "lg:pl-64" : "lg:pl-16"
      )}>
        <AppHeader />
        <main className="container mx-auto px-6 py-8">
          {children}
        </main>
      </div>
    </div>
  )
}

// Pattern: Layout components manage UI state
// Responsive sidebar with collapsible behavior
// Smooth transitions for state changes
// Container-based content wrapping
```

---

## UI Library & Design System

### Tailwind CSS v4 + Design Tokens

**CSS Custom Properties Setup:**
```css
/* File: src/styles/globals.css */
@import "tailwindcss";

@layer base {
  :root {
    /* Color Palette */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222.2 84% 4.9%;
    --muted: 210 40% 96%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96%;
    --accent-foreground: 222.2 84% 4.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;

    /* Typography */
    --font-sans: 'Inter', sans-serif;
    --font-mono: 'JetBrains Mono', monospace;

    /* Spacing Scale */
    --spacing-xs: 0.25rem;
    --spacing-sm: 0.5rem;
    --spacing-md: 1rem;
    --spacing-lg: 1.5rem;
    --spacing-xl: 2rem;
    --spacing-2xl: 3rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

/* English-only Font Support */
@layer base {
  html {
    font-family: 'Inter', sans-serif;
  }
}

// Pattern: CSS custom properties for theming
// Semantic color naming convention
// English-only with Inter font
// Consistent spacing scale
```

**Component Variant Patterns:**
```typescript
// File: src/components/ui/card.tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const cardVariants = cva(
  "rounded-lg border bg-card text-card-foreground shadow-sm",
  {
    variants: {
      variant: {
        default: "border-border",
        outline: "border-2 border-border",
        ghost: "border-transparent shadow-none",
        elevated: "shadow-lg border-border/50",
      },
      size: {
        sm: "p-4",
        default: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, size, className }))}
      {...props}
    />
  )
)

// Pattern: CVA for systematic variant management
// Consistent prop interface across components
// Composable styling with Tailwind utilities
```

### Responsive Design Patterns

**Mobile-First Responsive Components:**
```typescript
// File: src/components/chat/user-grid.tsx
import { UserCard } from './user-card'
import { User } from '@/lib/types'

interface UserGridProps {
  users: User[]
  isLoading?: boolean
}

export function UserGrid({ users, isLoading }: UserGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <UserCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  )
}

// Pattern: Mobile-first responsive grid systems
// Conditional rendering for loading states
// Consistent spacing scales across breakpoints
```

---

## Email Template System

### React Email v4 Integration

**Email Template Structure:**
```typescript
// File: src/emails/welcome.tsx
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Button,
  Img,
} from '@react-email/components'
import { WelcomeEmailProps } from './types'

export function WelcomeEmail({
  userName,
  dashboardUrl,
  joinDate,
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to roundtable.now</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img
            src="https://your-domain.com/logo.png"
            width="150"
            height="50"
            alt="Roundtable"
            style={logo}
          />

          <Heading style={h1}>Welcome to roundtable.now!</Heading>

          <Text style={text}>
            Hi {userName},
          </Text>

          <Text style={text}>
            We're excited to have you on board! Your account has been successfully created.
          </Text>

          <Section style={detailsSection}>
            <Text style={detailLabel}>Account Created:</Text>
            <Text style={detailValue}>{joinDate}</Text>
          </Section>

          <Button style={button} href={dashboardUrl}>
            View Dashboard
          </Button>

          <Text style={footer}>
            Thank you for joining roundtable.now!
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// CSS-in-JS styles for email compatibility
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
}

const h1 = {
  color: '#333',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0',
  textAlign: 'center' as const,
}

// Pattern: React Email components for cross-client compatibility
// Inline styles for email client support
// Responsive design with table-based layouts
// Brand-consistent styling and typography
```

**Email Template Types:**
```typescript
// File: src/emails/types.ts
export interface WelcomeEmailProps {
  userName: string
  dashboardUrl: string
  joinDate: string
}

export interface PasswordResetEmailProps {
  userName: string
  resetUrl: string
  expiresAt: string
}

export interface TeamInviteEmailProps {
  userName: string
  teamName: string
  inviterName: string
  acceptUrl: string
}

export interface AccountVerificationEmailProps {
  userName: string
  verificationUrl: string
  expiresAt: string
}

// Pattern: Strongly typed email template props
// Consistent prop interfaces across email types
// Optional properties for conditional content
```

**Email Service Integration:**
```typescript
// File: src/services/email-service.ts
import { render } from '@react-email/render'
import { WelcomeEmail } from '@/emails/welcome'
import { PasswordResetEmail } from '@/emails/password-reset'
import { env } from '@/lib/env'

export class EmailService {
  static async sendWelcome(props: WelcomeEmailProps) {
    const html = render(WelcomeEmail(props))
    const text = render(WelcomeEmail(props), { plainText: true })

    return fetch(`${env.EMAIL_API_URL}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.EMAIL_API_TOKEN}`,
      },
      body: JSON.stringify({
        to: props.userEmail,
        subject: 'Welcome to roundtable.now',
        html,
        text,
      }),
    })
  }

  static async sendPasswordReset(props: PasswordResetEmailProps) {
    const html = render(PasswordResetEmail(props))
    const text = render(PasswordResetEmail(props), { plainText: true })

    return fetch(`${env.EMAIL_API_URL}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.EMAIL_API_TOKEN}`,
      },
      body: JSON.stringify({
        to: props.userEmail,
        subject: 'Password Reset Request',
        html,
        text,
      }),
    })
  }
}

// Pattern: Service layer for email sending
// Both HTML and plain text versions
// Type-safe email template rendering
```

---

## Asset & Icon Management

### Lucide React Icon System

**Icon Component Patterns:**
```typescript
// File: src/components/ui/icon.tsx
import { LucideIcon, LucideProps } from 'lucide-react'
import { cn } from '@/lib/utils'

interface IconProps extends LucideProps {
  icon: LucideIcon
  className?: string
}

export function Icon({ icon: IconComponent, className, ...props }: IconProps) {
  return (
    <IconComponent
      className={cn("h-4 w-4", className)}
      {...props}
    />
  )
}

// Usage pattern for consistent icon sizing
export function IconButton({
  icon,
  children,
  ...props
}: ButtonProps & { icon: LucideIcon }) {
  return (
    <Button {...props}>
      <Icon icon={icon} className="mr-2 h-4 w-4" />
      {children}
    </Button>
  )
}

// Pattern: Wrapper component for consistent icon usage
// Default sizing with override capability
// Integration with button components
```

**Custom Icon Integration:**
```typescript
// File: src/icons/dashboard-icon.tsx
import * as React from 'react'

interface DashboardIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string
}

export function DashboardIcon({ className, ...props }: DashboardIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"
        fill="currentColor"
      />
    </svg>
  )
}

// Pattern: Custom SVG icons as React components
// Props interface matching Lucide patterns
// currentColor for theme consistency
```

### Image Optimization

**Next.js Image Component Usage:**
```typescript
// File: src/components/ui/optimized-image.tsx
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface OptimizedImageProps {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  priority?: boolean
  fill?: boolean
}

export function OptimizedImage({
  src,
  alt,
  width,
  height,
  className,
  priority = false,
  fill = false,
  ...props
}: OptimizedImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      fill={fill}
      priority={priority}
      className={cn(
        "object-cover",
        fill && "absolute inset-0",
        className
      )}
      {...props}
    />
  )
}

// Pattern: Wrapper for Next.js Image optimization
// Sensible defaults for common use cases
// Fill mode for responsive containers
```

---

## Utility Libraries & Helpers

### Core Utility Functions

**Utility Library Structure:**
```typescript
// File: src/lib/utils.ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(
  amount: number,
  currency: 'USD' = 'USD',
  locale: 'en' = 'en'
) {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return formatter.format(amount)
}

export function formatDate(
  date: Date | string,
  locale: 'en' | 'fa' = 'en',
  options?: Intl.DateTimeFormatOptions
) {
  const dateObj = typeof date === 'string' ? new Date(date) : date

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }

  return new Intl.DateTimeFormat(
    locale === 'fa' ? 'fa-IR' : 'en-US',
    { ...defaultOptions, ...options }
  ).format(dateObj)
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// Pattern: Centralized utility functions
// Internationalization-aware formatting
// Type-safe helper functions
```

**Validation Utilities:**
```typescript
// File: src/lib/validations.ts
import { z } from 'zod'

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Invalid email format')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

export const phoneSchema = z
  .string()
  .min(10, 'Phone number must be at least 10 digits')
  .regex(/^[\d\s\-\+\(\)]+$/, 'Invalid phone number format')

export const userSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: emailSchema,
  role: z.enum(['admin', 'user', 'manager']),
  status: z.enum(['active', 'inactive', 'pending']).default('pending'),
})

export const teamSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  description: z.string().optional(),
  members: z.array(z.string()).min(1, 'At least one member required'),
})

// Pattern: Zod schemas for type-safe validation
// Domain-specific validation rules
// User and team validations
```

### Authentication Helpers

**Auth Utility Functions:**
```typescript
// File: src/lib/auth.ts
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { env } from './env'

export const auth = betterAuth({
  database: prismaAdapter(db),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  },
})

export async function getSession() {
  try {
    const session = await auth.api.getSession()
    return session
  } catch {
    return null
  }
}

export async function requireAuth() {
  const session = await getSession()
  if (!session) {
    throw new Error('Authentication required')
  }
  return session
}

// Pattern: Better Auth integration
// Session management utilities
// Type-safe authentication helpers
```

---

## Performance & Optimization

### Code Splitting & Lazy Loading

**Component Lazy Loading:**
```typescript
// File: src/components/chat/analytics-overview.tsx
import { lazy, Suspense } from 'react'
import { LoadingSkeleton } from '@/components/ui/loading-skeleton'

// Lazy load heavy components
const ActivityChart = lazy(() =>
  import('./activity-chart').then(module => ({
    default: module.ActivityChart
  }))
)

const UserStats = lazy(() =>
  import('./user-stats').then(module => ({
    default: module.UserStats
  }))
)

export function AnalyticsOverview() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Suspense fallback={<LoadingSkeleton className="h-[400px]" />}>
          <ActivityChart />
        </Suspense>

        <Suspense fallback={<LoadingSkeleton className="h-[400px]" />}>
          <UserStats />
        </Suspense>
      </div>
    </div>
  )
}

// Pattern: Lazy loading for performance optimization
// Suspense boundaries with meaningful fallbacks
// Named exports for better debugging
```

**Route-Level Code Splitting:**
```typescript
// File: src/app/(app)/analytics/page.tsx
import dynamic from 'next/dynamic'
import { LoadingSkeleton } from '@/components/ui/loading-skeleton'

// Dynamic import with loading state
const AnalyticsDashboard = dynamic(
  () => import('@/containers/analytics-container'),
  {
    loading: () => <LoadingSkeleton className="min-h-[600px]" />,
    ssr: false, // Client-side only for heavy charts
  }
)

export default function AnalyticsPage() {
  return <AnalyticsDashboard />
}

// Pattern: Dynamic imports for route-level optimization
// SSR disabled for client-heavy components
// Consistent loading states
```

### Image and Asset Optimization

**Optimized Asset Loading:**
```typescript
// File: src/components/ui/avatar.tsx
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface AvatarProps {
  src?: string
  alt: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
}

export function Avatar({ src, alt, size = 'md', className }: AvatarProps) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-full bg-muted",
      sizeClasses[size],
      className
    )}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 32px, 48px"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <span className="text-sm font-medium text-muted-foreground">
            {alt.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
    </div>
  )
}

// Pattern: Responsive image sizes
// Fallback for missing images
// Next.js Image optimization
```

---

## Development Guidelines

### Code Quality Standards

**TypeScript Best Practices:**
```typescript
// File: src/lib/types.ts
// Prefer interfaces for object shapes
export interface User {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date
}

// Use type for unions and primitives
export type UserRole = 'admin' | 'user' | 'manager'
export type UserStatus = 'active' | 'inactive' | 'pending'

// Generic utility types for API responses
export interface ApiResponse<T> {
  data: T
  message: string
  success: boolean
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    hasMore: boolean
  }
}

// Branded types for better type safety
export type UserId = string & { readonly brand: unique symbol }
export type TeamId = string & { readonly brand: unique symbol }

// Pattern: Consistent type definitions
// Generic types for reusability
// Branded types for ID safety
```

**Component Testing Patterns:**
```typescript
// File: src/components/__tests__/user-card.test.tsx
import { render, screen } from '@/lib/testing'
import { UserCard } from '../chat/user-card'
import { createMockMessages } from '@/lib/testing'

describe('UserCard', () => {
  it('renders user information correctly', () => {
    const user = mockUser({
      name: 'John Doe',
      status: 'active',
    })

    render(<UserCard user={user} />)

    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows edit button for active users', () => {
    const user = mockUser({ status: 'active' })

    render(<UserCard user={user} />)

    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('shows activate button for inactive users', () => {
    const user = mockUser({ status: 'inactive' })

    render(<UserCard user={user} />)

    expect(screen.getByText('Activate')).toBeInTheDocument()
  })
})

// Pattern: Component unit testing
// Mock data utilities
// Behavior-driven test descriptions
```

### Error Handling Patterns

**Error Boundary Implementation:**
```typescript
// File: src/components/ui/error-boundary.tsx
'use client'

import React from 'react'
import { Button } from './button'
import { AlertTriangle } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback
      return (
        <FallbackComponent
          error={this.state.error!}
          reset={() => this.setState({ hasError: false, error: null })}
        />
      )
    }

    return this.props.children
  }
}

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <div className="text-center">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground mt-2">
          {error.message}
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}

// Pattern: Class-based error boundaries
// Customizable fallback components
// Error logging and recovery
```

### Accessibility Guidelines

**ARIA and Keyboard Navigation:**
```typescript
// File: src/components/ui/dropdown-menu.tsx
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight, Circle } from 'lucide-react'

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
        "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))

// Pattern: Radix UI primitives for accessibility
// ARIA attributes handled automatically
// Keyboard navigation support built-in
// Focus management and screen reader compatibility
```

---

## Conclusion

This frontend patterns guide establishes the architectural foundation for the roundtable.now frontend. These patterns ensure:

- **Consistency**: Unified component architecture and styling approach
- **Performance**: Optimized loading, caching, and code splitting strategies
- **Accessibility**: WCAG-compliant components with full keyboard navigation
- **Localization**: English-only with translation key management for consistency
- **Type Safety**: End-to-end TypeScript inference from API to UI
- **Developer Experience**: Clear patterns for data fetching, state management, and error handling

### Key Implementation Principles

1. **Component Composition**: Build complex UIs from simple, reusable primitives
2. **Data Co-location**: Keep data fetching close to components that need it
3. **Progressive Enhancement**: Start with semantic HTML, enhance with JavaScript
4. **Performance Budget**: Lazy load non-critical components and routes
5. **Error Recovery**: Graceful degradation with meaningful error states
6. **LTR Layout**: Design for left-to-right reading pattern (English)

### Reference Documentation

For backend integration patterns, see `docs/backend-patterns.md`
For specialized agent workflows, see `.claude/agents/README.md`
For project setup and deployment, see `CLAUDE.md`

---

**Last Updated**: January 2025
**Frontend Stack Version**: Next.js 15 + shadcn/ui + TanStack Query v5
**Platform Type**: User management and collaboration platform