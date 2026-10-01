# Configuração do OSPF em Ambiente Containerizado

Segundo protocolo avaliado no Trabalho I, sobre a **mesma topologia** do RIP
(ver `RIP.md`, Seção 3). O OSPF é um protocolo de **estado de enlace**: cada
roteador inunda LSAs, constrói o mesmo mapa da rede (LSDB) e calcula os
caminhos mínimos com Dijkstra (SPF).

## Configuração (`configs/ospf/rX/`)

- `daemons`: `ospfd=yes`, `ripd=no` (RIP e VDPE desativados).
- `zebra.conf`: idêntico ao do RIP (interfaces e `ip forwarding`).
- `ospfd.conf`: exemplo do R1:

```
interface eth1
 ip ospf network point-to-point
interface eth2
 ip ospf network point-to-point
router ospf
 ospf router-id 1.1.1.1
 passive-interface eth0
 network 10.1.0.0/24 area 0
 network 10.0.12.0/29 area 0
 network 10.0.13.0/29 area 0
```

Decisões: **área única (0)**, pois a topologia é pequena; enlaces
`point-to-point`, o que dispensa eleição de DR/BDR (as redes Docker são
*bridge*, ou seja, broadcast por padrão) e acelera a adjacência; LAN
*passive*, anunciada mas sem *hellos* para os hosts; `network` por prefixo;
*router-id* explícito. Temporizadores padrão (*hello* 10 s, *dead* 40 s).

## Execução e verificação

```bash
scripts/modo.sh ospf          # Git Bash/Linux
docker compose --profile vdpe down --remove-orphans
docker compose --env-file env/ospf.env up -d   # Windows, sem scripts
docker exec r1 vtysh -c "show ip ospf neighbor"   # adjacências Full
docker exec r1 vtysh -c "show ip route"           # rotas código O, AD 110
docker exec r1 vtysh -c "show ip ospf database"   # LSDB (igual em todos)
docker exec host1 ping -c 4 10.5.0.100
```

## Métricas

Coletadas com os mesmos scripts do RIP e do VDPE (ver `ROTEIRO.md`):
`ip route | wc -l`, o comando de captura e o de convergência do `TESTES.md` (filtro `ip proto 89`), `ping`. Registrar em `metricas/resultados.csv`.

> Os valores medidos de OSPF devem ser preenchidos após a execução; esta
> configuração foi gerada seguindo o padrão do FRR, mas ainda não foi
> validada em containers.
