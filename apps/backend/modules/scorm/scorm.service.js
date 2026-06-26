'use strict';

const fs     = require('fs');
const path   = require('path');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');

const db         = require('../../config/db');
const storage    = require('../../config/storage');
const ApiError   = require('../../shared/utils/apiError');
const eventBus   = require('../../shared/events/eventBus');

function isCourseManager(user, instructorId) {
  return user.role === 'admin' || user.role === 'super_admin' || user.id === instructorId;
}

async function verifyCourseOwner(courseId, requestingUser) {
  const { rows } = await db.query(
    'SELECT id, instructor_id FROM courses WHERE id = $1 AND deleted_at IS NULL',
    [courseId]
  );
  const course = rows[0];
  if (!course) throw ApiError.notFound('Course not found');
  if (!isCourseManager(requestingUser, course.instructor_id)) {
    throw ApiError.forbidden('You do not have permission to modify this course');
  }
  return course;
}

// ── Upload SCORM package ──────────────────────
async function uploadPackage(courseId, lessonId, uploadedFile, requestingUser) {
  await verifyCourseOwner(courseId, requestingUser);

  // Verify lesson exists and is of type 'scorm'
  const { rows: lessonRows } = await db.query(
    'SELECT id, type FROM lessons WHERE id = $1 AND course_id = $2 AND deleted_at IS NULL',
    [lessonId, courseId]
  );
  if (!lessonRows[0]) throw ApiError.notFound('Lesson not found');
  if (lessonRows[0].type !== 'scorm') {
    throw ApiError.badRequest('Lesson type must be "scorm" to upload a SCORM package');
  }

  // Check file is a zip
  if (!uploadedFile.originalname.toLowerCase().endsWith('.zip')) {
    throw ApiError.badRequest('Uploaded file must be a .zip file');
  }

  const packageId = uuidv4();
  const extractDir = path.join(storage.lmsdataPath, 'scorm', packageId);
  storage.ensureDir(extractDir);

  // Read and extract the zip
  let zip;
  try {
    zip = new AdmZip(uploadedFile.path);
  } catch (err) {
    // Clean up temp file
    fs.unlink(uploadedFile.path, () => {});
    throw ApiError.badRequest('Invalid zip file: ' + err.message);
  }

  zip.extractAllTo(extractDir, true);

  // Clean up temp file
  fs.unlink(uploadedFile.path, () => {});

  // Parse imsmanifest.xml
  const manifestPath = path.join(extractDir, 'imsmanifest.xml');
  let launchFile = 'index.html';
  let scormVersion = '1.2';
  let manifestData = {};

  if (fs.existsSync(manifestPath)) {
    const manifestXml = fs.readFileSync(manifestPath, 'utf8');
    const parsed = parseManifest(manifestXml);
    launchFile = parsed.launchFile || launchFile;
    scormVersion = parsed.scormVersion || scormVersion;
    manifestData = parsed.metadata || {};
  }

  // Check the launch file exists
  const launchPath = path.join(extractDir, launchFile);
  if (!fs.existsSync(launchPath)) {
    // Try to find any index.html
    const fallback = findIndexHtml(extractDir);
    if (fallback) {
      launchFile = fallback;
    }
  }

  // Insert record
  const { rows } = await db.query(
    `INSERT INTO scorm_packages
       (id, course_id, lesson_id, title, package_name, storage_path,
        launch_file, scorm_version, manifest_data, size_bytes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      packageId,
      courseId,
      lessonId,
      uploadedFile.originalname.replace(/\.zip$/i, ''),
      uploadedFile.originalname,
      `scorm/${packageId}`,
      launchFile,
      scormVersion,
      JSON.stringify(manifestData),
      uploadedFile.size,
      requestingUser.id,
    ]
  );

  // Update lesson duration based on manifest
  if (manifestData.durationSeconds) {
    await db.query(
      'UPDATE lessons SET duration_seconds = $1 WHERE id = $2',
      [manifestData.durationSeconds, lessonId]
    );
  }

  return rows[0];
}

// ── Parse imsmanifest.xml ─────────────────────
function parseManifest(xml) {
  const result = {
    launchFile: null,
    scormVersion: '1.2',
    metadata: {},
    title: '',
  };

  // Extract schema version
  const schemaMatch = xml.match(/<schemaversion>\s*([^<]+)\s*<\/schemaversion>/i);
  if (schemaMatch) {
    const ver = schemaMatch[1].trim();
    if (ver.startsWith('1.2')) result.scormVersion = '1.2';
    else if (ver.startsWith('2004')) result.scormVersion = '2004';
  }

  // Try ADL SCORM namespace-based version detection
  if (xml.includes('adlnet') && xml.includes('2004')) {
    result.scormVersion = '2004';
  }

  // Extract title
  const titleMatch = xml.match(/<title>\s*([^<]+)\s*<\/title>/i);
  if (titleMatch) result.metadata.title = titleMatch[1].trim();

  // Extract launch file from <resource> with scorm_type = 'sco'
  // Look for the sco resource — it has adlcp:scormType="sco"
  const resourceRegex = /<resource[^>]*identifier\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/resource>/gis;
  let match;
  while ((match = resourceRegex.exec(xml)) !== null) {
    const resourceBlock = match[0];
    const isSco = /adlcp:scormType\s*=\s*["']sco["']/i.test(resourceBlock);

    // Get the href from <file> or resource href attribute
    const hrefAttr = resourceBlock.match(/href\s*=\s*["']([^"']+)["']/i);
    const fileMatch = resourceBlock.match(/<file\s+href\s*=\s*["']([^"']+)["']/i);

    const href = hrefAttr?.[1] || fileMatch?.[1];
    if (href && isSco) {
      result.launchFile = href;
      break;
    }
    // Fallback: first resource with an href
    if (href && !result.launchFile) {
      result.launchFile = href;
    }
  }

  // Extract general metadata
  const genMatch = xml.match(/<general>(.*?)<\/general>/is);
  if (genMatch) {
    const genBlock = genMatch[1];
    const descMatch = genBlock.match(/<description>\s*([^<]+)\s*<\/description>/i);
    if (descMatch) result.metadata.description = descMatch[1].trim();
  }

  return result;
}

// ── Find an index.html in the extracted dir ───
function findIndexHtml(dir) {
  const files = fs.readdirSync(dir, { recursive: true });
  const htmlFiles = files.filter(f => /\.html?$/i.test(f) && !f.includes('backup'));
  if (htmlFiles.length === 0) return null;

  // Prefer index.html, then index.htm, then first html file
  const index = htmlFiles.find(f => /^index\.html?$/i.test(path.basename(f)));
  if (index) return index;
  return htmlFiles[0];
}

// ── Get package by id ─────────────────────────
async function getPackage(packageId) {
  const { rows } = await db.query(
    'SELECT * FROM scorm_packages WHERE id = $1',
    [packageId]
  );
  if (!rows[0]) throw ApiError.notFound('SCORM package not found');
  return rows[0];
}

// ── Get package by lesson ──────────────────────
async function getPackageByLesson(lessonId, courseId) {
  const { rows } = await db.query(
    'SELECT * FROM scorm_packages WHERE lesson_id = $1 AND course_id = $2',
    [lessonId, courseId]
  );
  return rows[0] || null;
}

// ── Get the physical path for a SCORM file ─────
async function getFilePath(packageId, filePath) {
  const pkg = await getPackage(packageId);
  return path.join(storage.lmsdataPath, pkg.storage_path, filePath);
}

// ── Save SCORM runtime data ────────────────────
async function saveScoData(packageId, userId, lessonId, data) {
  // Extract commonly-used values for the convenience columns
  const lessonStatus = data['cmi.core.lesson_status'] || data['cmi.lesson_status'] || null;
  const scoreRaw = data['cmi.core.score.raw'] || data['cmi.score.raw'] || null;
  const scoreMax = data['cmi.core.score.max'] || data['cmi.score.max'] || 100;
  const scoreMin = data['cmi.core.score.min'] || data['cmi.score.min'] || 0;
  const totalTime = data['cmi.core.total_time'] || data['cmi.total_time'] || null;

  const { rows } = await db.query(
    `INSERT INTO scorm_sco_data
       (package_id, user_id, lesson_id, data, lesson_status, score_raw, score_max, score_min, total_time, session_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (package_id, user_id)
     DO UPDATE SET
       data = $4,
       lesson_status = COALESCE($5, scorm_sco_data.lesson_status),
       score_raw = COALESCE($6::numeric, scorm_sco_data.score_raw),
       score_max = COALESCE($7::numeric, scorm_sco_data.score_max),
       score_min = COALESCE($8::numeric, scorm_sco_data.score_min),
       total_time = COALESCE($9, scorm_sco_data.total_time),
       session_time = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      packageId, userId, lessonId,
      JSON.stringify(data),
      lessonStatus,
      scoreRaw, scoreMax, scoreMin,
      totalTime,
    ]
  );

  // If lesson is completed/passed, fire progress event
  if (lessonStatus === 'completed' || lessonStatus === 'passed') {
    const pkg = await getPackage(packageId);
    eventBus.emit('lesson.completed', { userId, lessonId, courseId: pkg.course_id });
  }

  // Save to grades table if we have a score
  if (scoreRaw != null) {
    try {
      const pkg = await getPackage(packageId);
      const scorePct = scoreMax > 0 ? Math.round((parseFloat(scoreRaw) / parseFloat(scoreMax)) * 100) : 0;
      const passed = lessonStatus === 'passed' || (lessonStatus === 'completed' && scorePct >= 50);

      // Upsert into grades
      await db.query(
        `INSERT INTO grades (user_id, course_id, lesson_id, grade_type, score, max_score, score_pct, passed)
         VALUES ($1,$2,$3,'scorm',$4,$5,$6,$7)
         ON CONFLICT (user_id, course_id, lesson_id, grade_type)
         DO UPDATE SET score = $4, max_score = $5, score_pct = $6, passed = $7, graded_at = NOW()`,
        [userId, pkg.course_id, lessonId, scoreRaw, scoreMax, scorePct, passed]
      );
    } catch (err) {
      console.error('[SCORM] Error saving grade:', err.message);
    }
  }

  return rows[0];
}

