import { z } from 'zod';

const ProjectAttachmentRagMetadataSchema = z.object({
  context: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  projectR2Key: z.string().optional(),
  sourceThreadId: z.string().optional(),
}).strict();

export function getSourceThreadId(ragMetadata: unknown): string | null {
  const parsed = ProjectAttachmentRagMetadataSchema.safeParse(ragMetadata);
  return parsed.success ? (parsed.data.sourceThreadId ?? null) : null;
}

export function isAttachmentFromThread(ragMetadata: unknown): boolean {
  return getSourceThreadId(ragMetadata) !== null;
}
