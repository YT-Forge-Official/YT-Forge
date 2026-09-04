<div align="center">
  <img src="assets/icon.png" alt="YT-FORGE Icon" width="120" />

  <h1>YT-FORGE</h1>

  <p>
    A fast, modern desktop YouTube downloader designed for creators and editors.
  </p>

  <p>
    macOS • Windows • Linux <br/>

  </p>
</div>

---

## Overview

**YT-FORGE** is a fast, lightweight desktop **YouTube video downloader** and **yt-dlp GUI wrapper** built on top of the powerful [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) engine.

It focuses on three things:

• Speed  
• Simplicity  
• Editor-friendly downloads

Unlike many downloaders, YT-FORGE prioritizes **H.264 video and AAC audio** formats, ensuring smooth playback and seamless compatibility with professional editing software such as **Premiere Pro**, **Final Cut Pro**, and **DaVinci Resolve**.

---

## Features

- **Fast Downloads**  
  Powered by the battle-tested `yt-dlp` engine.

- **Minimal Interface**  
  Clean dark UI built with React and Shadcn UI.

- **Editor-Friendly Formats**  
  Automatically prefers H.264 + AAC (MP4) over AV1/VP9.

- **Built-in H.264 Conversion**  
  Easily convert downloaded VP9 or AV1 videos to H.264 directly within the app for maximum compatibility.

- **No Ads. No Tracking.**  
  Source-available and transparent.


---

## Interface

<p align="center">
  <img src="assets/screenshot1.png" width="49%" />
  &nbsp;
  <img src="assets/screenshot2.png" width="49%" />
</p>

---

## Download

| OS | Hardware / Architecture | Direct Download (v1.0.8) |
|--------|---------------------|--------------------------|
| **macOS** | Apple Silicon (M1/M2/M3/M4) | [Download .dmg](https://github.com/YT-Forge-Official/YT-Forge/releases/download/v1.0.8/YT-FORGE-1.0.8-arm64.dmg) |
| **Windows** | Intel / AMD & Snapdragon (ARM) | [Download .exe](https://github.com/YT-Forge-Official/YT-Forge/releases/download/v1.0.8/YT-FORGE-Setup-1.0.8.exe) |
| **Linux** | Intel / AMD (Standard PCs) | [Download .AppImage](https://github.com/YT-Forge-Official/YT-Forge/releases/download/v1.0.8/YT-FORGE-1.0.8.AppImage) |
| **Linux** | ARM Devices (Raspberry Pi, etc.)| [Download ARM .AppImage](https://github.com/YT-Forge-Official/YT-Forge/releases/download/v1.0.8/YT-FORGE-1.0.8-arm64.AppImage) |

**Latest release:**  
https://github.com/YT-Forge-Official/YT-Forge/releases/latest

---

## Security Notice

Because this is an independent open-source application without enterprise code-signing certificates, your operating system may show a warning on first launch.

**Windows:**  
`More Info` → `Run Anyway`

**macOS:**  
`System Settings → Privacy & Security → Open Anyway`

This approval is required **only once**.

---

## Legal

YT-FORGE is a graphical interface for the open-source **yt-dlp** project.

This application does not modify or circumvent the original software.

Please download only content that you have permission to access or distribute.

---

## License

YT-Forge is **source-available**, not open source.

It is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). In plain terms:

- **Allowed** — personal use, hobby projects, study and research, and use by charities, schools, public research bodies and government institutions. You may read, modify, fork and redistribute the source for those purposes.
- **Not allowed** — any commercial purpose. You may not sell YT-Forge, ship it inside a paid product, or rebrand it and monetise it.

"YT-Forge", the YT-Forge name and the YT-Forge logo are trademarks of the author and are **not** licensed by the above. A permitted fork must be distributed under a different name and branding.

For a commercial licence, contact the author.

> **Note on earlier versions:** releases up to and including v1.0.8 were published under the MIT License, and those versions remain available under MIT. This change applies to subsequent versions only.

### Credits and third-party components

The initial Electron + Vite + React scaffold was derived from [PikoCanFly/electron-react-vite-starter-project](https://github.com/PikoCanFly/electron-react-vite-starter-project) (MIT). The application itself was written by Suja Rahaman.

YT-Forge also bundles [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense) and [FFmpeg / FFprobe](https://ffmpeg.org) (GPL-3.0-or-later), which it invokes as separate executables.

Full attributions and licence texts: **[NOTICE.md](NOTICE.md)**.

---

## Privacy

YT-Forge respects your privacy. There is no telemetry, analytics, or remote tracking. All of your downloads, search history, and settings are stored locally on your device.

For full details regarding network requests and optional features like YouTube sign-in, please read the **[Privacy Policy](PRIVACY.md)**.

---

<div align="center">
Built with Electron, React, and Vite.
</div>
