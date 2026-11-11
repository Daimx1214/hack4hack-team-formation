/**
 * Wrap an async route handler so any rejected promise is forwarded to
 * Express's error-handling middleware (see app.js) instead of becoming an
 * unhandled rejection. Express 4 does not do this automatically.
 *
 * Usage: router.post('/register', asyncHandler(register))
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
