// Sticky download toggles, shared by the single-video and playlist views.
//
// Seeded from the preload's synchronous read of the store, so a view can use
// these as its initial state and paint the remembered value on its first
// frame. Every change writes through to this object as well as to disk, so a
// second video or playlist opened in the same session sees the latest choice
// without a round-trip.
//
// Defaults are duplicated from the main process only as a guard for the
// (shouldn't-happen) case of the preload snapshot being unavailable — the main
// process is the authority and always returns a full, validated set.
const DEFAULTS = {
  playlistConvertToH264: false,
  playlistOverwriteFiles: false,
  playlistNumberFiles: true,
  videoConvertToH264: false,
};

export const downloadOptions = {
  ...DEFAULTS,
  ...(window.electronAPI.initialDownloadOptions || {}),
};

/** Persist a subset of the toggles and keep the in-session copy in step. */
export const rememberOptions = (patch) => {
  Object.assign(downloadOptions, patch);
  window.electronAPI.setDownloadOptions(downloadOptions);
};
