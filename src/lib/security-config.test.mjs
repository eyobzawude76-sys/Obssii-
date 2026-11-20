import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { loadTypeScriptModule } from "./release-validation-tests.mjs";

const { getAesMasterKey, getCookieSecure, getCronSecret, getJwtSecret } =
  loadTypeScriptModule("src/lib/security-config.ts");
const strongTestSecret = crypto.randomBytes(48).toString("base64");

test("JWT secret keeps a development-only fallback and rejects missing production configuration", () => {
  assert.equal(getJwtSecret({ NODE_ENV: "development" }), "dev-secret");
  assert.throws(() => getJwtSecret({ NODE_ENV: "test" }));
  assert.throws(() => getJwtSecret({ NODE_ENV: "production" }));
  assert.throws(() =>
    getJwtSecret({ NODE_ENV: "production", JWT_SECRET: "short" }),
  );
  assert.throws(() =>
    getJwtSecret({
      NODE_ENV: "production",
      JWT_SECRET: "0123456789abcdef".repeat(3),
    }),
  );
  assert.doesNotThrow(() =>
    getJwtSecret({ NODE_ENV: "production", JWT_SECRET: strongTestSecret }),
  );
});

test("production cookies are Secure and insecure overrides are rejected", () => {
  assert.equal(getCookieSecure({ NODE_ENV: "production" }), true);
  assert.throws(() =>
    getCookieSecure({ NODE_ENV: "production", COOKIE_SECURE: "false" }),
  );
  assert.equal(
    getCookieSecure({ NODE_ENV: "development", COOKIE_SECURE: "false" }),
    false,
  );
  assert.equal(
    getCookieSecure({ NODE_ENV: "development", COOKIE_SECURE: "true" }),
    true,
  );
});

test("AES master key must be present and exactly 32 bytes in production", () => {
  assert.throws(() => getAesMasterKey({ NODE_ENV: "production" }));
  assert.throws(() =>
    getAesMasterKey({ NODE_ENV: "production", AES_MASTER_KEY: "short" }),
  );
  assert.throws(() =>
    getAesMasterKey({
      NODE_ENV: "production",
      AES_MASTER_KEY: "0123456789abcdef".repeat(2),
    }),
  );
  assert.throws(() =>
    getAesMasterKey({ NODE_ENV: "production", AES_MASTER_KEY: "hex:123" }),
  );
  const hexKey = getAesMasterKey({
    NODE_ENV: "production",
    AES_MASTER_KEY: `hex:${Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString("hex")}`,
  });
  assert.equal(hexKey.length, 32);
  const base64Key = getAesMasterKey({
    NODE_ENV: "production",
    AES_MASTER_KEY: `base64:${Buffer.from(Array.from({ length: 32 }, (_, index) => index + 32)).toString("base64")}`,
  });
  assert.equal(base64Key.length, 32);
  assert.throws(() =>
    getAesMasterKey({
      NODE_ENV: "production",
      AES_MASTER_KEY: `base64:${Buffer.alloc(32, 0x37).toString("base64")}`,
    }),
  );
  assert.equal(
    getAesMasterKey({ NODE_ENV: "development", AES_MASTER_KEY: "local" })
      .length,
    32,
  );
});

test("cron secret is required and strong in production", () => {
  assert.throws(() => getCronSecret({ NODE_ENV: "production" }));
  assert.throws(() =>
    getCronSecret({ NODE_ENV: "production", CRON_SECRET: "short" }),
  );
  assert.equal(getCronSecret({ NODE_ENV: "development" }), null);
  assert.doesNotThrow(() =>
    getCronSecret({ NODE_ENV: "production", CRON_SECRET: strongTestSecret }),
  );
});
