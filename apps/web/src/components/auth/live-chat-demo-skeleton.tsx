import { MessageCardSkeleton } from '@/components/skeletons';

/**
 * LiveChatDemoSkeleton - Loading skeleton for LiveChatDemo component
 *
 * Uses the shared MessageCardSkeleton to ensure consistency with actual chat views.
 * Shows 1 user message + 3 assistant messages to match demo content.
 */
export function LiveChatDemoSkeleton() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="w-full px-6 py-6 space-y-8">
        {/* User message */}
        <MessageCardSkeleton variant="user" />

        {/* 3 participant responses */}
        <MessageCardSkeleton variant="assistant" />
        <MessageCardSkeleton variant="assistant" />
        <MessageCardSkeleton variant="assistant" />
      </div>
    </div>
  );
}
