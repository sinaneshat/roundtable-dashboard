/**
 * API Routes Index
 *
 * This file registers all OpenAPI routes using chained .route() calls.
 * Routes are grouped into separate apps (~15 routes each) to avoid TS7056
 * (type instantiation excessively deep).
 *
 * PATTERN: Each group is a standalone OpenAPIHono app with its own type.
 * Groups are CHAINED (not merged) using .route('/', group) for type preservation.
 *
 * IMPORTANT: Chaining .route() preserves types for Hono RPC.
 * The final chained app type is exported as AppType.
 */

// ============================================================================
// CHAINED ROUTE COMPOSITION
//
// Chain all route groups using .route() to preserve types.
// This is the pattern from Hono docs for multi-file route organization.
// ============================================================================
import type { OpenAPIHono } from '@hono/zod-openapi';

import { createOpenApiApp } from '@/core/app';
import type { ApiEnv } from '@/types';

// ============================================================================
// Admin Routes
// ============================================================================
import { adminClearUserCacheHandler, adminSearchUserHandler } from './admin/handler';
import {
  createJobHandler,
  deleteJobHandler,
  getJobHandler,
  listJobsHandler,
  updateJobHandler,
} from './admin/jobs/handler';
import {
  createJobRoute,
  deleteJobRoute,
  getJobRoute,
  listJobsRoute,
  updateJobRoute,
} from './admin/jobs/route';
import { discoverTrendsHandler } from './admin/jobs/trends/handler';
import { discoverTrendsRoute } from './admin/jobs/trends/route';
import { adminClearUserCacheRoute, adminSearchUserRoute } from './admin/route';
import {
  createApiKeyHandler,
  deleteApiKeyHandler,
  getApiKeyHandler,
  listApiKeysHandler,
  updateApiKeyHandler,
} from './api-keys/handler';
import {
  createApiKeyRoute,
  deleteApiKeyRoute,
  getApiKeyRoute,
  listApiKeysRoute,
  updateApiKeyRoute,
} from './api-keys/route';
// ============================================================================
// Auth Routes
// ============================================================================
import { clearOwnCacheHandler, secureMeHandler } from './auth/handler';
import { clearOwnCacheRoute, secureMeRoute } from './auth/route';
// ============================================================================
// Billing Routes
// ============================================================================
import {
  cancelSubscriptionHandler,
  createCheckoutSessionHandler,
  createCustomerPortalSessionHandler,
  getProductHandler,
  getSubscriptionHandler,
  handleWebhookHandler,
  listProductsHandler,
  listSubscriptionsHandler,
  switchSubscriptionHandler,
  syncAfterCheckoutHandler,
  syncCreditsAfterCheckoutHandler,
} from './billing/handler';
import {
  cancelSubscriptionRoute,
  createCheckoutSessionRoute,
  createCustomerPortalSessionRoute,
  getProductRoute,
  getSubscriptionRoute,
  handleWebhookRoute,
  listProductsRoute,
  listSubscriptionsRoute,
  switchSubscriptionRoute,
  syncAfterCheckoutRoute,
  syncCreditsAfterCheckoutRoute,
} from './billing/route';
// ============================================================================
// Chat Routes
// ============================================================================
import {
  addParticipantHandler,
  analyzePromptHandler,
  councilModeratorRoundHandler,
  createCustomRoleHandler,
  createThreadHandler,
  createUserPresetHandler,
  deleteCustomRoleHandler,
  deleteParticipantHandler,
  deleteThreadHandler,
  deleteUserPresetHandler,
  executePreSearchHandler,
  getCustomRoleHandler,
  getPublicThreadHandler,
  getRoundStatusHandler,
  getThreadBySlugHandler,
  getThreadChangelogHandler,
  getThreadFeedbackHandler,
  getThreadHandler,
  getThreadMemoryEventsHandler,
  getThreadMessagesHandler,
  getThreadPreSearchesHandler,
  getThreadRoundChangelogHandler,
  getThreadSlugStatusHandler,
  getThreadStreamResumptionStateHandler,
  getUserPresetHandler,
  listCustomRolesHandler,
  listPublicThreadSlugsHandler,
  listSidebarThreadsHandler,
  listThreadsHandler,
  listUserPresetsHandler,
  resumeThreadStreamHandler,
  setRoundFeedbackHandler,
  startRoundHandler,
  streamChatHandler,
  subscribeToModeratorStreamHandler,
  subscribeToParticipantStreamHandler,
  subscribeToPreSearchStreamHandler,
  updateCustomRoleHandler,
  updateParticipantHandler,
  updateThreadHandler,
  updateUserPresetHandler,
} from './chat';
import {
  addParticipantRoute,
  analyzePromptRoute,
  councilModeratorRoundRoute,
  createCustomRoleRoute,
  createThreadRoute,
  createUserPresetRoute,
  deleteCustomRoleRoute,
  deleteParticipantRoute,
  deleteThreadRoute,
  deleteUserPresetRoute,
  executePreSearchRoute,
  getCustomRoleRoute,
  getPublicThreadRoute,
  getRoundStatusRoute,
  getThreadBySlugRoute,
  getThreadChangelogRoute,
  getThreadFeedbackRoute,
  getThreadMemoryEventsRoute,
  getThreadMessagesRoute,
  getThreadPreSearchesRoute,
  getThreadRoundChangelogRoute,
  getThreadRoute,
  getThreadSlugStatusRoute,
  getThreadStreamResumptionStateRoute,
  getUserPresetRoute,
  listCustomRolesRoute,
  listPublicThreadSlugsRoute,
  listSidebarThreadsRoute,
  listThreadsRoute,
  listUserPresetsRoute,
  resumeThreadStreamRoute,
  setRoundFeedbackRoute,
  startRoundRoute,
  streamChatRoute,
  subscribeToModeratorStreamRoute,
  subscribeToParticipantStreamRoute,
  subscribeToPreSearchStreamRoute,
  updateCustomRoleRoute,
  updateParticipantRoute,
  updateThreadRoute,
  updateUserPresetRoute,
} from './chat/route';
import {
  estimateCreditCostHandler,
  getCreditBalanceHandler,
  getCreditTransactionsHandler,
} from './credits/handler';
import {
  estimateCreditCostRoute,
  getCreditBalanceRoute,
  getCreditTransactionsRoute,
} from './credits/route';
import {
  callToolHandler,
  listResourcesHandler,
  listToolsHandler,
  mcpJsonRpcHandler,
  openAIFunctionsHandler,
} from './mcp/handler';
import {
  callToolRoute,
  listResourcesRoute,
  listToolsRoute,
  mcpJsonRpcRoute,
  openAIFunctionsRoute,
} from './mcp/route';
// ============================================================================
// Utility Routes (Models, MCP, Usage, Credits)
// ============================================================================
import { listModelsHandler } from './models/handler';
import { listModelsRoute } from './models/route';
import { ogChatHandler } from './og';
import { ogChatRoute } from './og/route';
// ============================================================================
// Project Routes
// ============================================================================
import {
  addAttachmentToProjectHandler,
  createProjectHandler,
  createProjectMemoryHandler,
  deleteProjectHandler,
  deleteProjectMemoryHandler,
  getProjectAttachmentHandler,
  getProjectContextHandler,
  getProjectHandler,
  getProjectLimitsHandler,
  getProjectMemoryHandler,
  listProjectAttachmentsHandler,
  listProjectMemoriesHandler,
  listProjectsHandler,
  listProjectThreadsHandler,
  removeAttachmentFromProjectHandler,
  updateProjectAttachmentHandler,
  updateProjectHandler,
  updateProjectMemoryHandler,
} from './project/handler';
import {
  addAttachmentToProjectRoute,
  createProjectMemoryRoute,
  createProjectRoute,
  deleteProjectMemoryRoute,
  deleteProjectRoute,
  getProjectAttachmentRoute,
  getProjectContextRoute,
  getProjectLimitsRoute,
  getProjectMemoryRoute,
  getProjectRoute,
  listProjectAttachmentsRoute,
  listProjectMemoriesRoute,
  listProjectsRoute,
  listProjectThreadsRoute,
  removeAttachmentFromProjectRoute,
  updateProjectAttachmentRoute,
  updateProjectMemoryRoute,
  updateProjectRoute,
} from './project/route';
// ============================================================================
// Health & System Routes
// ============================================================================
import { detailedHealthHandler, healthHandler } from './system/handler';
import { detailedHealthRoute, healthRoute } from './system/route';
// ============================================================================
// Test Routes (dev only)
// ============================================================================
import { setUserCreditsHandler } from './test/handler';
import { setUserCreditsRoute } from './test/route';
// ============================================================================
// Upload Routes
// ============================================================================
import {
  abortMultipartUploadHandler,
  completeMultipartUploadHandler,
  createMultipartUploadHandler,
  deleteUploadHandler,
  downloadUploadHandler,
  getDownloadUrlHandler,
  getUploadHandler,
  listUploadsHandler,
  requestUploadTicketHandler,
  updateUploadHandler,
  uploadPartHandler,
  uploadWithTicketHandler,
} from './uploads/handler';
import {
  abortMultipartUploadRoute,
  completeMultipartUploadRoute,
  createMultipartUploadRoute,
  deleteUploadRoute,
  downloadUploadRoute,
  getDownloadUrlRoute,
  getUploadRoute,
  listUploadsRoute,
  requestUploadTicketRoute,
  updateUploadRoute,
  uploadPartRoute,
  uploadWithTicketRoute,
} from './uploads/route';
import { getUserUsageStatsHandler } from './usage/handler';
import { getUserUsageStatsRoute } from './usage/route';

