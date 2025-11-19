'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

/**
 * Server action to navigate to a chat thread with proper cache revalidation.
 * Uses Next.js server-side revalidation instead of client-side router.push
 * for smoother transitions and guaranteed fresh data.
 */
export async function navigateToThread(slug: string) {
  // Revalidate the specific thread page to ensure fresh server component data
  revalidatePath(`/chat/${slug}`);

  // Also revalidate the chat list to show the new thread
  revalidatePath('/chat');

  // Redirect to the thread page - this throws a special Next.js redirect error
  redirect(`/chat/${slug}`);
}

/**
 * Server action to revalidate thread data without navigation.
 * Useful for refreshing data after streaming completes.
 */
export async function revalidateThread(slug: string) {
  revalidatePath(`/chat/${slug}`);
  revalidatePath('/chat');
}

/**
 * Server action to revalidate all chat-related paths.
 * Used after major state changes like analysis completion.
 */
export async function revalidateChatPaths() {
  revalidatePath('/chat', 'layout');
}
