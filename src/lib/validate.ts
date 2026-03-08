/**
 * Input validation for API routes.
 * Prevents oversized payloads, XSS in stored fields, and invalid data types.
 */

const MAX_STRING_LENGTH = 500;
const MAX_METADATA_SIZE = 10_000; // 10KB max for metadata JSON

/**
 * Sanitize a string field — trim, truncate, strip control characters.
 */
export function sanitizeString(input: unknown, maxLen = MAX_STRING_LENGTH): string | null {
  if (typeof input !== 'string') return null;
  // Strip control characters (except newlines/tabs) and trim
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, maxLen) || null;
}

/**
 * Validate and sanitize metadata object — ensure it's not too large.
 */
export function sanitizeMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const json = JSON.stringify(input);
  if (json.length > MAX_METADATA_SIZE) {
    return { _truncated: true, _originalSize: json.length };
  }
  return input as Record<string, unknown>;
}

/**
 * Validate and sanitize input/output payloads — more permissive than metadata.
 * Accepts objects, arrays, strings, numbers — anything JSON-serializable.
 */
export function sanitizePayload(input: unknown, maxSize = 50_000): unknown {
  if (input === undefined || input === null) return null;
  try {
    const json = JSON.stringify(input);
    if (json.length > maxSize) {
      return { _truncated: true, _originalSize: json.length, _preview: json.slice(0, 500) };
    }
    return input;
  } catch {
    return { _error: 'Could not serialize' };
  }
}

/**
 * Validate a positive integer.
 */
export function sanitizePositiveInt(input: unknown, max = 1_000_000): number {
  const num = typeof input === 'number' ? input : parseInt(String(input), 10);
  if (isNaN(num) || num < 0) return 0;
  return Math.min(Math.floor(num), max);
}

/**
 * Validate an action status string.
 */
export function validateStatus(input: unknown): 'success' | 'error' | 'blocked' {
  const valid = ['success', 'error', 'blocked'];
  if (typeof input === 'string' && valid.includes(input)) return input as 'success' | 'error' | 'blocked';
  return 'success';
}
