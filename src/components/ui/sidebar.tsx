"use client"

import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState } from 'react';

import { Slot } from "@/lib/ui/slot";
import { cva, type VariantProps } from "class-variance-authority";
import { useTranslations } from "next-intl";

import type { SidebarCollapsible, SidebarMenuButtonSize, SidebarSide, SidebarState, SidebarVariant } from '@/api/core/enums';
import { ComponentSizes, ComponentVariants, KeyboardKeys, SidebarCollapsibles, SidebarMenuButtonSizes, SidebarSides, SidebarStates, SidebarVariants } from '@/api/core/enums';
import { Icons } from '@/components/icons';

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
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/utils";
import { cn } from "@/lib/ui/cn";
import { Skeleton } from "./skeleton";

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "20rem"
const SIDEBAR_WIDTH_MOBILE = "20rem"
const SIDEBAR_WIDTH_ICON = "4rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: SidebarState
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

function useSidebarOptional() {
  return useContext(SidebarContext)
}

interface SidebarProviderProps extends ComponentProps<"div"> {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
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

  const state = open ? SidebarStates.EXPANDED : SidebarStates.COLLAPSED

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

interface SidebarProps extends ComponentProps<"div"> {
  side?: SidebarSide
  variant?: SidebarVariant
  collapsible?: SidebarCollapsible
  children?: ReactNode
}

function Sidebar({
  side = SidebarSides.START,
  variant = SidebarVariants.SIDEBAR,
  collapsible = SidebarCollapsibles.OFFCANVAS,
  className,
  children,
  ...props
}: SidebarProps) {
  const t = useTranslations('accessibility');
  const { isMobile, state, openMobile, setOpenMobile, toggleSidebar } = useSidebar()

  const isFloatingOrInset = variant === SidebarVariants.FLOATING || variant === SidebarVariants.INSET
  const isCollapsed = state === SidebarStates.COLLAPSED && collapsible === SidebarCollapsibles.ICON
  const handleCollapsedClick = useCallback(() => {
    if (isCollapsed) {
      toggleSidebar()
    }
  }, [isCollapsed, toggleSidebar])

  if (collapsible === SidebarCollapsibles.NONE) {
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
            <SheetTitle>{t('mobileSidebar.title')}</SheetTitle>
            <SheetDescription>{t('mobileSidebar.description')}</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col p-2">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const collapsedWidth = 'calc(var(--sidebar-width-icon) + 2rem)'

  return (
    <div
      className="group peer text-sidebar-foreground hidden md:block"
      data-state={state}
      data-collapsible={state === SidebarStates.COLLAPSED ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          'relative bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[collapsible=offcanvas]:w-0',
          'group-data-[side=end]:rotate-180',
        )}
        style={{
          width: isCollapsed && isFloatingOrInset ? collapsedWidth : isCollapsed ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)',
        }}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          'fixed inset-y-0 z-10 hidden h-svh transition-[left,right,width,padding] duration-200 ease-linear md:flex',
          side === SidebarSides.START
            ? 'start-0 group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)*-1)]'
            : 'end-0 group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)*-1)]',
          !isFloatingOrInset && 'group-data-[side=start]:border-e group-data-[side=end]:border-s',
          className,
        )}
        style={{
          width: isCollapsed && isFloatingOrInset ? collapsedWidth : isCollapsed ? 'var(--sidebar-width-icon)' : 'var(--sidebar-width)',
          padding: isFloatingOrInset ? '1rem' : undefined,
        }}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          role={isCollapsed ? "button" : undefined}
          tabIndex={isCollapsed ? 0 : undefined}
          onClick={handleCollapsedClick}
          onKeyDown={isCollapsed ? (e) => { if (e.key === KeyboardKeys.ENTER || e.key === ' ') { e.preventDefault(); handleCollapsedClick(); } } : undefined}
          className={cn(
            'bg-card flex h-full w-full flex-col rounded-2xl p-2',
            'border shadow-lg',
            isCollapsed && 'cursor-ew-resize',
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

interface SidebarTriggerProps extends ComponentProps<typeof Button> {
  iconClassName?: string
}

function SidebarTrigger({
  className,
  onClick,
  iconClassName,
  ...props
}: SidebarTriggerProps) {
  const { toggleSidebar, state } = useSidebar()
  const t = useTranslations('actions');

  const isCollapsed = state === SidebarStates.COLLAPSED

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant={ComponentVariants.GHOST}
      size={ComponentSizes.ICON}
      className={cn(isCollapsed ? 'size-6' : 'size-7', className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <Icons.panelLeft className={iconClassName ?? (isCollapsed ? "size-3.5" : "size-4")} />
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
        'absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=start]:-end-4 group-data-[side=end]:start-0 sm:flex',
        'in-data-[side=start]:cursor-w-resize in-data-[side=end]:cursor-e-resize',
        '[[data-side=start][data-state=collapsed]_&]:cursor-e-resize [[data-side=end][data-state=collapsed]_&]:cursor-w-resize',
        'hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:start-full',
        '[[data-side=start][data-collapsible=offcanvas]_&]:-end-2',
        '[[data-side=end][data-collapsible=offcanvas]_&]:-start-2',
        className,
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
        'relative flex w-full flex-1 flex-col',
        'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ms-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ms-2',
        className,
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
      className={cn('bg-card h-8 w-full shadow-none', className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn('flex flex-col gap-2 pb-2 w-full min-w-0 group-data-[collapsible=icon]:items-center', className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn('flex flex-col gap-2 pt-2 w-full min-w-0', className)}
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
      className={cn('bg-border mx-2 w-auto', className)}
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
        'flex min-h-0 flex-1 flex-col gap-0 w-full max-w-full group-data-[collapsible=icon]:overflow-hidden',
        className,
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
      className={cn('relative flex w-full min-w-0 flex-col pb-0', className)}
      {...props}
    />
  )
}

interface SidebarGroupLabelProps extends ComponentProps<"div"> {
  asChild?: boolean
  children?: ReactNode
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: SidebarGroupLabelProps) {
  const Comp = asChild ? Slot : 'div'

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        'text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-xl px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

interface SidebarGroupActionProps extends ComponentProps<"button"> {
  asChild?: boolean
  children?: ReactNode
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: SidebarGroupActionProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        'text-sidebar-foreground ring-sidebar-ring hover:bg-accent absolute top-3.5 end-3 flex aspect-square w-5 items-center justify-center rounded-full p-0 outline-hidden transition-all duration-200 focus-visible:ring-2 active:bg-accent active:scale-[0.998] [&>svg]:size-4 [&>svg]:shrink-0',
        'after:absolute after:-inset-2 md:after:hidden',
        'group-data-[collapsible=icon]:hidden',
        className,
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
      className={cn('w-full min-w-0 text-sm', className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1 group-data-[collapsible=icon]:items-center', className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn('group/menu-item relative w-full group-data-[collapsible=icon]:w-auto', className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-full px-4 py-2 text-start text-sm outline-hidden ring-sidebar-ring transition-all duration-200 hover:bg-accent focus-visible:ring-2 active:bg-accent active:scale-[0.998] disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pe-10 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-accent data-[active=true]:font-medium data-[state=open]:hover:bg-accent group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!min-w-[2.5rem] group-data-[collapsible=icon]:!max-w-[2.5rem] group-data-[collapsible=icon]:!min-h-[2.5rem] group-data-[collapsible=icon]:!max-h-[2.5rem] group-data-[collapsible=icon]:!flex-shrink-0 group-data-[collapsible=icon]:!flex-grow-0 group-data-[collapsible=icon]:items-center! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:gap-0! group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:rounded-full! group-data-[collapsible=icon]:aspect-square [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'hover:bg-white/[0.07]',
        outline:
          'bg-card shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-white/[0.07] hover:shadow-[0_0_0_1px_var(--border)]',
      },
      size: {
        default: 'h-9 text-sm group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!min-w-[2.5rem] group-data-[collapsible=icon]:!max-w-[2.5rem] group-data-[collapsible=icon]:!min-h-[2.5rem] group-data-[collapsible=icon]:!max-h-[2.5rem]',
        sm: 'h-8 text-xs group-data-[collapsible=icon]:!w-8 group-data-[collapsible=icon]:!h-8 group-data-[collapsible=icon]:!min-w-[2rem] group-data-[collapsible=icon]:!max-w-[2rem] group-data-[collapsible=icon]:!min-h-[2rem] group-data-[collapsible=icon]:!max-h-[2rem]',
        lg: 'h-11 text-sm group-data-[collapsible=icon]:!w-10 group-data-[collapsible=icon]:!h-10 group-data-[collapsible=icon]:!min-w-[2.5rem] group-data-[collapsible=icon]:!max-w-[2.5rem] group-data-[collapsible=icon]:!min-h-[2.5rem] group-data-[collapsible=icon]:!max-h-[2.5rem]',
      },
    },
    defaultVariants: {
      variant: ComponentVariants.DEFAULT,
      size: ComponentSizes.DEFAULT,
    },
  },
)

interface SidebarMenuButtonProps extends ComponentProps<"button">, VariantProps<typeof sidebarMenuButtonVariants> {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | ComponentProps<typeof TooltipContent>
  children?: ReactNode
}

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = ComponentVariants.DEFAULT,
  size = ComponentSizes.DEFAULT,
  tooltip,
  className,
  ...props
}: SidebarMenuButtonProps) {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const tooltipText = tooltip
    ? typeof tooltip === "string"
      ? tooltip
      : (tooltip.children as string) || ''
    : undefined
  const showNativeTooltip = tooltipText && state === SidebarStates.COLLAPSED && !isMobile

  return (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      title={showNativeTooltip ? tooltipText : undefined}
      {...props}
    />
  )
}

interface SidebarMenuActionProps extends ComponentProps<"button"> {
  asChild?: boolean
  showOnHover?: boolean
  children?: ReactNode
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: SidebarMenuActionProps) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        'absolute end-2 flex size-6 items-center justify-center p-0 outline-hidden cursor-pointer',
        'text-sidebar-foreground/60 ring-sidebar-ring',
        'hover:text-sidebar-foreground',
        'focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        'transition-all duration-150 ease-out',
        '[&>svg]:size-4 [&>svg]:shrink-0',
        'after:absolute after:-inset-2 md:after:hidden',
        'peer-data-[size=sm]/menu-button:top-1',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        'group-data-[collapsible=icon]:hidden',
        showOnHover &&
          'group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0',
        className,
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
        'text-sidebar-foreground pointer-events-none absolute end-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums select-none',
        'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
        'peer-data-[size=sm]/menu-button:top-1',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  )
}

interface SidebarMenuSkeletonProps extends ComponentProps<"div"> {
  showIcon?: boolean
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: SidebarMenuSkeletonProps) {
  const width = '75%'

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn('flex h-8 items-center gap-2 rounded-xl px-2', className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-xl"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-[var(--skeleton-width)] flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            '--skeleton-width': width,
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
        'border-sidebar-border mx-2 flex min-w-0 translate-x-px flex-col gap-0.5 border-l px-2 py-0.5',
        'group-data-[collapsible=icon]:hidden',
        className,
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
      className={cn('group/menu-sub-item relative', className)}
      {...props}
    />
  )
}

interface SidebarMenuSubButtonProps extends ComponentProps<"a"> {
  asChild?: boolean
  size?: SidebarMenuButtonSize
  isActive?: boolean
  children?: ReactNode
}

function SidebarMenuSubButton({
  asChild = false,
  size = SidebarMenuButtonSizes.MD,
  isActive = false,
  className,
  ...props
}: SidebarMenuSubButtonProps) {
  const Comp = asChild ? Slot : 'a'

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        'text-sidebar-foreground ring-sidebar-ring hover:bg-accent active:bg-accent active:scale-[0.998] flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-xl px-2 outline-hidden transition-all duration-200 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
        'data-[active=true]:bg-accent',
        size === SidebarMenuButtonSizes.SM && 'text-xs',
        size === SidebarMenuButtonSizes.MD && 'text-sm',
        'group-data-[collapsible=icon]:hidden',
        className,
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
  useSidebar,
  useSidebarOptional,
  type SidebarProps,
  type SidebarProviderProps,
  type SidebarTriggerProps,
  type SidebarGroupLabelProps,
  type SidebarGroupActionProps,
  type SidebarMenuButtonProps,
  type SidebarMenuActionProps,
  type SidebarMenuSkeletonProps,
  type SidebarMenuSubButtonProps,
};

