#!/usr/bin/env bash
# Restaura o enlace R1-R2 apos o teste de falha: recria r1 (e algo1, se VDPE).
# O agente DEVE ser recriado junto com o roteador (network_mode: service:r1).
set -e
cd "$(dirname "$0")/.."
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
if grep -q '^PROTOCOLO=vdpe' .env; then $DC up -d --force-recreate r1 algo1; else $DC up -d --force-recreate r1; fi
