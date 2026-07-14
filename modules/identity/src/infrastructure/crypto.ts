import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import type {
  Clock,
  IdGenerator,
  PasswordHasher,
  TokenGenerator,
} from "../application/ports.js";

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

export class UuidIdGenerator implements IdGenerator {
  id(): string {
    return randomBytes(16).toString("hex");
  }
}

export class SecureTokenGenerator implements TokenGenerator {
  token(): string {
    return randomBytes(32).toString("base64url");
  }
}

/** scrypt-based hasher for WP-02 (no native Argon2 dependency). */
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${derived}`;
  }

  async verify(password: string, hash: string): Promise<boolean> {
    const parts = hash.split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }
    const salt = parts[1]!;
    const expected = Buffer.from(parts[2]!, "hex");
    const actual = scryptSync(password, salt, 64);
    if (expected.length !== actual.length) {
      return false;
    }
    return timingSafeEqual(expected, actual);
  }
}

export function sha256Token(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
