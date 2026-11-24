export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "GAME_NOT_FOUND"
  | "GAME_CLOSED"
  | "GAME_FULL"
  | "NAME_TAKEN"
  | "CONFLICT"
  | "VERSION_CONFLICT"
  | "WRONG_PHASE"
  | "ALREADY_LOCKED"
  | "NOT_ELIGIBLE"
  | "TIME_UP"
  | "PAUSED"
  | "NOT_ENOUGH_PLAYERS"
  | "UNREADY_PLAYERS"
  | "NOT_READY"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "GENERATION_FAILED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  GAME_NOT_FOUND: 404,
  GAME_CLOSED: 409,
  GAME_FULL: 409,
  NAME_TAKEN: 409,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  WRONG_PHASE: 409,
  ALREADY_LOCKED: 409,
  NOT_ELIGIBLE: 403,
  TIME_UP: 409,
  PAUSED: 409,
  NOT_ENOUGH_PLAYERS: 409,
  UNREADY_PLAYERS: 409,
  NOT_READY: 409,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  GENERATION_FAILED: 409,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export type ApiErrorBody = { error: { code: ErrorCode; message: string; details?: Record<string, unknown> } };
