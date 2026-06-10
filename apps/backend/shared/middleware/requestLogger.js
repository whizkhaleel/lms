'use strict';

const env = require('../../config/env');

/**
 * Lightweight request logger for development.
 * In production, Morgan handles structured logging.
 */
module.exports = function requestLogger(req, res, next) {
  if (env.NODE_ENV === 'development') {
    const start = Date.now();
    res.on('finish', () => {
      const ms     = Date.now() - start;
      const color  = res.statusCode >= 500 ? '\x1b[31m'
                   : res.statusCode >= 400 ? '\x1b[33m'
                   : res.statusCode >= 300 ? '\x1b[36m'
                   : '\x1b[32m';
      console.log(
        `${color}[${req.method}]\x1b[0m ${req.originalUrl} — ${res.statusCode} (${ms}ms)`
      );
    });
  }
  next();
};
