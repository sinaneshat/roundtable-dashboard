'use client';

import {
  BarChart3,
  Lightbulb,
  Search,
  Wrench,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

type RoleInfo = {
  icon: React.ReactNode;
  name: string;
  description: string;
  color: string;
};

/**
 * AboutFrameworkSection - Multi-AI Deliberation Framework
 *
 * Static section explaining how the framework works with:
 * - Main description
 * - Role descriptions (Analyst, Innovator, Skeptic, Builder)
 * - Confidence score explanation
 */
export function AboutFrameworkSection() {
  const t = useTranslations('moderator');

  const roles: RoleInfo[] = [
    {
      icon: <BarChart3 className="size-4" />,
      name: t('aboutFramework.roles.analyst.name'),
      description: t('aboutFramework.roles.analyst.description'),
      color: 'text-emerald-500',
    },
    {
      icon: <Lightbulb className="size-4" />,
      name: t('aboutFramework.roles.innovator.name'),
      description: t('aboutFramework.roles.innovator.description'),
      color: 'text-amber-500',
    },
    {
      icon: <Search className="size-4" />,
      name: t('aboutFramework.roles.skeptic.name'),
      description: t('aboutFramework.roles.skeptic.description'),
      color: 'text-orange-500',
    },
    {
      icon: <Wrench className="size-4" />,
      name: t('aboutFramework.roles.builder.name'),
      description: t('aboutFramework.roles.builder.description'),
      color: 'text-blue-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Section Subtitle */}
      <p className="text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-3">
        {t('aboutFramework.subtitle')}
      </p>

      {/* Main Description */}
      <p className="text-sm text-foreground/80 leading-relaxed">
        {t('aboutFramework.description')}
      </p>

      {/* How It Works */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('aboutFramework.howItWorks')}
        </h4>

        <div className="grid gap-2 sm:grid-cols-2">
          {roles.map(role => (
            <div
              key={role.name}
              className="flex items-start gap-2 py-2"
            >
              <span className={role.color}>{role.icon}</span>
              <div className="space-y-0.5">
                <p className={`text-sm font-medium ${role.color}`}>{role.name}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {role.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confidence Score Explanation */}
      <p className="text-sm text-muted-foreground italic">
        {t('aboutFramework.confidenceExplanation')}
      </p>
    </div>
  );
}
