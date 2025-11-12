'use client';

import { useCallback, useState } from 'react';

export function useBoolean(defaultValue?: boolean) {
  const [value, setValue] = useState(!!defaultValue);

  // ✅ Use useCallback to ensure stable references
  // Prevents infinite loops when callbacks are used in useMemo/useEffect deps
  const onTrue = useCallback(() => setValue(true), []);
  const onFalse = useCallback(() => setValue(false), []);
  const onToggle = useCallback(() => setValue(prev => !prev), []);

  return {
    value,
    onTrue,
    onFalse,
    onToggle,
    setValue,
  };
}
