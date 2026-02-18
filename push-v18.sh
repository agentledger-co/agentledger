#!/bin/bash
set -e

echo "=== Pushing AgentLedger v18 ==="

# Check if this is a git repo
if [ ! -d .git ]; then
  echo "No .git found — setting up from GitHub..."
  
  # Clone into a temp dir, move .git over
  TMPDIR=$(mktemp -d)
  git clone https://github.com/miken1988/agentledger.git "$TMPDIR/repo"
  mv "$TMPDIR/repo/.git" .
  rm -rf "$TMPDIR"
  
  echo "✅ Git history restored from GitHub"
fi

# Commit and push
git add -A
git commit -m "v18: launch prep — error monitoring, demo script, auth docs, SDK v0.4.0, README rewrite

- Next.js upgraded to 15.5.12 (CVE-2025-66478 fix)
- Error monitoring (src/lib/errors.ts) with structured JSON logging
- Demo script (demo.mjs) for 60-second onboarding
- Supabase auth setup guide (docs/SUPABASE_AUTH_SETUP.md)
- SDK bumped to v0.4.0 with rewritten README
- Main README rewritten with badges, architecture, full API table
- All 500 responses now include detail field for debugging
- CRON_SECRET required (no longer optional)"

git push origin main

# Publish SDK
echo ""
echo "Publishing SDK v0.4.0 to npm..."
cd sdk
npm run build
npm publish
cd ..

echo ""
echo "✅ Done! Pushed to GitHub + published SDK v0.4.0"
echo ""
echo "Next steps:"
echo "  1. Vercel will auto-deploy from GitHub"
echo "  2. Set CRON_SECRET in Vercel: vercel env add CRON_SECRET"  
echo "  3. Configure Supabase auth (see docs/SUPABASE_AUTH_SETUP.md)"
echo "  4. Take a dashboard screenshot → docs/screenshot.png"
echo "  5. Run E2E against prod: node tests/e2e/run.mjs https://agentledger.co"
