'use strict';

const service   = require('./scorm.service');
const ApiResponse = require('../../shared/utils/apiResponse');
const path = require('path');
const fs = require('fs');

async function uploadPackage(req, res, next) {
  try {
    const { courseId, lessonId } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const pkg = await service.uploadPackage(courseId, lessonId, req.file, req.user);
    ApiResponse.success(res, { package: pkg }, 'SCORM package uploaded', 201);
  } catch (err) { next(err); }
}

async function getPackage(req, res, next) {
  try {
    const pkg = await service.getPackage(req.params.packageId);
    ApiResponse.success(res, { package: pkg });
  } catch (err) { next(err); }
}

async function getPackageByLesson(req, res, next) {
  try {
    const pkg = await service.getPackageByLesson(req.params.lessonId, req.params.courseId, req.user);
    ApiResponse.success(res, { package: pkg });
  } catch (err) { next(err); }
}

async function deletePackage(req, res, next) {
  try {
    await service.deletePackage(req.params.packageId, req.params.courseId, req.user);
    ApiResponse.success(res, null, 'Package deleted');
  } catch (err) { next(err); }
}

// ── SCORM API Adapter endpoints ───────────────
// The SCORM content in the iframe communicates with these via postMessage
// We use a bridge JS that posts messages, and these endpoints persist the data.

async function saveScoData(req, res, next) {
  try {
    const { packageId } = req.params;
    const sco = await service.saveScoData(packageId, req.user.id, req.body.lessonId, req.body.data || {});
    ApiResponse.success(res, { sco });
  } catch (err) { next(err); }
}

async function getScoData(req, res, next) {
  try {
    const sco = await service.getScoData(req.params.packageId, req.user.id);
    ApiResponse.success(res, { sco });
  } catch (err) { next(err); }
}

// ── Serve SCORM package files ──────────────────
async function serveFile(req, res, next) {
  try {
    const { packageId } = req.params;
    const filePath = req.params[0] || 'index.html';

    // Security: prevent directory traversal
    const normalized = path.normalize(filePath);
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      return res.status(400).json({ success: false, message: 'Invalid path' });
    }

    const storagePath = path.join(await service.getStoragePath(packageId), normalized);

    if (!fs.existsSync(storagePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    // Determine content type
    const ext = path.extname(storagePath).toLowerCase();
    const mimeMap = {
      '.html': 'text/html',
      '.htm': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
      '.xml': 'application/xml',
      '.zip': 'application/zip',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
    };

    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    // For HTML files, inject the SCORM API bridge
    if (ext === '.html' || ext === '.htm') {
      let content = fs.readFileSync(storagePath, 'utf8');
      const bridge = getScormBridgeScript();
      content = content.replace('</head>', `${bridge}\n</head>`);
      content = content.replace('</body>', `${bridge}\n</body>`);
      if (!content.includes('</head>') && !content.includes('</body>')) {
        content = content + bridge;
      }
      res.send(content);
    } else {
      res.sendFile(storagePath);
    }
  } catch (err) { next(err); }
}

// ── SCORM API Bridge JS ───────────────────────
// This script gets injected into SCORM HTML content.
// It creates window.API (SCORM 1.2) / window.API_1484_11 (SCORM 2004)
// and communicates with the LMS backend via postMessage to the parent frame.
function getScormBridgeScript() {
  return `<script>
(function() {
  // ── SCORM 1.2 API ──────────────────────────
  var scormData = {};
  var errorCode = 0;

  function postAction(action, data) {
    window.parent.postMessage({
      type: 'scorm',
      action: action,
      data: data,
      packageId: window._scormPackageId
    }, '*');
  }

  function postActionSync(action, data) {
    return new Promise(function(resolve) {
      var channel = 'scorm_' + Date.now() + '_' + Math.random();
      function handler(e) {
        if (e.data && e.data.type === 'scorm_response' && e.data.channel === channel) {
          window.removeEventListener('message', handler);
          resolve(e.data.data);
        }
      }
      window.addEventListener('message', handler);
      window.parent.postMessage({
        type: 'scorm',
        action: action,
        data: data,
        channel: channel,
        packageId: window._scormPackageId
      }, '*');
      // Timeout after 5s
      setTimeout(function() { window.removeEventListener('message', handler); resolve(null); }, 5000);
    });
  }

  var API = {
    LMSInitialize: function() {
      scormData = {};
      errorCode = 0;
      // Load existing data asynchronously
      postAction('initialize', {});
      return 'true';
    },
    LMSFinish: function() {
      postAction('commit', scormData);
      postAction('finish', {});
      return 'true';
    },
    LMSGetValue: function(name) {
      errorCode = 0;
      if (scormData.hasOwnProperty(name)) {
        return scormData[name];
      }
      errorCode = 101; // No data
      return '';
    },
    LMSSetValue: function(name, value) {
      errorCode = 0;
      scormData[name] = value;
      return 'true';
    },
    LMSCommit: function() {
      errorCode = 0;
      postAction('commit', scormData);
      return 'true';
    },
    LMSGetLastError: function() {
      return errorCode.toString();
    },
    LMSGetErrorString: function(code) {
      var errors = {
        '0': 'No error',
        '101': 'No data',
        '201': 'Invalid argument',
        '202': 'Element cannot have children',
        '203': 'Element not an array',
        '301': 'Not initialized',
        '401': 'Not implemented',
        '402': 'Invalid set value',
      };
      return errors[code] || 'Unknown error';
    },
    LMSGetDiagnostic: function(code) {
      return API.LMSGetErrorString(code);
    },
  };

  // ── SCORM 2004 API ─────────────────────────
  var API_1484_11 = {
    Initialize: function() { return API.LMSInitialize(); },
    Terminate: function() { return API.LMSFinish(); },
    GetValue: function(name) { return API.LMSGetValue(name); },
    SetValue: function(name, value) { return API.LMSSetValue(name, value); },
    Commit: function() { return API.LMSCommit(); },
    GetLastError: function() { return parseInt(API.LMSGetLastError()); },
    GetErrorString: function(code) { return API.LMSGetErrorString(code.toString()); },
    GetDiagnostic: function(code) { return API.LMSGetDiagnostic(code.toString()); },
  };

  window.API = API;
  window.API_1484_11 = API_1484_11;

  // Listen for initial data from parent
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'scorm_data') {
      scormData = e.data.data || {};
    }
  });

  // Tell parent we're ready
  window.parent.postMessage({ type: 'scorm_ready', packageId: window._scormPackageId }, '*');
})();
</script>`;
}

module.exports = {
  uploadPackage,
  getPackage,
  getPackageByLesson,
  deletePackage,
  saveScoData,
  getScoData,
  serveFile,
};
