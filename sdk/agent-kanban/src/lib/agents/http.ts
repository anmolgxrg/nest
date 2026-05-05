import {
  AuthorizationError,
  InvalidCursorApiKeyError,
  MissingCursorApiKeyError,
  UnknownSessionError,
} from "./server"

export function jsonError(error: unknown, fallback: string) {
  if (
    error instanceof MissingCursorApiKeyError ||
    error instanceof InvalidCursorApiKeyError ||
    error instanceof UnknownSessionError ||
    error instanceof AuthorizationError
  ) {
    const status =
      error instanceof InvalidCursorApiKeyError
        ? 401
        : error instanceof UnknownSessionError
          ? 404
          : error instanceof AuthorizationError
            ? 403
            : 400

    return Response.json(
      {
        code: error.code,
        error: error.message,
      },
      { status }
    )
  }

  return Response.json(
    {
      error: error instanceof Error ? error.message : fallback,
    },
    { status: 500 }
  )
}
