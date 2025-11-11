import type { LucideIcon } from 'lucide-react';
import { z } from 'zod';

// Zod schemas for form components - maximum reusability
export const formOptionSchema = z.object({
  label: z.union([z.string(), z.any()]), // Allow React elements for enhanced labels
  value: z.string(),
  description: z.string().optional(),
});

export const formOptionsSchema = z.array(formOptionSchema);
export const initialDefaultValuesSchema = z.union([z.string(), z.number(), z.null(), z.boolean(), z.undefined()]);

export type FormOption = z.infer<typeof formOptionSchema>;
export type FormOptions = z.infer<typeof formOptionsSchema>;
export type InitialDefaultValues = z.infer<typeof initialDefaultValuesSchema>;

export type GeneralFormProps = {
  colSpan?: number;
  onChange?: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { target: { value: InitialDefaultValues } }) => void;
  name: string;
  id?: string;
  title: string;
  value?: InitialDefaultValues;
  defaultValue?: InitialDefaultValues;
  description?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

// Zod enums for form variants - reusable and type-safe
export const textInputVariantSchema = z.enum([
  'text',
  'checkbox',
  'date',
  'switch',
  'number',
  'url',
  'email',
  'textarea',
]);

export const withOptionsVariantSchema = z.enum([
  'radio',
  'select',
  'combobox',
  'trigger_schedule',
]);

export type TextInputProps = {
  variant: z.infer<typeof textInputVariantSchema>;
} & GeneralFormProps;

export type WithOptionsProps = {
  variant: z.infer<typeof withOptionsVariantSchema>;
  options: FormOptions;
} & GeneralFormProps;

export type NavItem = {
  href?: string;
  icon?: LucideIcon; // Specify the icon as a LucideIcon component
  children?: NavItem[] | [];
  onClick?: () => void;
} & FormOption;

// Zod enum instead of static TypeScript enum for consistency
export const aiHistoryStatusSchema = z.enum(['aborted', 'success', 'failed']);
export type AIHistoryStatus = z.infer<typeof aiHistoryStatusSchema>;

// UPDATED: Use core schemas from @/api/core/schemas for API-related types
// Frontend types are kept separate from API schemas for clear separation of concerns
// API error types should import from @/api/core/schemas when needed

export type ServiceConfig = {
  basePath?: string;
  showToasts?: boolean;
  authToken?: string;
};

export type CustomFetchConfig = {
  cache?: 'default' | 'no-store' | 'reload' | 'force-cache' | 'only-if-cached';
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
} & RequestInit & Partial<ServiceConfig>;
