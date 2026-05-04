// Standardised error taxonomy for the MileClear API.
//
// Every error response across the API SHOULD use this shape:
//
//   {
//     "error": {
//       "code": "INVALID_INPUT",          // machine-readable, stable
//       "message": "Email is required.",  // human-readable, may change
//       "retryable": false,                // safe to retry without changes?
//       "hint": "Provide a valid email."   // optional remediation hint
//     },
//     "requestId": "abc-123"               // optional, for support
//   }
//
// Throw an `ApiError` from any handler and the global error handler
// (registered in server.ts) turns it into this shape. Existing routes
// that still call `reply.status(400).send({ error: "msg" })` keep working
// unchanged — the migration to ApiError is incremental, not a hard cut.
//
// Audit item #4 (external_audit_may_2.md).

/**
 * Canonical error codes. Add to this list as new error categories appear.
 * Codes are strings (not enums) so JSON output is stable; the const-array
 * gives compile-time autocomplete + exhaustiveness checks.
 */
export const ERROR_CODES = [
  // Generic
  "BAD_REQUEST",
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
  "INTERNAL",
  "SERVICE_UNAVAILABLE",
  "NOT_IMPLEMENTED",

  // Auth-specific
  "INVALID_CREDENTIALS",
  "EMAIL_NOT_VERIFIED",
  "TOKEN_EXPIRED",
  "TOKEN_INVALID",
  "ACCOUNT_LOCKED",

  // Premium / billing
  "PREMIUM_REQUIRED",
  "BILLING_NOT_CONFIGURED",
  "PAYMENT_FAILED",

  // Resource-specific
  "VEHICLE_NOT_FOUND",
  "TRIP_NOT_FOUND",
  "SHIFT_NOT_FOUND",
  "ALREADY_ACTIVE_SHIFT",

  // Rate / quota
  "RATE_LIMITED",
  "FREE_TIER_LIMIT_EXCEEDED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    hint?: string;
  };
  requestId?: string;
}

/**
 * Throw this from a route handler or service. The global error handler
 * in server.ts catches it, attaches the requestId, and serialises to the
 * canonical shape.
 *
 * Status code → reasonable defaults:
 *   400/422  retryable=false (client must fix the input)
 *   401      retryable=false (must re-authenticate)
 *   403      retryable=false (no amount of retry will help)
 *   404      retryable=false
 *   409      retryable=false (conflict needs reconciliation)
 *   429      retryable=true (after the rate-limit window)
 *   500/503  retryable=true (transient server issue)
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly hint?: string;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      statusCode?: number;
      retryable?: boolean;
      hint?: string;
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = options.statusCode ?? defaultStatusCode(code);
    this.retryable = options.retryable ?? defaultRetryable(this.statusCode);
    this.hint = options.hint;
  }

  toBody(requestId?: string): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
        ...(this.hint ? { hint: this.hint } : {}),
      },
      ...(requestId ? { requestId } : {}),
    };
  }
}

// ── Helpers — preferred call sites for handler authors ──────────────

export function badRequest(message: string, hint?: string): ApiError {
  return new ApiError("BAD_REQUEST", message, { hint });
}

export function invalidInput(message: string, hint?: string): ApiError {
  return new ApiError("INVALID_INPUT", message, { hint });
}

export function unauthorized(message = "Authentication required."): ApiError {
  return new ApiError("UNAUTHORIZED", message);
}

export function forbidden(message: string, hint?: string): ApiError {
  return new ApiError("FORBIDDEN", message, { hint });
}

export function notFound(message: string): ApiError {
  return new ApiError("NOT_FOUND", message);
}

export function conflict(message: string, hint?: string): ApiError {
  return new ApiError("CONFLICT", message, { hint });
}

export function premiumRequired(
  message = "This feature requires MileClear Pro.",
  hint = "Upgrade in Settings to access tax exports, CSV import, and unlimited saved locations."
): ApiError {
  return new ApiError("PREMIUM_REQUIRED", message, { hint });
}

export function tooManyRequests(message: string): ApiError {
  return new ApiError("TOO_MANY_REQUESTS", message, { retryable: true });
}

export function serverError(message = "Something went wrong."): ApiError {
  return new ApiError("INTERNAL", message, { retryable: true });
}

// ── Internal helpers ────────────────────────────────────────────────

function defaultStatusCode(code: ErrorCode): number {
  switch (code) {
    case "BAD_REQUEST":
    case "INVALID_INPUT":
      return 400;
    case "UNAUTHORIZED":
    case "INVALID_CREDENTIALS":
    case "EMAIL_NOT_VERIFIED":
    case "TOKEN_EXPIRED":
    case "TOKEN_INVALID":
      return 401;
    case "FORBIDDEN":
    case "PREMIUM_REQUIRED":
    case "ACCOUNT_LOCKED":
    case "FREE_TIER_LIMIT_EXCEEDED":
      return 403;
    case "NOT_FOUND":
    case "VEHICLE_NOT_FOUND":
    case "TRIP_NOT_FOUND":
    case "SHIFT_NOT_FOUND":
      return 404;
    case "CONFLICT":
    case "ALREADY_ACTIVE_SHIFT":
      return 409;
    case "TOO_MANY_REQUESTS":
    case "RATE_LIMITED":
      return 429;
    case "SERVICE_UNAVAILABLE":
    case "BILLING_NOT_CONFIGURED":
      return 503;
    case "NOT_IMPLEMENTED":
      return 501;
    case "PAYMENT_FAILED":
      return 402;
    case "INTERNAL":
    default:
      return 500;
  }
}

function defaultRetryable(statusCode: number): boolean {
  // 5xx and 429 are retryable by default. Everything else requires
  // client action so retries won't help.
  return statusCode >= 500 || statusCode === 429;
}
