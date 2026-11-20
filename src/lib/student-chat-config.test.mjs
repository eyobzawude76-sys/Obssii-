import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getStudentChatAvailability,
  hasStudentChatProvider,
} from "./student-chat-config.mjs";

test("student chat is unavailable when its provider key is missing or blank", () => {
  assert.equal(hasStudentChatProvider(undefined), false);
  assert.equal(hasStudentChatProvider(""), false);
  assert.equal(hasStudentChatProvider("   "), false);
});

test("student chat is available when a provider key is configured", () => {
  assert.equal(hasStudentChatProvider("configured-value"), true);
  assert.deepEqual(getStudentChatAvailability("configured-value"), {
    available: true,
  });
});

test("unconfigured chat reports a safe 503 without exposing configuration", () => {
  assert.deepEqual(getStudentChatAvailability(undefined), {
    available: false,
    status: 503,
    error: "Student chat is currently unavailable. Please try again later.",
  });
});
