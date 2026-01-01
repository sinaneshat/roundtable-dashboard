'use client';

import type { ComponentProps, ReactElement } from 'react';

import * as ToastPrimitives from '@radix-ui/react-toast';
import { cva, type VariantProps } from 'class-variance-authority';

import { Icons } from '@/components/icons';
import { cn } from '@/lib/ui/cn';

function ToastProvider({
  ...props
}: ComponentProps<typeof ToastPrimitives.Provider>) {
  return <ToastPrimitives.Provider data-slot="toast-provider" {...props} />
}

function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitives.Viewport>) {
  return (
    <ToastPrimitives.Viewport
      data-slot="toast-viewport"
      className={cn(
        'fixed bottom-0 end-0 z-[100] flex max-h-screen w-full flex-col p-4 md:max-w-[420px]',
        className,
      )}
      {...props}
    />
  );
}

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-2xl border p-6 pe-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-bottom-full data-[state=open]:slide-in-from-bottom-full',
  {
    variants: {
      variant: {
        default: 'border bg-background text-foreground',
        destructive:
          'destructive group border-destructive bg-destructive text-destructive-foreground',
        success: 'border bg-chart-3/10 text-chart-3 border-chart-3/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type ToastBaseProps = ComponentProps<typeof ToastPrimitives.Root>;
type ToastVariantProps = VariantProps<typeof toastVariants>;

interface ToastProps extends ToastBaseProps, ToastVariantProps {}

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

type ToastActionElement = ReactElement<typeof ToastAction>;

export {
  Toast,
  ToastAction, ToastClose,
  ToastDescription, ToastProvider,
  ToastTitle,
  ToastViewport, type ToastActionElement, type ToastProps
};