// ============================================================================
// ROUTE GROUP DEFINITIONS
//
// Each group is a standalone OpenAPIHono app with chained .openapi() calls.
// This keeps each group's type chain short (< 20 routes) to avoid TS7056.
// ============================================================================

/**
 * Group 1: Health + Auth (10 routes)
 */
const healthAuthRoutes = createOpenApiApp()
  .openapi(healthRoute, healthHandler)
  .openapi(detailedHealthRoute, detailedHealthHandler)
  .openapi(ogChatRoute, ogChatHandler)
  .openapi(secureMeRoute, secureMeHandler)
  .openapi(clearOwnCacheRoute, clearOwnCacheHandler)
  .openapi(listApiKeysRoute, listApiKeysHandler)
  .openapi(getApiKeyRoute, getApiKeyHandler)
  .openapi(createApiKeyRoute, createApiKeyHandler)
  .openapi(updateApiKeyRoute, updateApiKeyHandler)
  .openapi(deleteApiKeyRoute, deleteApiKeyHandler);

/**
 * Group 2: Billing (11 routes)
 */
const billingRoutes = createOpenApiApp()
  .openapi(listProductsRoute, listProductsHandler)
  .openapi(getProductRoute, getProductHandler)
  .openapi(createCheckoutSessionRoute, createCheckoutSessionHandler)
  .openapi(createCustomerPortalSessionRoute, createCustomerPortalSessionHandler)
  .openapi(syncAfterCheckoutRoute, syncAfterCheckoutHandler)
  .openapi(syncCreditsAfterCheckoutRoute, syncCreditsAfterCheckoutHandler)
  .openapi(listSubscriptionsRoute, listSubscriptionsHandler)
  .openapi(getSubscriptionRoute, getSubscriptionHandler)
  .openapi(switchSubscriptionRoute, switchSubscriptionHandler)
  .openapi(cancelSubscriptionRoute, cancelSubscriptionHandler)
  .openapi(handleWebhookRoute, handleWebhookHandler);

