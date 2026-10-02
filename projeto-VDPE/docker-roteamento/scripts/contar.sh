#!/bin/sh
# Roda DENTRO de um container netshoot que compartilha a rede de um roteador.
# Conta pacotes e bytes do protocolo de roteamento numa interface:
#   RIP = udp/520 | OSPF = ip proto 89 | VDPE = udp/5001
# uso: sh contar.sh <segundos> <interface> [filtro extra]
# exemplos:
#   sh contar.sh 60 eth2                    (enviados + recebidos)
#   sh contar.sh 60 eth2 "src host 10.0.12.2"   (so enviados pelo R1)
#   sh contar.sh 60 eth2 "dst host 10.0.12.2"   (so recebidos pelo R1)
SEG=${1:-60}; IF=${2:-eth1}; EXTRA=$3
FILTRO="(udp port 520 or ip proto 89 or udp port 5001)"
if [ -n "$EXTRA" ]; then FILTRO="$FILTRO and $EXTRA"; fi
timeout "$SEG" tcpdump -i "$IF" -nn -l "$FILTRO" 2>/dev/null | awk -v seg="$SEG" '
{ for (i = 1; i <= NF; i++) if ($i ~ /^length/) { n = $(i+1); gsub(/[^0-9]/, "", n); b += n; p++; break } }
END { printf "pacotes=%d bytes=%d segundos=%d pacotes_por_s=%.3f bits_por_s=%.1f\n", p, b, seg, p/seg, b*8/seg }'
