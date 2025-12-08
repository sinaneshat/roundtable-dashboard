#!/bin/bash

# Roundtable Development Startup Script
# This script starts Claude Code with skip permissions and the development server

echo "🚀 Starting Roundtable Development Environment..."

# Start Claude Code with skip permissions in background
echo "📝 Starting Claude Code (with skip permissions)..."
claude --dangerously-skip-permissions &
CLAUDE_PID=$!

# Give Claude a moment to start
sleep 2

# Start development server
echo "🌐 Starting development server..."
pnpm dev &
DEV_PID=$!

echo ""
echo "✅ Environment started!"
echo "   Claude PID: $CLAUDE_PID"
echo "   Dev Server PID: $DEV_PID"
echo ""
echo "To stop all services, run:"
echo "   kill $CLAUDE_PID $DEV_PID"
echo ""
echo "Or press Ctrl+C to stop this script (services will continue)"
echo ""

# Wait for user interrupt
wait
