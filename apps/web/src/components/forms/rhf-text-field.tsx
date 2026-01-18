import type { FieldType } from '@roundtable/shared';
import { FieldTypes } from '@roundtable/shared';
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
  inputClassName?: string;
  fieldType?: FieldType;
};

export function RHFTextField<TFieldValues extends FieldValues = FieldValues>({
  name,
  title,
  description,
  placeholder,
  required,
  disabled,
  fieldType = FieldTypes.TEXT,
  className,
  inputClassName,
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
              ref={field.ref}
              name={field.name}
              onBlur={field.onBlur}
              required={required}
              disabled={disabled}
              data-testid={field.name}
              type={fieldType}
              placeholder={placeholder}
              className={inputClassName}
              onChange={(e) => {
                const rawValue = e.target.value;
                const value = fieldType === FieldTypes.NUMBER && rawValue !== ''
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
