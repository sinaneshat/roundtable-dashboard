/**
 * Uploads Services - Domain Barrel Export
 *
 * Single source of truth for all upload-related API services
 * Matches backend route structure: /api/v1/uploads/*
 */

export {
  // Multipart upload services
  type AbortMultipartUploadRequest,
  type AbortMultipartUploadResponse,
  abortMultipartUploadService,
  type CompleteMultipartUploadRequest,
  type CompleteMultipartUploadResponse,
  completeMultipartUploadService,
  type CreateMultipartUploadRequest,
  type CreateMultipartUploadResponse,
  createMultipartUploadService,
  // Upload management services
  type DeleteAttachmentRequest,
  type DeleteAttachmentResponse,
  deleteAttachmentService,
  type GetAttachmentRequest,
  type GetAttachmentResponse,
  getAttachmentService,
  // Download URL service
  type GetDownloadUrlRequest,
  type GetDownloadUrlResponse,
  getDownloadUrlService,
  type ListAttachmentsRequest,
  type ListAttachmentsResponse,
  listAttachmentsService,
  // Secure ticket-based upload services
  type RequestUploadTicketRequest,
  type RequestUploadTicketResponse,
  requestUploadTicketService,
  secureUploadService,
  type UpdateAttachmentRequest,
  type UpdateAttachmentResponse,
  updateAttachmentService,
  type UploadPartResponse,
  uploadPartService,
  type UploadPartServiceInput,
  type UploadWithTicketResponse,
  uploadWithTicketService,
} from './uploads';
