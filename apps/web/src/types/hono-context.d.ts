import type { StoragePurpose } from '@roundtable/shared';

import type { Session, User } from '@/lib/auth/types';

declare module 'hono' {
  interface ContextVariableMap {
    session: Session | null;
    user: User | null;
    apiKey: string | undefined;
    requestId: string | undefined;
    // Storage-related context variables
    storageKey: string;
    storagePurpose: StoragePurpose | null;
    storageMethod: string;
    fileContentType: string;
    fileSize: number;
  }
}
