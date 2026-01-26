/**
 * PageView Tracker Component
 *
 * Handles manual pageview tracking since PostHog's automatic pageview
 * capture is disabled for performance (capture_pageview: false).
 *
 * Tracks:
 * - Subsequent pageviews (initial captured in PostHogProvider loaded callback)
 * - Page-specific context (thread ID, project ID, etc.)
 * - User properties on each pageview
 *
 * Location: /src/components/providers/pageview-tracker.tsx
 */

import { useLocation, useSearch } from '@tanstack/react-router';
import { usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';
import { z } from 'zod';

import { useSession } from '@/lib/auth/client';

// ============================================================================
// Zod Schemas for Type-Safe Pageview Tracking
// ============================================================================

/**
 * Schema for trackable search params
 * Only specific params that are safe to track in analytics
 */
const TrackableSearchParamsSchema = z.object({
  model: z.string().optional(),
  view: z.string().optional(),
});

type TrackableSearchParams = z.infer<typeof TrackableSearchParamsSchema>;

/**
 * Type for page context
 * All possible context fields for pageview tracking
 */
type PageContext = {
  pathname: string;
  section?: string;
  threadId?: string;
  hasThread?: boolean;
  projectId?: string;
  hasProject?: boolean;
  isNewProject?: boolean;
  settingsTab?: string;
  authPage?: string;
  hasQueryParams?: boolean;
  selectedModel?: string;
  viewMode?: string;
  userId?: string;
  userEmail?: string;
  authenticated?: boolean;
};

/**
 * Safely parse search params from router
 */
function parseSearchParams(params: unknown): TrackableSearchParams | null {
  if (!params || typeof params !== 'object') {
    return null;
  }
  const result = TrackableSearchParamsSchema.safeParse(params);
  return result.success ? result.data : null;
}

/**
 * Build URL search string from parsed params
 */
function buildSearchString(params: TrackableSearchParams | null): string {
  if (!params) {
    return '';
  }
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].length > 0,
  );
  if (entries.length === 0) {
    return '';
  }
  return `?${new URLSearchParams(entries).toString()}`;
}

/**
 * Extracts context from pathname for PostHog events
 * ✅ ZOD-FIRST PATTERN: Returns typed PageContext
 */
function extractPageContext(pathname: string, searchParams: TrackableSearchParams | null): PageContext {
  const segments = pathname.split('/').filter(Boolean);
  const context: PageContext = {
    pathname,
  };

  // Extract route context
  if (segments[0] === 'chat') {
    context.section = 'chat';

    if (segments[1]) {
      context.threadId = segments[1];
      context.hasThread = true;
    } else {
      context.hasThread = false;
    }
  } else if (segments[0] === 'projects') {
    context.section = 'projects';

    if (segments[1] && segments[1] !== 'new') {
      context.projectId = segments[1];
      context.hasProject = true;
    } else if (segments[1] === 'new') {
      context.isNewProject = true;
    }
  } else if (segments[0] === 'settings') {
    context.section = 'settings';
    if (segments[1]) {
      context.settingsTab = segments[1];
    }
  } else if (segments[0] === 'auth') {
    context.section = 'auth';
    if (segments[1]) {
      context.authPage = segments[1];
    }
  } else if (pathname === '/') {
    context.section = 'home';
  }

  // Add search params if present
  if (searchParams) {
    const hasParams = Object.values(searchParams).some(v => typeof v === 'string' && v.length > 0);
    if (hasParams) {
      context.hasQueryParams = true;
      if (searchParams.model) {
        context.selectedModel = searchParams.model;
      }
      if (searchParams.view) {
        context.viewMode = searchParams.view;
      }
    }
  }

  return context;
}

/**
 * PageView Tracker Component
 *
 * Place this inside PostHogProvider to track enhanced pageviews.
 * Initial pageview is captured in PostHogProvider's loaded callback.
 * This component handles subsequent navigation pageviews.
 */
export function PageViewTracker() {
  const posthog = usePostHog();
  const { pathname } = useLocation();
  const rawSearchParams = useSearch({ strict: false });
  const searchParams = parseSearchParams(rawSearchParams);
  const { data: session } = useSession();
  const lastTrackedPath = useRef<string>('');
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!posthog) {
      return;
    }

    const currentPath = `${pathname}${buildSearchString(searchParams)}`;

    // Avoid duplicate tracking of the same path
    if (lastTrackedPath.current === currentPath) {
      return;
    }

    // Skip first render - initial pageview captured in PostHogProvider loaded callback
    const shouldCapture = !isFirstRender.current;
    isFirstRender.current = false;
    lastTrackedPath.current = currentPath;

    // Extract page context
    const context = extractPageContext(pathname, searchParams);

    // Add user context if authenticated
    if (session?.user) {
      context.userId = session.user.id;
      context.userEmail = session.user.email;
      context.authenticated = true;
    } else {
      context.authenticated = false;
    }

    // Register super properties for ALL subsequent events
    posthog.register({
      current_page: pathname,
      current_section: context.section || 'unknown',
      page_type: context.section,
      ...(context.hasThread !== undefined && { has_thread: context.hasThread }),
      ...(context.hasProject !== undefined && { has_project: context.hasProject }),
      ...(context.authenticated !== undefined && { is_authenticated: context.authenticated }),
    });

    // Manually capture pageview for subsequent navigations
    if (shouldCapture) {
      posthog.capture('$pageview', {
        $current_url: window.location.href,
        ...context,
      });
    }
  }, [posthog, pathname, searchParams, session]);

  return null;
}
