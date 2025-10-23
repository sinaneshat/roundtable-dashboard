'use server';

import { cookies } from 'next/headers';

import type { Locale } from '@/i18n/routing';
import { locales } from '@/i18n/routing';

/**
 * Server action to set the user's locale preference in a cookie
 * This follows the official next-intl cookie-based pattern
 */
export async function setUserLocale(locale: Locale) {
  // Validate that the locale is supported
  if (!locales.includes(locale)) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const cookieStore = await cookies();

  try {
    // Set the locale cookie with proper security settings
    cookieStore.set('NEXT_LOCALE', locale, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    // Return success - client will handle refresh
    return { success: true, locale };
  } catch {
    throw new Error('Failed to update locale preference');
  }
}

/**
 * Get the current locale from cookies (server-side)
 * This is used internally by the request config
 */
export async function getUserLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE');

  if (localeCookie?.value && locales.includes(localeCookie.value as Locale)) {
    return localeCookie.value as Locale;
  }

  // Fallback to default locale
  return 'en';
}

/**
 * Clear the locale cookie (useful for logout or reset)
 */
export async function clearUserLocale() {
  const cookieStore = await cookies();
  cookieStore.delete('NEXT_LOCALE');
}
