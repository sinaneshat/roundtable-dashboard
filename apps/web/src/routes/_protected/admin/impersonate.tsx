'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { RHFTextField } from '@/components/forms/rhf-text-field';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { useAdminSearchUserMutation } from '@/hooks';
import { useBoolean } from '@/hooks/utils';
import { authClient } from '@/lib/auth/client';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { useTranslations } from '@/lib/i18n';
import { showApiErrorToast } from '@/lib/toast';

export const Route = createFileRoute('/_protected/admin/impersonate')({
  component: ImpersonatePage,
});

const searchSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type SearchFormData = z.infer<typeof searchSchema>;

type FoundUser = {
  id: string;
  email: string;
  name: string;
  image: string | null;
};

function ImpersonatePage() {
  const t = useTranslations();
  const searchMutation = useAdminSearchUserMutation();
  const isImpersonating = useBoolean(false);
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);

  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchSchema),
    defaultValues: { email: '' },
  });

  const handleSearch = async (data: SearchFormData) => {
    setFoundUser(null);
    try {
      const result = await searchMutation.mutateAsync({
        query: { email: data.email },
      });

      if (result?.success && result.data) {
        setFoundUser(result.data);
      } else {
        form.setError('email', {
          type: 'manual',
          message: t('admin.impersonate.userNotFound'),
        });
      }
    } catch {
      form.setError('email', {
        type: 'manual',
        message: t('admin.impersonate.userNotFound'),
      });
    }
  };

  const handleImpersonate = async () => {
    if (!foundUser)
      return;

    isImpersonating.onTrue();
    try {
      await authClient.admin.impersonateUser({
        userId: foundUser.id,
      });
      // Full page refresh to clear all caches
      const baseUrl = getAppBaseUrl();
      window.location.href = `${baseUrl}/chat`;
    } catch (error) {
      showApiErrorToast('Impersonation Failed', error);
      isImpersonating.onFalse();
    }
  };

  const userInitials = foundUser?.name
    ? foundUser.name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
    : foundUser?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icons.userCog className="size-5" />
            {t('admin.impersonate.title')}
          </CardTitle>
          <CardDescription>
            {t('admin.impersonate.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSearch)}
              className="flex flex-col gap-4"
            >
              <RHFTextField
                name="email"
                title={t('admin.impersonate.emailLabel')}
                placeholder={t('admin.impersonate.emailPlaceholder')}
                fieldType="email"
                required
                disabled={searchMutation.isPending}
              />
              <Button
                type="submit"
                disabled={searchMutation.isPending}
                loading={searchMutation.isPending}
              >
                <Icons.search className="size-4 mr-2" />
                {t('admin.impersonate.searchButton')}
              </Button>
            </form>
          </Form>

          {foundUser && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={foundUser.image || undefined} alt={foundUser.name} />
                  <AvatarFallback>{userInitials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{foundUser.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{foundUser.email}</p>
                </div>
              </div>
              <Button
                className="w-full"
                variant="destructive"
                onClick={handleImpersonate}
                disabled={isImpersonating.value}
                loading={isImpersonating.value}
              >
                <Icons.userCheck className="size-4 mr-2" />
                {t('admin.impersonate.impersonateButton')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
