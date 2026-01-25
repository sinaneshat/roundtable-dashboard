import type { ReactNode } from 'react';

export type NavigationHeaderProps = {
  className?: string;
  threadTitle?: string;
  threadActions?: ReactNode;
  showSidebarTrigger?: boolean;
  showLogo?: boolean;
  maxWidth?: boolean;
  showScrollButton?: boolean;
};

export type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  showSeparator?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export type ChatPageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};
