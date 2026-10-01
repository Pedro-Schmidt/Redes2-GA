# Testes do VDPE

Comandos digitados direto no PowerShell, na pasta do projeto. Nenhum script `.ps1` é usado.

## 0. Subir o modo VDPE
```powershell
docker compose --profile vdpe down --remove-orphans
docker compose --env-file env/vdpe.env --profile vdpe up -d
docker ps                      # 15 containers
```
Esperar uns 20 s para convergir.

## 1. Verificar que os roteadores estão funcionando
```powershell
docker logs algo2 --tail 15
docker exec algo2 cat /tmp/tabela.txt
docker exec r2 ip route
docker exec host1 ping -c 3 10.5.0.100
```
Esperado: vizinhos `ativo`, 4 rotas por roteador, rotas no kernel instaladas
pelo agente, ping respondendo.

## 2. Teste do critério 1: número de saltos
Olhar a tabela do R1:
```powershell
docker exec algo1 cat /tmp/tabela.txt
```
Para a rede `10.5.0.0/24` aparecem duas opções: `R3(2 saltos)` e `R2(3 saltos)`.
O R1 escolhe R3 porque tem menos saltos, sem olhar quedas.

## 3. Teste do critério 2: estabilidade em empate
O R2 chega à rede `10.5.0.0/24` por dois caminhos de 2 saltos:
R2-R3-R5 e R2-R4-R5.

**Antes (tudo zerado):**
```powershell
docker exec algo2 cat /tmp/tabela.txt
```
Esperado em `10.5.0.0/24`: `via R3`, com `R3(2 saltos, 0 quedas)` e
`R4(2 saltos, 0 quedas)`. Empate total, ganha o menor nome (R3).

**Provocar uma queda no enlace R2-R3.** Descobrir a interface do R2 que tem o IP 10.0.23.2:
```powershell
docker exec r2 ip -4 addr
```
Supondo `eth3` (confirmar na saída), derrubar e esperar uns 20 s:
```powershell
docker exec r2 ip link set eth3 down
```
Depois subir de novo:
```powershell
docker exec r2 ip link set eth3 up
```
Esperar uns 15 s e ver a tabela:
```powershell
docker exec algo2 cat /tmp/tabela.txt
docker logs algo2 --tail 15
docker exec host2 traceroute -n 10.5.0.100
```
**Esperado:** o enlace R3 mostra `quedas=1` e, em `10.5.0.0/24`:
`R3(2 saltos, 1 quedas)` e `R4(2 saltos, 0 quedas)`. A rota fica `via R4`.

**Como provar que foi a estabilidade:**
- os dois caminhos têm os mesmos 2 saltos, então saltos não decidiram;
- antes da queda o R2 usava R3 (menor nome); agora usa R4, então o nome também não decidiu;
- a única diferença entre as opções é a coluna de quedas;
- o `traceroute` mostra o primeiro salto 10.0.24.3 (R4) em vez de 10.0.23.3 (R3).

**Prova de que saltos vêm antes de estabilidade** (mesma tabela do R2): em `10.3.0.0/24`
o R2 usa `R3(1 saltos, 1 quedas)` e não `R1(2 saltos, 0 quedas)`. R3 tem
mais quedas, mas tem menos saltos.

**Voltar ao zero** para repetir o teste:
```powershell
docker restart algo1 algo2 algo3 algo4 algo5
```

## 4. Métricas
| Métrica | Comando | O que olhar |
|---|---|---|
| Tamanho da tabela | `docker exec algo2 cat /tmp/tabela.txt` e `docker exec r2 ip route` | `Tamanho da tabela` (rotas aprendidas) e total no kernel |
| Pacotes de roteamento | mesmo arquivo, linha `Pacotes` (ou o comando de captura abaixo) | enviados/recebidos; 3 vizinhos x 1 anúncio a cada 5 s no R2 |
| Taxa de transmissão | `docker run --rm --net container:r1 -v "${PWD}/scripts:/scripts" nicolaka/netshoot sh /scripts/contar.sh 30 eth1` | `bits_por_s` no enlace R1-R2 (também serve para RIP e OSPF) |
| Delay | `docker exec host2 ping -c 10 10.5.0.100` | `rtt min/avg/max` |
| Convergência | ver bloco "Convergência" abaixo | segundos impressos no fim (esperado perto de 15 a 20 s) |
| Quedas por enlace | `docker exec algo2 cat /tmp/tabela.txt` | `quedas=` em cada vizinho |

Anotar os valores em `metricas/resultados.csv` e rodar `python scripts\graficos.py`.
Repetir as mesmas medidas em RIP e OSPF (`scripts/modo.* rip` / `ospf`) para comparar.

### Convergência (corta o enlace R1-R2 e mede quanto o R1 demora para voltar a ter rota para a LAN2)
```powershell
docker exec r1 ip route show 10.2.0.0/24
docker exec r1 ip link set eth1 down
$t = Get-Date; while (-not (docker exec r1 ip route show 10.2.0.0/24 | Select-String "10.0.13.3")) { Start-Sleep 1 }; ((Get-Date) - $t).TotalSeconds
docker exec r1 ip route show 10.2.0.0/24
docker exec r1 ip link set eth1 up
```
O número impresso é o tempo de convergência. A rota passa a ser `via 10.0.13.3` (R3).
O último comando religa o enlace; em uns 10 s a rota volta a ser via R2.
Se `eth1` não for o enlace com o R2, conferir com `docker exec r1 ip -4 addr` (procurar `10.0.12.2`).

### Taxa de transmissão por conta do contador (alternativa sem tcpdump)
```powershell
docker exec algo2 cat /tmp/tabela.txt | Select-String "Bytes"
Start-Sleep 30
docker exec algo2 cat /tmp/tabela.txt | Select-String "Bytes"
```
Taxa em bits/s = (diferença de bytes enviados) x 8 / 30.
