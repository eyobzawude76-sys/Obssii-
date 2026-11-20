export declare function hasStudentChatProvider(
  apiKey: string | undefined,
): boolean;

export type StudentChatAvailability =
  | { available: true }
  | { available: false; status: 503; error: string };

export declare function getStudentChatAvailability(
  apiKey: string | undefined,
): StudentChatAvailability;
