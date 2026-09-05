#!/bin/bash
urls=(
  "https://youtu.be/l5OZu-IrXpw"
  "https://youtu.be/u9lj-c29dxI"
  "https://youtu.be/PVGeM40dABA"
  "https://youtu.be/u4R9rF8tyX8"
  "https://youtu.be/svpSQMu7d8A"
  "https://youtu.be/G4v1MITQbPk"
  "https://youtu.be/0lEWeVPD3nM"
  "https://youtu.be/ZsdgnZGbnzQ"
)
for url in "${urls[@]}"; do
  yt-dlp --dump-json "$url" | jq -r '{id: .id, title: .title, duration: .duration, filesize_approx: .filesize_approx, uploader: .uploader}'
done
