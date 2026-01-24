/**
 * Browser Frame Component
 *
 * macOS-style browser chrome wrapper for showcasing UI within videos.
 * Provides a realistic browser window appearance with traffic lights and URL bar.
 */

import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';

// ============================================================================
// Types
// ============================================================================

type BrowserFrameProps = {
  /** Content to display inside the browser frame */
  children: ReactNode;
  /** URL to display in the address bar (default: 'roundtable.ai') */
  url?: string;
  /** Whether to show the traffic light buttons (default: true) */
  showTrafficLights?: boolean;
};

// ============================================================================
// Constants
// ============================================================================

const TRAFFIC_LIGHT_COLORS = {
  close: '#ff5f56',
  minimize: '#ffbd2e',
  maximize: '#27ca3f',
} as const;

const FRAME_STYLES = {
  titleBarHeight: 36,
  borderRadius: 16,
  trafficLightSize: 12,
  trafficLightGap: 8,
  urlBarHeight: 24,
  urlBarBorderRadius: 6,
} as const;

// ============================================================================
// Browser Frame Component
// ============================================================================

export function BrowserFrame({
  children,
  url = 'roundtable.ai',
  showTrafficLights = true,
}: BrowserFrameProps) {
  const frame = useCurrentFrame();
  const shadowPulse = 0.4 + Math.sin(frame * 0.06) * 0.1;

  // Outer container with breathing shadow and border
  const containerStyles: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    borderRadius: FRAME_STYLES.borderRadius,
    boxShadow: `0 25px 50px -12px rgba(0, 0, 0, ${shadowPulse}), 0 0 80px rgba(0, 0, 0, ${shadowPulse * 0.3})`,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  };

  // Title bar (top chrome)
  const titleBarStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: FRAME_STYLES.titleBarHeight,
    backgroundColor: 'rgba(30, 30, 30, 0.9)',
    paddingLeft: 12,
    paddingRight: 12,
    gap: 12,
    flexShrink: 0,
  };

  // Traffic lights container
  const trafficLightsStyles: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: FRAME_STYLES.trafficLightGap,
  };

  // Individual traffic light button
  const trafficLightStyles = (color: string): CSSProperties => ({
    width: FRAME_STYLES.trafficLightSize,
    height: FRAME_STYLES.trafficLightSize,
    borderRadius: '50%',
    backgroundColor: color,
    flexShrink: 0,
  });

  // URL bar container (centered in remaining space)
  const urlBarContainerStyles: CSSProperties = {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    paddingRight: showTrafficLights ? 44 : 0, // Balance for traffic lights width
  };

  // URL bar itself
  const urlBarStyles: CSSProperties = {
    height: FRAME_STYLES.urlBarHeight,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: FRAME_STYLES.urlBarBorderRadius,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    minWidth: 200,
    maxWidth: 400,
  };

  // URL text
  const urlTextStyles: CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: '\'Noto Sans\', system-ui, -apple-system, sans-serif',
    userSelect: 'none',
  };

  // Content area
  const contentStyles: CSSProperties = {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  };

  return (
    <div style={containerStyles}>
      {/* Title Bar */}
      <div style={titleBarStyles}>
        {/* Traffic Lights */}
        {showTrafficLights && (
          <div style={trafficLightsStyles}>
            <div style={trafficLightStyles(TRAFFIC_LIGHT_COLORS.close)} />
            <div style={trafficLightStyles(TRAFFIC_LIGHT_COLORS.minimize)} />
            <div style={trafficLightStyles(TRAFFIC_LIGHT_COLORS.maximize)} />
          </div>
        )}

        {/* URL Bar */}
        <div style={urlBarContainerStyles}>
          <div style={urlBarStyles}>
            <span style={urlTextStyles}>{url}</span>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div style={contentStyles}>
        {children}
      </div>
    </div>
  );
}
