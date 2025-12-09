"use client"

import type { ComponentProps, CSSProperties } from 'react';
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState } from 'react';

import { Slot } from "@radix-ui/react-slot";
import { cva, VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/utils";
import { cn } from "@/lib/ui/cn";
import { Skeleton } from "./skeleton";

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "18rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "4rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
    // Intentionally empty
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // ✅ REACT 19: useEffectEvent for keyboard shortcut
  // Automatically captures latest toggleSidebar without re-mounting listener
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault()
      toggleSidebar()
    }
  })

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onKeyDown])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"

  const contextValue = useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = "start",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: ComponentProps<"div"> & {
  side?: "start" | "end"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { isMobile, state, openMobile, setOpenMobile, setOpen } = useSidebar()

  // ChatGPT-style: Click anywhere on collapsed sidebar to expand
  const handleSidebarClick = useCallback((e: React.MouseEvent) => {
    // Only expand if collapsed and click target is not a button/link/input
    if (state === "collapsed" && collapsible === "icon") {
      const target = e.target as HTMLElement
      const isInteractive = target.closest('button, a, input, [role="button"], [data-sidebar="menu-button"]')
      if (!isInteractive) {
        setOpen(true)
      }
    }
  }, [state, collapsible, setOpen])

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "text-sidebar-foreground flex h-full w-[var(--sidebar-width)] flex-col bg-card border-r border-border",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className={cn(
            "text-sidebar-foreground w-[var(--sidebar-width)] bg-card p-0 [&>button]:hidden"
          )}
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col p-3">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  // Calculate collapsed width for floating/inset variants
  const isFloatingOrInset = variant === "floating" || variant === "inset"
  const isCollapsed = state === "collapsed" && collapsible === "icon"

  // For floating/inset collapsed: icon width (3rem) + left/right padding (2rem) = 5rem
  // Gap needs same width as container for proper layout flow
  const collapsedWidth = "calc(var(--sidebar-width-icon) + 2rem)"

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "relative bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=end]:rotate-180"
        )}
        style={{
          width: isCollapsed && isFloatingOrInset ? collapsedWidth : isCollapsed ? "var(--sidebar-width-icon)" : "var(--sidebar-width)"
        }}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh transition-[left,right,width,padding] duration-200 ease-linear md:flex",
          side === "start"
            ? "start-0 group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)*-1)]"
            : "end-0 group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)*-1)]",
          !isFloatingOrInset && "group-data-[side=start]:border-e group-data-[side=end]:border-s",
          className
        )}
        style={{
          width: isCollapsed && isFloatingOrInset ? collapsedWidth : isCollapsed ? "var(--sidebar-width-icon)" : "var(--sidebar-width)",
          padding: isFloatingOrInset ? "1rem" : undefined
        }}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className={cn(
            "bg-card flex h-full w-full flex-col rounded-2xl p-3",
            "border border-white/[0.12] shadow-lg",
            // Show resize cursor when collapsed to indicate click-to-expand
            // Use !important to override global.css button cursor rules
            isCollapsed && "[&,&_*]:!cursor-ew-resize [&_button]:!cursor-pointer [&_button_*]:!cursor-pointer [&_a]:!cursor-pointer [&_a_*]:!cursor-pointer [&_[role=button]]:!cursor-pointer [&_[role=button]_*]:!cursor-pointer"
          )}
          onClick={handleSidebarClick}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: ComponentProps<typeof Button>) {
  const { toggleSidebar, state } = useSidebar()
  const t = useTranslations('actions');

  const isCollapsed = state === "collapsed";

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn(isCollapsed ? "size-6" : "size-7", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon className={isCollapsed ? "size-3.5" : "size-4"} />
      <span className="sr-only">{t('toggleSidebar')}</span>
    </Button>
  )
}

function SidebarRail({ className, ...props }: ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()
  const t = useTranslations()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label={t('accessibility.toggleSidebar')}
      tabIndex={-1}
      onClick={toggleSidebar}
      title={t('accessibility.toggleSidebar')}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=start]:-end-4 group-data-[side=end]:start-0 sm:flex",
        "in-data-[side=start]:cursor-w-resize in-data-[side=end]:cursor-e-resize",
        "[[data-side=start][data-state=collapsed]_&]:cursor-e-resize [[data-side=end][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:start-full",
        "[[data-side=start][data-collapsible=offcanvas]_&]:-end-2",
        "[[data-side=end][data-collapsible=offcanvas]_&]:-start-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2",
        className
      )}
      {...props}
    />
  )
}

function SidebarInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("bg-card h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 pb-2 w-full min-w-0 group-data-[collapsible=icon]:items-center", className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 pt-2 mt-auto w-full min-w-0 group-data-[collapsible=icon]:items-center", className)}
      {...props}
    />
  )
}

function SidebarSeparator({
  className,
  ...props
}: ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-border mx-2 w-auto", className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-0 w-full max-w-full",
        "group-data-[collapsible=icon]:hidden", // Hide in collapsed mode
        className
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col pb-0", className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-accent absolute top-3.5 end-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-all duration-200 focus-visible:ring-2 active:bg-accent active:scale-[0.998] [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full min-w-0 text-sm", className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1 group-data-[collapsible=icon]:items-center", className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative w-full", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-full px-2 py-2 text-start text-sm outline-hidden ring-sidebar-ring transition-all duration-200 hover:bg-accent focus-visible:ring-2 active:bg-accent active:scale-[0.998] disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-accent data-[active=true]:font-medium data-[state=open]:hover:bg-accent group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!min-w-[2.5rem] group-data-[collapsible=icon]:!max-w-[2.5rem] group-data-[collapsible=icon]:!min-h-[2.5rem] group-data-[collapsible=icon]:!max-h-[2.5rem] group-data-[collapsible=icon]:!flex-shrink-0 group-data-[collapsible=icon]:!flex-grow-0 group-data-[collapsible=icon]:items-center! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:gap-0! group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:rounded-full! group-data-[collapsible=icon]:aspect-square [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-accent",
        outline:
          "bg-card shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-accent hover:shadow-[0_0_0_1px_var(--border)]",
      },
      size: {
        default: "h-9 text-sm group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!min-w-[2.5rem] group-data-[collapsible=icon]:!max-w-[2.5rem] group-data-[collapsible=icon]:!min-h-[2.5rem] group-data-[collapsible=icon]:!max-h-[2.5rem]",
        sm: "h-8 text-xs group-data-[collapsible=icon]:!w-8 group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!min-w-[2rem] group-data-[collapsible=icon]:!max-w-[2rem] group-data-[collapsible=icon]:!min-h-[2rem] group-data-[collapsible=icon]:!max-h-[2rem]",
        lg: "h-11 text-sm group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!min-w-[2.5rem] group-data-[collapsible=icon]:!max-w-[2.5rem] group-data-[collapsible=icon]:!min-h-[2.5rem] group-data-[collapsible=icon]:!max-h-[2.5rem]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: ComponentProps<"button"> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: ComponentProps<"button"> & {
  asChild?: boolean
  showOnHover?: boolean
}) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        // Base styles - full rounded icon button with destructive hover
        "absolute end-2 flex size-6 items-center justify-center rounded-full p-0 outline-hidden",
        "text-sidebar-foreground/60 ring-sidebar-ring",
        "hover:bg-destructive/15 hover:text-destructive",
        "focus-visible:ring-2 focus-visible:ring-destructive/50",
        "transition-all duration-150 ease-out",
        "[&>svg]:size-3.5 [&>svg]:shrink-0",
        // Touch target - larger hit area on mobile
        "after:absolute after:-inset-2 md:after:hidden",
        // Size-responsive positioning
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        // Hide in icon mode
        "group-data-[collapsible=icon]:hidden",
        // Show on hover (desktop only) - always visible on mobile for touch accessibility
        showOnHover &&
          "group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuBadge({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "text-sidebar-foreground pointer-events-none absolute end-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: ComponentProps<"div"> & {
  showIcon?: boolean
}) {
  // Random width between 50 to 90%.
  const width = useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  }, [])

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-[var(--skeleton-width)] flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as CSSProperties
        }
      />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "border-sidebar-border mx-2 flex min-w-0 translate-x-px flex-col gap-0.5 border-l px-2 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({
  className,
  ...props
}: ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: ComponentProps<"a"> & {
  asChild?: boolean
  size?: "sm" | "md"
  isActive?: boolean
}) {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-accent active:bg-accent active:scale-[0.998] flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden transition-all duration-200 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-accent",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar
};

