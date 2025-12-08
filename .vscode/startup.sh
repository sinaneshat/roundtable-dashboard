#!/bin/bash

# Roundtable Development Startup Script
# This script syncs git, then starts Claude Code with skip permissions and the development server

set -e  # Exit on error

echo "🚀 Starting Roundtable Development Environment..."
echo ""

# ============================================
# STEP 1: Git Sync
# ============================================
echo "📡 Syncing with remote repository..."

# Fetch all branches
echo "   Fetching all branches..."
git fetch --all

# Show current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "   Current branch: $CURRENT_BRANCH"

# Check for preview branch
if git show-ref --verify --quiet refs/remotes/origin/preview; then
  echo "   Found origin/preview branch"

  # Check if we have uncommitted changes
  if [[ -n $(git status -s) ]]; then
    echo "   ⚠️  You have uncommitted changes!"
    git status -s
    echo ""
    read -p "   Stash changes and merge from preview? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git stash push -m "Auto-stash before preview merge $(date)"
      echo "   Changes stashed"
    else
      echo "   Skipping merge - please commit or stash your changes"
      echo ""
      read -p "   Continue without merging? (y/n) " -n 1 -r
      echo ""
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   Startup cancelled"
        exit 1
      fi
    fi
  fi

  # Try to merge preview
  if [[ -z $(git status -s) ]]; then
    echo "   Merging origin/preview into $CURRENT_BRANCH..."
    if git merge origin/preview --no-edit; then
      echo "   ✅ Successfully merged origin/preview"
    else
      echo "   ⚠️  Merge conflict detected!"
      echo "   Please resolve conflicts manually and run this script again"
      exit 1
    fi
  fi
else
  echo "   ⚠️  No preview branch found on remote"
fi

# Show recent commits
echo ""
echo "   Recent commits:"
git log -3 --oneline --decorate
echo ""

# ============================================
# STEP 2: Start Services
# ============================================
echo "🔧 Starting development services..."

# Start Claude Code with skip permissions in background
echo "   📝 Starting Claude Code (with skip permissions)..."
claude --dangerously-skip-permissions &
CLAUDE_PID=$!

# Give Claude a moment to start
sleep 2

# Start development server
echo "   🌐 Starting development server..."
pnpm dev &
DEV_PID=$!

echo ""
echo "✅ Environment started!"
echo "   Current branch: $CURRENT_BRANCH"
echo "   Claude PID: $CLAUDE_PID"
echo "   Dev Server PID: $DEV_PID"
echo ""
echo "To stop all services, run:"
echo "   kill $CLAUDE_PID $DEV_PID"
echo "   # or: lsof -ti:3000 | xargs kill -9"
echo ""
echo "Press Ctrl+C to stop this script (services will continue)"
echo ""

# Wait for user interrupt
wait
