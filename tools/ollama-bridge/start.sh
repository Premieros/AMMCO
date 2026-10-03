#!/usr/bin/env sh
set -eu

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env. Edit BRIDGE_TOKEN, then run this script again."
  exit 1
fi

set -a
. ./.env
set +a

exec node server.mjs
