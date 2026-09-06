/**
 * Human copy for the failure kinds main.js reports (see classifyYtDlpError).
 *
 * The old error view said "the URL may be invalid, or the video might be
 * unavailable" for everything, which sends people off checking a link that was
 * fine. yt-dlp almost always knows the real reason — these turn its `kind`
 * into something the user can act on.
 */
const FETCH_ERRORS = {
  'age-signin': {
    title: 'Age-restricted video',
    detail: 'YouTube needs a signed-in account to confirm your age. Sign in from Settings, then try again.',
  },
  'age-blocked': {
    title: 'Age-restricted video',
    detail: "YouTube refused this one even though you're signed in. It only serves this video over a protected stream that yt-dlp can't read yet.",
  },
  'bot-check': {
    title: 'YouTube wants to verify you',
    detail: 'YouTube is asking to confirm the request is not automated. Signing in from Settings usually clears it.',
  },
  'members-only': {
    title: 'Members-only video',
    detail: "This video is limited to the channel's members. Sign in with an account that has the membership.",
  },
  private: {
    title: 'Private video',
    detail: 'The uploader has made this video private, so only accounts they invited can watch it.',
  },
  'geo-blocked': {
    title: 'Blocked in your region',
    detail: 'The uploader has restricted this video to other countries.',
  },
  upcoming: {
    title: 'Not released yet',
    detail: 'This is a premiere or a scheduled live stream. It can be downloaded once it has actually started.',
  },
  removed: {
    title: 'Video no longer available',
    detail: 'It was taken down, or the channel it belonged to is gone.',
  },
  'no-formats': {
    title: 'No downloadable formats',
    detail: 'The site returned the page but no usable video or audio streams for it.',
  },
  'rate-limited': {
    title: 'Too many requests',
    detail: 'The site is rate-limiting this connection. Wait a few minutes before trying again.',
  },
  network: {
    title: "Couldn't reach the site",
    detail: 'The request failed before any video data came back. Check your connection and try again.',
  },
  unsupported: {
    title: 'Unsupported link',
    detail: "This page isn't one yt-dlp can extract a video from. Check that the URL points straight at a video.",
  },
  unavailable: {
    title: 'Video unavailable',
    detail: 'The site says this video cannot be played right now.',
  },
};

export function fetchErrorTitle(kind) {
  return FETCH_ERRORS[kind]?.title || "Couldn't fetch video";
}

export function fetchErrorDetail(kind, rawMessage) {
  return (
    FETCH_ERRORS[kind]?.detail ||
    rawMessage ||
    'The URL may be invalid, or the video might be unavailable. Please check and try again.'
  );
}
