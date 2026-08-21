/**
 * Error types for SynapticChain SDK
 *
 * Structured error types for each module.
 *
 * @module errors
 */

/**
 * Base error class for all SynapticChain SDK errors.
 */
export class SynapticError extends Error {
  /** Machine-readable error code */
  readonly code: string;
  /** Optional additional context */
  readonly details: Record<string, unknown> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SynapticError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error codes for cryptographic operations.
 */
export const CryptoErrorCode = {
  INVALID_KEY_LENGTH: 'INVALID_KEY_LENGTH',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  SIGNING_FAILED: 'SIGNING_FAILED',
} as const;

export type CryptoErrorCode = (typeof CryptoErrorCode)[keyof typeof CryptoErrorCode];

/**
 * Error thrown for cryptographic operation failures.
 */
export class CryptoError extends SynapticError {
  constructor(code: CryptoErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'CryptoError';
  }
}

/**
 * Error codes for address operations.
 */
export const AddressErrorCode = {
  INVALID_BECH32: 'INVALID_BECH32',
  INVALID_PREFIX: 'INVALID_PREFIX',
  INVALID_LENGTH: 'INVALID_LENGTH',
  INVALID_CHECKSUM: 'INVALID_CHECKSUM',
} as const;

export type AddressErrorCode = (typeof AddressErrorCode)[keyof typeof AddressErrorCode];

/**
 * Error thrown for address operation failures.
 */
export class AddressError extends SynapticError {
  constructor(code: AddressErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'AddressError';
  }
}

/**
 * Error codes for transaction operations.
 */
export const TransactionErrorCode = {
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  SERIALIZATION_FAILED: 'SERIALIZATION_FAILED',
} as const;

export type TransactionErrorCode = (typeof TransactionErrorCode)[keyof typeof TransactionErrorCode];

/**
 * Error thrown for transaction operation failures.
 */
export class TransactionError extends SynapticError {
  constructor(code: TransactionErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'TransactionError';
  }
}

/**
 * Error codes for RPC operations.
 */
export const RpcErrorCode = {
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  METHOD_NOT_FOUND: 'METHOD_NOT_FOUND',
} as const;

export type RpcErrorCode = (typeof RpcErrorCode)[keyof typeof RpcErrorCode];

/**
 * Error thrown for RPC operation failures.
 */
export class RpcError extends SynapticError {
  /** JSON-RPC error code */
  readonly rpcCode: number | undefined;
  /** Original error message from node */
  readonly rpcMessage: string | undefined;

  constructor(
    code: RpcErrorCode,
    message: string,
    details?: Record<string, unknown> & { rpcCode?: number; rpcMessage?: string }
  ) {
    super(code, message, details);
    this.name = 'RpcError';
    this.rpcCode = details?.rpcCode;
    this.rpcMessage = details?.rpcMessage;
  }
}

/**
 * Error codes for serialization operations.
 */
export const SerializationErrorCode = {
  INVALID_FORMAT: 'INVALID_FORMAT',
  UNEXPECTED_TYPE: 'UNEXPECTED_TYPE',
  BUFFER_OVERFLOW: 'BUFFER_OVERFLOW',
} as const;

export type SerializationErrorCode = (typeof SerializationErrorCode)[keyof typeof SerializationErrorCode];

/**
 * Error thrown for serialization operation failures.
 */
export class SerializationError extends SynapticError {
  constructor(code: SerializationErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'SerializationError';
  }
}

/**
 * Error codes for balance operations.
 */
export const BalanceErrorCode = {
  INVALID_FORMAT: 'INVALID_FORMAT',
  NEGATIVE_VALUE: 'NEGATIVE_VALUE',
  OVERFLOW: 'OVERFLOW',
  INVALID_DECIMALS: 'INVALID_DECIMALS',
} as const;

export type BalanceErrorCode = (typeof BalanceErrorCode)[keyof typeof BalanceErrorCode];

/**
 * Error thrown for balance parsing and formatting failures.
 */
export class BalanceError extends SynapticError {
  constructor(code: BalanceErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = 'BalanceError';
  }
}
