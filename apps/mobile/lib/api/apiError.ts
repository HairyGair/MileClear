// Client-side mirror of the server's standardised error taxonomy.
//
// The server may return one of two error response shapes:
//   - Modern: { error: { code, message, retryable, hint? }, requestId? }
//   - Legacy: { error: "<message>" }   (older endpoints)
//
// `parseApiError(json, statusCode)` returns an `ApiError` either way.
// Callers can branch on `err.code === "PREMIUM_REQUIRED"` to render
// upgrade UI, or check `err.retryable` to decide whether to retry on
// transient failures.
//
// Audit item #4 (external_audit_may_2.md).

export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly hint?: string;
  readonly requestId?: string;

  constructor(opts: {
    code: string;
    message: string;
    statusCode: number;
    retryable: boolean;
    hint?: string;
    requestId?: string;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.code = opts.code;
    this.statusCode = opts.statusCode;
    this.retryable = opts.retryable;
    this.hint = opts.hint;
    this.requestId = opts.requestId;
  }
}

interface ModernErrorBody {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    hint?: string;
  };
  requestId?: string;
}

interface LegacyErrorBody {
  error: string;
}

function isModernShape(body: unknown): body is ModernErrorBody {
  return (
    !!body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "object" &&
    (body as { error: { code?: unknown } }).error !== null &&
    typeof (body as { error: { code?: unknown } }).error.code === "string"
  );
}

function isLegacyShape(body: unknown): body is LegacyErrorBody {
  return (
    !!body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  );
}

/**
 * Build an ApiError from a parsed JSON response body. Tolerates both
 * the modern `{error: {code, ...}}` shape and the legacy `{error: "msg"}`
 * shape so the migration to ApiError on the server can be incremental.
 */
export function parseApiError(body: unknown, statusCode: number): ApiError {
  if (isModernShape(body)) {
    return new ApiError({
      code: body.error.code,
      message: body.error.message,
      statusCode,
      retryable: body.error.retryable,
      hint: body.error.hint,
      requestId: body.requestId,
    });
  }
  if (isLegacyShape(body)) {
    return new ApiError({
      code: deriveLegacyCode(statusCode),
      message: body.error,
      statusCode,
      retryable: statusCode >= 500 || statusCode === 429,
    });
  }
  // Fallback for entirely unparseable responses
  return new ApiError({
    code: deriveLegacyCode(statusCode),
    message: `Request failed (HTTP ${statusCode}).`,
    statusCode,
    retryable: statusCode >= 500 || statusCode === 429,
  });
}

function deriveLegacyCode(statusCode: number): string {
  if (statusCode === 400) return "BAD_REQUEST";
  if (statusCode === 401) return "UNAUTHORIZED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 409) return "CONFLICT";
  if (statusCode === 429) return "TOO_MANY_REQUESTS";
  if (statusCode >= 500) return "INTERNAL";
  return "BAD_REQUEST";
}

/**
 * Type guard for catch blocks. Use to discriminate ApiError from network
 * or parse errors when reacting to a thrown error.
 */
export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Turn any thrown error into a clear, specific user-facing { title, message }
 * for an Alert — instead of "Something went wrong / Try again". Names the real
 * reason (offline, session, permission, server, validation) using the ApiError
 * taxonomy, and crucially REASSURES on offline rather than alarming, since the
 * action is saved locally first. Phase 1 of the reliability work (point 12).
 */
export function describeError(
  err: unknown,
  fallbackTitle = "Something went wrong"
): { title: string; message: string } {
  // Sentinel strings thrown by apiRequest for connectivity/session issues.
  if (err instanceof Error) {
    const m = err.message;
    if (
      m === "Network error" ||
      m === "REFRESH_NETWORK_ERROR" ||
      m === "REFRESH_SECURESTORE_BLOCKED"
    ) {
      return {
        title: "You're offline",
        message:
          "We couldn't reach the server. Your change is saved on your phone and will upload automatically when you're back online.",
      };
    }
    if (m === "Session expired") {
      return {
        title: "Session expired",
        message: "Please sign in again to continue.",
      };
    }
  }

  if (isApiError(err)) {
    switch (err.code) {
      case "PREMIUM_REQUIRED":
        return {
          title: "Pro feature",
          message: err.hint ?? "This is a MileClear Pro feature. Upgrade to use it.",
        };
      case "UNAUTHORIZED":
        return { title: "Session expired", message: "Please sign in again to continue." };
      case "FORBIDDEN":
        return { title: "Not allowed", message: err.hint ?? err.message };
      case "NOT_FOUND":
        return {
          title: "Not found",
          message: "That item no longer exists — it may have already been removed.",
        };
      case "TOO_MANY_REQUESTS":
        return {
          title: "Too many requests",
          message: "Please wait a moment and try again.",
        };
      case "CONFLICT":
        return { title: "Already exists", message: err.hint ?? err.message };
      case "BAD_REQUEST":
        return { title: "Please check the details", message: err.hint ?? err.message };
      case "INTERNAL":
        return {
          title: "Server problem",
          message:
            "Something went wrong on our end — your data is safe. Please try again in a moment.",
        };
      default:
        return { title: fallbackTitle, message: err.hint ?? err.message };
    }
  }

  return {
    title: fallbackTitle,
    message: err instanceof Error ? err.message : "Please try again in a moment.",
  };
}
