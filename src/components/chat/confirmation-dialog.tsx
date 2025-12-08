'use client';

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

export type ConfirmationDialogVariant = 'default' | 'destructive' | 'warning';

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
};

const variantStyles: Record<ConfirmationDialogVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  warning: 'bg-amber-600 text-white hover:bg-amber-700',
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
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          {icon
            ? (
                <div className="flex items-center gap-3">
                  {icon}
                  <div className="flex-1">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="mt-1">
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
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(variantStyles[variant])}
          >
            {isLoading && confirmingText ? confirmingText : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
