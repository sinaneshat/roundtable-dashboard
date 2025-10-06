// components/RHFSelect.tsx
import React from 'react';
import { useFormContext } from 'react-hook-form';

import type { FormOptions, GeneralFormProps } from '@/types/general';

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

type Props = {
  options: FormOptions;
} & GeneralFormProps;

function RHFSelect({
  name,
  options,
  placeholder,
  title,
  description,
  value: externalValue,
  onChange: externalOnChange,
  required,
  disabled,
}: Props) {
  const { control } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="w-full">
          <FormLabel>{title}</FormLabel>
          <Select
            disabled={disabled}
            required={required}
            data-testid={field.name}
            onValueChange={(e) => {
              if (externalOnChange) {
                return externalOnChange?.({ target: { value: e } });
              }
              return field.onChange(e);
            }}
            value={field.value || externalValue || undefined}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map(item => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  disabled={item.value === ''}
                >
                  <p>{item.label}</p>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && (
            <FormDescription>
              {description}
              {' '}
            </FormDescription>
          )}
          {' '}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default RHFSelect;
