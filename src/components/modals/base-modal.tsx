import type { ReactNode } from 'react';

import type { ComponentSize } from '@/api/core/enums';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/ui/cn';

type ModalSize = Extract<ComponentSize, 'sm' | 'md' | 'lg'> | 'xl' | 'full';

type BaseModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  className?: string;
  preventScroll?: boolean;
  useScrollArea?: boolean;
  scrollAreaHeight?: string;
};

const sizeClasses: Record<ModalSize, string> = {
  sm: '', // Inline styles used instead
  md: '', // Inline styles used instead
  lg: '', // Inline styles used instead
  xl: '', // Inline styles used instead
  full: '', // Inline styles used instead
};

const sizeStyles: Record<ModalSize, React.CSSProperties> = {
  sm: { width: '90vw', minWidth: '320px', maxWidth: '384px' }, // Small - Simple forms
  md: { width: '90vw', minWidth: '320px', maxWidth: '448px' }, // Medium - Default
  lg: { width: '90vw', minWidth: '320px', maxWidth: '672px' }, // Large - Complex content
  xl: { width: '95vw', minWidth: '320px', maxWidth: '896px' }, // Extra Large - Pricing tables
  full: { width: '95vw', minWidth: '320px', maxWidth: '1152px' }, // Full - Maximum width
};

/**
 * Base Modal Component
 *
 * Reusable modal wrapper following shadcn/ui Dialog patterns
 * Provides consistent sizing, scrolling, and layout behavior
 *
 * @param props - Component props
 * @param props.open - Controls modal visibility
 * @param props.onOpenChange - Callback when modal visibility changes
 * @param props.title - Modal title (required for accessibility)
 * @param props.description - Optional modal description
 * @param props.children - Modal content
 * @param props.footer - Optional footer content
 * @param props.size - Modal size variant (sm, md, lg, xl, full)
 * @param props.className - Additional CSS classes
 * @param props.preventScroll - Disable scrolling if content is guaranteed to fit
 * @param props.useScrollArea - Use SHADCN ScrollArea instead of native scroll (follows model-selection-modal.tsx:266 pattern)
 * @param props.scrollAreaHeight - Custom height for ScrollArea (e.g., "500px", "60vh")
 */
export function BaseModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  preventScroll = false,
  useScrollArea = false,
  scrollAreaHeight = '500px',
}: BaseModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        glass={true}
        className={cn(
          sizeClasses[size],
          'rounded-2xl',
          (useScrollArea || !preventScroll) && 'overflow-hidden flex flex-col p-0',
          className,
        )}
        style={{
          ...sizeStyles[size],
          maxHeight: '85vh',
        }}
      >
        {/* Fixed Header */}
        <DialogHeader className={cn((useScrollArea || !preventScroll) && 'px-6 pt-6 pb-4 shrink-0 bg-black/50 backdrop-blur-lg')}>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {/* Content area - ScrollArea or native scroll */}
        {useScrollArea
          ? (
              <ScrollArea className={cn('border-t border-white/10 bg-black/50 backdrop-blur-lg')} style={{ height: scrollAreaHeight }}>
                <div className="px-6 py-4">
                  {children}
                </div>
              </ScrollArea>
            )
          : (
              <div
                className={cn(
                  'flex-1 bg-black/50 backdrop-blur-lg',
                  !preventScroll && 'overflow-y-auto px-6',
                  preventScroll && 'px-6',
                )}
              >
                {children}
              </div>
            )}

        {/* Fixed footer */}
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0 bg-black/50 backdrop-blur-lg">
            {footer}
          </div>
        )}

        {!preventScroll && !footer && !useScrollArea && <div className="pb-6" />}
      </DialogContent>
    </Dialog>
  );
}
