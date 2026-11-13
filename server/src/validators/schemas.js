const { z } = require('zod');

/**
 * Request validation schemas (Build Spec §10.3), shared rules for the whole
 * API. `.strict()` rejects unknown fields outright — a client sending
 * fields the API never defined gets a 400 instead of silent acceptance,
 * which also shuts down mass-assignment and NoSQL-operator smuggling
 * (an object where a string is expected simply fails the string check).
 */

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters'),
  })
  .strict();

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

const createTeamSchema = z
  .object({
    name: z.string().trim().min(3, 'Team name must be at least 3 characters').max(50),
    description: z.string().trim().max(280).optional().default(''),
    capacity: z.number().int().min(2).max(12),
    requireApproval: z.boolean().optional().default(false),
  })
  .strict();

// Edit: every field optional, but at least one must be present. Capacity's
// floor (not below the current member count) is a state rule, enforced in
// the controller with a 409 — it is not a shape rule.
const updateTeamSchema = z
  .object({
    name: z.string().trim().min(3, 'Team name must be at least 3 characters').max(50).optional(),
    description: z.string().trim().max(280).optional(),
    capacity: z.number().int().min(2).max(12).optional(),
    requireApproval: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

const listTeamsQuerySchema = z
  .object({
    q: z.string().trim().max(60).optional(),
    status: z.enum(['open', 'full']).optional(),
    sort: z.enum(['newest', 'seats']).default('newest'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .strict();

const mineQuerySchema = z
  .object({
    role: z.enum(['joined', 'created']).default('joined'),
  })
  .strict();

const joinByCodeSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(4).max(32),
  })
  .strict();

// Settings page (Spec §5.7): the only profile field a user may change
// is their display name.
const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  })
  .strict();

/**
 * Parse `data` with `schema`. On success returns the parsed value; on
 * failure sends the 400 VALIDATION envelope (with per-field details) and
 * returns null — callers do `const body = parseOr400(...); if (!body) return;`
 */
function parseOr400(res, schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || '(body)',
    message: issue.message,
  }));
  const { fail } = require('../utils/errors');
  fail(res, 400, 'VALIDATION', 'The request did not pass validation', details);
  return null;
}

module.exports = {
  registerSchema,
  loginSchema,
  createTeamSchema,
  updateTeamSchema,
  listTeamsQuerySchema,
  mineQuerySchema,
  updateProfileSchema,
  joinByCodeSchema,
  parseOr400,
};
