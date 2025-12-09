'use client';

import type { ComponentPropsWithoutRef, ElementRef, RefObject } from 'react';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';

import { cn } from '@/lib/ui/cn';

function RadioGroup({ ref, className, ...props }: ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root> & { ref?: RefObject<ElementRef<typeof RadioGroupPrimitive.Root> | null> }) {
  return (
    <RadioGroupPrimitive.Root
      className={cn('grid gap-2', className)}
      {...props}
      ref={ref}
    />
  );
}
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName;

function RadioGroupItem({ ref, className, ...props }: ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & { ref?: RefObject<ElementRef<typeof RadioGroupPrimitive.Item> | null> }) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'aspect-square h-4 w-4 rounded-full border border-primary text-primary outline-none focus-visible:ring-1 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="size-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };

