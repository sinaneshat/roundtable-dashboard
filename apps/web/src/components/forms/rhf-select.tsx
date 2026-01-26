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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FormOptions } from '@/lib/schemas';

type RHFSelectProps<TFieldValues extends FieldValues = FieldValues> = {
  name: FieldPath<TFieldValues>;
  title: string;
  options: FormOptions;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
};

export function RHFSelect<TFieldValues extends FieldValues = FieldValues>({
  description,
  disabled,
  name,
  options,
  placeholder,
  required,
  title,
}: RHFSelectProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

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
            onValueChange={field.onChange}
            value={field.value}
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
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
