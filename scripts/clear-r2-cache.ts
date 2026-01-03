/**
 * Clear R2 incremental cache bucket for OpenNext
 * Usage: npx tsx scripts/clear-r2-cache.ts [preview|prod]
 */

const ACCOUNT_ID = '499b6c3c38f75f7f7dc7d3127954b921'

const BUCKETS = {
  preview: 'roundtable-dashboard-r2-cache-preview',
  prod: 'roundtable-dashboard-r2-cache-prod',
  production: 'roundtable-dashboard-r2-cache-prod',
} as const

type Environment = keyof typeof BUCKETS

async function clearR2Bucket(env: Environment) {
  const bucketName = BUCKETS[env]
  if (!bucketName) {
    console.error(`Unknown environment: ${env}`)
    console.error('Valid environments: preview, prod')
    process.exit(1)
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  if (!apiToken) {
    console.error('CLOUDFLARE_API_TOKEN environment variable required')
    console.error('Create a token with R2 read/write permissions at:')
    console.error('https://dash.cloudflare.com/profile/api-tokens')
    process.exit(1)
  }

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
    const listData = await listRes.json() as {
      success: boolean
      result: { objects: { key: string }[], truncated: boolean, cursor?: string }
      errors?: { message: string }[]
    }

    if (!listData.success) {
      console.error('Failed to list objects:', listData.errors)
      process.exit(1)
    }

    const objects = listData.result.objects
    if (objects.length === 0) {
      console.log('No objects to delete')
      break
    }

    // Delete objects in batch
    const keys = objects.map(obj => obj.key)
    const deleteRes = await fetch(baseUrl, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ keys }),
    })
    const deleteData = await deleteRes.json() as { success: boolean, errors?: { message: string }[] }

    if (!deleteData.success) {
      console.error('Failed to delete objects:', deleteData.errors)
      process.exit(1)
    }

    totalDeleted += keys.length
    console.log(`  Deleted ${keys.length} objects (total: ${totalDeleted})`)

    cursor = listData.result.truncated ? listData.result.cursor : undefined
  } while (cursor)

  console.log(`✅ Cleared ${totalDeleted} objects from ${bucketName}`)
}

const env = (process.argv[2] || 'preview') as Environment
clearR2Bucket(env)
