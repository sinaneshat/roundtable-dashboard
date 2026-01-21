import type { FieldPath, FieldValues } from 'react-hook-form';
import { useFormContext } from 'react-hook-form';

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/ui/cn';

type RHFSwitchProps<TFieldValues extends FieldValues = FieldValues> = {
  name: FieldPath<TFieldValues>;
  title: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
};

export function RHFSwitch<TFieldValues extends FieldValues = FieldValues>({
  name,
  title,
  description,
  className,
  required,
  disabled = false,
}: RHFSwitchProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn('flex flex-row items-center justify-between rounded-2xl border p-4', className)}
        >
          <div className="space-y-0.5">
            <FormLabel className="text-base">{title}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
          </div>
          <FormControl>
            <Switch
              required={required}
              data-testid={field.name}
              disabled={disabled}
              checked={field.value === true}
              onCheckedChange={field.onChange}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}
