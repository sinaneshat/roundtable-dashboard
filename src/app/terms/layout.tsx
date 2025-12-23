import type React from 'react';

import AuthLayout from '@/components/layouts/auth-layout';

type TermsLayoutProps = {
  children: React.ReactNode;
};

export default async function TermsLayout({ children }: TermsLayoutProps) {
  return <AuthLayout>{children}</AuthLayout>;
}
