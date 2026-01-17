import { format, parseISO } from 'date-fns';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { Controller, useFormContext } from 'react-hook-form';

import { Icons } from '@/components/icons';
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
import { useTranslations } from '@/lib/compat';
import { cn } from '@/lib/ui/cn';

type RHFDatePickerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
  title: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

export function RHFDatePicker<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  title,
  name,
  description,
  placeholder,
  required,
  disabled,
}: RHFDatePickerProps<TFieldValues, TName>) {
  const t = useTranslations();
  const { control } = useFormContext<TFieldValues>();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const fieldValue = field.value;
        const selectedDate = fieldValue && typeof fieldValue === 'string'
          ? parseISO(fieldValue)
          : undefined;

        return (
          <FormItem className="flex w-full flex-col">
            <FormLabel>
              {title}
              {required && <span className="ms-1 text-destructive">*</span>}
            </FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    disabled={disabled}
                    className={cn(
                      'w-full ps-3 text-start font-normal',
                      !field.value && 'text-muted-foreground',
                    )}
                    aria-required={!!required}
                  >
                    {selectedDate
                      ? format(selectedDate, 'PPP')
                      : <span>{placeholder || t('forms.pickDate')}</span>}
                    <Icons.calendar className="ms-auto size-4 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  data-testid={field.name}
                  selected={selectedDate}
                  onSelect={(date: Date | undefined) => {
                    if (!date)
                      return;

                    const utcTimestamp = format(date, 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
                    field.onChange(utcTimestamp);
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
        );
      }}
    />
  );
}
