import { DropdownMenuVariants } from '@roundtable/shared';

import { Icons } from '@/components/icons';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

type ChatThreadMenuItemsProps = {
  onRename?: () => void;
  onPin: () => void;
  onShare?: () => void;
  onDelete?: () => void;
  isFavorite: boolean;
  isPinPending?: boolean;
};

export function ChatThreadMenuItems({
  onRename,
  onPin,
  onShare,
  onDelete,
  isFavorite,
  isPinPending = false,
}: ChatThreadMenuItemsProps) {
  const t = useTranslations();

  return (
    <>
      <DropdownMenuItem
        onClick={onPin}
        disabled={isPinPending}
        className={cn(isFavorite && 'text-primary')}
      >
        {isPinPending
          ? <Icons.loader className="size-4 animate-spin" />
          : <Icons.pin className={cn('size-4', isFavorite && 'fill-current')} />}
        {isFavorite
          ? t('chat.unpin')
          : t('chat.pin')}
      </DropdownMenuItem>
      {onRename && (
        <DropdownMenuItem onClick={onRename}>
          <Icons.pencil className="size-4" />
          {t('chat.rename')}
        </DropdownMenuItem>
      )}
      {onShare && (
        <DropdownMenuItem onClick={onShare}>
          <Icons.share className="size-4" />
          {t('chat.share')}
        </DropdownMenuItem>
      )}
      {onDelete && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant={DropdownMenuVariants.DESTRUCTIVE} onClick={onDelete}>
            <Icons.trash className="size-4" />
            {t('chat.deleteThread')}
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
