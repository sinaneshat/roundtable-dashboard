import type { LucideIcon } from 'lucide-react';
import { z } from 'zod';

import type { TextInputVariant, WithOptionsVariant } from '@/api/core/enums';
import { TextInputVariantSchema, WithOptionsVariantSchema } from '@/api/core/enums';

// Zod schemas for form components - maximum reusability
export const formOptionSchema = z.object({
  label: z.string(), // Display text for the option
  value: z.string(), // Value identifier
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

// Re-export for backwards compatibility - prefer importing from @/api/core/enums
export const textInputVariantSchema = TextInputVariantSchema;
export const withOptionsVariantSchema = WithOptionsVariantSchema;

export type TextInputProps = {
  variant: TextInputVariant;
} & GeneralFormProps;

export type WithOptionsProps = {
  variant: WithOptionsVariant;
  options: FormOptions;
} & GeneralFormProps;

export type NavItem = {
  href?: string;
  icon?: LucideIcon; // Specify the icon as a LucideIcon component
  children?: NavItem[] | [];
  onClick?: () => void;
} & FormOption;

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
