'use client';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslations } from '@/lib/i18n';

type LimitReachedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'project' | 'thread';
  max: number;
};

export function LimitReachedDialog({
  open,
  onOpenChange,
  type,
  max,
}: LimitReachedDialogProps) {
  const t = useTranslations();

  const title = type === 'project'
    ? t('projects.limitReached')
    : t('projects.threadLimitReached');

  const description = type === 'project'
    ? t('projects.limitReachedDescription', { max })
    : t('projects.threadLimitReachedDescription', { max });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.alertCircle className="size-5 text-muted-foreground" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        </DialogBody>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
