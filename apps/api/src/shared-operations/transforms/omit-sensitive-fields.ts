/**
 * Sensitive Field Omission Utilities
 *
 * Type-safe transformations for removing sensitive fields from responses.
 */

/**
 * Omit r2Key from upload within a parent object
 *
 * @example
 * ```ts
 * const attachment = omitUploadR2Key(projectAttachment);
 * // attachment.upload.r2Key is removed
 * ```
 */
export function omitUploadR2Key<T extends { upload: { r2Key: string } }>(
  obj: T,
): T & { upload: Omit<T['upload'], 'r2Key'> } {
  const { r2Key: _r2Key, ...uploadWithoutR2Key } = obj.upload;
  return {
    ...obj,
    upload: uploadWithoutR2Key as Omit<T['upload'], 'r2Key'>,
  };
}
