// src/utils/validateUuid.ts
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

/**
 * Validates if a given string is a valid UUID (version 4).
 * @param id The string to validate.
 * @returns True if the string is a valid v4 UUID, false otherwise.
 */
export function isValidUuid(id: string): boolean {
  return uuidValidate(id) && uuidVersion(id) === 4;
}
