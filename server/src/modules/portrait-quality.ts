/**
 * Portrait quality gate (v6) - reject platform logos, default avatars, and non-face chrome.
 * Prevents YouTube/Google Play logos from entering the Subject Portrait Gallery.
 */
import type { PortraitCandidate } from "../types.js";

/** Known platform logo / brand-mark URL patterns (not subject faces). */
const LOGO_URL_PATTERNS: RegExp[] = [
  /yt_1200\.png/i,
  /youtube\.com\/img\//i,
  /yt3\.googleusercontent\.com\/.*youtube/i,
  /play-lh\.googleusercontent\.com/i,
  /googleusercontent\.com\/.*play/i,
  /\/favicon\./i,
  /apple-touch-icon/i,
  /android-chrome/i,
  /mstile-/i,
  /\/logo[-_.]/i,
  /brand[-_]?assets/i,
  /static.*\/logo/i,
  /sprites\//i,
  /default[-_]?avatar/i,
  /avatar[-_]?default/i,
  /mystery[-_]?person/i,
  /placeholder/i,
  /no[-_]?photo/i,
  /gravatar\.com\/avatar\/[a-f0-9]{32}\?d=(identicon|mp|retro|monsterid|wavatar|robohash)/i,
  /abs\.twimg\.com\/sticky\/default_profile/i,
  /instagram\.com\/static\/images\/anonymous/i,
  /fbcdn\.net\/.*\/safe_image/i,
];

const LOGO_LABEL_PATTERNS: RegExp[] = [
  /^youtube(\s|-|$)/i,
  /google play/i,
  /apps on google play/i,
  /^favicon$/i,
  /default profile/i,
  /channel icon/i,
];

export interface PortraitQualityResult {
  isLikelyFace: boolean;
  isPlatformLogo: boolean;
  rejectReason?: string;
  score: number; // 0..1 quality for gallery ranking
}

export function assessPortraitUrlQuality(
  imageUrl: string,
  opts?: { label?: string; platform?: string; profileUrl?: string },
): PortraitQualityResult {
  const url = imageUrl || "";
  const label = opts?.label || "";
  const profile = opts?.profileUrl || "";

  for (const re of LOGO_URL_PATTERNS) {
    if (re.test(url)) {
      return {
        isLikelyFace: false,
        isPlatformLogo: true,
        rejectReason: `Platform/brand logo URL pattern: ${re.source.slice(0, 40)}`,
        score: 0,
      };
    }
  }

  for (const re of LOGO_LABEL_PATTERNS) {
    if (re.test(label)) {
      return {
        isLikelyFace: false,
        isPlatformLogo: true,
        rejectReason: `Label indicates brand asset: ${label.slice(0, 40)}`,
        score: 0,
      };
    }
  }

  // Profile URL is a platform home, not a person profile
  if (
    /^https?:\/\/(www\.)?youtube\.com\/?$/i.test(profile) ||
    /^https?:\/\/(www\.)?youtube\.com\/youtube\/?$/i.test(profile) ||
    /play\.google\.com\/store\/apps/i.test(profile)
  ) {
    return {
      isLikelyFace: false,
      isPlatformLogo: true,
      rejectReason: "Profile URL is platform homepage/app store, not a subject profile",
      score: 0,
    };
  }

  // Tiny images / tracking pixels (if dimensions known via query string)
  const dim = url.match(/[?&](?:w|width)=(\d+)/i);
  if (dim && Number(dim[1]) > 0 && Number(dim[1]) < 48) {
    return {
      isLikelyFace: false,
      isPlatformLogo: false,
      rejectReason: "Image width too small for face identification",
      score: 0.1,
    };
  }

  // Unavatar / gravatar / github avatars - treat as plausible faces
  let score = 0.55;
  if (/unavatar\.io\//i.test(url)) score = 0.7;
  if (/avatars\.githubusercontent\.com/i.test(url)) score = 0.8;
  if (/pbs\.twimg\.com\/profile_images/i.test(url)) score = 0.85;
  if (/scontent.*\.cdninstagram\.com/i.test(url) || /instagram\./i.test(url)) score = 0.75;
  if (/googleusercontent\.com\/a\//i.test(url)) score = 0.65;
  if (opts?.platform === "GitHub" || opts?.platform === "Twitter/X") score = Math.max(score, 0.72);

  return {
    isLikelyFace: score >= 0.55,
    isPlatformLogo: false,
    score,
  };
}

/** Filter portrait candidates for Subject Gallery (reject logos). */
export function filterGalleryPortraits<T extends Pick<PortraitCandidate, "imageUrl" | "label" | "platform" | "profileUrl">>(
  candidates: T[],
): { kept: T[]; rejected: Array<T & { rejectReason: string }> } {
  const kept: T[] = [];
  const rejected: Array<T & { rejectReason: string }> = [];
  for (const c of candidates) {
    const q = assessPortraitUrlQuality(c.imageUrl, {
      label: c.label,
      platform: c.platform,
      profileUrl: c.profileUrl,
    });
    if (q.isPlatformLogo || !q.isLikelyFace) {
      rejected.push({ ...c, rejectReason: q.rejectReason || "Failed portrait quality gate" });
    } else {
      kept.push(c);
    }
  }
  return { kept, rejected };
}
