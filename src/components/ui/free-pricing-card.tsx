'use client';

import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/ui/cn';

interface FreePricingCardProps {
  name: string;
  description?: string | null;
  price: {
    amount: number;
    currency: string;
    interval: 'month' | 'year';
  };
  features?: string[] | null;
  className?: string;
  delay?: number;
}

export function FreePricingCard({
  name,
  description,
  price,
  features,
  className,
  delay = 0,
}: FreePricingCardProps) {
  const t = useTranslations('pricing.free');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn('relative h-full', className)}
    >
      {/* Always Active Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: delay + 0.2, duration: 0.3 }}
        className="absolute -top-3 left-1/2 z-20 -translate-x-1/2"
      >
        <div className="whitespace-nowrap rounded-full bg-gradient-to-r from-emerald-500 to-green-600 px-3 py-1 text-xs font-medium text-white shadow-lg shadow-emerald-500/30">
          {t('alwaysActive')}
        </div>
      </motion.div>

      <div className="relative h-full rounded-2xl border-2 border-emerald-500/40 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50/50 via-green-50/30 to-emerald-100/50 p-2 shadow-xl shadow-emerald-500/20 dark:from-emerald-950/20 dark:via-green-950/10 dark:to-emerald-900/20 md:rounded-3xl md:p-3">
        {/* Subtle glow effect for luxury feel */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400/5 via-transparent to-green-500/5 md:rounded-3xl" />

        <div className="relative flex h-full flex-col overflow-hidden rounded-xl border-2 border-emerald-500/30 dark:border-emerald-500/20 bg-white/80 p-6 backdrop-blur-sm dark:bg-gray-950/80 dark:shadow-[0px_0px_27px_0px_rgba(16,185,129,0.15)]">
          {/* Card Content */}
          <div className="relative flex flex-1 flex-col gap-6">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.1, duration: 0.4 }}
              className="space-y-2"
            >
              <h3 className="bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-2xl font-semibold tracking-tight text-transparent dark:from-emerald-400 dark:to-green-400">
                {name}
              </h3>
              {description && (
                <p className="text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </motion.div>

            {/* Pricing */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: delay + 0.2, duration: 0.4 }}
              className="space-y-2"
            >
              <div className="flex items-baseline gap-1">
                <span className="bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-4xl font-bold tracking-tight text-transparent dark:from-emerald-400 dark:to-green-400">
                  {price.currency.toUpperCase()}
                  {' '}
                  {(price.amount / 100).toFixed(2)}
                </span>
                <span className="text-sm text-muted-foreground">
                  /
                  {price.interval}
                </span>
              </div>
            </motion.div>

            {/* Features */}
            {features && features.length > 0 && (
              <motion.ul
                initial="hidden"
                animate="show"
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: {
                      staggerChildren: 0.05,
                      delayChildren: delay + 0.3,
                    },
                  },
                }}
                className="flex-1 space-y-3"
              >
                {features.map((feature, idx) => (
                  <motion.li
                    key={idx}
                    variants={{
                      hidden: { opacity: 0, x: -10 },
                      show: { opacity: 1, x: 0 },
                    }}
                    transition={{
                      type: 'spring',
                      stiffness: 500,
                      damping: 40,
                    }}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-0.5 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 p-1">
                      <Check className="size-3.5 text-white" />
                    </div>
                    <span className="flex-1 text-sm text-muted-foreground">
                      {feature}
                    </span>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
