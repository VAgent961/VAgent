#!/bin/zsh
# Deploy the site to Cloudflare Pages project "vagent" in the account that owns vagent.online (Fayez's account).
# Uses the API token in ~/agent-tools/.cf-vagent-token (Pages edit + DNS edit). Only public files + functions are uploaded.
set -e
export CLOUDFLARE_API_TOKEN="$(cat ~/agent-tools/.cf-vagent-token)" CLOUDFLARE_ACCOUNT_ID=602f300bfa2512c1d3cb5900af74fbd6
cd "$(dirname "$0")/.." && D=$(mktemp -d) && mkdir -p $D/public
cp index.html office.html *.png favicon.ico $D/public/ && cp -R assets _headers $D/public/ && cp -R functions $D/
cd $D && npx --yes wrangler@3 pages deploy public --project-name vagent --branch main --commit-dirty=true 2>&1 | grep -E "Deployment complete|https://|rror" ; rm -rf $D
