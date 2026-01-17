import type { FieldPath, FieldValues } from 'react-hook-form';
import { useFormContext } from 'react-hook-form';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTranslations } from '@/lib/compat';
import type { FormOptions } from '@/lib/schemas';
import { cn } from '@/lib/ui/cn';

type RHFComboBoxProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
  title: string;
  options: FormOptions;
  description?: string;
  loading?: boolean;
};

export function RHFComboBox<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  title,
  description,
  loading = false,
  options,
}: RHFComboBoxProps<TFieldValues, TName>) {
  const { control } = useFormContext<TFieldValues>();
  const t = useTranslations();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedOption = options.find(option => option.value === field.value);

        return (
          <FormItem className="flex w-full flex-col">
            <FormLabel>{title}</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      'w-full justify-between',
                      !field.value && 'text-muted-foreground',
                    )}
                  >
                    {selectedOption?.label || t('forms.selectOption', { option: title })}
                    <Icons.chevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] p-0 sm:w-full">
                <Command>
                  <CommandInput placeholder={t('forms.searchPlaceholder', { field: title })} />
                  <CommandEmpty>
                    {t('forms.noResultsFound', { item: title })}
                  </CommandEmpty>
                  <CommandGroup>
                    <CommandList>
                      {!loading && options.length > 0 && options.map(option => (
                        <CommandItem
                          data-testid={field.name}
                          value={option.label}
                          key={option.value}
                          onSelect={() => {
                            field.onChange(option.value);
                          }}
                        >
                          <Icons.check
                            className={cn(
                              'me-2 h-4 w-4',
                              option.value === field.value
                                ? 'opacity-100'
                                : 'opacity-0',
                            )}
                          />
                          <p>{option.label}</p>
                        </CommandItem>
                      ))}
                      {!loading && options.length === 0 && (
                        <CommandItem value="empty" disabled>
                          <Icons.check className="me-2 h-4 w-4" />
                          {t('forms.noOptionsAvailable')}
                        </CommandItem>
                      )}
                      {loading && (
                        <CommandItem value="loading" disabled>
                          <Icons.loader className="me-2 h-4 w-4 animate-spin" />
                          {t('forms.loading')}
                        </CommandItem>
                      )}
                    </CommandList>
                  </CommandGroup>
                </Command>
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
