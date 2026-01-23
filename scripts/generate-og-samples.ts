/**
 * Generate OG Image Samples
 *
 * Creates sample OG images with glass design system.
 * - Glass wrappers for model icons (blur, transparency, subtle borders)
 * - Proper spacing and layout
 * - Color orbs in corners matching mode color
 *
 * Run with: bunx tsx scripts/generate-og-samples.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = process.cwd();
const WEB_PUBLIC = path.join(ROOT_DIR, 'apps/web/public');

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

const BRAND = {
  name: 'Roundtable.now',
  tagline: 'Multiple AI Models, One Conversation',
};

const OG_COLORS = {
  background: '#000000',
  bgStart: '#0a0a0a',
  bgEnd: '#1a1a1a',
  primary: '#2563eb',
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  analyzing: '#8b5cf6',
  brainstorming: '#f59e0b',
  debating: '#ef4444',
  solving: '#10b981',
  // Glass tokens
  glassBg: 'rgba(24, 24, 27, 0.85)',
  glassBorder: 'rgba(255, 255, 255, 0.12)',
  glassHighlight: 'rgba(255, 255, 255, 0.06)',
};

type ChatMode = 'analyzing' | 'brainstorming' | 'debating' | 'solving';
type OGType = 'chat' | 'static' | 'protected';

interface OGSampleConfig {
  name: string;
  title: string;
  subtitle?: string;
  type: OGType;
  route: string;
  mode?: ChatMode;
  participantCount?: number;
  messageCount?: number;
  participants?: string[];
  icon?: string;
}

const samples: OGSampleConfig[] = [
  // STATIC
  { name: 'home', title: BRAND.name, subtitle: BRAND.tagline, type: 'static', route: '/', icon: 'home' },
  { name: 'sign-in', title: 'Sign In', subtitle: 'Access your AI conversations', type: 'static', route: '/auth/sign-in', icon: 'signin' },
  { name: 'public-pricing', title: 'Pricing', subtitle: 'Choose the plan that fits your needs', type: 'static', route: '/public/pricing', icon: 'pricing' },
  { name: 'terms', title: 'Terms of Service', subtitle: 'Our terms and conditions', type: 'static', route: '/legal/terms', icon: 'legal' },
  { name: 'privacy', title: 'Privacy Policy', subtitle: 'How we handle your data', type: 'static', route: '/legal/privacy', icon: 'legal' },
  // PROTECTED
  { name: 'dashboard', title: 'Dashboard', subtitle: 'Start a new AI conversation', type: 'protected', route: '/chat', icon: 'dashboard' },
  { name: 'pricing-upgrade', title: 'Upgrade Your Plan', subtitle: 'Unlock more AI models and features', type: 'protected', route: '/chat/pricing', icon: 'pricing' },
  { name: 'billing-success', title: 'Subscription Activated', subtitle: 'Welcome to your new plan', type: 'protected', route: '/chat/billing/subscription-success', icon: 'success' },
  { name: 'billing-failure', title: 'Payment Issue', subtitle: 'There was a problem with your payment', type: 'protected', route: '/chat/billing/failure', icon: 'error' },
  // CHAT
  { name: 'chat-default', title: 'AI Conversation', type: 'chat', route: '/chat/$slug', participantCount: 3, messageCount: 10, participants: ['anthropic', 'openai', 'google'] },
  { name: 'chat-analyzing', title: 'Analyzing Market Trends for Q4', type: 'chat', route: '/chat/$slug', mode: 'analyzing', participantCount: 4, messageCount: 24, participants: ['anthropic', 'openai', 'google', 'meta'] },
  { name: 'chat-brainstorming', title: 'Brainstorming Product Features', type: 'chat', route: '/chat/$slug', mode: 'brainstorming', participantCount: 5, messageCount: 47, participants: ['anthropic', 'openai', 'google', 'mistral', 'deepseek'] },
  { name: 'chat-debating', title: 'AI Ethics and Future of Work', type: 'chat', route: '/chat/$slug', mode: 'debating', participantCount: 3, messageCount: 32, participants: ['anthropic', 'openai', 'google'] },
  { name: 'chat-solving', title: 'Algorithm Challenge Solution', type: 'chat', route: '/chat/$slug', mode: 'solving', participantCount: 2, messageCount: 18, participants: ['anthropic', 'openai'] },
  { name: 'chat-many', title: 'Large AI Model Discussion', type: 'chat', route: '/chat/$slug', mode: 'brainstorming', participantCount: 8, messageCount: 156, participants: ['anthropic', 'openai', 'google', 'meta', 'mistral', 'deepseek', 'xai', 'qwen'] },
  { name: 'chat-long', title: 'Very Long Title Testing Truncation Behavior in OG Images', type: 'chat', route: '/chat/$slug', mode: 'analyzing', participantCount: 3, messageCount: 42, participants: ['anthropic', 'openai', 'google'] },
  { name: 'public-chat', title: 'Shared: Climate Solutions Roundtable', type: 'chat', route: '/public/chat/$slug', mode: 'brainstorming', participantCount: 4, messageCount: 38, participants: ['anthropic', 'openai', 'google', 'deepseek'] },
];

function loadImageBase64(filePath: string): string {
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

function loadModeIconSvg(mode: string, color: string): string {
  try {
    const iconPath = path.join(WEB_PUBLIC, 'static/icons/modes', `${mode}.svg`);
    let svg = fs.readFileSync(iconPath, 'utf-8');
    svg = svg.replace(/currentColor/g, color).replace(/<\?xml[^>]*\?>/g, '').replace(/<!DOCTYPE[^>]*>/g, '');
    return svg.trim();
  } catch {
    return '';
  }
}

const LOGO_BASE64 = loadImageBase64(path.join(WEB_PUBLIC, 'static/logo.png'));
const MODEL_ICONS: Record<string, string> = {};
for (const p of ['anthropic', 'openai', 'google', 'meta', 'mistral', 'deepseek', 'xai', 'qwen', 'openrouter', 'claude', 'grok', 'kimi', 'microsoft']) {
  MODEL_ICONS[p] = loadImageBase64(path.join(WEB_PUBLIC, 'static/icons/ai-models', `${p}.png`));
}

function getModeColor(mode?: ChatMode): string {
  if (!mode) return OG_COLORS.primary;
  return OG_COLORS[mode] ?? OG_COLORS.primary;
}

// SVG filter definitions for glass blur effect
function svgDefs(modeColor: string): string {
  return `
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${OG_COLORS.bgStart}"/>
      <stop offset="100%" stop-color="${OG_COLORS.bgEnd}"/>
    </linearGradient>
    <radialGradient id="orb-tr" cx="100%" cy="0%" r="70%">
      <stop offset="0%" stop-color="${modeColor}" stop-opacity="0.35"/>
      <stop offset="50%" stop-color="${modeColor}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${modeColor}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orb-bl" cx="0%" cy="100%" r="60%">
      <stop offset="0%" stop-color="${modeColor}" stop-opacity="0.2"/>
      <stop offset="40%" stop-color="${modeColor}" stop-opacity="0.04"/>
      <stop offset="100%" stop-color="${modeColor}" stop-opacity="0"/>
    </radialGradient>
    <filter id="glass-blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="1"/>
    </filter>
    <clipPath id="logo-clip"><circle cx="84" cy="72" r="22"/></clipPath>
  </defs>`;
}

// Model icon with glass wrapper - smaller icon inside
function modelIcon(provider: string, idx: number): string {
  const iconB64 = MODEL_ICONS[provider];
  if (!iconB64) return '';

  const wrapperSize = 44;
  const iconSize = 26; // Much smaller icon inside
  const spacing = 36; // Overlap amount
  const x = 80 + idx * spacing;
  const y = 490;
  const cx = x + wrapperSize / 2;
  const cy = y + wrapperSize / 2;
  const iconX = x + (wrapperSize - iconSize) / 2;
  const iconY = y + (wrapperSize - iconSize) / 2;

  return `
    <g>
      <!-- Glass wrapper background -->
      <circle cx="${cx}" cy="${cy}" r="${wrapperSize / 2}" fill="${OG_COLORS.glassBg}" stroke="${OG_COLORS.glassBorder}" stroke-width="1.5"/>
      <!-- Inner highlight -->
      <circle cx="${cx}" cy="${cy - 2}" r="${wrapperSize / 2 - 4}" fill="${OG_COLORS.glassHighlight}" opacity="0.5"/>
      <!-- Icon (smaller, centered) -->
      <defs><clipPath id="ic-${idx}"><circle cx="${cx}" cy="${cy}" r="${iconSize / 2}"/></clipPath></defs>
      <image href="${iconB64}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}" clip-path="url(#ic-${idx})" preserveAspectRatio="xMidYMid slice"/>
    </g>`;
}

function generateChatOgSvg(config: OGSampleConfig): string {
  const { title, mode, participantCount = 0, messageCount = 0, participants = [] } = config;
  const modeColor = getModeColor(mode);

  // Truncate title
  const maxLen = 36;
  let line1 = title.length > maxLen ? title.slice(0, title.lastIndexOf(' ', maxLen)) || title.slice(0, maxLen) : title;
  let line2 = title.length > maxLen ? title.slice(line1.length).trim() : '';
  if (line2.length > maxLen) line2 = line2.slice(0, maxLen - 3) + '...';

  const modeIconSvg = mode ? loadModeIconSvg(mode, modeColor) : '';
  const modeEl = mode && modeIconSvg ? `
    <g transform="translate(80, 150)">
      <g transform="scale(1.0)">${modeIconSvg}</g>
      <text x="32" y="18" fill="${modeColor}" font-family="system-ui, -apple-system, sans-serif" font-size="17" font-weight="600">${mode.charAt(0).toUpperCase() + mode.slice(1)}</text>
    </g>` : '';

  const visibleP = participants.slice(0, 5);
  const icons = visibleP.map((p, i) => modelIcon(p, i)).join('');
  const extra = participantCount - 5;
  const extraEl = extra > 0 ? `<text x="${80 + visibleP.length * 36 + 16}" y="520" fill="${OG_COLORS.textSecondary}" font-family="system-ui" font-size="14" font-weight="500">+${extra} more</text>` : '';

  const titleY = mode ? 230 : 190;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${svgDefs(modeColor)}

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bg-grad)"/>

  <!-- Color orbs -->
  <rect width="700" height="450" x="500" y="0" fill="url(#orb-tr)"/>
  <rect width="550" height="400" x="0" y="230" fill="url(#orb-bl)"/>

  <!-- Logo -->
  ${LOGO_BASE64 ? `<image href="${LOGO_BASE64}" x="62" y="50" width="44" height="44" clip-path="url(#logo-clip)" preserveAspectRatio="xMidYMid slice"/>` : ''}

  <!-- Brand name -->
  <text x="118" y="80" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="600">${BRAND.name}</text>

  <!-- Mode badge -->
  ${modeEl}

  <!-- Title -->
  <text x="80" y="${titleY}" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="46" font-weight="700" letter-spacing="-0.02em">${line1}</text>
  ${line2 ? `<text x="80" y="${titleY + 54}" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="46" font-weight="700" letter-spacing="-0.02em">${line2}</text>` : ''}

  <!-- Stats -->
  <g transform="translate(80, ${line2 ? 355 : 310})">
    <text x="0" y="38" fill="${modeColor}" font-family="system-ui" font-size="44" font-weight="700">${participantCount}</text>
    <text x="0" y="66" fill="${OG_COLORS.textSecondary}" font-family="system-ui" font-size="15" font-weight="500">${participantCount === 1 ? 'AI Model' : 'AI Models'}</text>
    <text x="130" y="38" fill="${OG_COLORS.textPrimary}" font-family="system-ui" font-size="44" font-weight="700">${messageCount}</text>
    <text x="130" y="66" fill="${OG_COLORS.textSecondary}" font-family="system-ui" font-size="15" font-weight="500">${messageCount === 1 ? 'Message' : 'Messages'}</text>
  </g>

  <!-- Model icons with glass wrappers -->
  ${icons}
  ${extraEl}

  <!-- Footer -->
  <line x1="80" y1="570" x2="1120" y2="570" stroke="${OG_COLORS.glassBorder}" stroke-width="1"/>
  <text x="80" y="602" fill="${OG_COLORS.textMuted}" font-family="system-ui" font-size="15" font-weight="500">${BRAND.tagline}</text>
</svg>`;
}

function generateStaticOgSvg(config: OGSampleConfig): string {
  const { name, title, subtitle, icon = 'home', type } = config;
  const isHome = name === 'home';
  const accentColor = icon === 'success' ? '#10b981' : icon === 'error' ? '#ef4444' : type === 'protected' ? OG_COLORS.primary : OG_COLORS.analyzing;

  // Home page: centered large logo
  if (isHome) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${svgDefs(accentColor)}

  <rect width="100%" height="100%" fill="url(#bg-grad)"/>
  <rect width="700" height="450" x="500" y="0" fill="url(#orb-tr)"/>
  <rect width="550" height="400" x="0" y="230" fill="url(#orb-bl)"/>

  <!-- Centered logo glow -->
  <circle cx="600" cy="240" r="100" fill="${accentColor}" opacity="0.08"/>
  <circle cx="600" cy="240" r="70" fill="${accentColor}" opacity="0.12"/>

  <!-- Large centered logo -->
  ${LOGO_BASE64 ? `
  <defs><clipPath id="home-logo-clip"><circle cx="600" cy="240" r="55"/></clipPath></defs>
  <circle cx="600" cy="240" r="58" fill="${OG_COLORS.glassBg}" stroke="${OG_COLORS.glassBorder}" stroke-width="2"/>
  <image href="${LOGO_BASE64}" x="545" y="185" width="110" height="110" clip-path="url(#home-logo-clip)" preserveAspectRatio="xMidYMid slice"/>
  ` : ''}

  <!-- Title -->
  <text x="600" y="365" fill="${OG_COLORS.textPrimary}" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="700" text-anchor="middle" letter-spacing="-0.02em">${title}</text>

  <!-- Subtitle -->
  ${subtitle ? `<text x="600" y="415" fill="${OG_COLORS.textSecondary}" font-family="system-ui" font-size="22" font-weight="500" text-anchor="middle">${subtitle}</text>` : ''}

  <!-- Footer -->
  <line x1="80" y1="570" x2="1120" y2="570" stroke="${OG_COLORS.glassBorder}" stroke-width="1"/>
  <text x="600" y="602" fill="${OG_COLORS.textMuted}" font-family="system-ui" font-size="15" font-weight="500" text-anchor="middle">${BRAND.tagline}</text>
</svg>`;
  }

  // Other static/protected pages
  const iconSvg: Record<string, string> = {
    signin: `<circle cx="600" cy="260" r="16" fill="${accentColor}"/><path d="M570 305 Q570 275 600 275 Q630 275 630 305" fill="${accentColor}"/>`,
    pricing: `<text x="600" y="290" fill="${accentColor}" font-family="system-ui" font-size="52" font-weight="700" text-anchor="middle">$</text>`,
    legal: `<rect x="578" y="240" width="44" height="56" rx="4" fill="${accentColor}"/><line x1="588" y1="260" x2="622" y2="260" stroke="${OG_COLORS.bgStart}" stroke-width="3"/><line x1="588" y1="275" x2="616" y2="275" stroke="${OG_COLORS.bgStart}" stroke-width="3"/><line x1="588" y1="290" x2="620" y2="290" stroke="${OG_COLORS.bgStart}" stroke-width="3"/>`,
    dashboard: `<rect x="565" y="250" width="28" height="46" rx="4" fill="${accentColor}"/><rect x="600" y="268" width="28" height="28" rx="4" fill="${accentColor}"/>`,
    success: `<path d="M570 275 L592 297 L630 250" fill="none" stroke="${accentColor}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`,
    error: `<line x1="575" y1="250" x2="625" y2="300" stroke="${accentColor}" stroke-width="10" stroke-linecap="round"/><line x1="625" y1="250" x2="575" y2="300" stroke="${accentColor}" stroke-width="10" stroke-linecap="round"/>`,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${svgDefs(accentColor)}

  <rect width="100%" height="100%" fill="url(#bg-grad)"/>
  <rect width="700" height="450" x="500" y="0" fill="url(#orb-tr)"/>
  <rect width="550" height="400" x="0" y="230" fill="url(#orb-bl)"/>

  <!-- Logo -->
  ${LOGO_BASE64 ? `<image href="${LOGO_BASE64}" x="62" y="50" width="44" height="44" clip-path="url(#logo-clip)" preserveAspectRatio="xMidYMid slice"/>` : ''}
  <text x="118" y="80" fill="${OG_COLORS.textPrimary}" font-family="system-ui" font-size="24" font-weight="600">${BRAND.name}</text>

  <!-- Icon glow -->
  <circle cx="600" cy="275" r="80" fill="${accentColor}" opacity="0.08"/>
  <circle cx="600" cy="275" r="55" fill="${accentColor}" opacity="0.12"/>

  <!-- Icon -->
  ${iconSvg[icon] || iconSvg.dashboard}

  <!-- Title -->
  <text x="600" y="400" fill="${OG_COLORS.textPrimary}" font-family="system-ui" font-size="46" font-weight="700" text-anchor="middle">${title}</text>

  <!-- Subtitle -->
  ${subtitle ? `<text x="600" y="445" fill="${OG_COLORS.textSecondary}" font-family="system-ui" font-size="21" font-weight="500" text-anchor="middle">${subtitle}</text>` : ''}

  <!-- Footer -->
  <line x1="80" y1="570" x2="1120" y2="570" stroke="${OG_COLORS.glassBorder}" stroke-width="1"/>
  <text x="600" y="602" fill="${OG_COLORS.textMuted}" font-family="system-ui" font-size="15" font-weight="500" text-anchor="middle">${BRAND.tagline}</text>
</svg>`;
}

function generateOgSvg(config: OGSampleConfig): string {
  return config.type === 'chat' ? generateChatOgSvg(config) : generateStaticOgSvg(config);
}

async function main() {
  const outputDir = path.join(ROOT_DIR, 'og-samples');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log('Generating OG samples with glass design...\n');
  console.log(`Logo: ${LOGO_BASE64 ? '✓' : '✗'} | Model icons: ${Object.values(MODEL_ICONS).filter(Boolean).length}\n`);

  const types: OGType[] = ['static', 'protected', 'chat'];
  for (const type of types) {
    const typeSamples = samples.filter(s => s.type === type);
    console.log(`${type.toUpperCase()} (${typeSamples.length}):`);
    for (const sample of typeSamples) {
      fs.writeFileSync(path.join(outputDir, `${sample.name}.svg`), generateOgSvg(sample));
      console.log(`  ✓ ${sample.name}.svg`);
    }
    console.log('');
  }

  console.log(`📁 ${outputDir}`);
  console.log(`📊 ${samples.length} images`);
}

main().catch(console.error);
