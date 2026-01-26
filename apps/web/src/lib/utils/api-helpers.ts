export function createSuccessResponse<T>(data: T): { success: true; data: T } {
  return { data, success: true };
}
