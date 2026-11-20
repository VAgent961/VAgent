#!/bin/zsh
# Give a Voice AI client its own address <slug>.vagent.online (the public link voice.vagent.online/<slug> already works with no setup).
# Adds the Pages custom domain + a proxied CNAME in the account that owns vagent.online. usage: ./scripts/add-client-domain.sh voice2
set -e
[ -n "$1" ] || { echo "usage: $0 <slug>"; exit 1; }
T="$(cat ~/agent-tools/.cf-vagent-token)"; A=602f300bfa2512c1d3cb5900af74fbd6; Z=45abbe76483a68c54e56125aa233dfb1; N="$1.vagent.online"
cf() { curl -s -m 30 -H "Authorization: Bearer $T" -H 'Content-Type: application/json' "$@"; }
cf -X POST "https://api.cloudflare.com/client/v4/zones/$Z/dns_records" -d "{\"type\":\"CNAME\",\"name\":\"$1\",\"content\":\"vagent-bef.pages.dev\",\"proxied\":true,\"ttl\":1}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("DNS:",j.success?"ok":(j.errors||[]).map(e=>e.message).join("; "))})'
cf -X POST "https://api.cloudflare.com/client/v4/accounts/$A/pages/projects/vagent/domains" -d "{\"name\":\"$N\"}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log("Pages domain:",j.success?(j.result.status):(j.errors||[]).map(e=>e.message).join("; "))})'
echo "Live in a minute or two: https://$N"
