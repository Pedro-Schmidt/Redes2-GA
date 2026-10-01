#!/usr/bin/env bash
# Conta o trafego de controle no enlace R1-R2 (eth1 do r1) por N segundos.
# uso: scripts/capturar-controle.sh [segundos=60] [roteador=r1] [interface=eth1]
SEG=${1:-60}; R=${2:-r1}; IF=${3:-eth1}
cd "$(dirname "$0")/.."
MSYS_NO_PATHCONV=1 docker run --rm --net container:$R -v "$(pwd)/scripts:/scripts" \
  nicolaka/netshoot sh /scripts/contar.sh "$SEG" "$IF"
