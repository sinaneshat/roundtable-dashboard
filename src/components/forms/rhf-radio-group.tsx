import type { FieldPath, FieldValues } from 'react-hook-form';
import { useFormContext } from 'react-hook-form';

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { FormOptions } from '@/lib/schemas';

type RHFRadioGroupProps<TFieldValues extends FieldValues = FieldValues> = {
  name: FieldPath<TFieldValues>;
  title: string;
  options: FormOptions;
  required?: boolean;
};

export function RHFRadioGroup<TFieldValues extends FieldValues = FieldValues>({
  name,
  options,
  title,
  required,
}: RHFRadioGroupProps<TFieldValues>) {
  const { control } = useFormContext<TFieldValues>();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="w-full space-y-3">
          <FormLabel>{title}</FormLabel>
          <FormControl>
            <RadioGroup
              data-testid={field.name}
              onValueChange={field.onChange}
              value={field.value}
              required={required}
              className="flex flex-col space-y-3"
            >
              {options.map((item, index) => (
                <FormItem key={item.value} className="space-y-0">
                  <FormLabel
                    htmlFor={`${field.name}-${index}`}
                    className="flex cursor-pointer items-start space-x-3 rounded-2xl border p-4 hover:bg-accent hover:text-accent-foreground transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
                  >
                    <FormControl>
                      <RadioGroupItem
                        value={item.value}
                        id={`${field.name}-${index}`}
                        className="mt-1"
                        aria-describedby={item.description ? `${field.name}-${index}-description` : undefined}
                      />
                    </FormControl>
                    <div className="flex-1 space-y-1">
                      <div className="font-medium text-sm leading-none">
                        {item.label}
                      </div>
                      {item.description && (
                        <p
                          id={`${field.name}-${index}-description`}
                          className="text-sm text-muted-foreground leading-relaxed"
                        >
                          {item.description}
                        </p>
                      )}
                    </div>
                  </FormLabel>
                </FormItem>
              ))}
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
