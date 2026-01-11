import { BRAND } from '@/constants';
import { getAppBaseUrl } from '@/lib/config/base-urls';

/**
 * Props for the HowToSchema component
 */
type HowToSchemaProps = {
  /** Title of the how-to guide */
  name: string;
  /** Description of what will be accomplished */
  description: string;
  /** Estimated time to complete (ISO 8601 duration format, e.g., "PT30M" for 30 minutes) */
  totalTime?: string;
  /** Steps to complete the task */
  steps: Array<{
    /** Step name */
    name: string;
    /** Step description */
    text: string;
    /** Optional image for the step */
    image?: string;
    /** Optional URL for more information */
    url?: string;
  }>;
  /** Supply list (optional) */
  supply?: Array<{
    name: string;
    url?: string;
  }>;
  /** Tool list (optional) */
  tool?: Array<{
    name: string;
    url?: string;
  }>;
  /** Featured image for the how-to */
  image?: string;
  /** Video tutorial URL (optional) */
  video?: {
    name: string;
    description: string;
    thumbnailUrl: string;
    uploadDate: string;
    contentUrl: string;
    duration?: string;
  };
};

/**
 * HowTo structured data for tutorials and guides
 *
 * 2025 AI Search Optimization:
 * - AI engines prefer step-by-step content
 * - HowTo schema helps ChatGPT, Perplexity, and Google understand tutorials
 * - Increases chances of being cited in AI responses
 * - Improves voice assistant compatibility
 *
 * Use this for:
 * - Getting started guides
 * - Feature tutorials
 * - Best practices
 * - Troubleshooting guides
 */
export function HowToSchema(props: HowToSchemaProps) {
  const {
    name,
    description,
    totalTime,
    steps,
    supply,
    tool,
    image,
    video,
  } = props;

  const baseUrl = getAppBaseUrl();

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    'name': name,
    'description': description,
    ...(totalTime && { totalTime }),
    ...(image && {
      image: {
        '@type': 'ImageObject',
        'url': image.startsWith('http') ? image : `${baseUrl}${image}`,
      },
    }),
    'step': steps.map((step, index) => ({
      '@type': 'HowToStep',
      'position': index + 1,
      'name': step.name,
      'text': step.text,
      ...(step.image && {
        image: {
          '@type': 'ImageObject',
          'url': step.image.startsWith('http') ? step.image : `${baseUrl}${step.image}`,
        },
      }),
      ...(step.url && {
        url: step.url.startsWith('http') ? step.url : `${baseUrl}${step.url}`,
      }),
    })),
    ...(supply && {
      supply: supply.map(item => ({
        '@type': 'HowToSupply',
        'name': item.name,
        ...(item.url && { url: item.url }),
      })),
    }),
    ...(tool && {
      tool: tool.map(item => ({
        '@type': 'HowToTool',
        'name': item.name,
        ...(item.url && { url: item.url }),
      })),
    }),
    ...(video && {
      video: {
        '@type': 'VideoObject',
        'name': video.name,
        'description': video.description,
        'thumbnailUrl': video.thumbnailUrl,
        'uploadDate': video.uploadDate,
        'contentUrl': video.contentUrl,
        ...(video.duration && { duration: video.duration }),
      },
    }),
    'publisher': {
      '@type': 'Organization',
      'name': BRAND.fullName,
      'logo': {
        '@type': 'ImageObject',
        'url': `${baseUrl}/static/logo.png`,
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Required for JSON-LD structured data injection (SEO)
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, '\u003C'),
      }}
    />
  );
}
