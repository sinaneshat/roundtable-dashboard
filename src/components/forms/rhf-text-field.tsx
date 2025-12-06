// components/TextInput.tsx
import { useFormContext } from 'react-hook-form';

import type { GeneralFormProps } from '@/types/general';

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import { Input } from '../ui/input';

type Props = {
  fieldType?: 'number' | 'text' | 'email' | 'password';
} & GeneralFormProps;

function RHFTextField({
  name,
  title,
  description,
  placeholder,
  value: externalValue,
  onChange: externalOnChange,
  required,
  disabled,
  fieldType = 'text',
  className,
}: Props) {
  const { control } = useFormContext();

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

                // Call field.onChange with the processed value
                field.onChange(value);

                // If there's an external onChange, call it with the event
                if (externalOnChange) {
                  externalOnChange(e);
                }
              }}
              value={field.value !== undefined ? field.value : externalValue}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default RHFTextField;
