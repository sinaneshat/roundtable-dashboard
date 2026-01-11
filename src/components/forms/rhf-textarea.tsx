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
import { Textarea } from '@/components/ui/textarea';

type RHFTextareaProps<TFieldValues extends FieldValues = FieldValues> = {
  name: FieldPath<TFieldValues>;
  title?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  rows?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  hideLabel?: boolean;
};

export function RHFTextarea<TFieldValues extends FieldValues = FieldValues>({
  name,
  title,
  description,
  placeholder,
  required,
  rows,
  onKeyDown,
  className,
  hideLabel = false,
}: RHFTextareaProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className || 'w-full'}>
          {!hideLabel && title && <FormLabel>{title}</FormLabel>}
          <FormControl>
            <Textarea
              {...field}
              rows={rows}
              required={required}
              data-testid={field.name}
              placeholder={placeholder}
              className="resize-none"
              onKeyDown={onKeyDown}
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
