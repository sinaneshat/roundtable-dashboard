import { Icons } from '@/components/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTranslations } from '@/lib/compat';

export type DeleteAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isProcessing?: boolean;
};

export function DeleteAccountDialog({
  open,
  onOpenChange,
  onConfirm,
  isProcessing = false,
}: DeleteAccountDialogProps) {
  const t = useTranslations();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
              <Icons.trash className="size-5 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl">
              {t('deleteAccount.title')}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              {t('deleteAccount.description')}
            </p>

            <div className="rounded-lg border border-destructive/20 p-4 shadow-lg bg-card">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Icons.x className="size-4 mt-0.5 shrink-0 text-destructive" />
                  <span>{t('deleteAccount.dataList.threads')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icons.x className="size-4 mt-0.5 shrink-0 text-destructive" />
                  <span>{t('deleteAccount.dataList.projects')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icons.x className="size-4 mt-0.5 shrink-0 text-destructive" />
                  <span>{t('deleteAccount.dataList.billing')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icons.x className="size-4 mt-0.5 shrink-0 text-destructive" />
                  <span>{t('deleteAccount.dataList.settings')}</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <Icons.alertCircle className="size-4 text-destructive shrink-0" />
              <p className="text-sm font-medium text-destructive">
                {t('deleteAccount.warning')}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isProcessing}>
            {t('deleteAccount.cancelButton')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isProcessing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isProcessing
              ? (
                  <>
                    <Icons.loader className="size-4 animate-spin mr-2" />
                    {t('pricing.card.processing')}
                  </>
                )
              : (
                  t('deleteAccount.confirmButton')
                )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
