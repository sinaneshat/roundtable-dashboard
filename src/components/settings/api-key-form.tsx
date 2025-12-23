/**
 * API Key Form Component
 *
 * ✅ REUSES: API route schema from @/api/routes/api-keys/schema
 * Form for creating new API keys using RHF patterns
 * Following patterns from other forms in @/components/forms/
 */

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { CreateApiKeyRequestSchema } from '@/api/routes/api-keys/schema';
import FormProvider from '@/components/forms/form-provider';
import RHFSelect from '@/components/forms/rhf-select';
import RHFTextField from '@/components/forms/rhf-text-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateApiKeyMutation } from '@/hooks';
import { useBoolean } from '@/hooks/utils';
import { showApiErrorToast } from '@/lib/toast';

type ApiKeyFormProps = {
  onCreated: () => void;
};

// ============================================================================
// Form Schema (Reusing API Schema)
// ============================================================================

/**
 * ✅ REUSE: API schema for creating API keys
 * Extends with frontend-specific field transformation (expiresIn as string for select input)
 */
const formSchema = CreateApiKeyRequestSchema.omit({ expiresIn: true }).extend({
  expiresIn: z.string().optional(), // Stored as string in form, converted to number on submit
});

type FormValues = z.infer<typeof formSchema>;

// ============================================================================
// Component
// ============================================================================

export function ApiKeyForm({ onCreated, currentKeyCount = 0 }: ApiKeyFormProps & { currentKeyCount?: number }) {
  const t = useTranslations();
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const copied = useBoolean(false);
  const createMutation = useCreateApiKeyMutation();

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      expiresIn: 'never',
    },
  });

  const { handleSubmit, reset } = methods;

  // Check if user has reached the maximum number of API keys (5)
  const hasReachedLimit = currentKeyCount >= 5;

  const expirationOptions = [
    { label: t('apiKeys.form.expiresIn.never'), value: 'never' },
    { label: t('apiKeys.form.expiresIn.7days'), value: '7' },
    { label: t('apiKeys.form.expiresIn.30days'), value: '30' },
    { label: t('apiKeys.form.expiresIn.90days'), value: '90' },
    { label: t('apiKeys.form.expiresIn.180days'), value: '180' },
    { label: t('apiKeys.form.expiresIn.365days'), value: '365' },
  ];

  const onSubmit = async (values: FormValues) => {
    setCreatedKey(null);
    copied.onFalse();

    try {
      const expiresInDays = values.expiresIn && values.expiresIn !== 'never'
        ? Number.parseInt(values.expiresIn, 10)
        : undefined;

      const result = await createMutation.mutateAsync({
        json: {
          name: values.name,
          expiresIn: expiresInDays,
        },
      });

      // Check if successful
      if (result.success && result.data?.apiKey) {
        setCreatedKey(result.data.apiKey.key);
        // Success is obvious from the success UI showing the key - no toast needed
        // Don't reset form or call onCreated() yet - let user see and copy the key first
      }
    } catch (error) {
      showApiErrorToast('Failed to create API key', error);
    }
  };

  const handleDone = () => {
    setCreatedKey(null);
    copied.onFalse();
    reset();
    onCreated();
  };

  const handleCopy = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
      copied.onTrue();
      // Success is obvious from the button changing to "Copied" - no toast needed
      setTimeout(() => copied.onFalse(), 2000);
    }
  };

  // If key was created, show success state with the key
  if (createdKey) {
    return (
      <div className="grid gap-6 py-4">
        <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
          <div className="flex items-start gap-3">
            <Check className="mt-0.5 size-5 text-green-600 dark:text-green-400" />
            <div className="flex-1">
              <h3 className="font-semibold text-green-900 dark:text-green-100">
                {t('apiKeys.form.successTitle')}
              </h3>
              <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                {t('apiKeys.form.successMessage')}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <Label htmlFor="created-api-key" className="text-base font-semibold">
            {t('apiKeys.form.generatedKeyLabel')}
          </Label>
          <div className="flex gap-2">
            <Input
              id="created-api-key"
              type="text"
              readOnly
              value={createdKey}
              className="flex-1 font-mono text-sm"
            />
            <Button
              type="button"
              onClick={handleCopy}
              variant="secondary"
              size="default"
              className="shrink-0"
            >
              {copied.value
                ? (
                    <>
                      <Check className="mr-2 size-4" />
                      {t('apiKeys.form.copied')}
                    </>
                  )
                : (
                    <>
                      <Copy className="mr-2 size-4" />
                      {t('apiKeys.form.copyButton')}
                    </>
                  )}
            </Button>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              ⚠️
              {' '}
              {t('apiKeys.form.copyWarning')}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            onClick={handleDone}
            className="flex-1"
            variant="default"
          >
            {t('apiKeys.form.doneButton')}
          </Button>
        </div>
      </div>
    );
  }

  // If user has reached the limit, show a warning
  if (hasReachedLimit) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-6 text-center">
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          {t('apiKeys.form.limitReached.title')}
        </p>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
          {t('apiKeys.form.limitReached.description')}
        </p>
      </div>
    );
  }

  return (
    <FormProvider methods={methods} onSubmit={handleSubmit(onSubmit)}>
      <div className="grid gap-4 py-4">
        <RHFTextField
          name="name"
          title={t('apiKeys.form.nameLabel')}
          placeholder={t('apiKeys.form.namePlaceholder')}
          description={t('apiKeys.form.nameDescription')}
          required
        />
        <RHFSelect
          name="expiresIn"
          title={t('apiKeys.form.expiresInLabel')}
          options={expirationOptions}
          placeholder={t('apiKeys.form.expiresInPlaceholder')}
          description={t('apiKeys.form.expiresInDescription')}
        />

        <Button
          type="submit"
          className="w-full"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {t('apiKeys.form.createButton')}
        </Button>
      </div>
    </FormProvider>
  );
}
