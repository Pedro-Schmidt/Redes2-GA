#!/usr/bin/env bash
# Corta o enlace R1-R2 e mede (resolucao ~1 s) quanto tempo o R1 leva para
# reaprender a rota da LAN2 (10.2.0.0/24) pelo caminho alternativo via R3.
# Medicao feita na tabela do kernel (ip route): igual para RIP, OSPF e VDPE.
DEST=10.2.0.0/24; VIA=10.0.13.3
REDE=$(docker network ls --format '{{.Name}}' | grep 'link12$' | head -1)
echo "Rede do enlace: $REDE"
echo "Antes: $(docker exec r1 ip route show $DEST)"
docker network disconnect "$REDE" r1
T0=$(date +%s)
while :; do
  OUT=$(docker exec r1 ip route show $DEST 2>/dev/null)
  DT=$(( $(date +%s) - T0 ))
  echo "t=${DT}s -> ${OUT:-<sem rota>}"
  echo "$OUT" | grep -q "via $VIA" && break
  [ "$DT" -gt 240 ] && { echo "timeout"; break; }
  sleep 1
done
echo "CONVERGENCIA: ${DT} s"
echo "Para restaurar o enlace: scripts/restaurar.sh"
