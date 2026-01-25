#!/bin/bash
# Audio Splice - MINIMAL CUTS AT NATURAL REPEAT POINTS
#
# Track structure (onset density analysis):
#   Phrases 1-4 (0-66s):     Medium activity - BUILDING
#   Phrase 5 (66-83s):       HIGH activity
#   Phrase 6 (83-99s):       Medium
#   Phrase 7 (99-116s):      HIGH activity  
#   Phrase 8 (116-132s):     Lower - good for intro
#   Phrases 9-10 (132-165s): Medium - pre-peak
#   Phrases 11-12 (165-199s): PEAK! THE DROP!
#   Phrases 13+ (199s+):     Outro (mostly silent)
#
# Strategy: TWO segments with ONE clean cut
#   Segment A: Building section (phrases 2-6) for Intro through ChatInput
#   Segment B: Peak section (phrases 11-12) for ModelModal through Finale
#
# Cut point: At phrase boundary where onset patterns match

INPUT="public/static/music/showcase-bg.mp3"
OUTPUT="public/static/music/showcase-spliced.mp3"

echo "==========================================="
echo "MINIMAL CUT SPLICE - Natural Repeat Points"
echo "==========================================="
echo ""

mkdir -p /tmp/splice

# Segment A: Building energy (16.6s to 83s = ~66s)
# This covers: Intro, Homepage, Sidebar, most of ChatInput
# Natural phrase boundary at 16.6s and 83s
echo "Segment A: Building section (16.6s to 82.8s = 66.2s)"
ffmpeg -y -i "$INPUT" -ss 16.6 -t 66.2 \
    -af "afade=t=in:st=0:d=2" \
    -c:a libmp3lame -q:a 2 /tmp/splice/segA.mp3 2>/dev/null

# Segment B: PEAK section (165.5s to 199s = ~33.5s)  
# This covers: End of ChatInput, ModelModal, ChatThread, Finale
# THE DROP! Highest energy in the track
echo "Segment B: PEAK section - THE DROP (165.5s to 199s = 33.5s)"
ffmpeg -y -i "$INPUT" -ss 165.5 -t 33.5 \
    -af "afade=t=out:st=30:d=3.5" \
    -c:a libmp3lame -q:a 2 /tmp/splice/segB.mp3 2>/dev/null

# Join with crossfade at natural phrase boundary
# Both segments start/end at phrase boundaries where patterns are similar
echo ""
echo "Joining with 2s crossfade at phrase boundary..."
ffmpeg -y \
    -i /tmp/splice/segA.mp3 \
    -i /tmp/splice/segB.mp3 \
    -filter_complex "[0][1]acrossfade=d=2:c1=exp:c2=log[out]" \
    -map "[out]" \
    -c:a libmp3lame -q:a 2 \
    "$OUTPUT" 2>/dev/null

# Verify
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT" 2>/dev/null)
VOLUME=$(ffmpeg -i "$OUTPUT" -af "volumedetect" -f null - 2>&1 | grep "mean_volume" | awk '{print $5}')

echo ""
echo "==========================================="
echo "DONE - Minimal Cut Splice"
echo "==========================================="
echo "Output: $OUTPUT"
echo "Duration: ${DURATION}s"
echo "Mean volume: ${VOLUME}"
echo ""
echo "Structure:"
echo "  0-66s:  Building energy (phrases 2-5)"
echo "  64-98s: THE DROP! Peak energy (phrases 11-12)"
echo ""
echo "Only ONE crossfade at ~64s (phrase boundary)"
echo ""

rm -rf /tmp/splice