/**
 * Group 3: Chat - Threads (11 routes)
 */
const chatThreadRoutes = createOpenApiApp()
  .openapi(listThreadsRoute, listThreadsHandler)
  .openapi(listSidebarThreadsRoute, listSidebarThreadsHandler)
  .openapi(createThreadRoute, createThreadHandler)
  .openapi(getThreadRoute, getThreadHandler)
  .openapi(getThreadBySlugRoute, getThreadBySlugHandler)
  .openapi(getThreadSlugStatusRoute, getThreadSlugStatusHandler)
  .openapi(updateThreadRoute, updateThreadHandler)
  .openapi(deleteThreadRoute, deleteThreadHandler)
  .openapi(getPublicThreadRoute, getPublicThreadHandler)
  .openapi(listPublicThreadSlugsRoute, listPublicThreadSlugsHandler)
  .openapi(getThreadMemoryEventsRoute, getThreadMemoryEventsHandler);

/**
 * Group 4: Chat - Messages & Streaming (10 routes)
 */
const chatMessageRoutes = createOpenApiApp()
  .openapi(getThreadMessagesRoute, getThreadMessagesHandler)
  .openapi(getThreadChangelogRoute, getThreadChangelogHandler)
  .openapi(getThreadRoundChangelogRoute, getThreadRoundChangelogHandler)
  .openapi(streamChatRoute, streamChatHandler)
  .openapi(resumeThreadStreamRoute, resumeThreadStreamHandler)
  .openapi(getThreadStreamResumptionStateRoute, getThreadStreamResumptionStateHandler)
  .openapi(analyzePromptRoute, analyzePromptHandler)
  .openapi(addParticipantRoute, addParticipantHandler)
  .openapi(updateParticipantRoute, updateParticipantHandler)
  .openapi(deleteParticipantRoute, deleteParticipantHandler);

