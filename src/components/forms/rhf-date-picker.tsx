import { format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { Controller, useFormContext } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/ui/cn';

type RHFDatePickerProps<TFieldValues extends FieldValues = FieldValues> = {
  name: FieldPath<TFieldValues>;
  title: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
};

export function RHFDatePicker<TFieldValues extends FieldValues = FieldValues>({
  title,
  name,
  description,
  placeholder,
  required,
}: RHFDatePickerProps<TFieldValues>) {
  const t = useTranslations();
  const { control } = useFormContext<TFieldValues>();

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
                    ? format(parseISO(field.value), 'PPP')
                    : <span>{placeholder || t('forms.pickDate')}</span>}
                  <CalendarIcon className="ms-auto size-4 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                data-testid={field.name}
                selected={field.value ? parseISO(field.value) : undefined}
                onSelect={(selectedDate: Date | undefined) => {
                  if (selectedDate) {
                    field.onChange(format(selectedDate, 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\''));
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
