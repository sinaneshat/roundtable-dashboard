export async function copyToClipboard(content: string): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}
