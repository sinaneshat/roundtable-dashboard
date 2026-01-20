import type { StoragePurpose } from '@roundtable/shared/enums';

import type { Session, User } from '@/lib/auth/types';
import type { PerformanceMetrics } from '@/middleware/performance-tracking';

// ============================================================================
// HONO CONTEXT ENVIRONMENT
// ============================================================================

export type ApiEnv = {
  Bindings: CloudflareEnv;
  Variables: {
    session: Session | null;
    user: User | null;
    apiKey: string | null;
    requestId: string;
    storageKey: string | null;
    storagePurpose: StoragePurpose | null;
    storageMethod: string | null;
    fileContentType: string | null;
    fileSize: number | null;
    startTime: number;
    performanceTracking: boolean;
    performanceMetrics: PerformanceMetrics;
  };
};
