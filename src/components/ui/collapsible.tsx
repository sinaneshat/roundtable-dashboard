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
      layout
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      onAnimationComplete={onAnimationComplete}
      transition={{
        height: {
          type: 'spring',
          stiffness: 500,
          damping: 40,
        },
        opacity: { duration: 0.15, ease: [0.32, 0.72, 0, 1] },
        layout: {
          type: 'spring',
          stiffness: 500,
          damping: 40,
        },
      }}
      style={{ overflow: 'hidden' }}
    >
      <motion.div layout>
        {children}
      </motion.div>
    </motion.div>
  </CollapsiblePrimitive.CollapsibleContent>
));

CollapsibleContent.displayName = 'CollapsibleContent';

export { Collapsible, CollapsibleContent, CollapsibleTrigger };

