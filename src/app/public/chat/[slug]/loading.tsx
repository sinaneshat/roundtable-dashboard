'use client';

import { Skeleton } from '@/components/ui/skeleton';

export default function PublicChatThreadLoading() {
  return (
    <div className="relative flex flex-1 flex-col min-h-0 h-full">
      <div className="flex flex-col min-h-screen relative">
        <div
          id="public-chat-scroll-container"
          className="container max-w-4xl mx-auto px-5 md:px-6 pt-16 sm:pt-20 pb-16 flex-1"
        >
          <div className="mb-4 flex justify-end">
            <div className="max-w-[80%]">
              <div className="flex items-center gap-3 py-2 mb-2 flex-row-reverse">
                <Skeleton className="size-8 rounded-full bg-white/15" />
                <Skeleton className="h-5 w-24 bg-white/20" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full bg-white/15" />
                <Skeleton className="h-4 w-3/4 bg-white/15" />
              </div>
            </div>
          </div>

          {[0, 1].map(i => (
            <div key={i} className="mb-4 flex justify-start">
              <div className="max-w-[85%]">
                <div className="flex items-center gap-3 py-2 mb-2">
                  <Skeleton className="size-8 rounded-full bg-white/15" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-32 bg-white/20" />
                    <Skeleton className="h-4 w-20 bg-white/15" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full bg-white/10" />
                  <Skeleton className="h-4 w-full bg-white/10" />
                  <Skeleton className="h-4 w-5/6 bg-white/10" />
                </div>
              </div>
            </div>
          ))}

          <div className="mt-12 sm:mt-16 mb-6 sm:mb-8">
            <div className="rounded-2xl sm:rounded-xl border bg-gradient-to-br from-primary/5 via-primary/3 to-background p-6 sm:p-8 md:p-10 text-center space-y-4 sm:space-y-6">
              <Skeleton className="size-12 sm:size-14 rounded-full bg-primary/10 mx-auto" />
              <div className="space-y-2 sm:space-y-3">
                <Skeleton className="h-8 sm:h-10 w-64 sm:w-80 mx-auto bg-white/15" />
                <Skeleton className="h-5 w-80 sm:w-96 mx-auto bg-white/10" />
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 sm:pt-4">
                <Skeleton className="h-10 w-full sm:w-32 bg-primary/20" />
                <Skeleton className="h-10 w-full sm:w-32 bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
