/**
 * Form Option Schemas
 *
 * Zod schemas for form option types used across the application.
 * Single source of truth for form option validation.
 */

import { z } from 'zod';

// ============================================================================
// FORM OPTION (Generic select/radio option)
// ============================================================================

export const FormOptionSchema = z.object({
  description: z.string().optional(),
  label: z.string(),
  value: z.string(),
});

export type FormOption = z.infer<typeof FormOptionSchema>;

export const FormOptionsSchema = z.array(FormOptionSchema);

export type FormOptions = z.infer<typeof FormOptionsSchema>;

// ============================================================================
// NAV ITEM (Navigation item with optional children)
// ============================================================================

// Note: This needs to be lazy for recursive children
export type NavItem = {
  label: string;
  value: string;
  description?: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  children?: NavItem[];
};

// Schema version (without icon due to Zod limitations with React components)
export const NavItemBaseSchema = z.object({
  description: z.string().optional(),
  href: z.string().optional(),
  label: z.string(),
  value: z.string(),
});

// Type guard
export function isFormOption(value: unknown): value is FormOption {
  return FormOptionSchema.safeParse(value).success;
}

export function isFormOptions(value: unknown): value is FormOptions {
  return FormOptionsSchema.safeParse(value).success;
}
