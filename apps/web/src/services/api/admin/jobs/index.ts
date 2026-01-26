/**
 * Admin Jobs Service
 *
 * 100% type-safe RPC service for admin automated jobs operations
 * Types fully inferred from backend via Hono RPC - no hardcoded types
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient } from '@/lib/api/client';
import type { ServiceOptions } from '@/services/api/types';

// ============================================================================
// Type Inference - Endpoint definitions
// ============================================================================

type ListJobsEndpoint = ApiClientType['admin']['admin']['jobs']['$get'];
type CreateJobEndpoint = ApiClientType['admin']['admin']['jobs']['$post'];
type GetJobEndpoint = ApiClientType['admin']['admin']['jobs'][':id']['$get'];
type UpdateJobEndpoint = ApiClientType['admin']['admin']['jobs'][':id']['$patch'];
type DeleteJobEndpoint = ApiClientType['admin']['admin']['jobs'][':id']['$delete'];
type DiscoverTrendsEndpoint = ApiClientType['admin']['admin']['jobs']['trends']['discover']['$post'];

// ============================================================================
// Type Exports - Request/Response types inferred from backend
// ============================================================================

// List jobs
export type ListJobsParams = InferRequestType<ListJobsEndpoint>;
export type ListJobsResponse = InferResponseType<ListJobsEndpoint, 200>;
type ListSuccessResponse = Extract<ListJobsResponse, { success: true }>;
export type ListJobsData = ListSuccessResponse['data'];
export type AutomatedJob = ListJobsData['jobs'][number];

// Create job
export type CreateJobParams = InferRequestType<CreateJobEndpoint>;
export type CreateJobResponse = InferResponseType<CreateJobEndpoint, 201>;

// Get job
export type GetJobParams = InferRequestType<GetJobEndpoint>;
export type GetJobResponse = InferResponseType<GetJobEndpoint, 200>;

// Update job
export type UpdateJobParams = InferRequestType<UpdateJobEndpoint>;
export type UpdateJobResponse = InferResponseType<UpdateJobEndpoint, 200>;

// Delete job
export type DeleteJobParams = InferRequestType<DeleteJobEndpoint>;
export type DeleteJobResponse = InferResponseType<DeleteJobEndpoint, 200>;

// Discover trends
export type DiscoverTrendsParams = InferRequestType<DiscoverTrendsEndpoint>;
export type DiscoverTrendsResponse = InferResponseType<DiscoverTrendsEndpoint, 200>;
type DiscoverTrendsSuccessResponse = Extract<DiscoverTrendsResponse, { success: true }>;
export type DiscoverTrendsData = DiscoverTrendsSuccessResponse['data'];
export type TrendSuggestion = DiscoverTrendsData['suggestions'][number];

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List automated jobs (admin only)
 */
export async function listJobsService(
  params?: { query?: ListJobsParams['query'] },
  options?: ServiceOptions,
) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  const requestParams = { query: params?.query ?? {} };
  return parseResponse(client.admin.admin.jobs.$get(requestParams));
}

/**
 * Create an automated job (admin only)
 */
export async function createJobService(data: CreateJobParams) {
  const client = createApiClient();
  return parseResponse(client.admin.admin.jobs.$post(data));
}

/**
 * Get job by ID (admin only)
 */
export async function getJobService(params: GetJobParams, options?: ServiceOptions) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.admin.admin.jobs[':id'].$get(params));
}

/**
 * Update job (admin only)
 */
export async function updateJobService(params: UpdateJobParams) {
  const client = createApiClient();
  return parseResponse(client.admin.admin.jobs[':id'].$patch(params));
}

/**
 * Delete job (admin only)
 */
export async function deleteJobService(params: DeleteJobParams) {
  const client = createApiClient();
  return parseResponse(client.admin.admin.jobs[':id'].$delete(params));
}

/**
 * Discover trending topics (admin only)
 */
export async function discoverTrendsService(params: DiscoverTrendsParams) {
  const client = createApiClient();
  return parseResponse(client.admin.admin.jobs.trends.discover.$post(params));
}
