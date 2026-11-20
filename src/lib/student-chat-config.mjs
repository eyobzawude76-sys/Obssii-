export function hasStudentChatProvider(apiKey) {
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}

export function getStudentChatAvailability(apiKey) {
  return hasStudentChatProvider(apiKey)
    ? { available: true }
    : {
        available: false,
        status: 503,
        error: "Student chat is currently unavailable. Please try again later.",
      };
}
