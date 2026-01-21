/**
 * Clear R2 buckets for cache and uploads
 *
 * Clears both:
 * - Application cache bucket (roundtable-dashboard-r2-cache-{env})
 * - Uploads bucket (roundtable-dashboard-r2-uploads-{env})
 *
 * Usage:
 *   npx tsx scripts/clear-r2-cache.ts [preview|prod] [--cache-only|--uploads-only]
 *
 * Environment:
 *   CLOUDFLARE_API_TOKEN - Required. Create at https://dash.cloudflare.com/profile/api-tokens
 *
 * Options:
 *   --cache-only    Only clear the cache bucket
 *   --uploads-only  Only clear the uploads bucket
 *   --skip-if-no-token  Don't error if token is missing (for optional cleanup)
 */

const ACCOUNT_ID = '499b6c3c38f75f7f7dc7d3127954b921'

const CACHE_BUCKETS = {
  preview: 'roundtable-dashboard-r2-cache-preview',
  prod: 'roundtable-dashboard-r2-cache-prod',
  production: 'roundtable-dashboard-r2-cache-prod',
} as const

const UPLOAD_BUCKETS = {
  preview: 'roundtable-dashboard-r2-uploads-preview',
  prod: 'roundtable-dashboard-r2-uploads-prod',
  production: 'roundtable-dashboard-r2-uploads-prod',
} as const

type Environment = keyof typeof CACHE_BUCKETS

interface R2Object {
  key: string
  etag: string
  size: number
}

interface R2ListResponse {
  success: boolean
  errors?: { message: string }[]
  result: R2Object[]
  result_info?: {
    cursor?: string
    is_truncated: boolean
  }
}

interface R2DeleteResponse {
  success: boolean
  errors?: { message: string }[]
}

async function clearBucket(bucketName: string, apiToken: string): Promise<number> {
  console.log(`🗑️  Clearing R2 bucket: ${bucketName}`)

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${bucketName}/objects`
  const headers = {
    'Authorization': `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  }

  let cursor: string | undefined
  let totalDeleted = 0

  do {
    // List objects
    const listUrl = cursor ? `${baseUrl}?cursor=${cursor}` : baseUrl
    const listRes = await fetch(listUrl, { headers })
    const listData = await listRes.json() as R2ListResponse

    if (!listData.success) {
      console.error('Failed to list objects:', listData.errors)
      throw new Error(`Failed to list objects in ${bucketName}`)
    }

    // API returns objects directly in .result array
    const objects = listData.result || []
    if (objects.length === 0) {
      if (totalDeleted === 0) {
        console.log('  No objects to delete')
      }
      break
    }

    // Delete objects one by one (R2 REST API doesn't support bulk delete)
    const keys = objects.map(obj => obj.key)
    let batchDeleted = 0

    for (const key of keys) {
      const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${bucketName}/objects/${encodeURIComponent(key)}`
      const deleteRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers,
      })
      const deleteData = await deleteRes.json() as R2DeleteResponse

      if (!deleteData.success) {
        console.error(`Failed to delete ${key}:`, deleteData.errors)
        // Continue with other objects instead of failing completely
        continue
      }
      batchDeleted++
    }

    totalDeleted += batchDeleted
    console.log(`  Deleted ${batchDeleted} objects (total: ${totalDeleted})`)

    // Check for pagination
    const isTruncated = listData.result_info?.is_truncated ?? false
    cursor = isTruncated ? listData.result_info?.cursor : undefined
  } while (cursor)

  console.log(`✅ Cleared ${totalDeleted} objects from ${bucketName}`)
  return totalDeleted
}

async function main() {
  const args = process.argv.slice(2)
  const env = (args.find(a => !a.startsWith('--')) || 'preview') as Environment
  const cacheOnly = args.includes('--cache-only')
  const uploadsOnly = args.includes('--uploads-only')
  const skipIfNoToken = args.includes('--skip-if-no-token')

  const cacheBucket = CACHE_BUCKETS[env]
  const uploadBucket = UPLOAD_BUCKETS[env]

  if (!cacheBucket || !uploadBucket) {
    console.error(`Unknown environment: ${env}`)
    console.error('Valid environments: preview, prod')
    process.exit(1)
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!apiToken) {
    if (skipIfNoToken) {
      console.log('⚠️  CLOUDFLARE_API_TOKEN not set, skipping R2 cache clear')
      process.exit(0)
    }
    console.error('CLOUDFLARE_API_TOKEN environment variable required')
    console.error('Create a token with R2 read/write permissions at:')
    console.error('https://dash.cloudflare.com/profile/api-tokens')
    process.exit(1)
  }

  console.log(`\n🧹 Clearing R2 buckets for environment: ${env}\n`)

  let totalCleared = 0

  try {
    // Clear cache bucket
    if (!uploadsOnly) {
      totalCleared += await clearBucket(cacheBucket, apiToken)
    }

    // Clear uploads bucket
    if (!cacheOnly) {
      totalCleared += await clearBucket(uploadBucket, apiToken)
    }

    console.log(`\n✅ Total: Cleared ${totalCleared} objects from R2\n`)
  } catch (error) {
    console.error('\n❌ Failed to clear R2 buckets:', error)
    process.exit(1)
  }
}

main()
