/**
 * useIncompatibleModels - Shared hook for model compatibility checking
 *
 * Extracts duplicated logic from ChatThreadScreen and ChatView into a single hook.
 * Handles:
 * - Vision (image) incompatibility detection
 * - File (document) incompatibility detection
 * - Tier-restricted model detection
 * - Auto-deselection of incompatible models with toast notifications
 *
 * This consolidates ~150 lines of duplicate code from:
 * - ChatThreadScreen.tsx:145-279
 * - ChatView.tsx:250-453
 */

import type { ScreenMode } from '@roundtable/shared';
import { ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef } from 'react';

import { useTranslations } from '@/lib/i18n';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { toastManager } from '@/lib/toast';
import {
  getDetailedIncompatibleModelIds,
  isDocumentFile,
  isImageFile,
  isVisionRequiredMimeType,
  threadHasDocumentFiles,
  threadHasImageFiles,
} from '@/lib/utils';
import type { Model } from '@/services/api';

import type { UseChatAttachmentsReturn } from './use-chat-attachments';

export type UseIncompatibleModelsOptions = {
  messages: UIMessage[];
  attachments: UseChatAttachmentsReturn['attachments'];
  allEnabledModels: Model[];
  selectedParticipants: ParticipantConfig[];
  mode: ScreenMode;
  autoMode?: boolean;
  onParticipantsChange: (participants: ParticipantConfig[]) => void;
};

export type UseIncompatibleModelsReturn = {
  incompatibleModelIds: Set<string>;
  visionIncompatibleModelIds: Set<string>;
  fileIncompatibleModelIds: Set<string>;
};

/**
 * Shared hook for detecting and handling incompatible models.
 * Prevents code duplication between ChatThreadScreen and ChatView.
 */
