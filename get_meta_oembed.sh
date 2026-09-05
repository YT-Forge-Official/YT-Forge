#!/bin/bash
urls=(
  "l5OZu-IrXpw"
  "u9lj-c29dxI"
  "PVGeM40dABA"
  "u4R9rF8tyX8"
  "svpSQMu7d8A"
  "G4v1MITQbPk"
  "0lEWeVPD3nM"
  "ZsdgnZGbnzQ"
)
for id in "${urls[@]}"; do
  echo "ID: $id"
  curl -s "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=$id&format=json" | jq -r '{title: .title, author: .author_name}'
  # Get length in seconds from microformat
  curl -s -L "https://www.youtube.com/watch?v=$id" | grep -o '"lengthSeconds":"[0-9]*"' | head -1
done
