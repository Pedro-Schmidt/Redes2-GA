#!/bin/sh
# Roda DENTRO de um container netshoot que compartilha a rede de um roteador.
# Conta pacotes e bytes do protocolo de roteamento numa interface:
#   RIP = udp/520 | OSPF = ip proto 89 | VDPE = udp/5001
# uso: sh contar.sh <segundos> <interface>
SEG=${1:-60}; IF=${2:-eth1}
timeout "$SEG" tcpdump -i "$IF" -nn -l 'udp port 520 or ip proto 89 or udp port 5001' 2>/dev/null | awk -v seg="$SEG" '
{ for (i = 1; i <= NF; i++) if ($i == "length") { n = $(i+1); gsub(/[^0-9]/, "", n); b += n; p++; break } }
END { printf "pacotes=%d bytes=%d segundos=%d pacotes_por_s=%.3f bits_por_s=%.1f\n", p, b, seg, p/seg, b*8/seg }'
