/**
 * Sensitive Field Omission Utilities
 *
 * Type-safe transformations for removing sensitive fields from responses.
 */

/**
 * Omit r2Key from an object containing upload data
 *
 * @example
 * ```ts
 * const safeUpload = omitR2Key(upload);
 * // r2Key is removed, type reflects this
 * ```
 */
export function omitR2Key<T extends { r2Key: string }>(
  obj: T,
): Omit<T, 'r2Key'> {
  const { r2Key: _r2Key, ...rest } = obj;
  return rest;
}

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

/**
 * Generic sensitive field omission
 *
 * @example
 * ```ts
 * const safe = omitSensitiveFields(data, ['password', 'token']);
 * ```
 */
export function omitSensitiveFields<T extends object, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}
