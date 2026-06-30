'use strict';

console.log('[Worker] No background jobs configured yet.');
console.log('[Worker] Worker started successfully (idle mode).');

// Keep alive — don't exit
setInterval(() => {}, 1 << 30);
