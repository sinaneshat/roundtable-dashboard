import type { FormEventHandler, ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { FormProvider as RHFFormProvider } from 'react-hook-form';

type FormProviderProps<TFieldValues extends FieldValues = FieldValues> = {
  children: ReactNode;
  methods: UseFormReturn<TFieldValues>;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
};

export function FormProvider<TFieldValues extends FieldValues = FieldValues>({
  children,
  onSubmit,
  methods,
  className,
}: FormProviderProps<TFieldValues>) {
  return (
    <RHFFormProvider {...methods}>
      <form onSubmit={onSubmit} className={className}>{children}</form>
    </RHFFormProvider>
  );
}
