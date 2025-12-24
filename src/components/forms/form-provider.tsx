import type { FormEventHandler, ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { FormProvider as Form } from 'react-hook-form';

type Props<
  TFieldValues extends FieldValues = FieldValues,
  TContext = object,
  TTransformedValues = TFieldValues,
> = {
  children: ReactNode;
  methods: UseFormReturn<TFieldValues, TContext, TTransformedValues>;
  onSubmit?: FormEventHandler<HTMLFormElement>;
};

function FormProvider<
  TFieldValues extends FieldValues = FieldValues,
  TContext = object,
  TTransformedValues = TFieldValues,
>({
  children,
  onSubmit,
  methods,
}: Props<TFieldValues, TContext, TTransformedValues>) {
  return (
    <Form {...methods}>
      <form onSubmit={onSubmit}>{children}</form>
    </Form>
  );
}

export default FormProvider;
