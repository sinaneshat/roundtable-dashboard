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
  const i = Math.max(0, Math.min(1, intensity));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        scale: animate ? [1, 1.02, 1] : 1,
      }}
      transition={{
        opacity: { duration: 0.6, ease: "easeOut" },
        scale: {
          duration,
          repeat: animate ? Infinity : 0,
          repeatType: "reverse",
          ease: "easeInOut",
        },
      }}
      className={`pointer-events-none rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at center,
          rgba(37, 99, 235, ${0.4 * i}) 0%,
          rgba(30, 64, 175, ${0.25 * i}) 25%,
          rgba(30, 58, 138, ${0.12 * i}) 50%,
          rgba(30, 58, 138, ${0.04 * i}) 75%,
          transparent 100%)`,
      }}
    />
  );
};
