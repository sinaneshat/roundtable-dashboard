import type { LucideIcon } from 'lucide-react';
import { z } from 'zod';

import { TextInputVariantSchema, WithOptionsVariantSchema } from '@/api/core/enums';

// ============================================================================
// FORM OPTION SCHEMAS - Base form primitives
// ============================================================================

export const FormOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
  description: z.string().optional(),
});

export const FormOptionsSchema = z.array(FormOptionSchema);
export const InitialDefaultValuesSchema = z.union([z.string(), z.number(), z.null(), z.boolean(), z.undefined()]);

export type FormOption = z.infer<typeof FormOptionSchema>;
export type FormOptions = z.infer<typeof FormOptionsSchema>;
export type InitialDefaultValues = z.infer<typeof InitialDefaultValuesSchema>;

// Backwards compatibility exports
export const formOptionSchema = FormOptionSchema;
export const formOptionsSchema = FormOptionsSchema;
export const initialDefaultValuesSchema = InitialDefaultValuesSchema;

// ============================================================================
// GENERAL FORM PROPS SCHEMA
// ============================================================================

export const GeneralFormPropsSchema = z.object({
  colSpan: z.number().optional(),
  onChange: z.custom<(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: InitialDefaultValues } }) => void>().optional(),
  name: z.string(),
  id: z.string().optional(),
  title: z.string(),
  value: InitialDefaultValuesSchema.optional(),
  defaultValue: InitialDefaultValuesSchema.optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().optional(),
  disabled: z.boolean().optional(),
  className: z.string().optional(),
});

export type GeneralFormProps = z.infer<typeof GeneralFormPropsSchema>;

// Re-export for backwards compatibility - prefer importing from @/api/core/enums
export const textInputVariantSchema = TextInputVariantSchema;
export const withOptionsVariantSchema = WithOptionsVariantSchema;

// ============================================================================
// INPUT VARIANT SCHEMAS
// ============================================================================

export const TextInputPropsSchema = GeneralFormPropsSchema.extend({
  variant: TextInputVariantSchema,
});

export type TextInputProps = z.infer<typeof TextInputPropsSchema>;

export const WithOptionsPropsSchema = GeneralFormPropsSchema.extend({
  variant: WithOptionsVariantSchema,
  options: FormOptionsSchema,
});

export type WithOptionsProps = z.infer<typeof WithOptionsPropsSchema>;

// ============================================================================
// NAVIGATION SCHEMAS
// ============================================================================

// NavItem uses recursion and LucideIcon which Zod cannot validate at runtime
// Using z.custom<T>() for complex React types
export const NavItemBaseSchema = FormOptionSchema.extend({
  href: z.string().optional(),
  icon: z.custom<LucideIcon>().optional(),
  onClick: z.custom<() => void>().optional(),
});

// For recursive NavItem, type is manually defined to support recursion
export type NavItem = z.infer<typeof NavItemBaseSchema> & {
  children?: NavItem[] | [];
};

// ============================================================================
// SERVICE CONFIG SCHEMAS
// ============================================================================

export const ServiceConfigSchema = z.object({
  basePath: z.string().optional(),
  showToasts: z.boolean().optional(),
  authToken: z.string().optional(),
});

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

// ============================================================================
// FETCH CONFIG SCHEMAS
// ============================================================================

export const CustomFetchConfigSchema = ServiceConfigSchema.partial().extend({
  cache: z.enum(['default', 'no-store', 'reload', 'force-cache', 'only-if-cached']).optional(),
  next: z.object({
    revalidate: z.union([z.number(), z.literal(false)]).optional(),
    tags: z.array(z.string()).optional(),
  }).optional(),
});

// CustomFetchConfig extends RequestInit which has many complex types
// Using intersection with z.custom<RequestInit>() for runtime compatibility
export type CustomFetchConfig = z.infer<typeof CustomFetchConfigSchema> & RequestInit;
