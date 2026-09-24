export { SPECTRA_VERSION } from "../version.js";
import { SPECTRA_VERSION } from "../version.js";

const GHOST_SVG_RAW = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="sd-ghost" x1="16" y1="2" x2="16" y2="28" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ddd6fe"/><stop offset="45%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><path fill="url(#sd-ghost)" d="M16 3C9.4 3 5 8.2 5 14.5V26c0 0 2.4-2.2 4.4 0 2 2.2 3.6-1.8 6.6 0 2-2.2 4.4 0 4.4 0V14.5C20 8.2 15.6 3 16 3Z"/><ellipse cx="12" cy="14.5" rx="2.1" ry="2.6" fill="#0b1020" opacity=".9"/><ellipse cx="20" cy="14.5" rx="2.1" ry="2.6" fill="#0b1020" opacity=".9"/><circle cx="12.6" cy="13.4" r=".75" fill="#22d3ee"/><circle cx="20.6" cy="13.4" r=".75" fill="#22d3ee"/></svg>`;

/** Data-URI favicon for single-file shareable HTML reports. */
export function spectraGhostFaviconDataUri(): string {
  return `data:image/svg+xml,${encodeURIComponent(GHOST_SVG_RAW)}`;
}

/** Inline purple ghost mark for HTML reports (no external assets). */
export function spectraGhostSvg(size = 22): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" class="logo-ghost"><defs><linearGradient id="sd-ghost" x1="16" y1="2" x2="16" y2="28" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ddd6fe"/><stop offset="45%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><path fill="url(#sd-ghost)" d="M16 3C9.4 3 5 8.2 5 14.5V26c0 0 2.4-2.2 4.4 0 2 2.2 3.6-1.8 6.6 0 2-2.2 4.4 0 4.4 0V14.5C20 8.2 15.6 3 16 3Z"/><ellipse cx="12" cy="14.5" rx="2.1" ry="2.6" fill="#0b1020" opacity=".9"/><ellipse cx="20" cy="14.5" rx="2.1" ry="2.6" fill="#0b1020" opacity=".9"/><circle cx="12.6" cy="13.4" r=".75" fill="#22d3ee"/><circle cx="20.6" cy="13.4" r=".75" fill="#22d3ee"/></svg>`;
}

export function spectraBrandRow(caseMeta?: string): string {
  const meta = caseMeta ? ` <span class="case-id">${caseMeta}</span>` : "";
  return `<div class="brand-row">${spectraGhostSvg(22)}<span class="brand">Spectra Desk</span>${meta}</div>`;
}