/**
 * Group 5: Chat - Features (16 routes)
 */
const chatFeatureRoutes = createOpenApiApp()
  .openapi(executePreSearchRoute, executePreSearchHandler)
  .openapi(getThreadPreSearchesRoute, getThreadPreSearchesHandler)
  .openapi(councilModeratorRoundRoute, councilModeratorRoundHandler)
  .openapi(getRoundStatusRoute, getRoundStatusHandler)
  .openapi(listCustomRolesRoute, listCustomRolesHandler)
  .openapi(createCustomRoleRoute, createCustomRoleHandler)
  .openapi(getCustomRoleRoute, getCustomRoleHandler)
  .openapi(updateCustomRoleRoute, updateCustomRoleHandler)
  .openapi(deleteCustomRoleRoute, deleteCustomRoleHandler)
  .openapi(listUserPresetsRoute, listUserPresetsHandler)
  .openapi(createUserPresetRoute, createUserPresetHandler)
  .openapi(getUserPresetRoute, getUserPresetHandler)
  .openapi(updateUserPresetRoute, updateUserPresetHandler)
  .openapi(deleteUserPresetRoute, deleteUserPresetHandler)
  .openapi(setRoundFeedbackRoute, setRoundFeedbackHandler)
  .openapi(getThreadFeedbackRoute, getThreadFeedbackHandler);

/**
 * Group 5b: Chat - Entity Subscriptions & Round Orchestration (4 routes)
 * ✅ BACKEND-FIRST ARCHITECTURE: Per FLOW_DOCUMENTATION.md
 */
const chatEntitySubscriptionRoutes = createOpenApiApp()
  .openapi(startRoundRoute, startRoundHandler)
  .openapi(subscribeToPreSearchStreamRoute, subscribeToPreSearchStreamHandler)
  .openapi(subscribeToParticipantStreamRoute, subscribeToParticipantStreamHandler)
  .openapi(subscribeToModeratorStreamRoute, subscribeToModeratorStreamHandler);

/**
 * Group 6: Projects (18 routes)
 */
const projectRoutes = createOpenApiApp()
  .openapi(listProjectsRoute, listProjectsHandler)
  .openapi(getProjectLimitsRoute, getProjectLimitsHandler)
  .openapi(createProjectRoute, createProjectHandler)
  .openapi(getProjectRoute, getProjectHandler)
  .openapi(updateProjectRoute, updateProjectHandler)
  .openapi(deleteProjectRoute, deleteProjectHandler)
  .openapi(listProjectThreadsRoute, listProjectThreadsHandler)
  .openapi(listProjectAttachmentsRoute, listProjectAttachmentsHandler)
  .openapi(addAttachmentToProjectRoute, addAttachmentToProjectHandler)
  .openapi(getProjectAttachmentRoute, getProjectAttachmentHandler)
  .openapi(updateProjectAttachmentRoute, updateProjectAttachmentHandler)
  .openapi(removeAttachmentFromProjectRoute, removeAttachmentFromProjectHandler)
  .openapi(listProjectMemoriesRoute, listProjectMemoriesHandler)
  .openapi(createProjectMemoryRoute, createProjectMemoryHandler)
  .openapi(getProjectMemoryRoute, getProjectMemoryHandler)
  .openapi(updateProjectMemoryRoute, updateProjectMemoryHandler)
  .openapi(deleteProjectMemoryRoute, deleteProjectMemoryHandler)
  .openapi(getProjectContextRoute, getProjectContextHandler);

/**
 * Group 7: Admin (8 routes)
 */
const adminRoutes = createOpenApiApp()
  .openapi(adminSearchUserRoute, adminSearchUserHandler)
  .openapi(adminClearUserCacheRoute, adminClearUserCacheHandler)
  .openapi(listJobsRoute, listJobsHandler)
  .openapi(createJobRoute, createJobHandler)
  .openapi(getJobRoute, getJobHandler)
  .openapi(updateJobRoute, updateJobHandler)
  .openapi(deleteJobRoute, deleteJobHandler)
  .openapi(discoverTrendsRoute, discoverTrendsHandler);

