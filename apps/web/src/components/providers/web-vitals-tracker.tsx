/**
 * Web Vitals Tracker Component
 *
 * Tracks Core Web Vitals using native Performance APIs and reports to PostHog.
 * Uses PerformanceObserver for accurate measurements of:
 * - LCP (Largest Contentful Paint) - loading performance
 * - FID (First Input Delay) - interactivity (deprecated, replaced by INP)
 * - INP (Interaction to Next Paint) - interactivity
 * - CLS (Cumulative Layout Shift) - visual stability
 * - TTFB (Time to First Byte) - server response time
 *
 * @see https://web.dev/vitals/
 */

import { usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';

/** Thresholds for Web Vitals ratings (in ms for time-based, unitless for CLS) */
const THRESHOLDS = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  INP: { good: 200, needsImprovement: 500 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  TTFB: { good: 800, needsImprovement: 1800 },
} as const;

type MetricName = keyof typeof THRESHOLDS;

/** Get rating based on metric value and thresholds */
function getRating(name: MetricName, value: number): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name];
  if (value <= threshold.good) {
    return 'good';
  }
  if (value <= threshold.needsImprovement) {
    return 'needs-improvement';
  }
  return 'poor';
}

/**
 * Web Vitals Tracker Component
 *
 * Place this inside PostHogProvider to track Core Web Vitals.
 * Measurements are taken once per page load.
 */
export function WebVitalsTracker() {
  const posthog = usePostHog();
  const trackedMetrics = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Skip SSR
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
      return;
    }

    // Skip if PostHog not ready
    if (!posthog) {
      return;
    }

    const observers: PerformanceObserver[] = [];

    // Helper to capture metric to PostHog
    const captureMetric = (name: MetricName, value: number, entries?: PerformanceEntry[]) => {
      // Prevent duplicate tracking
      if (trackedMetrics.current.has(name)) {
        return;
      }
      trackedMetrics.current.add(name);

      const rating = getRating(name, value);

      posthog.capture('web_vitals', {
        metric_name: name,
        metric_value: Math.round(value * 1000) / 1000, // Round to 3 decimal places
        metric_rating: rating,
        metric_delta: value, // For Web Vitals, value and delta are same on first measurement
        page_url: window.location.pathname,
        connection_type: getConnectionType(),
        device_memory: getDeviceMemory(),
        hardware_concurrency: getHardwareConcurrency(),
        entries_count: entries?.length,
      });
    };

    // LCP - Largest Contentful Paint
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
        if (lastEntry) {
          captureMetric('LCP', lastEntry.startTime, entries);
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      observers.push(lcpObserver);
    } catch {
      // LCP not supported
    }

    // FID - First Input Delay
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const firstEntry = entries[0] as PerformanceEventTiming;
        if (firstEntry) {
          const fid = firstEntry.processingStart - firstEntry.startTime;
          captureMetric('FID', fid, entries);
        }
      });
      fidObserver.observe({ type: 'first-input', buffered: true });
      observers.push(fidObserver);
    } catch {
      // FID not supported
    }

    // INP - Interaction to Next Paint (replaces FID)
    try {
      let maxINP = 0;
      const inpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceEventTiming[];
        for (const entry of entries) {
          // INP is the max of all interaction durations
          const duration = entry.duration;
          if (duration > maxINP) {
            maxINP = duration;
          }
        }
      });
      inpObserver.observe({ type: 'event', buffered: true });
      observers.push(inpObserver);

      // Report INP on page hide (visibilitychange or pagehide)
      const reportINP = () => {
        if (maxINP > 0) {
          captureMetric('INP', maxINP);
        }
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          reportINP();
        }
      });
      window.addEventListener('pagehide', reportINP);
    } catch {
      // INP not supported
    }

    // CLS - Cumulative Layout Shift
    try {
      let clsValue = 0;
      const clsEntries: PerformanceEntry[] = [];
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[];
        for (const entry of entries) {
          // Only count layout shifts without recent user input
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            clsEntries.push(entry);
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });
      observers.push(clsObserver);

      // Report CLS on page hide
      const reportCLS = () => {
        if (clsEntries.length > 0) {
          captureMetric('CLS', clsValue, clsEntries);
        }
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          reportCLS();
        }
      });
      window.addEventListener('pagehide', reportCLS);
    } catch {
      // CLS not supported
    }

    // TTFB - Time to First Byte
    try {
      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (navEntry) {
        const ttfb = navEntry.responseStart - navEntry.requestStart;
        if (ttfb > 0) {
          captureMetric('TTFB', ttfb);
        }
      }
    } catch {
      // Navigation timing not supported
    }

    // Cleanup observers on unmount
    return () => {
      observers.forEach(observer => observer.disconnect());
    };
  }, [posthog]);

  return null;
}

/** Get connection type from Network Information API */
function getConnectionType(): string | undefined {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string } };
  return nav.connection?.effectiveType;
}

/** Get device memory from Device Memory API */
function getDeviceMemory(): number | undefined {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return nav.deviceMemory;
}

/** Get hardware concurrency (CPU cores) */
function getHardwareConcurrency(): number | undefined {
  return navigator.hardwareConcurrency;
}
