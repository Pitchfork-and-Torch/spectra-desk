/** Case and report ids that are safe to join onto a directory. */
export const CASE_ID_RE = /^[A-Za-z0-9_-]+$/;

export function isSafeCaseId(id: string): boolean {
  return typeof id === "string" && CASE_ID_RE.test(id);
}
