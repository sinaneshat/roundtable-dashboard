'use client';

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { motion } from 'framer-motion';
import * as React from 'react';

const Collapsible = CollapsiblePrimitive.Root;

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent> & {
    onAnimationComplete?: () => void;
  }
>(({ children, onAnimationComplete, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleContent ref={ref} asChild {...props}>
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      onAnimationComplete={onAnimationComplete}
      transition={{
        height: {
          duration: 0.25,
          ease: [0.32, 0.72, 0, 1],
          when: 'beforeChildren' as const,
        },
        opacity: { duration: 0.15, ease: [0.32, 0.72, 0, 1] },
      }}
      style={{ overflow: 'hidden' }}
    >
      {children}
    </motion.div>
  </CollapsiblePrimitive.CollapsibleContent>
));

CollapsibleContent.displayName = 'CollapsibleContent';

export { Collapsible, CollapsibleContent, CollapsibleTrigger };

