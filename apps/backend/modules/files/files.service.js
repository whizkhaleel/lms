'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const db       = require('../../config/db');
const storage  = require('../../config/storage');
const ApiError = require('../../shared/utils/apiError');

// Allowed MIME types per context
const ALLOWED_TYPES = {
  avatar:               ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  course_thumbnail:     ['image/jpeg', 'image/png', 'image/webp'],
  lesson_video:         ['video/mp4', 'video/webm'],
  lesson_resource:      ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  assignment_submission: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'text/plain',
    'application/zip',
  ],
};

// Max sizes per context (bytes)
const MAX_SIZES = {
  avatar:                5 * 1024 * 1024,    // 5 MB
  course_thumbnail:      5 * 1024 * 1024,    // 5 MB
  lesson_video:          500 * 1024 * 1024,  // 500 MB
  lesson_resource:       50 * 1024 * 1024,   // 50 MB
  assignment_submission: 100 * 1024 * 1024,  // 100 MB
};

// Context -> storage sub-directory mapping
const CONTEXT_DIRS = {
  avatar:                'uploads/avatars',
  course_thumbnail:      'uploads/courses',
  lesson_video:          'uploads/lessons',
  lesson_resource:       'uploads/lessons',
  assignment_submission: 'uploads/assignments',
};

/**
 * Compute SHA-256 hash of a file on disk.
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Move a file from temp/ to its permanent location inside lmsdata/.
 *
 * @param {Object} uploadedFile - Multer file object from temp/
 * @param {string} context - e.g. 'lesson_video', 'course_thumbnail'
 * @param {string} ownerId - ID of the entity this file belongs to (courseId, lessonId, etc.)
 * @param {string} uploadedBy - user.id of the uploader
 * @param {boolean} isPublic - Whether Nginx can serve this directly
 * @returns {Object} - Saved file record from DB
 */
async function saveFile({ uploadedFile, context, ownerId, uploadedBy, isPublic = false }) {
  // 1. Validate context
  if (!ALLOWED_TYPES[context]) {
    throw ApiError.badRequest(`Unknown file context: ${context}`);
  }

  // 2. Validate MIME type
  if (!ALLOWED_TYPES[context].includes(uploadedFile.mimetype)) {
    // Clean up temp file
    fs.unlink(uploadedFile.path, () => {});
    throw ApiError.badRequest(
      `File type '${uploadedFile.mimetype}' is not allowed for ${context}. ` +
      `Allowed: ${ALLOWED_TYPES[context].join(', ')}`
    );
  }

  // 3. Validate file size
  if (uploadedFile.size > MAX_SIZES[context]) {
    fs.unlink(uploadedFile.path, () => {});
    throw ApiError.badRequest(
      `File too large. Max size for ${context} is ${MAX_SIZES[context] / 1024 / 1024} MB`
    );
  }

  // 4. Compute SHA-256 hash
  const sha256 = await hashFile(uploadedFile.path);

  // 5. Deduplication check
  const existing = await db.query(
    'SELECT id, storage_path FROM files WHERE sha256_hash = $1 AND deleted_at IS NULL',
    [sha256]
  );
  if (existing.rows.length > 0) {
    // Reuse existing file record - delete the duplicate temp file
    fs.unlink(uploadedFile.path, () => {});
    console.log(`[Files] Deduplication hit for hash ${sha256.slice(0, 8)}...`);
    return existing.rows[0];
  }

  // 6. Build permanent path: lmsdata/{contextDir}/{ownerId}/
  const ext = path.extname(uploadedFile.originalname).toLowerCase();
  const storedName = `${uuidv4()}${ext}`;
  const subDir = CONTEXT_DIRS[context];
  const destDir = storage.localPath(`${subDir}/${ownerId}`);
  const storagePath = `${subDir}/${ownerId}/${storedName}`;
  const destPath = storage.localPath(storagePath);

  // 7. Ensure destination directory exists
  storage.ensureDir(destDir);

  // 8. Move file from temp/ to permanent location
  fs.renameSync(uploadedFile.path, destPath);

  // 9. Insert metadata record into DB (ONLY metadata - no file content)
  const { rows } = await db.query(
    `INSERT INTO files
       (original_name, stored_name, storage_path, mime_type, size_bytes,
        sha256_hash, storage_backend, is_public, context, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      uploadedFile.originalname,
      storedName,
      storagePath,
      uploadedFile.mimetype,
      uploadedFile.size,
      sha256,
      storage.backend,
      isPublic,
      context,
      uploadedBy,
    ]
  );

  console.log(`[Files] Saved: ${storagePath} (${(uploadedFile.size / 1024).toFixed(1)} KB)`);
  return rows[0];
}

/**
 * Serve a private file - verify the requester has access, then return the absolute path.
 * Used by the files controller to stream private files through the API.
 */
async function getFilePath(fileId) {
  const { rows } = await db.query(
    'SELECT storage_path, is_public, mime_type, deleted_at FROM files WHERE id = $1',
    [fileId]
  );
  const file = rows[0];
  if (!file || file.deleted_at) throw ApiError.notFound('File not found');

  const absPath = storage.localPath(file.storage_path);
  if (!fs.existsSync(absPath)) throw ApiError.notFound('File not found on disk');

  return { absPath, isPublic: file.is_public, mimeType: file.mime_type };
}

/**
 * Soft-delete a file record.
 * Actual file removal is handled by a background cleanup worker.
 */
async function deleteFile(fileId, deletedBy) {
  const { rows } = await db.query(
    `UPDATE files SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [fileId]
  );
  if (!rows[0]) throw ApiError.notFound('File not found');

  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id)
     VALUES ($1, 'file.deleted', 'file', $2)`,
    [deletedBy, fileId]
  );
}

module.exports = { saveFile, getFilePath, deleteFile, ALLOWED_TYPES, MAX_SIZES };
