/**
 * Date Formatting Utilities
 * English locale, US timezone
 */

/**
 * Check if a date is valid
 */
export function isValidDate(date: Date | string | number): boolean {
  const dateObj = new Date(date);
  return !Number.isNaN(dateObj.getTime());
}

/**
 * Format date with locale support
 */
export function formatDate(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
  locale = 'en-US',
): string {
  const dateObj = new Date(date);

  if (!isValidDate(dateObj)) {
    return 'Invalid Date';
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  return new Intl.DateTimeFormat(locale, { ...defaultOptions, ...options }).format(dateObj);
}

/**
 * Get relative time
 */
export function formatRelativeTime(
  date: Date | string | number,
  locale = 'en-US',
): string {
  if (!isValidDate(date)) {
    return 'Invalid Date';
  }

  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  // Use Intl.RelativeTimeFormat for proper localization
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffMins < 1) {
    return rtf.format(0, 'minute');
  }

  if (diffMins < 60) {
    return rtf.format(-diffMins, 'minute');
  }

  if (diffHours < 24) {
    return rtf.format(-diffHours, 'hour');
  }

  if (diffDays < 7) {
    return rtf.format(-diffDays, 'day');
  }

  // For older dates, show formatted date
  return formatDate(target, {}, locale);
}

/**
 * Get days until a date (positive = future, negative = past)
 */
export function getDaysUntil(date: Date | string | number): number {
  if (!isValidDate(date)) {
    return 0;
  }

  const dateObj = new Date(date);
  const now = new Date();
  const diffTime = dateObj.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date is overdue (in the past)
 */
export function isOverdue(date: Date | string | number): boolean {
  if (!isValidDate(date)) {
    return false;
  }

  const dateObj = new Date(date);
  const now = new Date();
  return dateObj.getTime() < now.getTime();
}

/**
 * Format date for billing context (English-only)
 */
export function formatBillingDate(
  date: Date | string | number,
  locale = 'en-US',
  variant: 'short' | 'medium' | 'long' = 'medium',
): string {
  if (!isValidDate(date)) {
    return 'Invalid Date';
  }

  const dateObj = new Date(date);
  const optionsMap: Record<'short' | 'medium' | 'long', Intl.DateTimeFormatOptions> = {
    short: { year: 'numeric', month: 'short', day: 'numeric' },
    medium: { year: 'numeric', month: 'long', day: 'numeric' },
    long: { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' },
  };

  return new Intl.DateTimeFormat(locale, optionsMap[variant]).format(dateObj);
}

/**
 * Format next billing date with contextual information (English-only)
 */
export function formatNextBillingDate(
  date: Date | string | number,
  locale = 'en-US',
): string {
  if (!isValidDate(date)) {
    return 'Invalid Date';
  }

  const daysUntil = getDaysUntil(date);

  if (daysUntil < 0) {
    return `Overdue by ${Math.abs(daysUntil)} day${Math.abs(daysUntil) !== 1 ? 's' : ''}`;
  }

  if (daysUntil === 0) {
    return 'Today';
  }

  if (daysUntil === 1) {
    return 'Tomorrow';
  }

  if (daysUntil <= 7) {
    return `In ${daysUntil} days`;
  }

  return formatBillingDate(date, locale, 'medium');
}
