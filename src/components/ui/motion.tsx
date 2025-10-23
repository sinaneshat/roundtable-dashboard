'use client';

import { motion, type HTMLMotionProps, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

// Subtle animation variants
const defaultFadeIn: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 }
};

const defaultScaleIn: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 }
};

const defaultSlideIn: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 8 }
};

const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
  }
};

// Base motion component props
interface MotionComponentProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
}

// FadeIn Component
export function FadeIn({ 
  children, 
  className, 
  delay = 0, 
  duration = 0.2,
  variants = defaultFadeIn,
  ...props 
}: MotionComponentProps & { variants?: Variants }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ 
        duration, 
        delay,
        ease: [0.25, 0.1, 0.25, 1]
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ScaleIn Component
export function ScaleIn({ 
  children, 
  className, 
  delay = 0, 
  duration = 0.2,
  variants = defaultScaleIn,
  ...props 
}: MotionComponentProps & { variants?: Variants }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ 
        duration, 
        delay,
        ease: [0.25, 0.1, 0.25, 1]
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// SlideIn Component
export function SlideIn({ 
  children, 
  className, 
  delay = 0, 
  duration = 0.2,
  variants = defaultSlideIn,
  ...props 
}: MotionComponentProps & { variants?: Variants }) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{ 
        duration, 
        delay,
        ease: [0.25, 0.1, 0.25, 1]
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// StaggerContainer Component
export function StaggerContainer({ 
  children, 
  className,
  staggerDelay = 0.1,
  delayChildren = 0.1,
  ...props 
}: MotionComponentProps & { 
  staggerDelay?: number;
  delayChildren?: number;
}) {
  const containerVariants: Variants = {
    initial: {},
    animate: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren
      }
    }
  };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={containerVariants}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// StaggerItem Component
export function StaggerItem({ 
  children, 
  className,
  variants = staggerItem,
  ...props 
}: MotionComponentProps & { variants?: Variants }) {
  return (
    <motion.div
      variants={variants}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// Simple wrapper without hover effects - for initial load only
export function SimpleMotion({ 
  children, 
  className,
  delay: _delay,
  duration: _duration,
  ...props 
}: MotionComponentProps) {
  return (
    <div
      className={cn(className)}
      {...(props as React.HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </div>
  );
}

// Page transition wrapper
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <FadeIn 
      className={cn('h-full', className)}
      duration={0.2}
    >
      {children}
    </FadeIn>
  );
}