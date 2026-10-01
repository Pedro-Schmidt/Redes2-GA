#!/bin/bash
# Derruba o link R1-R2 e mede quanto tempo o host1 leva para voltar a
# alcancar o host2 (agora passando por R3).
# Uso: ./scripts/convergencia.sh

# confere se esta tudo funcionando antes de derrubar o link
if ! docker exec host1 ping -c 2 -W 1 10.2.0.100 > /dev/null; then
  echo "host1 nao alcanca host2. Espere o RIP estabilizar e tente de novo."
  exit 1
fi

echo "Caminho antes da falha:"
docker exec host1 traceroute -n 10.2.0.100

echo
echo "Derrubando o link R1-R2 (eth1 do r1 e eth1 do r2)..."
SECONDS=0
docker exec r1 vtysh -c "configure terminal" -c "interface eth1" -c "shutdown"
docker exec r2 vtysh -c "configure terminal" -c "interface eth1" -c "shutdown"

# tenta um ping por segundo ate o host1 alcancar o host2 de novo
until docker exec host1 ping -c 1 -W 1 10.2.0.100 > /dev/null 2>&1; do
  sleep 1
done
echo "Convergiu em aproximadamente $SECONDS segundos."

echo
echo "Caminho depois da falha:"
docker exec host1 traceroute -n 10.2.0.100

echo
echo "Religando o link R1-R2..."
docker exec r1 vtysh -c "configure terminal" -c "interface eth1" -c "no shutdown"
docker exec r2 vtysh -c "configure terminal" -c "interface eth1" -c "no shutdown"
