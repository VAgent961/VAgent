#!/bin/zsh
# Deploy the site to Cloudflare Pages project "vagent" (only public files + functions are uploaded).
set -e
npx --yes wrangler@3 whoami >/dev/null 2>&1 || true  # refreshes the Cloudflare login
cd "$(dirname "$0")/.." && D=$(mktemp -d) && mkdir -p $D/public
cp index.html office.html *.png favicon.ico $D/public/ && cp -R assets _headers $D/public/ && cp -R functions $D/
cd $D && npx --yes wrangler@3 pages deploy public --project-name vagent --branch main --commit-dirty=true 2>&1 | grep -E "Deployment complete|https://|rror" ; rm -rf $D
