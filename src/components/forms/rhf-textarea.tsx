// components/TextInput.tsx
import { useFormContext } from 'react-hook-form';

import type { GeneralFormProps } from '@/types/general';

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import { Textarea } from '../ui/textarea';

type Props = {
  placeholder?: string;
  rows?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  hideLabel?: boolean;
} & GeneralFormProps;

function RHFTextarea({
  name,
  title,
  description,
  placeholder,
  required,
  value: externalValue,
  onChange: externalOnChange,
  onKeyDown,
  rows,
  className,
  hideLabel = false,
}: Props) {
  const { control } = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className || 'w-full'}>
          {!hideLabel && <FormLabel>{title}</FormLabel>}
          <FormControl>
            <Textarea
              {...field}
              rows={rows}
              required={required}
              data-testid={field.name}
              placeholder={placeholder}
              className="resize-none"
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                field.onChange(e.target.value);
                if (externalOnChange) {
                  externalOnChange(e);
                }
              }}
              onKeyDown={onKeyDown}
              value={field.value !== undefined ? field.value : externalValue}
            />
          </FormControl>
          <FormDescription>
            {description}
            {' '}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default RHFTextarea;
