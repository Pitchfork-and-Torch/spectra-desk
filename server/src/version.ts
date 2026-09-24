/**
 * Single product version for Spectra Desk.
 * Keep in lockstep with root/server/client/desktop package.json when releasing.
 * Desktop main reads package.json; UI/API/reports import this constant.
 */
export const SPECTRA_VERSION = "10.0.0";

export function spectraToolLabel(): string {
  return `Spectra Desk v${SPECTRA_VERSION}`;
}
