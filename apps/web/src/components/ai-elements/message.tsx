import type { UIMessage } from 'ai';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import type { ComponentProps, HTMLAttributes } from 'react';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { cn } from '@/lib/ui/cn';

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage['role'];
};

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={cn(
        'group flex w-full items-end gap-2',
        className,
      )}
      {...props}
    />
  );
}

const messageContentVariants = cva(
  'is-user:dark w-full flex flex-col gap-2 text-sm',
  {
    variants: {
      variant: {
        contained: [
          'max-w-[80%] px-4 py-3',
          'group-[.is-user]:text-foreground',
          'group-[.is-assistant]:text-foreground',
        ],
        flat: [
          'group-[.is-user]:max-w-[80%] group-[.is-user]:text-foreground',
          'group-[.is-assistant]:flex-1 group-[.is-assistant]:min-w-0 group-[.is-assistant]:w-full group-[.is-assistant]:text-foreground',
        ],
      },
    },
    defaultVariants: {
      variant: 'contained',
    },
  },
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>
  & VariantProps<typeof messageContentVariants>;

export function MessageContent({
  children,
  className,
  variant,
  ...props
}: MessageContentProps) {
  return (
    <div
      className={cn(messageContentVariants({ variant, className }))}
      {...props}
    >
      {children}
    </div>
  );
}

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src: string;
  name?: string;
};

export function MessageAvatar({
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) {
  return (
    <Avatar className={cn('size-8', className)} {...props}>
      <AvatarImage alt={name ? `${name} avatar` : 'User avatar'} className="mt-0 mb-0" src={src} />
      <AvatarFallback>{name?.slice(0, 2) || 'ME'}</AvatarFallback>
    </Avatar>
  );
}
