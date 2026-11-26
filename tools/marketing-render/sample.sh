#!/bin/sh
# Run ON THE SERVER: builds the worker, renders the sample, starts the private review page.
set -eu
cd "$(dirname "$0")"
docker compose build
docker compose run --rm worker render posts/voice-receptionist.json
docker compose up -d review
echo "On your computer: ssh -N -L 8787:127.0.0.1:8787 USER@SERVER   then open http://localhost:8787"
