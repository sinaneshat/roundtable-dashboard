'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/ui/cn';

/**
 * Liquid Glass Component
 *
 * Implements Apple's Liquid Glass effect with SVG distortion filters
 * Uses 4-layer architecture from official specifications:
 *
 * Layer 1: Distortion Filter (SVG feDisplacementMap)
 * Layer 2: Glass Overlay (Semi-transparent tint)
 * Layer 3: Specular Highlight (Light reflection/rim light)
 * Layer 4: Content Layer (Actual content)
 *
 * Based on official implementation:
 * https://dev.to/fabiosleal/how-to-create-the-apple-liquid-glass-effect-with-css-and-svg-2o06
 *
 * Browser Support: Chromium-based browsers only
 * (SVG filters as backdrop-filter not supported in Safari/Firefox)
 */

export type LiquidGlassProps = {
  /** Content to render inside glass container */
  children: ReactNode;
  /** Glass intensity variant */
  variant?: 'subtle' | 'medium' | 'strong';
  /** Additional className for the container */
  className?: string;
  /** Blur amount (20px default for Medium Glass preset) */
  blurAmount?: string;
  /** Background opacity (0-1) */
  opacity?: number;
  /** Border radius */
  rounded?: string;
  /** Enable specular highlight (rim light effect) */
  showSpecular?: boolean;
};

export function LiquidGlass({
  children,
  variant = 'medium',
  className,
  blurAmount = '30px',
  opacity = 0.15,
  rounded = '1rem',
  showSpecular = false,
}: LiquidGlassProps) {
  // Map variants to blur amounts
  const blurMap = {
    subtle: '20px',
    medium: '30px',
    strong: '40px',
  };

  const variantBlur = blurMap[variant];

  return (
    <div
      className={cn('liquid-glass-wrapper relative overflow-hidden backdrop-blur-xl', className)}
      style={{
        borderRadius: rounded,
        backdropFilter: `blur(${variantBlur})`,
        WebkitBackdropFilter: `blur(${variantBlur})`,
      }}
    >
      {/* Layer 1: Glass Overlay (Tint Layer) */}
      <div
        className="liquid-glass-overlay absolute inset-0 z-0 pointer-events-none"
        style={{
          background: `rgba(0, 0, 0, ${opacity})`,
        }}
      />

      {/* Layer 2: Specular Highlight (Rim Light) - Optional */}
      {showSpecular && (
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            borderRadius: rounded,
            overflow: 'hidden',
            boxShadow:
              'inset 1px 1px 0 rgba(255, 255, 255, 0.1), inset 0 0 5px rgba(255, 255, 255, 0.05)',
          }}
        />
      )}

      {/* Layer 3: Content Layer */}
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}
