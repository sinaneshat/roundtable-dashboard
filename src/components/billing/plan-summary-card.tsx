'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type PlanStat = {
  label: string;
  value: number | string;
};

type PlanSummaryCardProps = {
  tierName: string;
  description?: string;
  status?: string;
  stats: PlanStat[];
  activeUntil?: string;
};

export function PlanSummaryCard({
  tierName,
  description,
  status,
  stats,
  activeUntil,
}: PlanSummaryCardProps) {
  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{tierName}</CardTitle>
          {status && (
            <span className="text-xs font-medium text-green-600 capitalize shrink-0">
              {status}
            </span>
          )}
        </div>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {stats.map(stat => (
            <div key={stat.label} className="space-y-1">
              <p className="text-lg font-semibold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
        {activeUntil && (
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Active until
            {' '}
            {activeUntil}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
