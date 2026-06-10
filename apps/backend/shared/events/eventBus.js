'use strict';

const EventEmitter = require('events');

/**
 * Internal event bus — decouples modules from side effects.
 *
 * When a module completes work, it emits an event.
 * Other modules (notifications, progress, etc.) react independently.
 *
 * Usage (emitting):
 *   eventBus.emit('user.registered', { userId, email });
 *   eventBus.emit('enrollment.created', { enrollmentId, userId, courseId });
 *   eventBus.emit('lesson.completed', { userId, lessonId, courseId });
 *
 * Usage (listening — in the module that cares):
 *   const eventBus = require('../../shared/events/eventBus');
 *   eventBus.on('enrollment.created', async ({ userId, courseId }) => {
 *     await sendWelcomeEmail(userId, courseId);
 *   });
 */
class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // many modules can listen
  }
}

const eventBus = new EventBus();

// Log events in development
if (process.env.NODE_ENV === 'development') {
  const originalEmit = eventBus.emit.bind(eventBus);
  eventBus.emit = (event, ...args) => {
    console.log(`[EventBus] ${event}`, args[0] || '');
    return originalEmit(event, ...args);
  };
}

module.exports = eventBus;
