'use client';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useState } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

type SidebarSectionProps = {
  title: string;
  icon?: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
};
export function SidebarSection({
  title,
  icon,
  count,
  defaultOpen = true,
  children,
  className,
  collapsible = true,
}: SidebarSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  if (!collapsible) {
    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2">
            {icon && <div className="text-muted-foreground">{icon}</div>}
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {title}
            </h3>
          </div>
          {count !== undefined && count > 0 && (
            <span className="text-xs text-muted-foreground">
              {count}
            </span>
          )}
        </div>
        <div>{children}</div>
      </div>
    );
  }
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('space-y-1', className)}
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between px-2 py-1 rounded-md hover:bg-accent/50 transition-colors group">
        <div className="flex items-center gap-1.5">
          {icon && (
            <div className="text-muted-foreground">
              {icon}
            </div>
          )}
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          {count !== undefined && count > 0 && (
            <span className="text-xs text-muted-foreground">
              {count}
            </span>
          )}
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]',
              isOpen && 'rotate-180',
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent asChild>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{
                height: 'auto',
                opacity: 1,
                transition: {
                  height: {
                    type: 'spring',
                    stiffness: 500,
                    damping: 40,
                  },
                  opacity: {
                    duration: 0.2,
                    ease: [0.25, 0.1, 0.25, 1],
                  },
                },
              }}
              exit={{
                height: 0,
                opacity: 0,
                transition: {
                  height: {
                    type: 'spring',
                    stiffness: 500,
                    damping: 40,
                  },
                  opacity: {
                    duration: 0.15,
                    ease: [0.25, 0.1, 0.25, 1],
                  },
                },
              }}
              className="space-y-0.5 overflow-hidden"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </CollapsibleContent>
    </Collapsible>
  );
}
