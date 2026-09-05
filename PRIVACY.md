# Privacy

*Last updated: 4 September 2026*

**YT-Forge has no telemetry, no analytics, and no accounts.** It does not
report usage, does not count launches, does not send crash reports, and does
not contain any third-party analytics service, SDK, ad network, or tracking
pixel. There is no server operated by this project, so there is nowhere for
your data to go.

Nothing about you or your downloads is ever sent anywhere.

The app does make network requests, because a video downloader has to. All of
them are listed below, and all of them can be verified by reading the source.

## Requests YT-Forge makes at startup

Two, both to GitHub, neither to us.

**1. yt-dlp update check.** YT-Forge runs `yt-dlp -U`, which asks GitHub
whether a newer yt-dlp release exists and updates the bundled binary if so.
YouTube changes constantly and an out-of-date yt-dlp stops working, so this is
what keeps downloads functioning.

**2. YT-Forge release check.** YT-Forge asks the public GitHub API whether a
newer YT-Forge release exists, so it can show a "new version available" hint.
There is no auto-updater, so nothing is downloaded or installed as a result —
it is only a notice. It is one `fetch` call in
[`src/contexts/AppContext.jsx`](src/contexts/AppContext.jsx).

Both are subject to
[GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
Like any HTTP request they reveal your IP address to GitHub, which no app can
avoid. Neither carries anything about you, and neither reaches this project.

## Signing in to YouTube (optional)

YT-Forge can sign in to YouTube, which is needed for age-restricted videos,
private playlists, and content only your account can see. This is entirely
optional and off until you use it. No YT-Forge server is involved at any point —
it is between your computer and Google.

If you do sign in, you should know how it works:

- Sign-in happens in a real Google sign-in window
  ([`src/main.js`](src/main.js)). YT-Forge never sees or stores your password.
- YT-Forge then copies your YouTube session cookies out of that window into a
  plain text file, `youtube_cookies.txt`, in the same folder as your settings,
  and passes it to yt-dlp with `--cookies` so downloads can use your session.
  **That file is not encrypted**, and like any file in your user folder it is
  readable by other software running as you. It never leaves your machine.
- While you are signed in, your downloads are authenticated as your Google
  account, which means YouTube can associate them with you. That is inherent to
  signing in anywhere, not something YT-Forge adds — but it is the practical
  consequence, so it is worth stating plainly.
- **Signing out deletes it.** YT-Forge clears your `youtube.com` and
  `google.com` cookies and deletes `youtube_cookies.txt` from disk.

## Video thumbnails

Thumbnails shown in the app — in search results, playlists, and your download
history — are loaded directly from YouTube's image servers (`i.ytimg.com`) as
normal images, because YT-Forge stores the thumbnail URL rather than a copy of
the picture.

This means that opening your History requests those images from Google, which
reveals your IP address to Google and, through the URLs, which videos are in
your history. Nothing is uploaded and nothing reaches this project — but "your
history stays on your computer" would be misleading without this note, so here
it is.

## Everything else stays on your computer

Your download history, settings, theme, and downloaded files are stored locally
and never leave your machine. YT-Forge has no account system, no login, and no
server-side storage of anything you do in the app.

Those settings live in a single file, if you ever want to inspect or delete it:

- **macOS** `~/Library/Application Support/YT-Forge/config.json`
- **Windows** `%APPDATA%\YT-Forge\config.json`
- **Linux** `~/.config/YT-Forge/config.json`

(Some **development** builds — never a released version — stored this file in an
`electron-store-nodejs` folder instead, because of a bug in how YT-Forge loaded
its settings library. If you ever ran one, the app merges that file back into
the correct location on launch and renames the old one to
`config.json.migrated`, leaving its contents intact. Nothing is deleted.)

## Questions

Changes to this document are visible in its
[file history](https://github.com/YT-Forge-Official/YT-Forge/commits/main/PRIVACY.md).
For anything else, open a discussion at
<https://github.com/YT-Forge-Official/YT-Forge/discussions>.