export function useIncompatibleModels({
  messages,
  attachments,
  allEnabledModels,
  selectedParticipants,
  mode,
  autoMode = false,
  onParticipantsChange,
}: UseIncompatibleModelsOptions): UseIncompatibleModelsReturn {
  const t = useTranslations();
  const hasCompletedInitialMountRef = useRef(false);
  const incompatibleModelIdsRef = useRef<Set<string>>(new Set());

  // Calculate incompatible models based on capabilities and files
  const { incompatibleModelIds, visionIncompatibleModelIds, fileIncompatibleModelIds } = useMemo(() => {
    const incompatible = new Set<string>();

    // Add inaccessible models (tier restrictions)
    for (const model of allEnabledModels) {
      if (!model.is_accessible_to_user) {
        incompatible.add(model.id);
      }
    }

    // Check for images in thread and attachments
    const existingImageFiles = threadHasImageFiles(messages);
    const newImageFiles = attachments.some(att => isImageFile(att.file.type));
    const hasImages = existingImageFiles || newImageFiles;

    // Check for documents in thread and attachments
    const existingDocumentFiles = threadHasDocumentFiles(messages);
    const newDocumentFiles = attachments.some(att => isDocumentFile(att.file.type));
    const hasDocuments = existingDocumentFiles || newDocumentFiles;

    // Build file list for capability checking
    const files: Array<{ mimeType: string }> = [];
    if (hasImages) {
      files.push({ mimeType: 'image/png' }); // Representative image type
    }
    if (hasDocuments) {
      files.push({ mimeType: 'application/pdf' }); // Representative document type
    }

    // Get detailed incompatibility info
    const modelsWithCapabilities = allEnabledModels.map((m: Model) => ({
      id: m.id,
      capabilities: {
        vision: m.supports_vision,
        file: m.supports_file,
      },
    }));

    const {
      incompatibleIds,
      visionIncompatibleIds,
      fileIncompatibleIds,
    } = getDetailedIncompatibleModelIds(modelsWithCapabilities, files);

    // Merge with tier-restricted models
    for (const id of incompatibleIds) {
      incompatible.add(id);
    }

    return {
      incompatibleModelIds: incompatible,
      visionIncompatibleModelIds: visionIncompatibleIds,
      fileIncompatibleModelIds: fileIncompatibleIds,
    };
  }, [messages, attachments, allEnabledModels]);

  // Keep ref updated for use in callbacks
  useEffect(() => {
    incompatibleModelIdsRef.current = incompatibleModelIds;
  }, [incompatibleModelIds]);

  // Auto-deselect incompatible models and show toast
  useEffect(() => {
    const isInitialMount = !hasCompletedInitialMountRef.current;
    if (isInitialMount) {
      hasCompletedInitialMountRef.current = true;
    }

    const hasVisualAttachments = attachments.some(att =>
      isVisionRequiredMimeType(att.file.type),
    );

    // Skip incompatible filter when autoMode is enabled in OVERVIEW mode
    // Server validates model accessibility in auto mode - trust those results
    // ALWAYS check vision incompatibility when files are attached
    if (mode === ScreenModes.OVERVIEW && autoMode && !hasVisualAttachments) {
      return;
    }

    // Skip in OVERVIEW mode with no messages and no visual files
    if (mode === ScreenModes.OVERVIEW && messages.length === 0 && !hasVisualAttachments) {
      return;
    }

    if (incompatibleModelIds.size === 0) {
      return;
    }

    const incompatibleSelected = selectedParticipants.filter(p =>
      incompatibleModelIds.has(p.modelId),
    );

    if (incompatibleSelected.length === 0) {
      return;
    }

    // Track deselected models by reason
    const visionDeselected = incompatibleSelected.filter(
      p => visionIncompatibleModelIds.has(p.modelId),
    );
    const fileDeselected = incompatibleSelected.filter(
      p => fileIncompatibleModelIds.has(p.modelId) && !visionIncompatibleModelIds.has(p.modelId),
    );

    const visionModelNames = visionDeselected
      .map((p: ParticipantConfig) => allEnabledModels.find((m: Model) => m.id === p.modelId)?.name)
      .filter((name): name is string => Boolean(name));

    const fileModelNames = fileDeselected
      .map((p: ParticipantConfig) => allEnabledModels.find((m: Model) => m.id === p.modelId)?.name)
      .filter((name): name is string => Boolean(name));

    const compatibleParticipants = selectedParticipants
      .filter(p => !incompatibleModelIds.has(p.modelId))
      .map((p, index) => ({ ...p, priority: index }));

    onParticipantsChange(compatibleParticipants);

    // Show granular toasts (not on initial page load)
    if (!isInitialMount) {
      if (visionModelNames.length > 0) {
        const modelList = visionModelNames.length <= 2
          ? visionModelNames.join(' and ')
          : `${visionModelNames.slice(0, 2).join(', ')} and ${visionModelNames.length - 2} more`;

        toastManager.warning(
          t('chat.models.modelsDeselected'),
          t('chat.models.modelsDeselectedDueToImages', { models: modelList }),
        );
      }

      if (fileModelNames.length > 0) {
        const modelList = fileModelNames.length <= 2
          ? fileModelNames.join(' and ')
          : `${fileModelNames.slice(0, 2).join(', ')} and ${fileModelNames.length - 2} more`;

        toastManager.warning(
          t('chat.models.modelsDeselected'),
          t('chat.models.modelsDeselectedDueToDocuments', { models: modelList }),
        );
      }
    }
  }, [
    mode,
    autoMode,
    incompatibleModelIds,
    visionIncompatibleModelIds,
    fileIncompatibleModelIds,
    selectedParticipants,
    messages,
    onParticipantsChange,
    allEnabledModels,
    t,
    attachments,
  ]);

  return {
    incompatibleModelIds,
    visionIncompatibleModelIds,
    fileIncompatibleModelIds,
  };
}

/**
 * Check if a model can be selected (for use in toggle handlers)
 */
export function canSelectModel(
  modelId: string,
  incompatibleModelIds: Set<string>,
  t: ReturnType<typeof useTranslations>,
): boolean {
  if (incompatibleModelIds.has(modelId)) {
    toastManager.warning(
      t('chat.models.cannotSelectModel'),
      t('chat.models.modelIncompatibleWithFiles'),
    );
    return false;
  }
  return true;
}
