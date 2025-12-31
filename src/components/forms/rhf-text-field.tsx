import type { FieldPath, FieldValues } from 'react-hook-form';
import { useFormContext } from 'react-hook-form';

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

type RHFTextFieldProps<TFieldValues extends FieldValues = FieldValues> = {
  name: FieldPath<TFieldValues>;
  title?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  fieldType?: 'number' | 'text' | 'email' | 'password';
};

export function RHFTextField<TFieldValues extends FieldValues = FieldValues>({
  name,
  title,
  description,
  placeholder,
  required,
  disabled,
  fieldType = 'text',
  className,
}: RHFTextFieldProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className || 'w-full'}>
          {title && <FormLabel>{title}</FormLabel>}
          <FormControl>
            <Input
              {...field}
              required={required}
              disabled={disabled}
              data-testid={field.name}
              type={fieldType}
              placeholder={placeholder}
              onChange={(e) => {
                const rawValue = e.target.value;
                const value = fieldType === 'number' && rawValue !== ''
                  ? Number(rawValue)
                  : rawValue;
                field.onChange(value);
              }}
              value={field.value ?? ''}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
