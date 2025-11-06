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
        'group flex w-full items-end justify-end gap-2 py-4',
        from === 'user' ? 'is-user' : 'is-assistant flex-row-reverse justify-end',
        className,
      )}
      {...props}
    />
  );
}

const messageContentVariants = cva(
  'is-user:dark flex flex-col gap-2 overflow-hidden rounded-2xl text-sm',
  {
    variants: {
      variant: {
        contained: [
          'max-w-[80%] px-4 py-3',
          // Glass-like design for user messages matching assistant message styling
          'group-[.is-user]:backdrop-blur-xl group-[.is-user]:bg-background/10 group-[.is-user]:text-foreground group-[.is-user]:border group-[.is-user]:border-white/20 group-[.is-user]:shadow-2xl',
          'group-[.is-assistant]:backdrop-blur-2xl group-[.is-assistant]:text-foreground group-[.is-assistant]:shadow-2xl',
        ],
        flat: [
          // Consolidated: Use same glass design as contained variant for consistency
          'group-[.is-user]:max-w-[80%] group-[.is-user]:backdrop-blur-xl group-[.is-user]:bg-background/10 group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground group-[.is-user]:border group-[.is-user]:border-white/20 group-[.is-user]:shadow-2xl',
          'group-[.is-assistant]:text-foreground',
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
    <Avatar className={cn('size-8 ring-1 ring-border', className)} {...props}>
      <AvatarImage alt="" className="mt-0 mb-0" src={src} />
      <AvatarFallback>{name?.slice(0, 2) || 'ME'}</AvatarFallback>
    </Avatar>
  );
}
