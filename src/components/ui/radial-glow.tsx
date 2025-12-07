"use client";
import { motion } from "motion/react";

type RadialGlowProps = {
  /** Size of the glow in pixels */
  size?: number;
  /** Animation duration in seconds */
  duration?: number;
  /** Whether to animate the glow */
  animate?: boolean;
  /** Vertical offset from center */
  offsetY?: number;
  /** Use logo gradient colors (rainbow) - deprecated, now uses dark blue */
  useLogoColors?: boolean;
  className?: string;
};

export const RadialGlow = ({
  size = 800,
  duration = 12,
  animate = true,
  offsetY = 0,
  useLogoColors = true,
  className = "",
}: RadialGlowProps = {}) => {
  return (
    <div
      className={`absolute left-1/2 top-1/2 pointer-events-none ${className}`}
      style={{
        width: 0,
        height: 0,
        zIndex: -1,
      }}
    >
      <motion.div
        initial={{ opacity: 0.85 }}
        animate={{
          opacity: animate ? [0.85, 1, 0.85] : 0.9,
          scale: animate ? [1, 1.05, 1] : 1,
        }}
        transition={{
          opacity: {
            duration: 0.6,
            delay: 0.1,
            ease: "easeOut",
          },
          scale: {
            duration,
            repeat: animate ? Infinity : 0,
            repeatType: "reverse",
            ease: "easeInOut",
          },
        }}
        className="absolute will-change-transform"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${-size / 2}px`,
          top: `calc(-50% + ${offsetY}px)`,
          transform: 'translateZ(0)', // Force GPU acceleration
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {/* Dark blue radial glow - primary layer */}
        <motion.div
          className="absolute inset-0 rounded-full will-change-transform"
          style={{
            background: `radial-gradient(circle, rgba(30, 58, 138, 0.55) 0%, rgba(30, 64, 175, 0.42) 25%, rgba(37, 99, 235, 0.28) 50%, transparent 70%)`,
            filter: 'blur(100px)',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
          }}
          initial={{ scale: 1 }}
          animate={animate ? {
            scale: [1, 1.1, 1],
          } : {}}
          transition={{
            duration: duration * 2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.2,
          }}
        />

        {/* Dark blue radial glow - secondary layer (larger, more subtle) */}
        <motion.div
          className="absolute inset-0 rounded-full will-change-transform"
          style={{
            background: `radial-gradient(circle, rgba(30, 64, 175, 0.45) 0%, rgba(37, 99, 235, 0.32) 30%, rgba(59, 130, 246, 0.20) 60%, transparent 80%)`,
            filter: 'blur(140px)',
            transform: 'translateZ(0) scale(1.3)',
            backfaceVisibility: 'hidden',
          }}
          initial={{ scale: 1 }}
          animate={animate ? {
            scale: [1, 1.15, 1],
          } : {}}
          transition={{
            duration: duration * 2.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.3,
          }}
        />

        {/* Dark blue radial glow - tertiary layer (largest, most subtle) */}
        <motion.div
          className="absolute inset-0 rounded-full will-change-transform"
          style={{
            background: `radial-gradient(circle, rgba(37, 99, 235, 0.38) 0%, rgba(59, 130, 246, 0.26) 40%, rgba(96, 165, 250, 0.16) 70%, transparent 90%)`,
            filter: 'blur(180px)',
            transform: 'translateZ(0) scale(1.6)',
            backfaceVisibility: 'hidden',
          }}
          initial={{ scale: 1 }}
          animate={animate ? {
            scale: [1, 1.2, 1],
          } : {}}
          transition={{
            duration: duration * 3,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.4,
          }}
        />
      </motion.div>
    </div>
  );
};
