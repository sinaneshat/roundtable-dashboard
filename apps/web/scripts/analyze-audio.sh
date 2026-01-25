#!/bin/bash
# Audio Energy Analysis Script
# Analyzes showcase-bg.mp3 and outputs energy levels

AUDIO_FILE="public/static/music/showcase-bg.mp3"
OUTPUT_DIR="src/remotion/lib"

echo "=========================================="
echo "AUDIO ENERGY ANALYSIS"
echo "=========================================="
echo ""

# Get audio duration
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$AUDIO_FILE" 2>/dev/null)
echo "Audio file: $AUDIO_FILE"
echo "Duration: ${DURATION}s"
echo ""

# Extract audio stats every 5 seconds
echo "Analyzing energy levels (5-second segments)..."
echo ""
echo "Time       | Energy Bar                                    | Level"
echo "-----------|-----------------------------------------------|-------"

# Analyze in 5-second chunks
CHUNK_SIZE=5
TIME=0

# Store results for later
declare -a TIMES
declare -a ENERGIES
declare -a LABELS

while (( $(echo "$TIME < $DURATION" | bc -l) )); do
    # Get the RMS volume for this segment
    END_TIME=$(echo "$TIME + $CHUNK_SIZE" | bc)

    # Use ffmpeg to get volume stats
    STATS=$(ffmpeg -i "$AUDIO_FILE" -ss "$TIME" -t "$CHUNK_SIZE" -af "volumedetect" -f null - 2>&1)

    # Extract mean volume (in dB, typically -50 to 0)
    MEAN_VOL=$(echo "$STATS" | grep "mean_volume:" | awk '{print $5}' | tr -d ' ')
    MAX_VOL=$(echo "$STATS" | grep "max_volume:" | awk '{print $5}' | tr -d ' ')

    if [ -n "$MEAN_VOL" ]; then
        # Convert dB to percentage (assuming -60dB is silence, 0dB is max)
        # Formula: percentage = (60 + dB) / 60 * 100
        PERCENT=$(echo "scale=0; (60 + $MEAN_VOL) * 100 / 60" | bc)
        if [ "$PERCENT" -lt 0 ]; then PERCENT=0; fi
        if [ "$PERCENT" -gt 100 ]; then PERCENT=100; fi

        # Generate bar
        BAR_LEN=$((PERCENT * 40 / 100))
        BAR=""
        for ((i=0; i<BAR_LEN; i++)); do BAR+="█"; done
        for ((i=BAR_LEN; i<40; i++)); do BAR+="░"; done

        # Classify energy
        if [ "$PERCENT" -lt 20 ]; then
            LABEL="quiet"
        elif [ "$PERCENT" -lt 35 ]; then
            LABEL="low"
        elif [ "$PERCENT" -lt 50 ]; then
            LABEL="medium"
        elif [ "$PERCENT" -lt 65 ]; then
            LABEL="building"
        elif [ "$PERCENT" -lt 80 ]; then
            LABEL="high"
        else
            LABEL="PEAK"
        fi

        # Format time
        MINS=$((${TIME%.*} / 60))
        SECS=$((${TIME%.*} % 60))
        TIME_STR=$(printf "%d:%02d-%d:%02d" $MINS $SECS $((${END_TIME%.*}/60)) $((${END_TIME%.*}%60)))

        echo "$TIME_STR | $BAR | $LABEL ($PERCENT%)"

        # Store for analysis
        TIMES+=("$TIME")
        ENERGIES+=("$PERCENT")
        LABELS+=("$LABEL")
    fi

    TIME=$END_TIME
done

echo ""
echo "=========================================="
echo "RECOMMENDED SPLICE MAP FOR VIDEO"
echo "=========================================="
echo ""
echo "Your video needs these energy levels:"
echo ""
echo "Scene        | Duration | Need    | Best Audio Segment"
echo "-------------|----------|---------|-------------------"

# Find best matches for each scene
find_best_segment() {
    local need="$1"
    local min_duration="$2"
    local best_time=""
    local best_energy=0

    for i in "${!LABELS[@]}"; do
        case "$need" in
            "quiet"|"low")
                if [[ "${LABELS[$i]}" == "quiet" || "${LABELS[$i]}" == "low" ]]; then
                    if [ -z "$best_time" ]; then
                        best_time="${TIMES[$i]}"
                    fi
                fi
                ;;
            "medium"|"building")
                if [[ "${LABELS[$i]}" == "medium" || "${LABELS[$i]}" == "building" ]]; then
                    if [ -z "$best_time" ] || [ "${ENERGIES[$i]}" -gt "$best_energy" ]; then
                        best_time="${TIMES[$i]}"
                        best_energy="${ENERGIES[$i]}"
                    fi
                fi
                ;;
            "high"|"peak")
                if [[ "${LABELS[$i]}" == "high" || "${LABELS[$i]}" == "PEAK" ]]; then
                    if [ "${ENERGIES[$i]}" -gt "$best_energy" ]; then
                        best_time="${TIMES[$i]}"
                        best_energy="${ENERGIES[$i]}"
                    fi
                fi
                ;;
        esac
    done
    echo "$best_time"
}

echo "Intro        | 5.0s     | quiet   | $(find_best_segment quiet 5)s"
echo "Homepage     | 4.2s     | building| $(find_best_segment building 4)s"
echo "Sidebar      | 3.5s     | medium  | $(find_best_segment medium 3)s"
echo "ChatInput    | 35.5s    | building| $(find_best_segment building 30)s"
echo "ModelModal   | 12.2s    | high    | $(find_best_segment high 12)s"
echo "ChatThread   | 20.2s    | PEAK    | $(find_best_segment peak 20)s"
echo "Finale       | 3.8s     | low     | $(find_best_segment low 3)s"

echo ""
echo "=========================================="
echo "Done! Use these timestamps to configure your audio splicing."
echo "=========================================="
