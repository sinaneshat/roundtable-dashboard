import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';

import { Icons } from '@/components/icons';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

type DialogOverlayProps = {
  glass?: boolean;
} & ComponentProps<typeof DialogPrimitive.Overlay>;

function DialogOverlay({
  className,
  glass = false,
  ...props
}: DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50',
        glass ? 'bg-black/95' : 'bg-black/90',
        className,
      )}
      {...props}
    />
  );
}

type DialogContentProps = {
  showCloseButton?: boolean;
  glass?: boolean;
} & ComponentProps<typeof DialogPrimitive.Content>;

function DialogContent({
  className,
  children,
  showCloseButton = true,
  glass = false,
  ...props
}: DialogContentProps) {
  const t = useTranslations();

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay glass={glass} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-2rem)] sm:w-full max-w-lg translate-x-[-50%] translate-y-[-50%] duration-200',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          glass
            ? cn('gap-0 rounded-2xl border border-border bg-card p-0 shadow-lg overflow-hidden')
            : 'gap-3 sm:gap-4 rounded-2xl border bg-background p-4 sm:p-6 shadow-lg overflow-hidden',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-3 end-3 sm:top-4 sm:end-4 rounded-full opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 min-h-11 min-w-11 flex items-center justify-center"
          >
            <Icons.x />
            <span className="sr-only">{t('actions.close')}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

type DialogHeaderProps = {
  glass?: boolean;
} & ComponentProps<'div'>;

function DialogHeader({ className, glass = false, ...props }: DialogHeaderProps) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flex flex-col space-y-1.5 text-left',
        glass && 'bg-card px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4',
        className,
      )}
      {...props}
    />
  );
}

type DialogFooterProps = {
  glass?: boolean;
} & ComponentProps<'div'>;

type DialogBodyProps = {
  glass?: boolean;
} & ComponentProps<'div'>;

function DialogBody({ className, glass = false, ...props }: DialogBodyProps) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        glass && 'bg-background px-4 sm:px-6 py-4 sm:py-6',
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({ className, glass = false, ...props }: DialogFooterProps) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3',
        glass && 'bg-background px-4 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4',
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
