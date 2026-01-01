'use client';

import type { ComponentProps } from 'react';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { useTranslations } from 'next-intl';

import { Icons } from '@/components/icons';
import { cn } from '@/lib/ui/cn';

function Sheet({
  ...props
}: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        start: 'inset-y-0 start-0 h-full w-3/4 border-e data-[state=closed]:slide-out-to-start data-[state=open]:slide-in-from-start sm:max-w-sm',
        end:
          'inset-y-0 end-0 h-full w-3/4  border-s data-[state=closed]:slide-out-to-end data-[state=open]:slide-in-from-end sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'end',
    },
  },
);

type SheetContentBaseProps = ComponentProps<typeof SheetPrimitive.Content>;
type SheetContentVariantProps = VariantProps<typeof sheetVariants>;

interface SheetContentProps extends SheetContentBaseProps, SheetContentVariantProps {}

function SheetContent({
  side = 'end',
  className,
  children,
  ...props
}: SheetContentProps) {
  const t = useTranslations('actions');

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute end-4 top-4 rounded-full opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <Icons.x className="size-4" />
          <span className="sr-only">{t('close')}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        'flex flex-col space-y-2 text-center sm:text-start',
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'flex flex-col-reverse gap-3',
        'sm:flex-row sm:justify-end sm:gap-2',
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-lg font-semibold text-foreground', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger
};

