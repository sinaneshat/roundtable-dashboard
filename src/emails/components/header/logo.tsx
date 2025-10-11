import React from 'react';

import { BRAND } from '@/constants/brand';

type LogoProps = {
  width?: number;
  height?: number;
};

export function Logo({ width = 160, height = 40 }: LogoProps) {
  return (
    <div style={{ display: 'block' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/static/logo.svg"
        alt={`${BRAND.displayName} Logo`}
        style={{
          width,
          height,
          display: 'block',
        }}
      />
    </div>
  );
}
