import * as ToastPrimitives from '@radix-ui/react-toast';
import type { BaseToastVariant } from '@roundtable/shared';
import { BaseToastVariants } from '@roundtable/shared';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import type { ComponentProps, ReactElement } from 'react';

import { Icons } from '@/components/icons';
import { cn } from '@/lib/ui/cn';

function ToastProvider({
  ...props
}: ComponentProps<typeof ToastPrimitives.Provider>) {
  return <ToastPrimitives.Provider data-slot="toast-provider" {...props} />;
}

function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Viewport>) {
  return (
    <ToastPrimitives.Viewport
      data-slot="toast-viewport"
      className={cn(
        'fixed bottom-0 end-0 z-[100] flex max-h-screen w-full flex-col p-3 sm:p-4 sm:max-w-[380px] md:max-w-[420px]',
        className,
      )}
      {...props}
    />
  );
}

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-3 sm:space-x-4 overflow-hidden rounded-2xl border p-4 sm:p-6 pe-7 sm:pe-8 shadow-lg backdrop-blur-xl transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-bottom-full data-[state=open]:slide-in-from-bottom-full',
  {
    variants: {
      variant: {
        [BaseToastVariants.DEFAULT]: 'border bg-background/80 text-foreground',
        [BaseToastVariants.DESTRUCTIVE]:
          'destructive group border-destructive/30 bg-destructive/15 text-destructive',
        [BaseToastVariants.SUCCESS]: 'border border-success/30 bg-success/15 text-success',
        [BaseToastVariants.WARNING]: 'border border-warning/30 bg-warning/15 text-warning',
        [BaseToastVariants.INFO]: 'border border-info/30 bg-info/15 text-info',
      } satisfies Record<BaseToastVariant, string>,
    },
    defaultVariants: {
      variant: BaseToastVariants.DEFAULT,
    },
  },
);

type ToastProps = {} & ComponentProps<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>;

function Toast({
  className,
  variant,
  ...props
}: ToastProps) {
  return (
    <ToastPrimitives.Root
      data-slot="toast"
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
}

function ToastAction({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Action>) {
  return (
    <ToastPrimitives.Action
      data-slot="toast-action"
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center rounded-4xl border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  );
}

function ToastClose({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Close>) {
  return (
    <ToastPrimitives.Close
      data-slot="toast-close"
      className={cn(
        'absolute end-2 top-2 rounded-full p-1 text-foreground/50 transition-opacity hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100',
        'group-[.destructive]:text-destructive-foreground/80 group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus-visible:ring-destructive group-[.destructive]:focus-visible:ring-offset-destructive',
        className,
      )}
      toast-close=""
      {...props}
    >
      <Icons.x className="size-4" />
    </ToastPrimitives.Close>
  );
}

function ToastTitle({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Title>) {
  return (
    <ToastPrimitives.Title
      data-slot="toast-title"
      className={cn('text-sm font-semibold', className)}
      {...props}
    />
  );
}

function ToastDescription({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Description>) {
  return (
    <ToastPrimitives.Description
      data-slot="toast-description"
      className={cn('text-sm opacity-90', className)}
      {...props}
    />
  );
}

type ToastActionElement = ReactElement<ComponentProps<typeof ToastAction>, typeof ToastAction>;

export {
  Toast,
  ToastAction,
  type ToastActionElement,
  ToastClose,
  ToastDescription,
  type ToastProps,
  ToastProvider,
  ToastTitle,
  ToastViewport,
};
