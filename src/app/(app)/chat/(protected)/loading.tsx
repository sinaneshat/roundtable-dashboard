/**
 * Generic loading state for /chat/(protected) layout
 *
 * This shows while the layout's requireAuth() is running.
 * Keep it minimal - child routes have their own specific loading states.
 * Don't show overview-specific content here since this loads for ALL child routes.
 */
export default function ChatLayoutLoading() {
  return (
    <div className="flex flex-col relative flex-1 min-h-dvh">
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          {/* Simple pulsing dots - works for any child route */}
          <div className="flex items-center gap-1.5">
            <div className="size-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="size-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '150ms' }} />
            <div className="size-2 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
