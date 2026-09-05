# Third-Party Notices

YT-Forge is licensed under the PolyForm Noncommercial License 1.0.0 (see [LICENSE](LICENSE)).
The components below are covered by their own licences, reproduced or referenced here.

---

## Project scaffold

The initial project scaffold — an Electron Forge + Vite + React starter — was derived from
[PikoCanFly/electron-react-vite-starter-project](https://github.com/PikoCanFly/electron-react-vite-starter-project),
which is MIT licensed. The application itself was written by Suja Rahaman; the scaffold's
original notice is preserved below as required by the MIT License.

MIT License

Copyright (c) 2025 Piko Can Fly

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Bundled executables

YT-Forge invokes the following programs as separate executables via the command line. They are
aggregated with YT-Forge, not linked into it, and each remains under its own licence.

### yt-dlp

Bundled in `bin/`. Released into the public domain under The Unlicense.
<https://github.com/yt-dlp/yt-dlp>

### FFmpeg and FFprobe

Bundled via the `ffmpeg-static` and `ffprobe-static` npm packages. The binaries are built with
`--enable-gpl --enable-version3` and are therefore licensed under the **GNU General Public
License, version 3 or later**. Full licence text: <https://www.gnu.org/licenses/gpl-3.0.html>
Source code: <https://ffmpeg.org/download.html>

The `ffprobe-static` npm wrapper itself is MIT licensed, Copyright (c) 2015 Josh Johnston.
