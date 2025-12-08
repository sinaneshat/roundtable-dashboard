"use client"

import type { ComponentProps } from 'react';

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/ui/cn"
import { buttonVariants } from "@/components/ui/button"

function AlertDialog({
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

type AlertDialogOverlayProps = ComponentProps<typeof AlertDialogPrimitive.Overlay> & {
  glass?: boolean;
};

function AlertDialogOverlay({
  className,
  glass = false,
  ...props
}: AlertDialogOverlayProps) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
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

type AlertDialogContentProps = ComponentProps<typeof AlertDialogPrimitive.Content> & {
  glass?: boolean;
};

function AlertDialogContent({
  className,
  glass = false,
  ...props
}: AlertDialogContentProps) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay glass={glass} />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          glass
            ? cn("gap-0 rounded-lg border bg-black/80 p-0 shadow-lg overflow-hidden backdrop-blur-lg")
            : "gap-4 rounded-lg border bg-background p-6 shadow-lg",
          className
        )}
        style={glass ? { backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' } : undefined}
        {...props}
      />
    </AlertDialogPortal>
  )
}

type AlertDialogHeaderProps = ComponentProps<"div"> & {
  glass?: boolean;
};

function AlertDialogHeader({ className, glass = false, ...props }: AlertDialogHeaderProps) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "flex flex-col space-y-2 text-left",
        glass && "bg-black/40 px-4 sm:px-5 md:px-6 pt-4 sm:pt-5 md:pt-6 pb-3 sm:pb-4",
        className
      )}
      {...props}
    />
  )
}

type AlertDialogFooterProps = ComponentProps<"div"> & {
  glass?: boolean;
};

function AlertDialogFooter({ className, glass = false, ...props }: AlertDialogFooterProps) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        // Mobile: Stack vertically with gap, action button on top (more prominent)
        "flex flex-col-reverse gap-3",
        // Desktop: Horizontal layout with proper spacing
        "sm:flex-row sm:justify-end sm:gap-2",
        glass && "bg-black/30 px-4 sm:px-5 md:px-6 pb-4 sm:pb-5 md:pb-6 pt-3 sm:pt-4",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(
        buttonVariants(),
        // Mobile: Full width buttons for better touch targets
        "w-full sm:w-auto",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(
        buttonVariants({ variant: "outline" }),
        // Mobile: Full width buttons for better touch targets
        "w-full sm:w-auto",
        className
      )}
      {...props}
    />
  )
}

export {
  AlertDialog, AlertDialogAction,
  AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger
}

