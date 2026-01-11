import type { ReactNode } from 'react';

import type { ModelPreferencesState } from '@/stores/preferences/store';

export type PreferencesStoreProviderProps = {
  children: ReactNode;
  initialState?: ModelPreferencesState | null;
};
