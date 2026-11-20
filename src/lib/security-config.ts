type RuntimeEnvironment = Record<string, string | undefined>;

const MIN_SECRET_BYTES = 32;
const INSECURE_SECRET_VALUES = new Set([
  "change-me",
  "changeme",
  "development",
  "dev-secret",
  "password",
  "secret",
]);

function isProduction(env: RuntimeEnvironment): boolean {
  return env.NODE_ENV === "production";
}

function hasShortPeriod(value: string | Buffer): boolean {
  const units = typeof value === "string" ? Array.from(value) : [...value];
  for (
    let period = 1;
    period <= Math.min(16, Math.floor(units.length / 2));
    period++
  ) {
    if (
      units.every(
        (unit, index) => index < period || unit === units[index % period],
      )
    ) {
      return true;
    }
  }
  return false;
}

function validateProductionSecret(name: string, value: string): void {
  if (
    Buffer.byteLength(value, "utf8") < MIN_SECRET_BYTES ||
    INSECURE_SECRET_VALUES.has(value.trim().toLowerCase()) ||
    new Set(value).size < 12 ||
    hasShortPeriod(value)
  ) {
    throw new Error(`${name} must be a strong secret of at least 32 bytes`);
  }
}

export function getJwtSecret(env: RuntimeEnvironment = process.env): string {
  const secret = env.JWT_SECRET;
  if (isProduction(env)) {
    if (!secret) throw new Error("JWT_SECRET is required in production");
    validateProductionSecret("JWT_SECRET", secret);
    return secret;
  }
  if (env.NODE_ENV === "development") return secret || "dev-secret";
  if (!secret) throw new Error("JWT_SECRET is required outside development");
  return secret;
}

export function getCookieSecure(
  env: RuntimeEnvironment = process.env,
): boolean {
  const configured = env.COOKIE_SECURE;
  if (
    configured !== undefined &&
    configured !== "true" &&
    configured !== "false"
  ) {
    throw new Error("COOKIE_SECURE must be true or false");
  }
  if (isProduction(env)) {
    if (configured === "false") {
      throw new Error("COOKIE_SECURE cannot be false in production");
    }
    return true;
  }
  return configured === "true";
}

export function getAesMasterKey(env: RuntimeEnvironment = process.env): Buffer {
  const raw = env.AES_MASTER_KEY;
  if (!raw) throw new Error("AES_MASTER_KEY is required");

  let key: Buffer;
  if (raw.startsWith("base64:")) {
    const encoded = raw.slice(7);
    key = Buffer.from(encoded, "base64");
    if (
      key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")
    ) {
      throw new Error("AES_MASTER_KEY has invalid base64 encoding");
    }
  } else if (raw.startsWith("hex:")) {
    const encoded = raw.slice(4);
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(encoded)) {
      throw new Error("AES_MASTER_KEY has invalid hex encoding");
    }
    key = Buffer.from(encoded, "hex");
  } else if (isProduction(env)) {
    key = Buffer.from(raw, "utf8");
  } else if (env.NODE_ENV === "development") {
    // Preserve the legacy development key handling for existing local data.
    key = Buffer.alloc(32);
    Buffer.from(raw, "utf8").copy(key);
    return key;
  } else {
    key = Buffer.from(raw, "utf8");
  }

  if (key.length !== 32) {
    throw new Error("AES_MASTER_KEY must encode exactly 32 bytes");
  }
  if (isProduction(env) && (new Set(key).size < 12 || hasShortPeriod(key))) {
    throw new Error("AES_MASTER_KEY must contain sufficient key variation");
  }
  return key;
}

export function getCronSecret(
  env: RuntimeEnvironment = process.env,
): string | null {
  const secret = env.CRON_SECRET;
  if (!secret) {
    if (isProduction(env))
      throw new Error("CRON_SECRET is required in production");
    return null;
  }
  if (isProduction(env)) validateProductionSecret("CRON_SECRET", secret);
  return secret;
}
