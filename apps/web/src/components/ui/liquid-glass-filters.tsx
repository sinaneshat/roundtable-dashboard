/**
 * Liquid Glass SVG Filter Definitions
 *
 * Official Apple Liquid Glass implementation using SVG displacement maps
 * Based on WWDC 2025 specifications and official implementations
 *
 * Sources:
 * - https://dev.to/fabiosleal/how-to-create-the-apple-liquid-glass-effect-with-css-and-svg-2o06
 * - https://kube.io/blog/liquid-glass-css-svg/
 * - Official Liquid Glass Generator: https://liquidglassgen.com/
 *
 * Key Technical Details:
 * - feTurbulence: Creates noise texture for distortion
 * - feGaussianBlur: Smooths the noise for natural refraction
 * - feDisplacementMap: Applies pixel displacement (distortion effect)
 *
 * Browser Support: Chromium only (Chrome, Edge, Arc, Brave)
 * Safari does not support SVG filters as backdrop-filter
 */

export function LiquidGlassFilters() {
  return (
    <svg
      style={{
        position: 'absolute',
        width: 0,
        height: 0,
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <defs>
        {/* Main Liquid Glass Distortion Filter - Medium Intensity */}
        <filter
          id="liquid-glass-distortion"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          {/* Generate fractal noise for natural-looking distortion */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.008"
            numOctaves="2"
            seed="92"
            result="noise"
          />

          {/* Blur the noise to create smooth distortion */}
          <feGaussianBlur
            in="noise"
            stdDeviation="2"
            result="blurred"
          />

          {/* Apply displacement mapping for glass refraction effect */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurred"
            scale="70"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Subtle Liquid Glass - Light Modal Overlays */}
        <filter
          id="liquid-glass-subtle"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.01 0.01"
            numOctaves="1"
            seed="42"
            result="noise"
          />

          <feGaussianBlur
            in="noise"
            stdDeviation="1.5"
            result="blurred"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="blurred"
            scale="40"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Strong Liquid Glass - Heavy Distortion for Sticky Headers */}
        <filter
          id="liquid-glass-strong"
          x="-10%"
          y="-10%"
          width="120%"
          height="120%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.006"
            numOctaves="3"
            seed="157"
            result="noise"
          />

          <feGaussianBlur
            in="noise"
            stdDeviation="3"
            result="blurred"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="blurred"
            scale="100"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
