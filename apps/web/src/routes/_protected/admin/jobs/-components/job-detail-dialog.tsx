import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { getJobStatusConfig } from '@/lib/ui/job-status-config';
import { getJobCompletedAt, getJobErrorMessage, getJobStartedAt } from '@/lib/utils/job-metadata';
import type { AutomatedJob } from '@/services/api';

type JobDetailDialogProps = {
  job: AutomatedJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function JobDetailDialog({ job, onOpenChange, open }: JobDetailDialogProps) {
  const t = useTranslations();

  if (!job) {
    return null;
  }

  const statusConfig = getJobStatusConfig(job.status);
  const errorMessage = getJobErrorMessage(job);
  const startedAt = getJobStartedAt(job);
  const completedAt = getJobCompletedAt(job);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant={statusConfig.variant} className="flex items-center gap-1">
              <statusConfig.icon className={cn('size-3', statusConfig.isAnimated && 'animate-spin')} />
              {job.status}
            </Badge>
            {t('admin.jobs.details')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prompt */}
          <div className="space-y-1.5">
            <Label>{t('admin.jobs.prompt')}</Label>
            <div className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
              {job.initialPrompt}
            </div>
          </div>

          {/* Rounds */}
          <div className="flex items-center gap-4">
            <Label className="shrink-0">{t('admin.jobs.rounds')}</Label>
            <span className="text-sm">
              {job.currentRound + 1}
              {' '}
              /
              {job.totalRounds}
            </span>
          </div>

          {/* Models */}
          {job.selectedModels && job.selectedModels.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('admin.jobs.models')}</Label>
              <div className="flex flex-wrap gap-1">
                {job.selectedModels.map((model: string) => (
                  <Badge key={model} variant="secondary">
                    {model.split('/')[1] ?? model}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">{t('admin.jobs.createdAt', { date: '' })}</span>
              <p>{new Date(job.createdAt).toLocaleString()}</p>
            </div>
            {startedAt && (
              <div>
                <span className="text-muted-foreground">{t('admin.jobs.startedAt')}</span>
                <p>{new Date(startedAt).toLocaleString()}</p>
              </div>
            )}
            {completedAt && (
              <div>
                <span className="text-muted-foreground">{t('admin.jobs.completedAt')}</span>
                <p>{new Date(completedAt).toLocaleString()}</p>
              </div>
            )}
          </div>

          {/* Error message */}
          {job.status === 'failed' && errorMessage && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive font-medium">{t('admin.jobs.error')}</p>
              <p className="text-sm mt-1">{errorMessage}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