/**
 * Group 8: Utility (10 routes)
 */
const utilityRoutes = createOpenApiApp()
  .openapi(getUserUsageStatsRoute, getUserUsageStatsHandler)
  .openapi(getCreditBalanceRoute, getCreditBalanceHandler)
  .openapi(getCreditTransactionsRoute, getCreditTransactionsHandler)
  .openapi(estimateCreditCostRoute, estimateCreditCostHandler)
  .openapi(listModelsRoute, listModelsHandler)
  .openapi(mcpJsonRpcRoute, mcpJsonRpcHandler)
  .openapi(listToolsRoute, listToolsHandler)
  .openapi(listResourcesRoute, listResourcesHandler)
  .openapi(callToolRoute, callToolHandler)
  .openapi(openAIFunctionsRoute, openAIFunctionsHandler);

/**
 * Group 9: Uploads (12 routes)
 */
const uploadRoutes = createOpenApiApp()
  .openapi(listUploadsRoute, listUploadsHandler)
  .openapi(getUploadRoute, getUploadHandler)
  .openapi(getDownloadUrlRoute, getDownloadUrlHandler)
  .openapi(downloadUploadRoute, downloadUploadHandler)
  .openapi(updateUploadRoute, updateUploadHandler)
  .openapi(deleteUploadRoute, deleteUploadHandler)
  .openapi(requestUploadTicketRoute, requestUploadTicketHandler)
  .openapi(uploadWithTicketRoute, uploadWithTicketHandler)
  .openapi(createMultipartUploadRoute, createMultipartUploadHandler)
  .openapi(uploadPartRoute, uploadPartHandler)
  .openapi(completeMultipartUploadRoute, completeMultipartUploadHandler)
  .openapi(abortMultipartUploadRoute, abortMultipartUploadHandler);

/**
 * Group 10: Test (1 route - dev only)
 */
const testRoutes = createOpenApiApp()
  .openapi(setUserCreditsRoute, setUserCreditsHandler);

// ============================================================================
// TYPE DEFINITIONS FOR EACH ROUTE GROUP
//
// Each group's type is exported separately so TypeScript can serialize them
// individually. The web client imports specific group types as needed.
// ============================================================================

export type HealthAuthRoutesType = typeof healthAuthRoutes;
export type BillingRoutesType = typeof billingRoutes;
export type ChatThreadRoutesType = typeof chatThreadRoutes;
export type ChatMessageRoutesType = typeof chatMessageRoutes;
export type ChatFeatureRoutesType = typeof chatFeatureRoutes;
export type ChatEntitySubscriptionRoutesType = typeof chatEntitySubscriptionRoutes;
export type ProjectRoutesType = typeof projectRoutes;
export type AdminRoutesType = typeof adminRoutes;
export type UtilityRoutesType = typeof utilityRoutes;
export type UploadRoutesType = typeof uploadRoutes;
export type TestRoutesType = typeof testRoutes;

// ============================================================================
// CHAINED ROUTE COMPOSITION FOR RPC
//
// TS7056 CONSTRAINT: With 100+ routes, TypeScript can't infer `typeof apiRoutes`.
// We use explicit type annotation + intersection type as workaround.
// ============================================================================

const apiRoutes: OpenAPIHono<ApiEnv> = createOpenApiApp()
  .route('/', healthAuthRoutes)
  .route('/', billingRoutes)
  .route('/', chatThreadRoutes)
  .route('/', chatMessageRoutes)
  .route('/', chatFeatureRoutes)
  .route('/', chatEntitySubscriptionRoutes)
  .route('/', projectRoutes)
  .route('/', adminRoutes)
  .route('/', utilityRoutes)
  .route('/', uploadRoutes)
  .route('/', testRoutes);

export { apiRoutes };

// Intersection of route types for RPC client type inference
export type AppType
  = HealthAuthRoutesType
    & BillingRoutesType
    & ChatThreadRoutesType
    & ChatMessageRoutesType
    & ChatFeatureRoutesType
    & ChatEntitySubscriptionRoutesType
    & ProjectRoutesType
    & AdminRoutesType
    & UtilityRoutesType
    & UploadRoutesType
    & TestRoutesType;
