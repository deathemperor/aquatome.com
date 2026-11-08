#!/bin/sh
# A short silent loop of a fish for the app's cards (content/curation.json `loops`), from a clip whose licence allows it.
#
#   scripts/make-loop.sh <input> <start s> <length s> <out dir/name> [crop centre x 0–1] [crop centre y 0–1] [deshake]
#
# Writes <name>.mp4 (HEVC, tagged hvc1), <name>-h264.mp4 (for browsers without HEVC) and <name>.webp (the first frame):
# square 1080 px, the source's own frame rate up to 30 fps, BT.709, no audio track, the moov at the front. The last
# second fades into the first, so it loops with no jump: pick a start whose first second looks like the second after
# the loop, or a fish shows twice while it fades. FADE=0.5 shortens the fade for a shot too short for a whole second.
# BOUNCE=1 is for a fish that holds still: the shot plays backward from its last frame and forward again, so the join
# needs no fade, and the poster is the shot's last frame. POSTER=2.5 takes the poster from 2.5 s into the loop: a loop
# that starts before its fish swims in, or a bounce's sharpest frame. It runs at the lowest priority: the Mac is shared
# (AGENTS.md, This Mac).
set -eu
in=$1 start=$2 len=$3 out=$4 cx=${5:-0.5} cy=${6:-0.5} shake=${7:-}
fade=${FADE:-1}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
run() { nice -n 19 "$@"; }
count() { ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$1"; }

# The source's own frame rate, up to 30: 25 fps footage stretched to 30 repeats every sixth frame, which shows as a
# stutter (council, 2026-11-08).
# Some containers give 0/0 for the average; then the stream's base rate, then 30.
fps_of() { ffprobe -v error -select_streams v:0 -show_entries "stream=$1" -of csv=p=0 "$in" | awk -F/ '{ print ($2 + 0 ? $1 / $2 : 0) }'; }
rate=$(printf '%s %s\n' "$(fps_of avg_frame_rate)" "$(fps_of r_frame_rate)" | awk '{ r = $1 > 0 ? $1 : ($2 > 0 ? $2 : 30); print (r > 30 ? 30 : r) }')
# The square crop around (cx, cy), kept inside the frame, scaled to 1080.
square="crop='min(iw,ih)':'min(iw,ih)':'max(0,min(iw-min(iw,ih),iw*$cx-min(iw,ih)/2))':'max(0,min(ih-min(iw,ih),ih*$cy-min(iw,ih)/2))',scale=1080:1080:flags=lanczos,fps=$rate,setsar=1"
[ -n "$shake" ] && square="deshake,$square"

if [ -n "${BOUNCE:-}" ]; then
  # Backward, then forward without the two frames the turns would show twice, counted in the cut itself.
  run ffmpeg -nostdin -loglevel error -ss "$start" -t "$len" -i "$in" -an -vf "$square,format=yuv420p" -c:v libx264 -crf 12 -preset veryfast "$tmp/cut.mp4"
  n=$(count "$tmp/cut.mp4")
  run ffmpeg -nostdin -loglevel error -i "$tmp/cut.mp4" -filter_complex \
    "[0:v]reverse,split[a][b];[b]reverse,trim=start_frame=1:end_frame=$((n - 1)),setpts=PTS-STARTPTS[c];[a]setpts=PTS-STARTPTS[a2];[a2][c]concat=n=2:v=1:a=0,format=yuv420p[v]" \
    -map '[v]' -c:v libx264 -crf 10 -preset veryfast "$tmp/loop.mp4"
else
  # One second more than the loop: its first second fades in over the loop's last.
  run ffmpeg -nostdin -loglevel error -ss "$start" -t "$(echo "$len + $fade" | bc)" -i "$in" -an -vf "$square,format=yuv420p" -c:v libx264 -crf 12 -preset veryfast "$tmp/cut.mp4"
  run ffmpeg -nostdin -loglevel error -i "$tmp/cut.mp4" -filter_complex \
    "[0:v]split[a][b];[a]trim=start=$fade,setpts=PTS-STARTPTS[main];[b]trim=end=$fade,setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=$fade:offset=$(echo "$len - $fade" | bc),format=yuv420p[v]" \
    -map '[v]' -c:v libx264 -crf 10 -preset veryfast "$tmp/loop.mp4"
fi

tags="-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv"
# HEVC for the app: about 1 Mbps, a keyframe at the start only every 2 s.
run ffmpeg -nostdin -loglevel error -y -i "$tmp/loop.mp4" -an -c:v libx265 -preset slow -b:v 1100k -maxrate 1500k -bufsize 3000k \
  -x265-params "log-level=error:keyint=60:min-keyint=60:colorprim=bt709:transfer=bt709:colormatrix=bt709" -tag:v hvc1 -pix_fmt yuv420p $tags -movflags +faststart "$out.mp4"
run ffmpeg -nostdin -loglevel error -y -i "$tmp/loop.mp4" -an -c:v libx264 -preset slow -profile:v high -b:v 1400k -maxrate 1800k -bufsize 3600k \
  -x264-params "colorprim=bt709:transfer=bt709:colormatrix=bt709" -g 60 -pix_fmt yuv420p $tags -movflags +faststart "$out-h264.mp4"
run ffmpeg -nostdin -loglevel error -y -ss "${POSTER:-0}" -i "$out.mp4" -frames:v 1 "$tmp/poster.png"
run magick "$tmp/poster.png" -quality 78 "$out.webp"
ls -l "$out.mp4" "$out-h264.mp4" "$out.webp" | awk '{print $5, $9}'
