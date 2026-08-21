/**
 * Contract Parameter Serialization
 * 
 * Converts TypeScript/JavaScript types to SynapticChain Value enum format
 * for contract function calls.
 */

/**
 * Value enum type matching Rust synaptic-types::Value
 */
export type Value =
  | { Bool: boolean }
  | { U8: number }
  | { U16: number }
  | { U32: number }
  | { U64: bigint }
  | { U128: bigint }
  | { U256: Uint8Array }
  | { I8: number }
  | { I16: number }
  | { I32: number }
  | { I64: bigint }
  | { I128: bigint }
  | { Address: string }
  | { Bytes: Uint8Array }
  | { String: string }
  | { Array: Value[] }
  | { Option: Value | null }
  | "Unit";

/**
 * Convert a JavaScript value to Value enum format
 * 
 * @param param - The value to convert
 * @returns Value enum object
 * 
 * @example
 * ```typescript
 * toValue(42)           // { U8: 42 }
 * toValue("hello")      // { String: "hello" }
 * toValue(true)         // { Bool: true }
 * toValue([1, 2, 3])    // { Array: [{ U8: 1 }, { U8: 2 }, { U8: 3 }] }
 * ```
 */
export function toValue(param: any): Value {
  // Handle null/undefined
  if (param === null || param === undefined) {
    return { Option: null };
  }

  // Handle boolean
  if (typeof param === "boolean") {
    return { Bool: param };
  }

  // Handle number
  if (typeof param === "number") {
    if (!Number.isInteger(param)) {
      throw new TypeError(`Floating point numbers not supported: ${param}`);
    }

    if (param < 0) {
      // Signed integers
      if (param >= -128) {
        return { I8: param };
      } else if (param >= -32768) {
        return { I16: param };
      } else if (param >= -2147483648) {
        return { I32: param };
      } else {
        return { I64: BigInt(param) };
      }
    } else {
      // Unsigned integers
      if (param <= 255) {
        return { U8: param };
      } else if (param <= 65535) {
        return { U16: param };
      } else if (param <= 4294967295) {
        return { U32: param };
      } else {
        return { U64: BigInt(param) };
      }
    }
  }

  // Handle bigint
  if (typeof param === "bigint") {
    if (param < 0n) {
      return { I128: param };
    } else {
      return { U128: param };
    }
  }

  // Handle string
  if (typeof param === "string") {
    // Check if it's an address (starts with "syn1")
    if (param.startsWith("syn1")) {
      return { Address: param };
    }
    return { String: param };
  }

  // Handle Uint8Array (bytes)
  if (param instanceof Uint8Array) {
    return { Bytes: param };
  }

  // Handle Array (convert to Uint8Array if all elements are numbers 0-255)
  if (Array.isArray(param)) {
    // Check if it's a byte array
    if (param.every((x) => typeof x === "number" && x >= 0 && x <= 255)) {
      return { Bytes: new Uint8Array(param) };
    }
    // Otherwise, convert to Value array
    return { Array: param.map(toValue) };
  }

  // Handle objects that are already in Value format
  if (typeof param === "object") {
    const keys = Object.keys(param);
    if (keys.length === 1) {
      const key = keys[0];
      const validKeys = [
        "Bool",
        "U8",
        "U16",
        "U32",
        "U64",
        "U128",
        "U256",
        "I8",
        "I16",
        "I32",
        "I64",
        "I128",
        "Address",
        "Bytes",
        "String",
        "Array",
        "Option",
      ];
      if (validKeys.includes(key)) {
        return param as Value;
      }
    }
  }

  throw new TypeError(`Unsupported parameter type: ${typeof param}`);
}

/**
 * Serialize an array of arguments to Value enum format
 * 
 * @param args - Array of JavaScript values
 * @returns Array of Value enum objects
 * 
 * @example
 * ```typescript
 * serializeArgs([5, "test", true])
 * // [{ U8: 5 }, { String: "test" }, { Bool: true }]
 * 
 * serializeArgs([])
 * // []
 * ```
 */
export function serializeArgs(args: any[]): Value[] {
  return args.map(toValue);
}

/**
 * Type-safe helper for creating U8 values
 */
export function u8(value: number): Value {
  if (value < 0 || value > 255 || !Number.isInteger(value)) {
    throw new RangeError(`U8 value must be 0-255, got ${value}`);
  }
  return { U8: value };
}

/**
 * Type-safe helper for creating U16 values
 */
export function u16(value: number): Value {
  if (value < 0 || value > 65535 || !Number.isInteger(value)) {
    throw new RangeError(`U16 value must be 0-65535, got ${value}`);
  }
  return { U16: value };
}

/**
 * Type-safe helper for creating U32 values
 */
export function u32(value: number): Value {
  if (value < 0 || value > 4294967295 || !Number.isInteger(value)) {
    throw new RangeError(`U32 value must be 0-4294967295, got ${value}`);
  }
  return { U32: value };
}

/**
 * Type-safe helper for creating U64 values
 */
export function u64(value: number | bigint): Value {
  return { U64: typeof value === "bigint" ? value : BigInt(value) };
}

/**
 * Type-safe helper for creating String values
 */
export function str(value: string): Value {
  return { String: value };
}

/**
 * Type-safe helper for creating Bool values
 */
export function bool(value: boolean): Value {
  return { Bool: value };
}

/**
 * Type-safe helper for creating Address values
 */
export function address(value: string): Value {
  if (!value.startsWith("syn1")) {
    throw new Error(`Invalid address format: ${value}`);
  }
  return { Address: value };
}

/**
 * Type-safe helper for creating Bytes values
 */
export function bytes(value: Uint8Array | number[]): Value {
  return {
    Bytes: value instanceof Uint8Array ? value : new Uint8Array(value),
  };
}

/**
 * Type-safe helper for creating Array values
 */
export function array(values: any[]): Value {
  return { Array: values.map(toValue) };
}

/**
 * Type-safe helper for creating Option values
 */
export function option(value: any | null): Value {
  return { Option: value === null ? null : toValue(value) };
}
