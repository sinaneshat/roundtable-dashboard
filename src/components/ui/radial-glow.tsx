"use client";
import React from "react";
import { motion } from "motion/react";
import { BRAND } from "@/constants/brand";

type RadialGlowProps = {
  /** Size of the glow in pixels */
  size?: number;
  /** Animation duration in seconds */
  duration?: number;
  /** Whether to animate the glow */
  animate?: boolean;
  /** Vertical offset from center */
  offsetY?: number;
  /** Use logo gradient colors (rainbow) */
  useLogoColors?: boolean;
  className?: string;
};

// Convert logo gradient colors to subtle, semi-transparent versions
const createRainbowGradient = (opacity: number = 0.02) => {
  const colors = BRAND.logoGradient.map(color => {
    // Convert hex to rgb and add opacity
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  });

  // Create a conic gradient (color rays emanating from center)
  const colorStops = colors.map((color, i) => {
    const percentage = (i / colors.length) * 100;
    return `${color} ${percentage}%`;
  }).join(', ');

  return `conic-gradient(from 0deg, ${colorStops}, ${colors[0]} 100%)`;
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
        initial={{ opacity: 0 }}
        animate={{
          opacity: animate ? [0.85, 1, 0.85] : 0.9,
          scale: animate ? [1, 1.05, 1] : 1,
        }}
        transition={{
          opacity: {
            duration,
            repeat: animate ? Infinity : 0,
            repeatType: "reverse",
            ease: "easeInOut",
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
        }}
      >
        {useLogoColors ? (
          <>
            {/* Rainbow radial gradient - primary layer */}
            <motion.div
              className="absolute inset-0 rounded-full will-change-transform"
              style={{
                background: createRainbowGradient(0.15),
                filter: 'blur(100px)',
                transform: 'translateZ(0)',
              }}
              animate={animate ? {
                scale: [1, 1.1, 1],
              } : {}}
              transition={{
                duration: duration * 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Rainbow radial gradient - secondary layer (larger, more subtle) */}
            <motion.div
              className="absolute inset-0 rounded-full will-change-transform"
              style={{
                background: createRainbowGradient(0.12),
                filter: 'blur(140px)',
                transform: 'translateZ(0) scale(1.3)',
              }}
              animate={animate ? {
                scale: [1, 1.15, 1],
              } : {}}
              transition={{
                duration: duration * 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Rainbow radial gradient - tertiary layer (largest, most subtle) */}
            <motion.div
              className="absolute inset-0 rounded-full will-change-transform"
              style={{
                background: createRainbowGradient(0.08),
                filter: 'blur(180px)',
                transform: 'translateZ(0) scale(1.6)',
              }}
              animate={animate ? {
                scale: [1, 1.2, 1],
              } : {}}
              transition={{
                duration: duration * 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </>
        ) : (
          <>
            {/* Fallback to simple radial gradients */}
            <motion.div
              className="absolute inset-0 rounded-full will-change-transform"
              style={{
                background: `radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)`,
                filter: 'blur(80px)',
                transform: 'translateZ(0)',
              }}
            />

            <motion.div
              className="absolute inset-0 rounded-full will-change-transform"
              style={{
                background: `radial-gradient(circle, rgba(59, 130, 246, 0.04) 20%, transparent 80%)`,
                filter: 'blur(100px)',
                transform: 'translateZ(0) scale(1.2)',
              }}
            />

            <motion.div
              className="absolute inset-0 rounded-full will-change-transform"
              style={{
                background: `radial-gradient(circle, rgba(139, 92, 246, 0.02) 30%, transparent 90%)`,
                filter: 'blur(120px)',
                transform: 'translateZ(0) scale(1.4)',
              }}
            />
          </>
        )}
      </motion.div>
    </div>
  );
};
