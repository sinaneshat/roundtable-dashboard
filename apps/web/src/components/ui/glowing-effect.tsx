import type { GlowingEffectVariant } from '@roundtable/shared';
import { GlowingEffectVariants } from '@roundtable/shared';
import { animate } from 'motion/react';
import { memo, useCallback, useEffect, useRef } from 'react';

import { cn } from '@/lib/ui/cn';

type GlowingEffectProps = {
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  variant?: GlowingEffectVariant;
  glow?: boolean;
  className?: string;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
};
const GlowingEffect = memo(
  ({
    blur = 0,
    inactiveZone = 0.7,
    proximity = 0,
    spread = 20,
    variant = GlowingEffectVariants.DEFAULT,
    glow = false,
    className,
    movementDuration = 2,
    borderWidth = 1,
    disabled = true,
  }: GlowingEffectProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastPosition = useRef({ x: 0, y: 0 });
    const animationFrameRef = useRef<number>(0);

    const handleMove = useCallback(
      (e?: MouseEvent | { x: number; y: number }) => {
        if (!containerRef.current)
          return;

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
          const element = containerRef.current;
          if (!element)
            return;

          const { left, top, width, height } = element.getBoundingClientRect();
          const mouseX = e?.x ?? lastPosition.current.x;
          const mouseY = e?.y ?? lastPosition.current.y;

          if (e) {
            lastPosition.current = { x: mouseX, y: mouseY };
          }

          const centerX = left + width * 0.5;
          const centerY = top + height * 0.5;
          const distanceFromCenter = Math.hypot(
            mouseX - centerX,
            mouseY - centerY,
          );
          const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

          if (distanceFromCenter < inactiveRadius) {
            element.style.setProperty('--active', '0');
            return;
          }

          const isActive
            = mouseX > left - proximity
              && mouseX < left + width + proximity
              && mouseY > top - proximity
              && mouseY < top + height + proximity;

          element.style.setProperty('--active', isActive ? '1' : '0');

          if (!isActive)
            return;

          const currentAngle
            = Number.parseFloat(element.style.getPropertyValue('--start')) || 0;
          const targetAngle
            = (180 * Math.atan2(mouseY - centerY, mouseX - centerX))
              / Math.PI
              + 90;

          const angleDiff = ((targetAngle - currentAngle + 180) % 360) - 180;
          const newAngle = currentAngle + angleDiff;

          animate(currentAngle, newAngle, {
            duration: movementDuration,
            ease: [0.16, 1, 0.3, 1],
            onUpdate: (value) => {
              element.style.setProperty('--start', String(value));
            },
          });
        });
      },
      [inactiveZone, proximity, movementDuration],
    );

    useEffect(() => {
      if (disabled)
        return;

      const handleScroll = () => handleMove();
      const handlePointerMove = (e: PointerEvent) => handleMove(e);

      window.addEventListener('scroll', handleScroll, { passive: true });
      document.body.addEventListener('pointermove', handlePointerMove, {
        passive: true,
      });

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        window.removeEventListener('scroll', handleScroll);
        document.body.removeEventListener('pointermove', handlePointerMove);
      };
    }, [handleMove, disabled]);

    return (
      <>
        <div
          className={cn(
            'pointer-events-none absolute -inset-px hidden rounded-[inherit] border opacity-0 transition-opacity',
            glow && 'opacity-100',
            variant === GlowingEffectVariants.WHITE && 'border-white',
            disabled && '!block',
          )}
        />
        <div
          ref={containerRef}
          style={
            {
              '--blur': `${blur}px`,
              '--spread': spread,
              '--start': '0',
              '--active': '0',
              '--glowingeffect-border-width': `${borderWidth}px`,
              '--repeating-conic-gradient-times': '5',
              // Roundtable brand logo gradient colors for smooth transitions
              '--gradient':
                variant === GlowingEffectVariants.WHITE
                  ? `repeating-conic-gradient(
                from 236.84deg at 50% 50%,
                var(--black),
                var(--black) calc(25% / var(--repeating-conic-gradient-times))
              )`
                  : `radial-gradient(circle, #FF1493 10%, #FF149300 20%),
              radial-gradient(circle at 40% 40%, #FFD700 5%, #FFD70000 15%),
              radial-gradient(circle at 60% 60%, #00BCD4 10%, #00BCD400 20%),
              radial-gradient(circle at 40% 60%, #9C27B0 10%, #9C27B000 20%),
              repeating-conic-gradient(
                from 0deg at 50% 50%,
                #FFD700 0%,
                #FF8C00 calc(16.67% / var(--repeating-conic-gradient-times)),
                #FF1493 calc(33.33% / var(--repeating-conic-gradient-times)),
                #9C27B0 calc(50% / var(--repeating-conic-gradient-times)),
                #2196F3 calc(66.67% / var(--repeating-conic-gradient-times)),
                #00BCD4 calc(83.33% / var(--repeating-conic-gradient-times)),
                #FFD700 calc(100% / var(--repeating-conic-gradient-times))
              )`,
            } as React.CSSProperties
          }
          className={cn(
            'pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity',
            glow && 'opacity-100',
            blur > 0 && 'blur-[var(--blur)] ',
            className,
            disabled && '!hidden',
          )}
        >
          <div
            className={cn(
              'glow',
              'rounded-[inherit]',
              'after:content-[""] after:rounded-[inherit] after:absolute after:inset-[calc(-1*var(--glowingeffect-border-width))]',
              'after:[border:var(--glowingeffect-border-width)_solid_transparent]',
              'after:[background:var(--gradient)] after:[background-attachment:fixed]',
              'after:opacity-[var(--active)] after:transition-opacity after:duration-300',
              'after:[mask-clip:padding-box,border-box]',
              'after:[mask-composite:intersect]',
              'after:[mask-image:linear-gradient(#0000,#0000),conic-gradient(from_calc((var(--start)-var(--spread))*1deg),#00000000_0deg,#fff,#00000000_calc(var(--spread)*2deg))]',
            )}
          />
        </div>
      </>
    );
  },
);

GlowingEffect.displayName = 'GlowingEffect';

export { GlowingEffect };
