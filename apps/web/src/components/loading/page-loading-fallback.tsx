import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/ui/cn';

type PageLoadingFallbackProps = {
  text?: string;
  className?: string;
};

export function PageLoadingFallback({ className, text }: PageLoadingFallbackProps) {
  return (
    <div className={cn('flex items-center justify-center min-h-screen bg-background', className)}>
      <LoadingSpinner size="md" text={text} />
    </div>
  );
}
