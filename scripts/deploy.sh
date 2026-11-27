#!/bin/zsh
# Deploy the site to Cloudflare Pages project "vagent" in the account that owns vagent.online (Fayez's account).
# Uses the API token in ~/agent-tools/.cf-vagent-token (Pages edit + DNS edit). Only public files + functions are uploaded.
set -e
export CLOUDFLARE_API_TOKEN="$(cat ~/agent-tools/.cf-vagent-token)" CLOUDFLARE_ACCOUNT_ID=602f300bfa2512c1d3cb5900af74fbd6
cd "$(dirname "$0")/.." && D=$(mktemp -d) && mkdir -p $D/public
cp index.html office.html call.html admin-voice.html marketing.html *.png favicon.ico $D/public/ && cp -R assets _headers $D/public/ && cp -R functions $D/
# the zone caches /assets for 4 hours in browsers: a content hash in the URL makes a release show at once
for f in marketing.js marketing.css; do sed -i '' "s|/assets/$f\"|/assets/$f?v=$(shasum assets/$f | cut -c1-8)\"|" $D/public/marketing.html; done
for f in office.js research.js research.css; do sed -i '' "s|/assets/$f\"|/assets/$f?v=$(shasum assets/$f | cut -c1-8)\"|" $D/public/office.html; done
cd $D && npx --yes wrangler@3 pages deploy public --project-name vagent --branch main --commit-dirty=true 2>&1 | grep -E "Deployment complete|https://|rror" ; rm -rf $D
