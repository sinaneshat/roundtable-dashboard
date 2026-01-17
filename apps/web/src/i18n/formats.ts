import type { Formats } from '@/lib/compat';

export const formats = {
  dateTime: {
    short: {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
    long: {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
    },
    time: {
      hour: 'numeric',
      minute: 'numeric',
    },
    dateTime: {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    },
  },
  number: {
    currency: {
      style: 'currency',
      currency: 'USD',
    },
    percent: {
      style: 'percent',
    },
    decimal: {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
    integer: {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
  },
  list: {
    enumeration: {
      style: 'long',
      type: 'conjunction',
    },
    disjunction: {
      style: 'long',
      type: 'disjunction',
    },
  },
} satisfies Formats;
