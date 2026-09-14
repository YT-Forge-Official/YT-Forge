// Audio output formats offered alongside MP4, shared by the single-video and
// playlist views. The main process keeps its own copy of this table (it owns
// the yt-dlp arguments and the save dialog); this one owns what the user sees.
//
// Each format carries only a `tagline` — the one or two words that say what it
// is FOR ("Editing", "Archive"), which holds on every site. There is
// deliberately no explanatory note: any sentence detailed enough to be useful
// ("keeps the source AAC stream untouched") is a claim about one site's
// streams, and this app downloads from hundreds. Measured proof that the
// claims don't travel: M4A really is a byte-exact copy on YouTube and Reddit,
// but SoundCloud serves MP3, so there it is a re-encode — the same option, the
// opposite of what a note would have promised. Purpose survives that; detail
// does not. Don't reintroduce per-format prose.
//
// Keep `tagline` short: it renders as "M4A · Efficient" inside a half-width
// select that sits next to the quality one, and "FLAC · Archive" is about as
// much as fits before the label truncates to an ellipsis.

/**
 * Bytes per second of audio for the size estimate, or null to fall back to the
 * size of the source stream.
 *
 * Only the two lossless targets need a computed figure: their size has nothing
 * to do with how big the compressed source was. WAV is 48 kHz / 16-bit /
 * stereo PCM — the sample rate Opus decodes to, and Opus is what yt-dlp is
 * told to prefer for these formats — a 44.1 kHz source makes this figure ~9%
 * high, which is the safe direction. FLAC on already-lossy material measured
 * 51-54% of WAV across YouTube, Reddit and SoundCloud sources (at 16-bit; see
 * the sample-format note in main.js); 60% is a deliberate over-estimate, since
 * running out of disk is worse than a file arriving smaller than promised.
 */
const WAV_BYTES_PER_SECOND = 48000 * 2 * 2;

export const AUDIO_FORMATS = {
  mp3: {
    label: 'MP3',
    tagline: 'Universal',
    // LAME V0 is VBR, and measured output ranges from 97 kbps (old, lowpassed
    // speech) to 209 kbps (a normal 131k AAC source) — so no fixed bitrate
    // estimates it well either. The source stream size stays the best
    // available proxy, as in earlier builds, and it is exact on the sites that
    // serve MP3 natively (SoundCloud), where the stream is copied. Marked
    // approximate because on an AAC source the real file can be ~1.6x this.
    bytesPerSecond: null,
  },
  m4a: {
    label: 'M4A',
    tagline: 'Efficient',
    bytesPerSecond: null,
  },
  wav: {
    label: 'WAV',
    tagline: 'Editing',
    bytesPerSecond: WAV_BYTES_PER_SECOND,
  },
  flac: {
    label: 'FLAC',
    tagline: 'Archive',
    bytesPerSecond: Math.round(WAV_BYTES_PER_SECOND * 0.6),
  },
};

export const AUDIO_FORMAT_KEYS = Object.keys(AUDIO_FORMATS);

/** True for every audio output type; false for 'mp4'. */
export const isAudioType = (type) =>
  Object.prototype.hasOwnProperty.call(AUDIO_FORMATS, type);

/** 'MP3 · Universal' — the label used in the format dropdown. */
export const audioFormatLabel = (type) => {
  const entry = AUDIO_FORMATS[type];
  return entry ? `${entry.label} · ${entry.tagline}` : '';
};

/**
 * Estimated on-disk size of an audio download, in bytes.
 *
 * Formats that copy the source stream report its real size; the rest are
 * derived from duration, because the source size says nothing about what a
 * PCM or FLAC re-encode will weigh.
 */
export const estimateAudioBytes = (type, durationSeconds, sourceBytes = 0) => {
  const entry = AUDIO_FORMATS[type];
  if (!entry) return sourceBytes || 0;
  if (!entry.bytesPerSecond) return sourceBytes || 0;
  if (!durationSeconds) return sourceBytes || 0;
  return Math.round(durationSeconds * entry.bytesPerSecond);
};
