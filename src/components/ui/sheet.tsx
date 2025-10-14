'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@/lib/ui/cn';

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

function SheetOverlay({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay> & { ref?: React.RefObject<React.ElementRef<typeof SheetPrimitive.Overlay> | null> }) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
      ref={ref}
    />
  );
}
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

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

type SheetContentProps = {} & React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & VariantProps<typeof sheetVariants>;

function SheetContent({ ref, side = 'end', className, children, ...props }: SheetContentProps & { ref?: React.RefObject<React.ElementRef<typeof SheetPrimitive.Content> | null> }) {
  const t = useTranslations('actions');

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute end-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary">
          <X className="size-4" />
          <span className="sr-only">{t('close')}</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}
SheetContent.displayName = SheetPrimitive.Content.displayName;

function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-2 text-center sm:text-start',
        className,
      )}
      {...props}
    />
  );
}
SheetHeader.displayName = 'SheetHeader';

function SheetFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 rtl:space-x-reverse',
        className,
      )}
      {...props}
    />
  );
}
SheetFooter.displayName = 'SheetFooter';

function SheetTitle({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title> & { ref?: React.RefObject<React.ElementRef<typeof SheetPrimitive.Title> | null> }) {
  return (
    <SheetPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold text-foreground', className)}
      {...props}
    />
  );
}
SheetTitle.displayName = SheetPrimitive.Title.displayName;

function SheetDescription({ ref, className, ...props }: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description> & { ref?: React.RefObject<React.ElementRef<typeof SheetPrimitive.Description> | null> }) {
  return (
    <SheetPrimitive.Description
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
SheetDescription.displayName = SheetPrimitive.Description.displayName;

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


