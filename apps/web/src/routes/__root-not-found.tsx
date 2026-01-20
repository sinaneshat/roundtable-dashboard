import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';

export function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4 sm:p-8">
      <div className="w-full max-w-2xl text-center">
        <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-6 sm:p-10 shadow-xl">
          <div className="flex flex-col items-center">
            <div className="rounded-full bg-muted/30 p-4 mb-6">
              <Icons.fileQuestion className="size-12 text-muted-foreground" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">Page Not Found</h1>
            <p className="text-muted-foreground text-base sm:text-lg mb-8 max-w-md">
              The page you're looking for doesn't exist or has been moved.
            </p>
            <Button
              size="lg"
              onClick={() => (window.location.href = '/')}
              startIcon={<Icons.home className="size-4" />}
            >
              Go Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
