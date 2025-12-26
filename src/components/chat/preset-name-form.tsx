'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toastManager } from '@/lib/toast';

type PresetNameFormProps = {
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
};

export const PresetNameForm = memo(({
  onSubmit,
  onCancel,
  isPending,
}: PresetNameFormProps) => {
  const tModels = useTranslations('chat.models');
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toastManager.error(tModels('presets.cannotSave'), tModels('presets.nameRequired'));
      return;
    }
    await onSubmit(trimmedName);
    setName('');
  };

  const handleCancel = () => {
    setName('');
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isPending) {
      handleCancel();
    }
  };

  // Focus input when mounted
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2"
    >
      <Input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder={tModels('presets.namePlaceholder')}
        disabled={isPending}
        className="h-8 w-28 sm:w-40 text-sm"
        onKeyDown={handleKeyDown}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleCancel}
        disabled={isPending}
        className="text-xs sm:text-sm shrink-0 px-2 sm:px-3"
      >
        {tModels('presets.cancel')}
      </Button>
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={isPending}
        className="text-xs sm:text-sm shrink-0 px-2 sm:px-3"
      >
        {isPending
          ? <Loader2 className="size-3 sm:size-3.5 animate-spin" />
          : tModels('presets.save')}
      </Button>
    </form>
  );
});

PresetNameForm.displayName = 'PresetNameForm';
