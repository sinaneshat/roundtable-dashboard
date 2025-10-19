# AI Model Provider Logos

This directory contains standardized brand logos for AI model providers used throughout the Roundtable application.

## Source

All logos are sourced from **[LobeHub Icons](https://lobehub.com/icons/)** - a comprehensive collection of AI/LLM brand logos.

**Package**: `@lobehub/icons-static-png`
**CDN**: https://unpkg.com/@lobehub/icons-static-png@latest/dark/

## Specifications

All logos in this directory follow these standards:

- **Format**: PNG with transparency
- **Dimensions**: 128×128 pixels
- **Color**: Monochrome (black/white) optimized for both light and dark themes
- **File Size**: Optimized (typically 1-7KB)
- **Naming**: Lowercase provider slug (e.g., `anthropic.png`, `openai.png`)

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
2. Download using the CDN pattern:
   ```bash
   curl -L "https://unpkg.com/@lobehub/icons-static-png@latest/dark/{SLUG}.png" \
     -o "{PROVIDER}.png"
   ```
3. Resize to 128×128 if needed:
   ```bash
   sips --resampleWidth 128 {PROVIDER}.png --out {PROVIDER}.png
   ```
4. Update `PROVIDER_ICON_MAP` in `src/lib/utils/ai-display.ts` if needed

## Available Providers

Current logo inventory (36 providers):

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

## Maintenance

Last updated: 2025-10-19
Total logos: 36 providers
Average file size: ~3.5KB
