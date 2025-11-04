# AI Model Provider Logos

This directory contains standardized brand logos for AI model providers used throughout the Roundtable application.

## Source

All logos are sourced from **[LobeHub Icons](https://lobehub.com/icons/)** - a comprehensive collection of AI/LLM brand logos.

**Package**: `@lobehub/icons-static-png`
**CDN (Color)**: https://unpkg.com/@lobehub/icons-static-png@latest/light/{SLUG}-color.png
**CDN (Standard)**: https://unpkg.com/@lobehub/icons-static-png@latest/light/{SLUG}.png
**CDN (Fallback)**: https://unpkg.com/@lobehub/icons-static-png@latest/dark/{SLUG}.png

## Specifications

All logos in this directory follow these standards:

- **Format**: PNG with transparency (8-bit colormap optimized)
- **Dimensions**: 128×128 pixels (optimized for web performance)
- **Color**: Colorful variants prioritized, white for black icons ONLY
- **File Size**: Optimized (1-4KB per icon, avg ~2.6KB)
- **Naming**: Lowercase provider slug (e.g., `anthropic.png`, `openai.png`)
- **Optimization**: Resized from 1024×1024 to 128×128 with Lanczos filter + pngquant (quality 90-100) + optipng -o5

## Usage

Logos are automatically displayed via the `getProviderIcon()` utility in `src/lib/utils/ai-display.ts`:

```typescript
import { getProviderIcon } from '@/lib/utils/ai-display';

// Get icon path for a provider
const iconPath = getProviderIcon('anthropic'); // Returns: '/static/icons/ai-models/anthropic.png'
```

## Updating Logos

To add or update a logo:

1. Find the provider slug at [LobeHub Icons](https://lobehub.com/icons/)
2. Download using the CDN pattern (try in order):
   ```bash
   # Try color variant first (full branded colors)
   curl -L "https://unpkg.com/@lobehub/icons-static-png@latest/light/{SLUG}-color.png" \
     -o "{PROVIDER}.png"

   # If color variant doesn't exist, try standard light version
   curl -L "https://unpkg.com/@lobehub/icons-static-png@latest/light/{SLUG}.png" \
     -o "{PROVIDER}.png"

   # Fallback to dark version if needed
   curl -L "https://unpkg.com/@lobehub/icons-static-png@latest/dark/{SLUG}.png" \
     -o "{PROVIDER}.png"
   ```
3. No resizing needed - icons are optimized at 1024×1024 pixels
4. Update `PROVIDER_ICON_MAP` in `src/lib/utils/ai-display.ts` if needed

## Available Providers

Current logo inventory (38 providers):

| Provider | Filename | Source Slug |
|----------|----------|-------------|
| Anthropic | `anthropic.png` | anthropic |
| OpenAI | `openai.png` | openai |
| Google | `google.png` | google |
| Microsoft | `microsoft.png` | microsoft |
| Meta | `meta.png` | meta |
| NVIDIA | `nvidia.png` | nvidia |
| DeepSeek | `deepseek.png` | deepseek |
| Perplexity | `perplexity.png` | perplexity |
| xAI | `xai.png` | xai |
| Mistral AI | `mistral.png` | mistralai |
| Cohere | `cohere.png` | cohere |
| AI21 Labs | `ai21.png` | ai21 |
| Amazon/AWS | `aws.png` | aws |
| Azure | `azure.png` | azure |
| Alibaba/Qwen | `alibaba.png`, `qwen.png` | alibaba, qwen |
| Baidu | `baidu.png` | baidu |
| ByteDance | `bytedance.png` | bytedance |
| Baichuan | `baichuan.png` | baichuan |
| Zhipu AI | `zhipu.png` | zhipu |
| Moonshot AI | `moonshot.png`, `kimi.png` | moonshot |
| 01.AI (Yi) | `yi.png` | 01-ai |
| MiniMax | `minimax.png` | minimax |
| Hunyuan | `hunyuan.png` | hunyuan |
| Inflection AI | `inflection.png` | inflection |
| Liquid AI | `liquid.png` | liquid |
| Groq | `groq.png` | groq |
| Replicate | `replicate.png` | replicate |
| Together AI | `together.png` | togetherai |
| Databricks | `databricks.png` | dbrx |
| IBM | `ibm.png` | ibm |
| Stability AI | `stabilityai.png` | stability |
| Hugging Face | `huggingface.png` | huggingface |
| OpenRouter | `openrouter.png` | openrouter |
| Claude | `claude.png` | anthropic |
| Gemini | `gemini.png` | google |

## Fallback Behavior

If a provider logo is not found, the system automatically falls back to the OpenRouter logo (`openrouter.png`). This ensures no broken images are displayed to users.

## License

Icons are provided by LobeHub under the MIT License. See [LobeHub Icons License](https://github.com/lobehub/lobe-icons/blob/master/LICENSE) for details.

## Optimization Process

All icons optimized with **colorful priority**, white only for black icons:

1. **Download Strategy**:
   - **Priority 1**: Download -color variants (full branded colors) from LobeHub CDN
   - **Priority 2**: Download standard light variants (often colorful)
   - **Priority 3**: Download dark variants (white on transparent) ONLY for black icons

2. **Black Icon Replacement**: 11 black icons replaced with white variants:
   - ai21, anthropic, claude, groq, ibm, inflection, liquid, openai, openrouter, replicate, xai

3. **Colorful Icons Retained** (27 icons):
   - alibaba, aws, azure, baichuan, baidu, bytedance, cohere, databricks, deepseek, gemini, gemini-vertex, google, huggingface, hunyuan, kimi, meta, microsoft, minimax, mistral, moonshot, nvidia, perplexity, qwen, stabilityai, together, yi, zhipu

4. **Resizing**: High-quality Lanczos downscaling from 1024×1024 to 128×128 pixels

5. **Compression**: pngquant (quality 90-100) + optipng -o5 for balanced size/quality

**Optimization Results:**
- **Total size**: ~100KB for all 38 icons (originally ~1.6MB = **94% reduction**)
- **Colorful icons preserved**: 27 icons remain in full brand colors
- **White replacements**: 11 formerly black icons now white
- **Size range**: 1-4KB per icon
- **Average per icon**: ~2.6KB (down from ~43KB)
- **Quality**: Optimized for 128×128 web display with transparency preserved
- **Dimensions**: All icons 128×128 pixels (verified)

## Maintenance

**Last updated**: 2025-11-04
**Total logos**: 38 providers (27 colorful, 11 white - **NO black icons**)
**Total size**: ~100KB for all icons (down from 1.6MB = **94% reduction**)
**Average per icon**: ~2.6KB (down from ~43KB = **94% reduction per icon**)
**Icon resolution**: All 128×128 pixels (optimized for web)
**Format**: 8-bit colormap PNG with transparency
**Optimization**: ImageMagick Lanczos resize + pngquant (quality 90-100) + optipng -o5
**Color policy**: **Colorful icons prioritized** - white only for formerly black icons

**Key improvements:**
- ✅ **Colorful icons prioritized**: 27 icons retain full brand colors
- ✅ **Black icons eliminated**: 11 replaced with white variants (ai21, anthropic, claude, groq, ibm, inflection, liquid, openai, openrouter, replicate, xai)
- ✅ Downloaded -color variants from LobeHub CDN where available
- ✅ Resized to 128×128 pixels for balanced quality/performance
- ✅ **94% size reduction**: 1.6MB → 100KB total
- ✅ High-quality Lanczos downscaling preserves clarity at 128×128
- ✅ Optimized with pngquant + optipng for balanced compression
- ✅ All icons verified: 128×128 pixels, 8-bit colormap
