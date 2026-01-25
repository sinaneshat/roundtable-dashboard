/**
 * Custom 3D Transition Presentations for Remotion
 *
 * Cinematic depth-based transitions with:
 * - Z-depth movement with blur
 * - Camera rotation effects
 * - Zoom-through fly effect
 * - Chromatic aberration overlay
 * - Shatter3D effect - scene breaks into 3D pieces
 * - Motion blur for fast transitions
 * - Enhanced chromatic zoom with RGB split
 */

import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import { useMemo } from 'react';
import { AbsoluteFill, interpolate, random } from 'remotion';

// ============================================================================
// DEPTH ZOOM TRANSITION
// Outgoing scene moves to z=-200 with blur, incoming scene enters from z=200
// ============================================================================

type DepthZoomProps = {
  perspective?: number;
  maxDepth?: number;
  blurMultiplier?: number;
  cameraRotation?: number;
};

const DepthZoomPresentation: React.FC<
  TransitionPresentationComponentProps<DepthZoomProps>
> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const {
    perspective = 1200,
    maxDepth = 300,
    blurMultiplier = 0.04,
    cameraRotation = 3,
  } = passedProps;

  const isEntering = presentationDirection === 'entering';

  // Calculate Z position
  const zPosition = isEntering
    ? interpolate(presentationProgress, [0, 1], [maxDepth, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, -maxDepth], {
        extrapolateLeft: 'clamp',
      });

  // Calculate blur based on distance from camera
  const blur = Math.abs(zPosition) * blurMultiplier;

  // Subtle camera rotation for cinematic feel
  const rotateY = isEntering
    ? interpolate(presentationProgress, [0, 1], [cameraRotation, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, -cameraRotation], {
        extrapolateLeft: 'clamp',
      });

  const rotateX = isEntering
    ? interpolate(presentationProgress, [0, 1], [cameraRotation * 0.3, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, -cameraRotation * 0.3], {
        extrapolateLeft: 'clamp',
      });

  // Scale effect for depth perception
  const scale = isEntering
    ? interpolate(presentationProgress, [0, 1], [1.15, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [1, 0.85], {
        extrapolateLeft: 'clamp',
      });

  // Opacity for smooth fade
  const opacity = isEntering
    ? interpolate(presentationProgress, [0, 0.4, 1], [0, 1, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.6, 1], [1, 1, 0], {
        extrapolateLeft: 'clamp',
      });

  return (
    <AbsoluteFill
      style={{
        perspective: `${perspective}px`,
        perspectiveOrigin: '50% 50%',
      }}
    >
      <AbsoluteFill
        style={{
          transform: `translateZ(${zPosition}px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`,
          filter: `blur(${blur}px)`,
          opacity,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export function depthZoom(props: DepthZoomProps = {}): TransitionPresentation<DepthZoomProps> {
  return { component: DepthZoomPresentation, props };
}

// ============================================================================
// ZOOM THROUGH TRANSITION
// Camera flies through the scene - exiting scene pulls back, entering zooms in
// ============================================================================

type ZoomThroughProps = {
  perspective?: number;
  maxZoom?: number;
  rotationIntensity?: number;
};

const ZoomThroughPresentation: React.FC<
  TransitionPresentationComponentProps<ZoomThroughProps>
> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const {
    perspective = 1000,
    maxZoom = 500,
    rotationIntensity = 5,
  } = passedProps;

  const isEntering = presentationDirection === 'entering';

  // Entering: start far behind camera, zoom to normal
  // Exiting: start normal, zoom past camera
  const zPosition = isEntering
    ? interpolate(presentationProgress, [0, 1], [-maxZoom, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, maxZoom * 2], {
        extrapolateLeft: 'clamp',
      });

  // Dynamic rotation during fly-through
  const rotateZ = isEntering
    ? interpolate(presentationProgress, [0, 0.5, 1], [-rotationIntensity, rotationIntensity * 0.5, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.5, 1], [0, rotationIntensity * 0.5, rotationIntensity], {
        extrapolateLeft: 'clamp',
      });

  // Scale for enhanced depth
  const scale = isEntering
    ? interpolate(presentationProgress, [0, 1], [0.3, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [1, 2.5], {
        extrapolateLeft: 'clamp',
      });

  // Blur based on speed/distance
  const blur = isEntering
    ? interpolate(presentationProgress, [0, 0.3, 1], [8, 2, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.7, 1], [0, 2, 12], {
        extrapolateLeft: 'clamp',
      });

  // Opacity
  const opacity = isEntering
    ? interpolate(presentationProgress, [0, 0.2, 1], [0, 1, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.8, 1], [1, 1, 0], {
        extrapolateLeft: 'clamp',
      });

  return (
    <AbsoluteFill
      style={{
        perspective: `${perspective}px`,
        perspectiveOrigin: '50% 50%',
      }}
    >
      <AbsoluteFill
        style={{
          transform: `translateZ(${zPosition}px) rotateZ(${rotateZ}deg) scale(${scale})`,
          filter: `blur(${blur}px)`,
          opacity,
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export function zoomThrough(props: ZoomThroughProps = {}): TransitionPresentation<ZoomThroughProps> {
  return { component: ZoomThroughPresentation, props };
}

// ============================================================================
// CAMERA ORBIT TRANSITION
// Camera rotates around the scene with 3D perspective
// ============================================================================

type CameraOrbitProps = {
  perspective?: number;
  rotationDegrees?: number;
  direction?: 'left' | 'right';
};

const CameraOrbitPresentation: React.FC<
  TransitionPresentationComponentProps<CameraOrbitProps>
> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const {
    perspective = 1200,
    rotationDegrees = 45,
    direction = 'right',
  } = passedProps;

  const isEntering = presentationDirection === 'entering';
  const directionMultiplier = direction === 'right' ? 1 : -1;

  // Rotation around Y axis
  const rotateY = isEntering
    ? interpolate(
        presentationProgress,
        [0, 1],
        [-rotationDegrees * directionMultiplier, 0],
        { extrapolateRight: 'clamp' },
      )
    : interpolate(
        presentationProgress,
        [0, 1],
        [0, rotationDegrees * directionMultiplier],
        { extrapolateLeft: 'clamp' },
      );

  // Slight X rotation for depth
  const rotateX = isEntering
    ? interpolate(presentationProgress, [0, 1], [8, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, -8], {
        extrapolateLeft: 'clamp',
      });

  // Translate X based on rotation
  const translateX = isEntering
    ? interpolate(presentationProgress, [0, 1], [100 * directionMultiplier, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, -100 * directionMultiplier], {
        extrapolateLeft: 'clamp',
      });

  // Z translation for depth
  const translateZ = isEntering
    ? interpolate(presentationProgress, [0, 0.5, 1], [-150, -50, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.5, 1], [0, -50, -150], {
        extrapolateLeft: 'clamp',
      });

  // Scale
  const scale = isEntering
    ? interpolate(presentationProgress, [0, 1], [0.9, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [1, 0.9], {
        extrapolateLeft: 'clamp',
      });

  // Opacity
  const opacity = isEntering
    ? interpolate(presentationProgress, [0, 0.3, 1], [0, 1, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.7, 1], [1, 1, 0], {
        extrapolateLeft: 'clamp',
      });

  return (
    <AbsoluteFill
      style={{
        perspective: `${perspective}px`,
        perspectiveOrigin: '50% 50%',
      }}
    >
      <AbsoluteFill
        style={{
          transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`,
          opacity,
          transformStyle: 'preserve-3d',
          backfaceVisibility: 'hidden',
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export function cameraOrbit(props: CameraOrbitProps = {}): TransitionPresentation<CameraOrbitProps> {
  return { component: CameraOrbitPresentation, props };
}

// ============================================================================
// DEPTH FADE TRANSITION
// Combines depth movement with opacity for smoother feel
// ============================================================================

type DepthFadeProps = {
  perspective?: number;
  depth?: number;
  blurAmount?: number;
};

const DepthFadePresentation: React.FC<
  TransitionPresentationComponentProps<DepthFadeProps>
> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const { perspective = 1000, depth = 200, blurAmount = 0.03 } = passedProps;

  const isEntering = presentationDirection === 'entering';

  const zPosition = isEntering
    ? interpolate(presentationProgress, [0, 1], [depth, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, -depth], {
        extrapolateLeft: 'clamp',
      });

  const blur = Math.abs(zPosition) * blurAmount;

  const opacity = isEntering
    ? interpolate(presentationProgress, [0, 0.5, 1], [0, 0.8, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.5, 1], [1, 0.8, 0], {
        extrapolateLeft: 'clamp',
      });

  const scale = isEntering
    ? interpolate(presentationProgress, [0, 1], [1.05, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [1, 0.95], {
        extrapolateLeft: 'clamp',
      });

  return (
    <AbsoluteFill
      style={{
        perspective: `${perspective}px`,
        perspectiveOrigin: '50% 50%',
      }}
    >
      <AbsoluteFill
        style={{
          transform: `translateZ(${zPosition}px) scale(${scale})`,
          filter: `blur(${blur}px)`,
          opacity,
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export function depthFade(props: DepthFadeProps = {}): TransitionPresentation<DepthFadeProps> {
  return { component: DepthFadePresentation, props };
}

// ============================================================================
// SHATTER 3D TRANSITION
// Outgoing scene breaks into 3D pieces that fly away, incoming assembles
// ============================================================================

type Shatter3DProps = {
  /** Number of pieces (grid: sqrt(pieces) x sqrt(pieces)) */
  pieces?: number;
  /** Maximum distance pieces fly away */
  explosionDistance?: number;
  /** Rotation intensity for pieces */
  rotationIntensity?: number;
  /** Perspective distance */
  perspective?: number;
};

// Generate consistent random values for pieces based on seed
function generatePieceData(
  pieceCount: number,
  seed: string,
): Array<{
  randomX: number;
  randomY: number;
  randomZ: number;
  randomRotateX: number;
  randomRotateY: number;
  randomRotateZ: number;
  delay: number;
}> {
  return Array.from({ length: pieceCount }, (_, i) => ({
    randomX: (random(`${seed}-x-${i}`) - 0.5) * 2,
    randomY: (random(`${seed}-y-${i}`) - 0.5) * 2,
    randomZ: random(`${seed}-z-${i}`) * -1, // Always fly back
    randomRotateX: (random(`${seed}-rx-${i}`) - 0.5) * 2,
    randomRotateY: (random(`${seed}-ry-${i}`) - 0.5) * 2,
    randomRotateZ: (random(`${seed}-rz-${i}`) - 0.5) * 2,
    delay: random(`${seed}-delay-${i}`) * 0.3, // Stagger effect
  }));
}

const Shatter3DPresentation: React.FC<
  TransitionPresentationComponentProps<Shatter3DProps>
> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const {
    pieces = 16,
    explosionDistance = 600,
    rotationIntensity = Math.PI * 0.8,
    perspective = 1200,
  } = passedProps;

  const isEntering = presentationDirection === 'entering';
  const gridSize = Math.ceil(Math.sqrt(pieces));
  const actualPieces = gridSize * gridSize;

  // Generate consistent piece data
  const pieceData = useMemo(
    () => generatePieceData(actualPieces, `shatter-${isEntering ? 'enter' : 'exit'}`),
    [actualPieces, isEntering],
  );

  // For entering: reverse the explosion (assemble)
  // For exiting: explode outward
  const progress = isEntering ? 1 - presentationProgress : presentationProgress;

  // Easing for more dramatic effect
  const easedProgress = interpolate(progress, [0, 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Overall opacity
  const opacity = isEntering
    ? interpolate(presentationProgress, [0, 0.3, 1], [0, 0.8, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.7, 1], [1, 0.8, 0], {
        extrapolateLeft: 'clamp',
      });

  // If no shatter effect needed (progress near 0 for exit, near 1 for enter)
  if (easedProgress < 0.01) {
    return (
      <AbsoluteFill style={{ opacity }}>
        {children}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        perspective: `${perspective}px`,
        perspectiveOrigin: '50% 50%',
      }}
    >
      {/* Render each piece */}
      {pieceData.map((piece, i) => {
        const row = Math.floor(i / gridSize);
        const col = i % gridSize;

        // Staggered progress for each piece
        const staggeredProgress = interpolate(
          easedProgress,
          [piece.delay, 1],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        const translateX = piece.randomX * explosionDistance * staggeredProgress;
        const translateY = piece.randomY * explosionDistance * staggeredProgress;
        const translateZ = piece.randomZ * explosionDistance * 0.5 * staggeredProgress;

        const rotateX = piece.randomRotateX * rotationIntensity * staggeredProgress;
        const rotateY = piece.randomRotateY * rotationIntensity * staggeredProgress;
        const rotateZ = piece.randomRotateZ * rotationIntensity * 0.5 * staggeredProgress;

        // Scale down as pieces fly away
        const scale = interpolate(staggeredProgress, [0, 1], [1, 0.6], {
          extrapolateRight: 'clamp',
        });

        // Piece opacity
        const pieceOpacity = interpolate(staggeredProgress, [0, 0.8, 1], [1, 0.8, 0], {
          extrapolateRight: 'clamp',
        });

        return (
          <AbsoluteFill
            key={i}
            style={{
              transform: `
                translate3d(${translateX}px, ${translateY}px, ${translateZ}px)
                rotateX(${rotateX}rad)
                rotateY(${rotateY}rad)
                rotateZ(${rotateZ}rad)
                scale(${scale})
              `,
              opacity: pieceOpacity * opacity,
              transformStyle: 'preserve-3d',
              clipPath: `polygon(
                ${(col / gridSize) * 100}% ${(row / gridSize) * 100}%,
                ${((col + 1) / gridSize) * 100}% ${(row / gridSize) * 100}%,
                ${((col + 1) / gridSize) * 100}% ${((row + 1) / gridSize) * 100}%,
                ${(col / gridSize) * 100}% ${((row + 1) / gridSize) * 100}%
              )`,
            }}
          >
            {children}
          </AbsoluteFill>
        );
      })}

      {/* Add depth glow effect during shatter */}
      {easedProgress > 0.1 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center,
              rgba(255, 255, 255, ${easedProgress * 0.08}) 0%,
              transparent 60%
            )`,
            pointerEvents: 'none',
            zIndex: 100,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export function shatter3D(props: Shatter3DProps = {}): TransitionPresentation<Shatter3DProps> {
  return { component: Shatter3DPresentation, props };
}

// ============================================================================
// MOTION BLUR TRANSITION
// Fast movement with directional motion blur effect
// ============================================================================

type MotionBlurProps = {
  /** Direction of motion: 'horizontal', 'vertical', 'diagonal' */
  direction?: 'horizontal' | 'vertical' | 'diagonal';
  /** Blur intensity (0-20) */
  blurIntensity?: number;
  /** Speed multiplier for the slide */
  speedMultiplier?: number;
  /** Add streaks effect */
  streaks?: boolean;
};

const MotionBlurPresentation: React.FC<
  TransitionPresentationComponentProps<MotionBlurProps>
> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const {
    direction = 'horizontal',
    blurIntensity = 12,
    speedMultiplier = 1.5,
    streaks = true,
  } = passedProps;

  const isEntering = presentationDirection === 'entering';

  // Calculate movement direction
  const directionVector = {
    horizontal: { x: 1, y: 0 },
    vertical: { x: 0, y: 1 },
    diagonal: { x: 0.7, y: 0.7 },
  }[direction];

  // Movement calculation
  const movement = 100 * speedMultiplier; // Percentage of viewport
  const translateX = isEntering
    ? interpolate(presentationProgress, [0, 1], [-movement * directionVector.x, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, movement * directionVector.x], {
        extrapolateLeft: 'clamp',
      });

  const translateY = isEntering
    ? interpolate(presentationProgress, [0, 1], [-movement * directionVector.y, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, movement * directionVector.y], {
        extrapolateLeft: 'clamp',
      });

  // Motion blur peaks in the middle of transition
  const blurPhase = Math.sin(presentationProgress * Math.PI);
  const currentBlur = blurIntensity * blurPhase;

  // Directional blur using SVG filter simulation
  const blurX = direction === 'vertical' ? 0 : currentBlur;
  const blurY = direction === 'horizontal' ? 0 : currentBlur;

  // Opacity
  const opacity = isEntering
    ? interpolate(presentationProgress, [0, 0.3, 1], [0, 1, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.7, 1], [1, 1, 0], {
        extrapolateLeft: 'clamp',
      });

  // Scale effect for speed perception
  const scale = interpolate(blurPhase, [0, 1], [1, 1.02], {
    extrapolateRight: 'clamp',
  });

  // Generate streak data for motion lines
  const streakData = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => ({
      offset: random(`streak-${i}`) * 100,
      width: 1 + random(`streak-w-${i}`) * 2,
      opacity: 0.1 + random(`streak-o-${i}`) * 0.2,
    })), []);

  return (
    <AbsoluteFill>
      {/* Main content with motion blur */}
      <AbsoluteFill
        style={{
          transform: `translate(${translateX}%, ${translateY}%) scale(${scale})`,
          filter: blurX > 0 || blurY > 0
            ? `blur(${Math.max(blurX, blurY) * 0.5}px)`
            : 'none',
          opacity,
        }}
      >
        {children}
      </AbsoluteFill>

      {/* Streaks overlay for speed effect */}
      {streaks && blurPhase > 0.2 && (
        <AbsoluteFill
          style={{
            transform: `translate(${translateX * 0.5}%, ${translateY * 0.5}%)`,
            opacity: blurPhase * 0.6,
            pointerEvents: 'none',
          }}
        >
          {streakData.map((streak, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: direction === 'vertical' ? `${streak.offset}%` : 0,
                top: direction === 'horizontal' ? `${streak.offset}%` : 0,
                width: direction === 'horizontal' ? '100%' : `${streak.width}px`,
                height: direction === 'vertical' ? '100%' : `${streak.width}px`,
                background: direction === 'horizontal'
                  ? `linear-gradient(to right, transparent, rgba(255,255,255,${streak.opacity}), transparent)`
                  : `linear-gradient(to bottom, transparent, rgba(255,255,255,${streak.opacity}), transparent)`,
              }}
            />
          ))}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

export function motionBlur(props: MotionBlurProps = {}): TransitionPresentation<MotionBlurProps> {
  return { component: MotionBlurPresentation, props };
}

// ============================================================================
// CHROMATIC ZOOM TRANSITION
// Enhanced zoom with animated RGB channel separation
// ============================================================================

type ChromaticZoomProps = {
  /** Maximum zoom scale */
  maxZoom?: number;
  /** Maximum RGB separation in pixels */
  maxRgbSeparation?: number;
  /** Add glitch effect at peak */
  glitch?: boolean;
  /** Perspective for 3D effect */
  perspective?: number;
};

const ChromaticZoomPresentation: React.FC<
  TransitionPresentationComponentProps<ChromaticZoomProps>
> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const {
    maxZoom = 2,
    maxRgbSeparation = 15,
    glitch = true,
    perspective = 1000,
  } = passedProps;

  const isEntering = presentationDirection === 'entering';

  // Scale calculation
  const scale = isEntering
    ? interpolate(presentationProgress, [0, 1], [maxZoom, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [1, 1 / maxZoom], {
        extrapolateLeft: 'clamp',
      });

  // RGB separation peaks in the middle
  const aberrationPhase = Math.sin(presentationProgress * Math.PI);
  const rgbSeparation = maxRgbSeparation * aberrationPhase;

  // Z-depth for 3D feel
  const translateZ = isEntering
    ? interpolate(presentationProgress, [0, 1], [-200, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [0, -200], {
        extrapolateLeft: 'clamp',
      });

  // Rotation for dramatic effect
  const rotation = isEntering
    ? interpolate(presentationProgress, [0, 0.5, 1], [3, -1, 0], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.5, 1], [0, 1, -3], {
        extrapolateLeft: 'clamp',
      });

  // Opacity
  const opacity = isEntering
    ? interpolate(presentationProgress, [0, 0.2, 1], [0, 1, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.8, 1], [1, 1, 0], {
        extrapolateLeft: 'clamp',
      });

  // Glitch offset at peak
  const glitchOffset = glitch && aberrationPhase > 0.7
    ? (random(`glitch-${Math.floor(presentationProgress * 10)}`) - 0.5) * 10
    : 0;

  return (
    <AbsoluteFill
      style={{
        perspective: `${perspective}px`,
        perspectiveOrigin: '50% 50%',
      }}
    >
      {/* Red channel - shifts left and down */}
      <AbsoluteFill
        style={{
          transform: `
            translateZ(${translateZ}px)
            translate(${-rgbSeparation + glitchOffset}px, ${rgbSeparation * 0.5}px)
            scale(${scale})
            rotate(${rotation}deg)
          `,
          opacity: opacity * 0.8,
          filter: 'url(#red-channel)',
          mixBlendMode: 'screen',
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </AbsoluteFill>

      {/* Green channel - center (main content) */}
      <AbsoluteFill
        style={{
          transform: `
            translateZ(${translateZ}px)
            translate(${glitchOffset}px, 0)
            scale(${scale})
            rotate(${rotation}deg)
          `,
          opacity,
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </AbsoluteFill>

      {/* Blue channel - shifts right and up */}
      <AbsoluteFill
        style={{
          transform: `
            translateZ(${translateZ}px)
            translate(${rgbSeparation - glitchOffset}px, ${-rgbSeparation * 0.5}px)
            scale(${scale})
            rotate(${rotation}deg)
          `,
          opacity: opacity * 0.8,
          filter: 'url(#blue-channel)',
          mixBlendMode: 'screen',
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
      </AbsoluteFill>

      {/* SVG filters for color channel isolation */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="red-channel">
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0"
            />
          </filter>
          <filter id="blue-channel">
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 1 0 0
                      0 0 0 1 0"
            />
          </filter>
        </defs>
      </svg>

      {/* Glow effect at peak */}
      {aberrationPhase > 0.3 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(
              ellipse at 50% 50%,
              rgba(255, 255, 255, ${aberrationPhase * 0.1}) 0%,
              transparent 50%
            )`,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}

      {/* Scan lines during glitch */}
      {glitch && aberrationPhase > 0.6 && (
        <AbsoluteFill
          style={{
            background: `repeating-linear-gradient(
              0deg,
              transparent 0px,
              transparent 2px,
              rgba(0, 0, 0, ${(aberrationPhase - 0.6) * 0.3}) 2px,
              rgba(0, 0, 0, ${(aberrationPhase - 0.6) * 0.3}) 4px
            )`,
            pointerEvents: 'none',
            zIndex: 11,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export function chromaticZoom(props: ChromaticZoomProps = {}): TransitionPresentation<ChromaticZoomProps> {
  return { component: ChromaticZoomPresentation, props };
}

// ============================================================================
// PORTAL TRANSITION
// Scene warps through a circular portal effect
// ============================================================================

type PortalProps = {
  /** Maximum scale of the portal */
  portalScale?: number;
  /** Add vortex rotation */
  vortex?: boolean;
  /** Vortex rotation speed */
  vortexSpeed?: number;
};

const PortalPresentation: React.FC<
  TransitionPresentationComponentProps<PortalProps>
> = ({
  children,
  presentationDirection,
  presentationProgress,
  passedProps,
}) => {
  const {
    portalScale = 3,
    vortex = true,
    vortexSpeed = 360,
  } = passedProps;

  const isEntering = presentationDirection === 'entering';

  // Clip path animation - circular wipe
  const clipProgress = isEntering
    ? interpolate(presentationProgress, [0, 1], [0, 150], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 1], [150, 0], {
        extrapolateLeft: 'clamp',
      });

  // Scale effect
  const scale = isEntering
    ? interpolate(presentationProgress, [0, 0.5, 1], [portalScale, 1.2, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.5, 1], [1, 1.2, portalScale], {
        extrapolateLeft: 'clamp',
      });

  // Vortex rotation
  const vortexRotation = vortex
    ? interpolate(presentationProgress, [0, 1], [0, vortexSpeed * (isEntering ? -1 : 1)], {
        extrapolateRight: 'clamp',
      })
    : 0;

  // Opacity
  const opacity = isEntering
    ? interpolate(presentationProgress, [0, 0.2, 1], [0.5, 1, 1], {
        extrapolateRight: 'clamp',
      })
    : interpolate(presentationProgress, [0, 0.8, 1], [1, 1, 0.5], {
        extrapolateLeft: 'clamp',
      });

  // Blur based on scale
  const blur = Math.abs(scale - 1) * 3;

  return (
    <AbsoluteFill>
      {/* Main content with portal clip */}
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) rotate(${vortexRotation}deg)`,
          clipPath: `circle(${clipProgress}% at 50% 50%)`,
          filter: blur > 0.5 ? `blur(${blur}px)` : 'none',
          opacity,
        }}
      >
        {children}
      </AbsoluteFill>

      {/* Portal ring effect */}
      {clipProgress > 5 && clipProgress < 140 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(
              circle at 50% 50%,
              transparent ${clipProgress - 3}%,
              rgba(255, 255, 255, 0.25) ${clipProgress}%,
              rgba(234, 234, 234, 0.15) ${clipProgress + 2}%,
              transparent ${clipProgress + 5}%
            )`,
            pointerEvents: 'none',
            transform: `rotate(${-vortexRotation * 0.5}deg)`,
          }}
        />
      )}

      {/* Energy particles */}
      {clipProgress > 10 && clipProgress < 130 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(
              circle at 50% 50%,
              transparent ${clipProgress - 10}%,
              rgba(255, 255, 255, ${0.05 * Math.sin(presentationProgress * Math.PI * 4)}) ${clipProgress - 5}%,
              transparent ${clipProgress}%
            )`,
            pointerEvents: 'none',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export function portal(props: PortalProps = {}): TransitionPresentation<PortalProps> {
  return { component: PortalPresentation, props };
}
