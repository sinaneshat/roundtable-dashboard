import type { ComponentProps } from 'react';

import type { ComponentVariant } from "@/api/core/enums"
import { cn } from "@/lib/ui/cn"
import { glassCard } from "@/lib/ui/glassmorphism"

type CardVariant = Extract<ComponentVariant, 'default'> | "glass" | "glass-subtle" | "glass-strong";

type CardProps = ComponentProps<"div"> & {
  variant?: CardVariant;
};

function Card({ className, variant = "default", ...props }: CardProps) {
  const variantClasses = {
    default: "bg-card text-card-foreground rounded-2xl border py-6 shadow-sm",
    glass: cn(glassCard("medium"), "rounded-2xl py-6"),
    "glass-subtle": cn(glassCard("subtle"), "rounded-2xl py-6"),
    "glass-strong": cn(glassCard("strong"), "rounded-2xl py-6"),
  };

  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 w-full min-w-0 overflow-hidden",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex flex-col items-start gap-1.5 px-6 [.border-b]:pb-6 w-full min-w-0 overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold w-full min-w-0 truncate", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm w-full min-w-0 line-clamp-2", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6 w-full min-w-0 overflow-hidden", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6 w-full min-w-0 overflow-hidden", className)}
      {...props}
    />
  )
}

export {
  Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
}

