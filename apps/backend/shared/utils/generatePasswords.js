'use strict';

const crypto = require('crypto');

/**
 * Generate a secure, human-typeable temporary password.
 * Guarantees at least one uppercase, one lowercase, one digit
 * (matches the app's password policy) and avoids ambiguous
 * characters (0/O, 1/l/I) so it's easy to read in an email.
 */
function generateTempPassword(length = 12) {
  const lower = 'abcdefghjkmnpqrstuvwxyz';      // no i, l, o
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';      // no I, L, O
  const digits = '23456789';                     // no 0, 1
  const all   = lower + upper + digits;

  const pick = (set) => set[crypto.randomInt(0, set.length)];

  let pwd = [pick(lower), pick(upper), pick(digits)];
  for (let i = pwd.length; i < length; i++) pwd.push(pick(all));

  // Shuffle (Fisher-Yates) so the guaranteed chars aren't always first
  for (let i = pwd.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [pwd[i], pwd[j]] = [pwd[j], pwd[i]];
  }

  return pwd.join('');
}

module.exports = { generateTempPassword };