// ── Get SCORM runtime data ────────────────────
async function getScoData(packageId, userId) {
  const { rows } = await db.query(
    'SELECT * FROM scorm_sco_data WHERE package_id = $1 AND user_id = $2',
    [packageId, userId]
  );
  return rows[0] || null;
}

// ── Delete SCORM package ──────────────────────
async function deletePackage(packageId, courseId, requestingUser) {
  await verifyCourseOwner(courseId, requestingUser);

  const pkg = await getPackage(packageId);
  if (pkg.course_id !== courseId) {
    throw ApiError.forbidden('Package does not belong to this course');
  }

  // Remove extracted files
  const pkgDir = path.join(storage.lmsdataPath, pkg.storage_path);
  if (fs.existsSync(pkgDir)) {
    fs.rmSync(pkgDir, { recursive: true, force: true });
  }

  await db.query('DELETE FROM scorm_packages WHERE id = $1', [packageId]);
}

// ── Serve SCORM file content ──────────────────
async function getStoragePath(packageId) {
  const pkg = await getPackage(packageId);
  return path.join(storage.lmsdataPath, pkg.storage_path);
}

module.exports = {
  uploadPackage,
  getPackage,
  getPackageByLesson,
  getFilePath,
  getStoragePath,
  saveScoData,
  getScoData,
  deletePackage,
};
