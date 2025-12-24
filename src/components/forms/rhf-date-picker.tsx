// components/TextInput.tsx
import { format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Controller, useFormContext } from 'react-hook-form';

import { cn } from '@/lib/ui/cn';
import type { GeneralFormProps } from '@/types/general';

import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

function RHFDatePicker({
  title,
  name,
  description,
  placeholder,
  required,
  value: externalValue,
  onChange: externalOnChange,
}: GeneralFormProps) {
  const t = useTranslations();
  const { control } = useFormContext();

  const UTCtoUserDate = useMemo(
    () => (externalValue ? parseISO(externalValue as string) : undefined),
    [externalValue],
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex w-full flex-col">
          <FormLabel>
            {title}
            {required && <span className="text-destructive ms-1">*</span>}
          </FormLabel>
          <Popover>
            <PopoverTrigger asChild>
              <FormControl>
                <Button
                  variant="outline"
                  className={cn(
                    'ps-3 text-start font-normal w-full',
                    !field.value && 'text-muted-foreground',
                  )}
                  aria-required={!!required}
                >
                  {field.value
                    ? (
                        format(field.value, 'PPP')
                      )
                    : (
                        <span>{placeholder || t('forms.pickDate')}</span>
                      )}
                  <CalendarIcon className="ms-auto size-4 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                data-testid={field.name}
                selected={field?.value ? parseISO(field?.value) : UTCtoUserDate}
                onSelect={(selectedDate: Date | undefined) => {
                  if (!selectedDate) {
                    return;
                  }
                  const utcTimestamp = format(
                    selectedDate,
                    'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'',
                  );
                  if (externalOnChange) {
                    externalOnChange({ target: { value: utcTimestamp } });
                  } else {
                    // Intentionally empty
                    field.onChange(utcTimestamp);
                  }
                }}
                disabled={(date: Date) =>
                  date > new Date() || date < new Date('1900-01-01')}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default RHFDatePicker;
