import { BRAND } from '@/constants/brand';
import { getBaseUrl } from '@/utils/helpers';

/**
 * Props for the VideoObjectSchema component
 */
type VideoObjectSchemaProps = {
  /** Video title */
  name: string;
  /** Video description */
  description: string;
  /** Thumbnail URL */
  thumbnailUrl: string;
  /** Upload date (ISO 8601 format) */
  uploadDate: string;
  /** Video content URL */
  contentUrl?: string;
  /** Video embed URL */
  embedUrl?: string;
  /** Video duration (ISO 8601 duration format, e.g., "PT1M30S" for 1 minute 30 seconds) */
  duration?: string;
  /** Transcript or caption text */
  transcript?: string;
  /** Video views count */
  interactionCount?: number;
  /** Video file format */
  encodingFormat?: string;
  /** Video width in pixels */
  width?: number;
  /** Video height in pixels */
  height?: number;
  /** Whether the video requires subscription */
  requiresSubscription?: boolean;
  /** Content rating */
  contentRating?: string;
};

/**
 * VideoObject structured data for video content
 *
 * 2025 AI Search Optimization:
 * - Video content is highly valued by AI engines
 * - Perplexity often cites video tutorials
 * - YouTube integration in AI responses
 * - Transcript helps AI understand content
 *
 * Benefits:
 * - Better video discovery in search
 * - AI can summarize video content
 * - Enhanced rich results
 * - Improved accessibility
 */
export function VideoObjectSchema(props: VideoObjectSchemaProps) {
  const {
    name,
    description,
    thumbnailUrl,
    uploadDate,
    contentUrl,
    embedUrl,
    duration,
    transcript,
    interactionCount,
    encodingFormat = 'video/mp4',
    width = 1920,
    height = 1080,
    requiresSubscription = false,
    contentRating,
  } = props;

  const baseUrl = getBaseUrl();

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    'name': name,
    'description': description,
    'thumbnailUrl': thumbnailUrl.startsWith('http') ? thumbnailUrl : `${baseUrl}${thumbnailUrl}`,
    'uploadDate': uploadDate,
    ...(contentUrl && { contentUrl }),
    ...(embedUrl && { embedUrl }),
    ...(duration && { duration }),
    ...(transcript && { transcript }),
    ...(interactionCount && {
      interactionStatistic: {
        '@type': 'InteractionCounter',
        'interactionType': 'https://schema.org/WatchAction',
        'userInteractionCount': interactionCount,
      },
    }),
    'encodingFormat': encodingFormat,
    'width': width,
    'height': height,
    'requiresSubscription': requiresSubscription,
    ...(contentRating && { contentRating }),
    'publisher': {
      '@type': 'Organization',
      'name': BRAND.fullName,
      'logo': {
        '@type': 'ImageObject',
        'url': `${baseUrl}/static/logo.png`,
      },
      'url': baseUrl,
    },
    'author': {
      '@type': 'Organization',
      'name': BRAND.venture,
      'url': BRAND.website,
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
