/**
 * Convert technical/API failures into clear Afaan Oromoo messages.
 * Never expose raw server exceptions or stack traces to end users.
 */
export function oromoErrorMessage(
  error: unknown,
  fallback = "Hojii kana yeroo ammaa raawwachuun hin danda'amne. Maaloo irra deebi'ii yaali.",
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const message = raw.toLowerCase();

  if (
    /failed to fetch|networkerror|network request failed|load failed|internet|fetch failed/.test(
      message,
    )
  ) {
    return "Intarneetiin hin jiru ykn serveriin hin deebisne. Walqunnamtii intarneetii kee mirkaneeffadhu; achiis irra deebi'ii yaali.";
  }
  if (/401|unauthorized|not authenticated|token.*expired|session.*expired/.test(message)) {
    return "Yeroon seensaa kee xumurameera. Maaloo irra deebi'ii seeni.";
  }
  if (/403|forbidden|permission|not allowed|access denied/.test(message)) {
    return "Hojii kana raawwachuuf hayyama hin qabdu. Admin ykn itti gaafatamaa kee qunnami.";
  }
  if (/404|not found|does not exist/.test(message)) {
    return "Odeeffannoon barbaadde hin argamne ykn duraan haqameera. Fuula haaromsiitii irra deebi'ii ilaali.";
  }
  if (/409|already exists|duplicate|conflict/.test(message)) {
    return "Odeeffannoon ati galchite duraan jira. Maaloo odeeffannoo adda ta'e galchi.";
  }
  if (/422|validation|invalid|is required|required field|must be/.test(message)) {
    return "Odeeffannoon galchite sirrii miti ykn kan barbaachisu hin guutamne. Maaloo dirreewwan hundaa sirriitti guuti.";
  }
  if (/429|too many requests|rate limit/.test(message)) {
    return "Yeroo gabaabaa keessatti yaalii baay'ee goote. Xiqqoo eegiitii irra deebi'ii yaali.";
  }
  if (/timeout|timed out/.test(message)) {
    return "Deebiin serverii yeroo isaa keessatti hin dhufne. Intarneetii kee mirkaneeffadhuutii irra deebi'ii yaali.";
  }
  if (/500|502|503|504|internal server|server error|service unavailable/.test(message)) {
    return "Serveriin yeroo ammaa rakkoo qaba. Booda irra deebi'ii yaali; yoo itti fufe Admin qunnami.";
  }
  return fallback;
}
