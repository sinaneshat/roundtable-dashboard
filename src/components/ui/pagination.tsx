import type { ComponentProps } from 'react';
import { forwardRef } from 'react';

import type { VariantProps } from "class-variance-authority";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/ui/cn";

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

const Pagination = ({ className, ...props }: ComponentProps<"nav">) => {
  const t = useTranslations();
  return (
    <nav
      role="navigation"
      aria-label={t('accessibility.pagination')}
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
};
Pagination.displayName = "Pagination";

const PaginationContent = forwardRef<
  HTMLUListElement,
  ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
));
PaginationContent.displayName = "PaginationContent";

const PaginationItem = forwardRef<
  HTMLLIElement,
  ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<ButtonProps, "size"> &
  ComponentProps<"a">;

const PaginationLink = ({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) => (
  <a
    aria-current={isActive ? "page" : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? "outline" : "ghost",
        size,
      }),
      className
    )}
    {...props}
  />
);
PaginationLink.displayName = "PaginationLink";

const PaginationPrevious = ({
  className,
  ...props
}: ComponentProps<typeof PaginationLink>) => {
  const t = useTranslations();
  return (
    <PaginationLink
      aria-label={t('accessibility.previousPage')}
      size="default"
      className={cn("gap-1 ps-2.5", className)}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{t('actions.previous')}</span>
    </PaginationLink>
  );
};
PaginationPrevious.displayName = "PaginationPrevious";

const PaginationNext = ({
  className,
  ...props
}: ComponentProps<typeof PaginationLink>) => {
  const t = useTranslations();
  return (
    <PaginationLink
      aria-label={t('accessibility.nextPage')}
      size="default"
      className={cn("gap-1 pe-2.5", className)}
      {...props}
    >
      <span>{t('actions.next')}</span>
      <ChevronRight className="h-4 w-4" />
    </PaginationLink>
  );
};
PaginationNext.displayName = "PaginationNext";

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<"span">) => {
  const t = useTranslations();
  return (
    <span
      aria-hidden
      className={cn("flex h-9 w-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">{t('accessibility.morePages', { default: 'More pages' })}</span>
    </span>
  );
};
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
};

