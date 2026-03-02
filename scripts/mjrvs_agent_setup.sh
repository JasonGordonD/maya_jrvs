#!/bin/bash
# MJRVS Agent Environment Setup
# Run once per cloud agent session before any npm commands
# Usage: bash scripts/mjrvs_agent_setup.sh

set -e

echo "🔧 MJRVS agent env setup starting..."

# Check node version
node --version
npm --version

# Install dependencies if node_modules is missing or stale
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
else
  echo "✅ node_modules up to date, skipping install"
fi

# Verify build tooling
echo "🔍 Verifying build tools..."
npx tsc --version
npx next --version

echo "✅ MJRVS agent env ready"
