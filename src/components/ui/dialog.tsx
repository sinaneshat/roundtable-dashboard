"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"
import { useTranslations } from 'next-intl';
import * as React from "react"

import { cn } from "@/lib/ui/cn"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

type DialogOverlayProps = React.ComponentProps<typeof DialogPrimitive.Overlay> & {
  glass?: boolean;
};

function DialogOverlay({
  className,
  glass = false,
  ...props
}: DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50",
        glass ? "bg-black/60" : "bg-black/50",
        className
      )}
      style={glass ? { backdropFilter: 'blur(25px)', WebkitBackdropFilter: 'blur(25px)' } : undefined}
      {...props}
    />
  )
}

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
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
  const t = useTranslations('actions');

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay glass={glass} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] duration-200",
          glass
            ? cn("bg-black/80 shadow-2xl p-0 gap-0 overflow-hidden rounded-2xl")
            : "bg-background border shadow-lg gap-4 p-6 rounded-lg",
          className
        )}
        style={glass ? { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } : undefined}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 end-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">{t('close')}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

type DialogHeaderProps = React.ComponentProps<"div"> & {
  glass?: boolean;
};

function DialogHeader({ className, glass = false, ...props }: DialogHeaderProps) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2 text-center sm:text-start",
        glass && "px-6 pt-6 pb-4 bg-black/40",
        className
      )}
      {...props}
    />
  )
}

type DialogFooterProps = React.ComponentProps<"div"> & {
  glass?: boolean;
};

function DialogFooter({ className, glass = false, ...props }: DialogFooterProps) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        glass && "px-6 pb-6 pt-4",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger
}

