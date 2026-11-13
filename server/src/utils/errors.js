/**
 * API error contract (Build Spec §10): every error response has the shape
 *   { "error": { "code": "TEAM_FULL", "message": "...", "details": [...] } }
 * `code` is the machine-readable part clients and tests rely on; `message`
 * is the human sentence shown to the user. `details` is optional and used
 * for validation errors (one entry per problem field).
 */
function fail(res, status, code, message, details) {
  const error = { code, message };
  if (details) error.details = details;
  return res.status(status).json({ error });
}

module.exports = { fail };
