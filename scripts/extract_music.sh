#!/usr/bin/env bash
# Decodes raw-assets/adventures/sounds/music.mo3 — the original game's background music, a single
# tracker module (MO3/Impulse Tracker) bundling 16 separate subsongs — into 16 standalone looping
# .ogg files under public/adventures/music/. Volume 2 has no music file of its own in the extracted
# data; its scripts reference the same MUSIC_* song-position constants as Volume 1, so both games
# share this one folder (see src/game/music.ts / src/game/adventures/musicMap.ts).
#
# Requires: libopenmpt (`brew install libopenmpt`, for openmpt123) and ffmpeg (with libopus).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=raw-assets/adventures/sounds/music.mo3
OUT=public/adventures/music
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$OUT"
for i in $(seq -w 0 15); do
  cp "$SRC" "$TMP/song_$i.mo3"
  openmpt123 --render --subsong "$((10#$i))" --samplerate 44100 --force --output-type wav "$TMP/song_$i.mo3" >/dev/null
  ffmpeg -nostdin -y -i "$TMP/song_$i.mo3.wav" -codec:a libopus -b:a 96k "$OUT/song_$i.ogg" </dev/null >/dev/null 2>&1
  echo "song_$i.ogg"
done
