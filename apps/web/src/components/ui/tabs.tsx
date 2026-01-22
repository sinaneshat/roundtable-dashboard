'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps, ElementRef } from 'react';

import { cn } from '@/lib/ui/cn';

const Tabs = TabsPrimitive.Root;

type TabsListProps = ComponentProps<typeof TabsPrimitive.List> & {
  ref?: React.RefObject<ElementRef<typeof TabsPrimitive.List> | null>;
};

function TabsList({ ref, className, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-xl bg-muted p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
TabsList.displayName = TabsPrimitive.List.displayName;

type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger> & {
  ref?: React.RefObject<ElementRef<typeof TabsPrimitive.Trigger> | null>;
};

function TabsTrigger({ ref, className, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
        className,
      )}
      {...props}
    />
  );
}
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

type TabsContentProps = ComponentProps<typeof TabsPrimitive.Content> & {
  ref?: React.RefObject<ElementRef<typeof TabsPrimitive.Content> | null>;
};

function TabsContent({ ref, className, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  );
}
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
