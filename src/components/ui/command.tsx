'use client';

import type { ComponentPropsWithoutRef, ElementRef, HTMLAttributes, RefObject } from 'react';

import type { DialogProps } from '@radix-ui/react-dialog';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { glassCard } from '@/lib/ui/glassmorphism';
import { cn } from '@/lib/ui/cn';

type CommandProps = ComponentPropsWithoutRef<typeof CommandPrimitive> & {
  ref?: RefObject<ElementRef<typeof CommandPrimitive> | null>;
  glass?: boolean;
};

function Command({ ref, className, glass = false, ...props }: CommandProps) {
  return (
    <CommandPrimitive
      ref={ref}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-2xl',
        glass ? glassCard('medium') : 'bg-popover text-popover-foreground',
        className,
      )}
      {...props}
    />
  );
}
Command.displayName = CommandPrimitive.displayName;

type CommandDialogProps = DialogProps;

function CommandDialog({ children, ...props }: CommandDialogProps) {
  return (
    <Dialog {...props}>
      <DialogContent glass={true} className="overflow-hidden p-0 shadow-lg">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:size-5">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({ ref, className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & { ref?: RefObject<ElementRef<typeof CommandPrimitive.Input> | null> }) {
  return (
    <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
      <Search className="me-2 size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

CommandInput.displayName = CommandPrimitive.Input.displayName;

function CommandList({ ref, className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.List> & { ref?: RefObject<ElementRef<typeof CommandPrimitive.List> | null> }) {
  return (
    <CommandPrimitive.List
      ref={ref}
      className={cn('max-h-[300px] overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  );
}

CommandList.displayName = CommandPrimitive.List.displayName;

function CommandEmpty({ ref, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Empty> & { ref?: RefObject<ElementRef<typeof CommandPrimitive.Empty> | null> }) {
  return (
    <CommandPrimitive.Empty
      ref={ref}
      className="py-6 text-center text-sm"
      {...props}
    />
  );
}

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

function CommandGroup({ ref, className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Group> & { ref?: RefObject<ElementRef<typeof CommandPrimitive.Group> | null> }) {
  return (
    <CommandPrimitive.Group
      ref={ref}
      className={cn(
        'overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

CommandGroup.displayName = CommandPrimitive.Group.displayName;

function CommandSeparator({ ref, className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Separator> & { ref?: RefObject<ElementRef<typeof CommandPrimitive.Separator> | null> }) {
  return (
    <CommandPrimitive.Separator
      ref={ref}
      className={cn('-mx-1 h-px bg-border', className)}
      {...props}
    />
  );
}
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

function CommandItem({ ref, className, ...props }: ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & { ref?: RefObject<ElementRef<typeof CommandPrimitive.Item> | null> }) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-xl px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled=\'true\']:pointer-events-none data-[disabled=\'true\']:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

CommandItem.displayName = CommandPrimitive.Item.displayName;

function CommandShortcut({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'ms-auto text-xs tracking-widest text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
CommandShortcut.displayName = 'CommandShortcut';

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
};

