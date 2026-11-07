#!/usr/bin/env bash
# Uçtan uca test için küçük örnek yayınlar üretir (ffmpeg gerekir). Çıktı git'e girmez.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p media/hls
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=320x180:rate=15:duration=40" -f lavfi -i "sine=frequency=440:duration=40" \
  -c:v libvpx -b:v 300k -g 15 -c:a libopus -b:a 48k -shortest media/clip.webm
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=320x180:rate=15:duration=24" -f lavfi -i "sine=frequency=330:duration=24" \
  -c:v libvpx-vp9 -b:v 200k -g 30 -c:a libopus -b:a 48k -shortest -f hls -hls_time 4 -hls_playlist_type vod \
  -hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4 -hls_segment_filename 'media/hls/seg%d.m4s' media/hls/index.m3u8
echo "örnek yayınlar hazır: mock/media"
