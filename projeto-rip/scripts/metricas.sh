#!/bin/bash
# Coleta as metricas do RIP (rodar com o ambiente ja no ar e estabilizado).
# Uso: ./scripts/metricas.sh [segundos_de_captura]   (padrao: 60)

TEMPO=${1:-60}
mkdir -p resultados

echo "=== 1) Tamanho da tabela: rotas aprendidas via RIP em cada roteador"
for r in r1 r2 r3 r4 r5; do
  n=$(docker exec $r vtysh -c "show ip route rip" | grep -c '^R')
  echo "$r: $n rotas RIP"
done

echo
echo "=== 2) Atraso e saltos: host1 -> host5"
docker exec host1 ping -c 20 -q 10.5.0.100 | tail -2
docker exec host1 traceroute -n 10.5.0.100

echo
echo "=== 3) Pacotes RIP no link R1-R2 (eth1 do r1) durante $TEMPO s"
# o tcpdump roda num container auxiliar que usa a rede do r1
docker run --rm --net container:r1 nicolaka/netshoot \
  timeout $TEMPO tcpdump -i eth1 -nn -e -l udp port 520 \
  > resultados/captura_rip_r1_eth1.txt 2>/dev/null

ENV=$(grep -c ' 10.0.12.2.520 >' resultados/captura_rip_r1_eth1.txt)
REC=$(grep -c ' 10.0.12.3.520 >' resultados/captura_rip_r1_eth1.txt)
BYTES=$(grep -oE 'length [0-9]+:' resultados/captura_rip_r1_eth1.txt | tr -dc '0-9\n' | awk '{s+=$1} END {print s+0}')
BPS=$((BYTES * 8 / TEMPO))

echo "Pacotes RIP enviados pelo r1:   $ENV"
echo "Pacotes RIP recebidos pelo r1:  $REC"
echo "Total de bytes (com Ethernet):  $BYTES"
echo "Taxa media do RIP no link:      $BPS bits/s"
