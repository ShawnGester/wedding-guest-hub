#!/usr/bin/env bash
# Run inside WSL after virtualization is enabled.
set -euo pipefail

PROJECT_WIN="/mnt/c/Users/shawn/Projects/wedding-guest-hub"
PROJECT_LINUX="$HOME/Projects/wedding-guest-hub"

echo "Wedding Guest Hub — WSL setup"
echo "Sibling of pokemon-grading-advisor under Projects/"

if [[ ! -d "$PROJECT_WIN" ]]; then
  echo "Expected Windows path missing: $PROJECT_WIN"
  exit 1
fi

mkdir -p "$HOME/Projects"

if [[ ! -d "$PROJECT_LINUX" ]]; then
  echo "Copying project into Linux filesystem for faster node_modules…"
  cp -a "$PROJECT_WIN" "$PROJECT_LINUX"
else
  echo "Using existing $PROJECT_LINUX"
fi

cd "$PROJECT_LINUX"

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v git >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y git
fi

echo "node $(node -v) · npm $(npm -v)"
npm install
npm run build

echo ""
echo "Ready. From WSL:"
echo "  cd $PROJECT_LINUX"
echo "  npm run dev"
echo ""
echo "Windows twin (same sibling folder): $PROJECT_WIN"
echo "Pokemon advisor sibling: $(dirname "$PROJECT_WIN")/pokemon-grading-advisor"
