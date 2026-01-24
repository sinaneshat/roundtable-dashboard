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

type ProjectLimitDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  maxProjects: number;
};

export function ProjectLimitDialog({
  open,
  onOpenChange,
  maxProjects,
}: ProjectLimitDialogProps) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.alertCircle className="size-5 text-muted-foreground" />
            {t('projects.limitReached')}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
          <p className="text-sm text-muted-foreground">
            {t('projects.limitReachedDescription', { max: maxProjects })}
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
