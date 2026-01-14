'use client';

import dynamic from 'next/dynamic';

import { Icons } from '@/components/icons';
import { cn } from '@/lib/ui/cn';

type VoiceVisualizationProps = {
  isActive: boolean;
  audioLevels?: number[];
  barCount?: number;
};

function VoiceVisualizationSkeleton() {
  return (
    <div className="overflow-hidden">
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-3',
          'border-0 border-b border-blue-500/20',
          'bg-blue-500/10 backdrop-blur-xl',
        )}
      >
        <div className="flex items-center gap-2 shrink-0">
          <Icons.mic className="size-3.5 text-blue-500 animate-pulse" />
          <span className="text-[10px] font-medium text-blue-500">
            Loading...
          </span>
        </div>
        <div className="flex items-center gap-[2px] flex-1 h-6 min-w-0">
          {Array.from({ length: 20 }, (_, i) => (
            <div
              key={`skeleton-bar-${i}`}
              className="flex-1 bg-blue-500/30 rounded-full min-w-[2px] h-[40%] animate-pulse"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const VoiceVisualizationInternal = dynamic<VoiceVisualizationProps>(
  () => import('@/components/chat/voice-visualization').then(m => ({
    default: m.VoiceVisualization,
  })),
  {
    ssr: false,
    loading: () => <VoiceVisualizationSkeleton />,
  },
);

export function VoiceVisualization(props: VoiceVisualizationProps) {
  // Only render if active
  if (!props.isActive) {
    return null;
  }

  return <VoiceVisualizationInternal {...props} />;
}
