import type { ConfirmationDialogVariant } from '@roundtable/shared';
import { ConfirmationDialogVariants } from '@roundtable/shared';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/ui/cn';

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Optional icon to display beside the title (horizontal layout) */
  icon?: ReactNode;
  /** Confirm button text */
  confirmText: string;
  /** Confirm button text when loading */
  confirmingText?: string;
  /** Cancel button text */
  cancelText: string;
  /** Whether the action is in progress */
  isLoading?: boolean;
  /** Visual variant for the confirm button */
  variant?: ConfirmationDialogVariant;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Optional callback when user cancels */
  onCancel?: () => void;
  /** Optional custom content to render in the dialog body */
  children?: ReactNode;
};

const variantStyles: Record<ConfirmationDialogVariant, string> = {
  [ConfirmationDialogVariants.DEFAULT]: 'bg-primary text-primary-foreground hover:bg-primary/90',
  [ConfirmationDialogVariants.DESTRUCTIVE]: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  [ConfirmationDialogVariants.WARNING]: 'bg-amber-600 text-white hover:bg-amber-700',
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  confirmText,
  confirmingText,
  cancelText,
  isLoading = false,
  variant = ConfirmationDialogVariants.DEFAULT,
  onConfirm,
  onCancel,
  children,
}: ConfirmationDialogProps) {
  const handleCancel = () => {
    if (isLoading)
      return;
    onCancel?.();
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isLoading && !newOpen)
      return;
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!isLoading}>
        <DialogHeader>
          {icon
            ? (
                <div className="flex items-start gap-3">
                  {icon}
                  <div className="flex-1">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="mt-2">
                      {description}
                    </DialogDescription>
                  </div>
                </div>
              )
            : (
                <>
                  <DialogTitle>{title}</DialogTitle>
                  <DialogDescription>
                    {description}
                  </DialogDescription>
                </>
              )}
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            loading={isLoading}
            loadingText={confirmingText}
            className={cn(variantStyles[variant])}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
