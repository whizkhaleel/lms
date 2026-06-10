'use strict';

const path   = require('path');
const fs     = require('fs');
const env    = require('./env');

// ── Storage abstraction ───────────────────────
// Swap between 'local' and 'minio' via STORAGE_BACKEND env var.
// The rest of the app doesn't care which is active.

let storageClient = null;

if (env.STORAGE_BACKEND === 'minio') {
  const Minio = require('minio');
  storageClient = new Minio.Client({
    endPoint:  env.MINIO_ENDPOINT,
    port:      env.MINIO_PORT,
    useSSL:    env.MINIO_USE_SSL,
    accessKey: env.MINIO_ACCESS_KEY,
    secretKey: env.MINIO_SECRET_KEY,
  });

  // Ensure bucket exists on startup
  (async () => {
    const exists = await storageClient.bucketExists(env.MINIO_BUCKET);
    if (!exists) {
      await storageClient.makeBucket(env.MINIO_BUCKET, 'us-east-1');
      console.log(`[Storage] MinIO bucket '${env.MINIO_BUCKET}' created`);
    } else {
      console.log(`[Storage] MinIO connected — bucket: ${env.MINIO_BUCKET}`);
    }
  })().catch(console.error);
}

/**
 * Get the absolute local path for a given relative storage path.
 * e.g. 'uploads/courses/uuid/thumbnail.webp' → '/app/lmsdata/uploads/courses/uuid/thumbnail.webp'
 */
function localPath(storagePath) {
  return path.join(env.LMSDATA_PATH, storagePath);
}

/**
 * Ensure directory exists (creates all parent dirs).
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

module.exports = {
  backend: env.STORAGE_BACKEND,
  client:  storageClient,
  localPath,
  ensureDir,
  lmsdataPath: env.LMSDATA_PATH,
};
