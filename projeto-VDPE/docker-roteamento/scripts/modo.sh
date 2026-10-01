#!/usr/bin/env bash
# Troca o protocolo ativo. Uso: scripts/modo.sh rip|ospf|vdpe
# Derruba tudo (inclusive agentes algo1..5), grava .env e sobe so o modo pedido.
# Garante que RIP, OSPF e VDPE nunca rodem simultaneamente.
set -e
cd "$(dirname "$0")/.."
P="$1"
case "$P" in
  rip|ospf) PROF="" ;;
  vdpe)     PROF="vdpe" ;;
  *) echo "uso: $0 rip|ospf|vdpe"; exit 1 ;;
esac
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
$DC --profile vdpe down --remove-orphans
printf 'PROTOCOLO=%s\nCOMPOSE_PROFILES=%s\n' "$P" "$PROF" > .env
$DC up -d
$DC ps
echo ">> Modo ativo: $P  (aguarde a convergencia: RIP ~30-60s, OSPF ~10-20s, VDPE ~10s)"
