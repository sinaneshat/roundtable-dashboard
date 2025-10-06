// components/TextInput.tsx
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormContext } from 'react-hook-form';

import { cn } from '@/lib/ui/cn';
import type { FormOptions, GeneralFormProps } from '@/types/general';

import { Button } from '../ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '../ui/command';
import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '../ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

type Props = {
  options: FormOptions;
  loading?: boolean;
} & GeneralFormProps;

function RHFComboBox({
  name,
  title,
  description,

  loading = false,
  options,
}: Props) {
  const { control, setValue } = useFormContext();
  const t = useTranslations();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
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
                  {field.value
                    ? options.find(option => option.value === field.value)
                      ?.label
                    : t('forms.selectOption', { option: title })}
                  <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
                </Button>
              </FormControl>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-full p-0">
              <Command>
                <CommandInput placeholder={t('forms.searchPlaceholder', { field: title })} />
                <CommandEmpty>
                  {t('forms.noResultsFound', { item: title })}
                </CommandEmpty>
                <CommandGroup>
                  <CommandList>
                    {!loading
                      && options.length
                      && options.map(option => (
                        <CommandItem
                          data-testid={field.name}
                          value={option.label}
                          key={option.value}
                          onSelect={() => {
                            setValue(field.name, option.value);
                          }}
                        >
                          <Check
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
                    {!loading && !options.length && (
                      <CommandItem value="empty" disabled>
                        <Check className={cn('me-2 h-4 w-4')} />
                        {t('forms.noOptionsAvailable')}
                      </CommandItem>
                    )}
                    {loading && (
                      <CommandItem value="loading" disabled>
                        <Loader2 className={cn('me-2 h-4 w-4 animate-spin')} />
                        {t('forms.loading')}
                      </CommandItem>
                    )}
                  </CommandList>
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default RHFComboBox;
