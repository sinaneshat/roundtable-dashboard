// components/TextInput.tsx
import { useFormContext } from 'react-hook-form';

import type { FormOptions, GeneralFormProps } from '@/types/general';

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

type Props = {
  options: FormOptions;
} & GeneralFormProps;
function RHFRadioGroup({
  name,
  options,
  title,
  required,
  value: externalValue,
  onChange: externalOnChange,
}: Props) {
  const { control } = useFormContext();

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
              onValueChange={(e) => {
                if (externalOnChange) {
                  return externalOnChange?.({ target: { value: e } });
                }
                return field.onChange(e);
              }}
              required={required}
              defaultValue={
                field.value !== undefined ? field.value : externalValue
              }
              className="flex flex-col space-y-3"
            >
              {options.map((item, index) => (
                <FormItem
                  key={item.value}
                  className="space-y-0"
                >
                  <FormLabel
                    htmlFor={`${field.name}-${index}`}
                    className="flex cursor-pointer items-start space-x-3 rounded-md border p-4 hover:bg-accent hover:text-accent-foreground transition-colors [&:has([data-state=checked])]:border-primary [&:has([data-state=checked])]:bg-primary/5"
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
                        {typeof item.label === 'string' ? item.label : item.label}
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

export default RHFRadioGroup;
