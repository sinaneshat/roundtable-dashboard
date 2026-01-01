"use client"

import type { ComponentProps } from 'react';

import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/ui/cn"
import { glassCard } from "@/lib/ui/glassmorphism"

function Drawer({
  shouldScaleBackground = true,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Root>) {
  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      {...props}
    />
  )
}

function DrawerTrigger({
  ...props
}: ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-0 z-50 bg-black/80", className)}
      {...props}
    />
  )
}

type DrawerContentBaseProps = ComponentProps<typeof DrawerPrimitive.Content>;

interface DrawerContentProps extends DrawerContentBaseProps {
  glass?: boolean
}

function DrawerContent({
  className,
  children,
  glass = false,
  ...props
}: DrawerContentProps) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-2xl border",
          glass
            ? glassCard("medium")
            : "bg-background",
          className
        )}
        {...props}
      >
        <div className="mx-auto mt-4 mb-2 h-1.5 w-12 rounded-full bg-white" />
        <div className="pb-12">
          {children}
        </div>
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function DrawerHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DrawerFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
