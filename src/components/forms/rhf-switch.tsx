// components/TextInput.tsx
import { useFormContext } from 'react-hook-form';

import { cn } from '@/lib/ui/cn';
import type { GeneralFormProps } from '@/types/general';

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '../ui/form';
import { Switch } from '../ui/switch';

type Props = {
  className?: string;
} & GeneralFormProps;

function RHFSwitch({
  name,
  title,
  description,
  value: externalValue,
  onChange: externalOnChange,
  className,
  required,

  disabled = false,
}: Props) {
  const { control } = useFormContext();

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
              onCheckedChange={(e) => {
                if (externalOnChange) {
                  return externalOnChange?.({ target: { value: e } });
                }
                return field.onChange(e);
              }}
              checked={field.value !== undefined ? field.value : externalValue}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

export default RHFSwitch;
