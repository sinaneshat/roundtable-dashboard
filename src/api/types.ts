import type { z } from 'zod';

import type { StoragePurposeSchema as storagePurposeSchema } from '@/api/core/enums';
import type { Session, User } from '@/lib/auth/types';

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type StoragePurpose = z.infer<typeof storagePurposeSchema>;

// ============================================================================
// HONO CONTEXT ENVIRONMENT
// ============================================================================

export type ApiEnv = {
  Bindings: CloudflareEnv;
  Variables: {
    session?: Session | null;
    user?: User | null;
    apiKey?: string | undefined;
    requestId?: string;
    storageKey?: string;
    storagePurpose?: StoragePurpose | null;
    storageMethod?: string;
    fileContentType?: string;
    fileSize?: number;
  };
};

export type AuthenticatedContext = {
  user: User;
  session: Session;
  requestId: string;
};
