"use client";
import { motion } from "motion/react";

type RadialGlowProps = {
  /** Size of the glow in pixels */
  size?: number;
  /** Animation duration in seconds */
  duration?: number;
  /** Whether to animate the glow */
  animate?: boolean;
  /** Intensity multiplier (0-1) to control brightness */
  intensity?: number;
  className?: string;
};

export const RadialGlow = ({
  size = 800,
  duration = 12,
  animate = true,
  intensity = 1,
  className = "",
}: RadialGlowProps = {}) => {
  // Apply intensity multiplier to opacity values
  const i = Math.max(0, Math.min(1, intensity));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: animate ? [0.85, 1, 0.85] : 0.9,
        scale: animate ? [1, 1.03, 1] : 1,
      }}
      transition={{
        opacity: {
          duration: 0.8,
          ease: "easeOut",
        },
        scale: {
          duration,
          repeat: animate ? Infinity : 0,
          repeatType: "reverse",
          ease: "easeInOut",
        },
      }}
      className={`pointer-events-none will-change-transform ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        position: 'relative',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
      }}
    >
      {/* Dark blue radial glow - primary layer (tight, focused) */}
      <motion.div
        className="absolute inset-0 rounded-full will-change-transform"
        style={{
          background: `radial-gradient(circle, rgba(30, 58, 138, ${0.6 * i}) 0%, rgba(30, 64, 175, ${0.4 * i}) 20%, rgba(37, 99, 235, ${0.2 * i}) 40%, transparent 60%)`,
          filter: 'blur(60px)',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
        initial={{ scale: 1 }}
        animate={animate ? {
          scale: [1, 1.05, 1],
        } : {}}
        transition={{
          duration: duration * 2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.2,
        }}
      />

      {/* Dark blue radial glow - secondary layer (slightly larger) */}
      <motion.div
        className="absolute inset-0 rounded-full will-change-transform"
        style={{
          background: `radial-gradient(circle, rgba(30, 64, 175, ${0.4 * i}) 0%, rgba(37, 99, 235, ${0.25 * i}) 25%, rgba(59, 130, 246, ${0.1 * i}) 50%, transparent 70%)`,
          filter: 'blur(80px)',
          transform: 'translateZ(0) scale(1.15)',
          backfaceVisibility: 'hidden',
        }}
        initial={{ scale: 1 }}
        animate={animate ? {
          scale: [1, 1.08, 1],
        } : {}}
        transition={{
          duration: duration * 2.5,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.3,
        }}
      />

      {/* Dark blue radial glow - tertiary layer (outer halo) */}
      <motion.div
        className="absolute inset-0 rounded-full will-change-transform"
        style={{
          background: `radial-gradient(circle, rgba(37, 99, 235, ${0.25 * i}) 0%, rgba(59, 130, 246, ${0.12 * i}) 30%, transparent 55%)`,
          filter: 'blur(100px)',
          transform: 'translateZ(0) scale(1.3)',
          backfaceVisibility: 'hidden',
        }}
        initial={{ scale: 1 }}
        animate={animate ? {
          scale: [1, 1.1, 1],
        } : {}}
        transition={{
          duration: duration * 3,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.4,
        }}
      />
    </motion.div>
  );
};
