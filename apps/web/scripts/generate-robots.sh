#!/bin/bash

# Generate robots.txt based on environment
# Usage: ./scripts/generate-robots.sh [local|preview|production]

set -e

ENV=${1:-local}
PUBLIC_DIR="$(dirname "$0")/../public"

case "$ENV" in
  local)
    echo "Generating robots.txt for local development..."
    cp "$PUBLIC_DIR/robots.txt.local" "$PUBLIC_DIR/robots.txt"
    ;;
  preview)
    echo "Generating robots.txt for preview environment..."
    cp "$PUBLIC_DIR/robots.txt.preview" "$PUBLIC_DIR/robots.txt"
    ;;
  production|prod)
    echo "Generating robots.txt for production..."
    cp "$PUBLIC_DIR/robots.txt.production" "$PUBLIC_DIR/robots.txt"
    ;;
  *)
    echo "Error: Invalid environment '$ENV'"
    echo "Usage: $0 [local|preview|production]"
    exit 1
    ;;
esac

echo "robots.txt generated successfully for $ENV environment"
