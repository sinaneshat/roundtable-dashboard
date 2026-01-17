const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787/api/v1';

/**
 * Fetch public thread data for SSR
 * This enables initial data hydration for public chat pages
 * Called directly during SSR loader execution
 */
export async function getPublicThread(slug: string) {
  try {
    const response = await fetch(`${API_URL}/chat/public/${slug}`);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}
