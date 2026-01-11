/**
 * OG Image Preview Page
 * Simple HTML page to display the OG image preview
 *
 * Access at: http://localhost:3000/api/og-preview-page
 */
import { NextResponse } from 'next/server';

import { BRAND } from '@/constants';

export async function GET() {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OG Image Preview - ${BRAND.displayName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%);
      color: #ffffff;
      min-height: 100vh;
      padding: 40px 20px;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    h1 {
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 12px;
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .subtitle {
      font-size: 16px;
      color: #a1a1aa;
      margin-bottom: 40px;
    }
    
    .preview-card {
      background: rgba(24, 24, 27, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 32px;
      backdrop-filter: blur(8px);
      margin-bottom: 32px;
    }
    
    .preview-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 16px;
      color: #ffffff;
    }
    
    .og-image {
      width: 100%;
      height: auto;
      border-radius: 12px;
      border: 2px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 32px;
    }
    
    .info-card {
      background: rgba(16, 16, 20, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 20px;
    }
    
    .info-label {
      font-size: 12px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    .info-value {
      font-size: 16px;
      color: #e4e4e7;
      font-weight: 500;
    }
    
    .url-box {
      background: rgba(16, 16, 20, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 16px;
      margin-top: 24px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 14px;
      color: #22c55e;
      word-break: break-all;
    }
    
    .badge {
      display: inline-block;
      padding: 6px 12px;
      background: rgba(34, 197, 94, 0.2);
      border: 1px solid rgba(34, 197, 94, 0.3);
      border-radius: 6px;
      font-size: 12px;
      color: #22c55e;
      font-weight: 600;
      margin-top: 12px;
    }
    
    .tip {
      background: rgba(59, 130, 246, 0.1);
      border-left: 3px solid #3b82f6;
      padding: 16px;
      border-radius: 8px;
      margin-top: 24px;
      color: #a1a1aa;
      font-size: 14px;
      line-height: 1.6;
    }
    
    .tip strong {
      color: #ffffff;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🖼️ Open Graph Image Preview</h1>
    <p class="subtitle">Dynamic OG images for public chat threads</p>
    
    <div class="preview-card">
      <div class="preview-title">Example OG Image (Mock Data)</div>
      <img 
        src="/api/og-preview" 
        alt="OG Image Preview" 
        class="og-image"
        loading="lazy"
      />
      
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">Dimensions</div>
          <div class="info-value">1200 × 630 px</div>
          <span class="badge">Standard OG Size</span>
        </div>
        
        <div class="info-card">
          <div class="info-label">Format</div>
          <div class="info-value">PNG (ImageResponse)</div>
        </div>
        
        <div class="info-card">
          <div class="info-label">Features</div>
          <div class="info-value">Glass-morphism, Gradients, Real Icons</div>
        </div>
        
        <div class="info-card">
          <div class="info-label">Revalidation</div>
          <div class="info-value">24 hours (ISR)</div>
        </div>
      </div>
      
      <div class="url-box">
        Image URL: http://localhost:3000/api/og-preview
      </div>
    </div>
    
    <div class="preview-card">
      <div class="preview-title">📖 How to Test with Real Data</div>
      
      <div class="tip">
        <strong>Step 1:</strong> Create a public chat thread in your app<br>
        <strong>Step 2:</strong> Share it to get a URL like: <code>/public/chat/[slug]</code><br>
        <strong>Step 3:</strong> View the OG image at: <code>/public/chat/[slug]/opengraph-image</code><br>
        <strong>Step 4:</strong> Test with social media debuggers:
        <ul style="margin-top: 8px; padding-left: 20px;">
          <li>Twitter: <a href="https://cards-dev.twitter.com/validator" target="_blank" style="color: #3b82f6;">cards-dev.twitter.com/validator</a></li>
          <li>Facebook: <a href="https://developers.facebook.com/tools/debug/" target="_blank" style="color: #3b82f6;">developers.facebook.com/tools/debug/</a></li>
          <li>LinkedIn: <a href="https://www.linkedin.com/post-inspector/" target="_blank" style="color: #3b82f6;">linkedin.com/post-inspector/</a></li>
        </ul>
      </div>
      
      <div class="tip" style="margin-top: 16px; border-color: #8b5cf6; background: rgba(139, 92, 246, 0.1);">
        <strong>💡 Pro Tip:</strong> The OG image automatically includes:
        <ul style="margin-top: 8px; padding-left: 20px;">
          <li>Thread title and first message</li>
          <li>Real AI model icons (Claude, GPT-4, Gemini, etc.)</li>
          <li>Mode with color-coded badge (analyzing, brainstorming, etc.)</li>
          <li>Participant and message counts</li>
          <li>Glass-morphism design matching your brand</li>
        </ul>
      </div>
    </div>
    
    <div class="preview-card">
      <div class="preview-title">🎨 Customization</div>
      <p style="color: #a1a1aa; margin-bottom: 16px;">
        To customize the OG image design, edit:
      </p>
      <div class="url-box">
        src/app/public/chat/[slug]/opengraph-image.tsx
      </div>
      <p style="color: #71717a; margin-top: 12px; font-size: 14px;">
        Colors, layout, and styling can be adjusted in the OG_COLORS constant and component styles.
      </p>
    </div>
  </div>
</body>
</html>
  `;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}
