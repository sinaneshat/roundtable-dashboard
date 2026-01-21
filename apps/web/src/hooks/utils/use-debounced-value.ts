import { useEffect, useState } from 'react';

export type UseDebouncedValueReturn<T> = T;

export function useDebouncedValue<T>(value: T, delay = 500): UseDebouncedValueReturn<T> {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
