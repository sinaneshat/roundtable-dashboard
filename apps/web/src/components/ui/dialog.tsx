import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ComponentProps } from 'react';

import { Icons } from '@/components/icons';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal {...props} />;
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />;
}

type DialogOverlayProps = ComponentProps<typeof DialogPrimitive.Overlay> & {
  glass?: boolean;
};

function DialogOverlay({
  className,
  glass = false,
  ...props
}: DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50',
        glass ? 'bg-black/95' : 'bg-black/90',
        className,
      )}
      {...props}
    />
  );
}

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  glass?: boolean;
};

function DialogContent({
  className,
  children,
  showCloseButton = true,
  glass = false,
  ...props
}: DialogContentProps) {
  const t = useTranslations();

  return (
    <DialogPortal>
      <DialogOverlay glass={glass} />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-[50%] top-[50%] z-50 flex flex-col w-[calc(100%-2rem)] sm:w-full max-w-lg max-h-[90vh] translate-x-[-50%] translate-y-[-50%] duration-200 overflow-auto',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          glass
            ? cn('gap-0 rounded-2xl border border-border bg-card p-0 shadow-lg')
            : 'gap-3 sm:gap-4 rounded-2xl border bg-background p-4 sm:p-6 shadow-lg',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
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

type DialogHeaderProps = ComponentProps<'div'> & {
  glass?: boolean;
};

function DialogHeader({ className, glass = false, ...props }: DialogHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5 text-left flex-shrink-0 pb-2',
        glass && 'bg-card px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4',
        className,
      )}
      {...props}
    />
  );
}

type DialogFooterProps = ComponentProps<'div'> & {
  glass?: boolean;
  justify?: 'end' | 'between';
  bordered?: boolean;
  bleed?: boolean;
};

type DialogBodyProps = ComponentProps<'div'> & {
  glass?: boolean;
};

function DialogBody({ className, glass = false, children, ...props }: DialogBodyProps) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mx-4 sm:-mx-6 custom-scrollbar',
        glass && 'bg-background',
        className,
      )}
      {...props}
    >
      <div className={cn(
        'px-4 sm:px-6 py-3',
        glass && 'py-4 sm:py-6',
      )}>
        {children}
      </div>
    </div>
  );
}

function DialogFooter({
  className,
  glass = false,
  justify = 'end',
  bordered = true,
  bleed = true,
  ...props
}: DialogFooterProps) {
  return (
    <div
      className={cn(
        'flex-shrink-0 pt-4',
        justify === 'between'
          ? 'flex flex-row items-center justify-between gap-2 sm:gap-3'
          : 'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3',
        bordered && 'border-t border-border pt-4',
        bleed && '-mx-4 -mb-4 sm:-mx-6 sm:-mb-6 px-4 sm:px-6 py-2.5 sm:py-3',
        glass && !bleed && 'bg-background px-4 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4',
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
  DialogTrigger
};

