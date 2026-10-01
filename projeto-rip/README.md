# Roteamento IP com RIP usando Docker e FRRouting

Trabalho do GA — Fundamentos de Sistemas Operacionais (Unisinos)
Autores: ______________________ e ______________________

## 1. Objetivo

Montar um ambiente experimental com cinco roteadores virtuais, configurar o
protocolo **RIP versão 2** e coletar métricas do seu funcionamento (tamanho da
tabela, pacotes de controle, taxa, atraso, saltos e tempo de convergência).
Esta parte do trabalho cobre somente o RIP; o segundo protocolo e o algoritmo
próprio usam a mesma topologia (veja a seção 9).

## 2. Tecnologias

- Docker Desktop e Docker Compose
- FRRouting (FRR), imagem `frrouting/frr`: cada container é um roteador
- Imagem `nicolaka/netshoot`: hosts de teste e captura de pacotes (tem `ping`, `traceroute` e `tcpdump`)

## 3. Topologia

```
                 LAN1 10.1.0.0/24
                        |
                       R1
              10.0.12.0/29   10.0.13.0/29
             /                          \
LAN2 --- R2 ------ 10.0.23.0/29 ------ R3 --- LAN3
10.2.0.0/24 \                          /     10.3.0.0/24
        10.0.24.0/29              10.0.35.0/29
              \                        /
LAN4 --- R4 ------ 10.0.45.0/29 ------ R5 --- LAN5
10.4.0.0/24                                    10.5.0.0/24
```

Cada LAN tem um host de teste (`host1` a `host5`, final `.100`). Há caminhos
alternativos entre os roteadores (por exemplo R1→R2→R3 e R1→R3), o que permite
observar o que acontece quando um link cai.

| Roteador | eth0 (LAN) | Links (interface: endereço)                                     |
|----------|------------|-----------------------------------------------------------------|
| R1       | 10.1.0.1   | eth1: 10.0.12.2 (R2), eth2: 10.0.13.2 (R3)                       |
| R2       | 10.2.0.1   | eth1: 10.0.12.3 (R1), eth2: 10.0.23.2 (R3), eth3: 10.0.24.2 (R4) |
| R3       | 10.3.0.1   | eth1: 10.0.13.3 (R1), eth2: 10.0.23.3 (R2), eth3: 10.0.35.2 (R5) |
| R4       | 10.4.0.1   | eth1: 10.0.24.3 (R2), eth2: 10.0.45.2 (R5)                       |
| R5       | 10.5.0.1   | eth1: 10.0.35.3 (R3), eth2: 10.0.45.3 (R4)                       |

Os links usam máscara /29 (e não /30) porque o Docker reserva o endereço `.1`
de cada rede para o gateway dele. Para conferir qual rede está em cada
interface: `docker exec r2 ip -br addr`.

## 4. Estrutura do repositório

```
docker-compose.yml     topologia: containers, redes e endereços
configs/r1 ... r5/     configuração de cada roteador (montada em /etc/frr)
    daemons            quais serviços do FRR iniciam (zebra e ripd)
    zebra.conf         nome do roteador e encaminhamento de pacotes
    ripd.conf          configuração do RIP
    vtysh.conf         usa um arquivo de configuração por serviço
scripts/metricas.sh    coleta tamanho da tabela, atraso, saltos e pacotes RIP
scripts/convergencia.sh derruba um link e mede o tempo de convergência
resultados/            saídas das medições
```

## 5. Como executar

Pré-requisito: Docker Desktop aberto. Os scripts são em bash (no Windows, use
WSL ou Git Bash). Os comandos manuais abaixo funcionam em qualquer terminal.

```bash
docker pull frrouting/frr:latest
docker pull nicolaka/netshoot
docker compose up -d
docker compose ps          # os 10 containers devem estar "running"
```

Espere cerca de 1 minuto para o RIP estabilizar (as atualizações periódicas
saem a cada 30 s). Para encerrar: `docker compose down`.

## 6. Como verificar o RIP

```bash
docker exec -it r1 vtysh                           # console do FRR no R1 (sair: exit)

docker exec r1 vtysh -c "show ip rip status"       # timers e interfaces com RIP
docker exec r1 vtysh -c "show ip rip"              # banco de dados do RIP
docker exec r1 vtysh -c "show ip route rip"        # rotas RIP instaladas
docker exec r1 vtysh -c "show ip route"            # tabela completa
```

Nas rotas, `R>*` indica rota aprendida por RIP e `[120/3]` significa
distância administrativa 120 e métrica 3 (número de saltos).

Conectividade entre redes diferentes:

```bash
docker exec host1 ping -c 4 10.5.0.100
docker exec host1 traceroute -n 10.5.0.100
```

## 7. Como coletar as métricas

| Métrica                 | Como medir                                                         |
|-------------------------|--------------------------------------------------------------------|
| Tamanho da tabela       | `docker exec r1 vtysh -c "show ip route rip" \| grep -c '^R'`       |
| Atraso                  | `docker exec host1 ping -c 20 -q 10.5.0.100` (linha `rtt`)          |
| Saltos                  | `docker exec host1 traceroute -n 10.5.0.100`                        |
| Pacotes RIP e taxa      | captura de UDP/520 com `tcpdump` (feita pelo `metricas.sh`)         |
| Tempo de convergência   | `./scripts/convergencia.sh`                                         |

Para rodar tudo de uma vez (a captura de pacotes dura 60 s por padrão):

```bash
./scripts/metricas.sh          # ou ./scripts/metricas.sh 120 para capturar por 120 s
./scripts/convergencia.sh
```

O `metricas.sh` captura no link R1–R2 (interface `eth1` do `r1`). Ele conta os
pacotes RIP enviados e recebidos pelo R1 (requisições e respostas) e soma os
bytes dos quadros Ethernet para estimar a taxa em bits/s. A captura bruta
fica em `resultados/captura_rip_r1_eth1.txt`.

O `convergencia.sh` desativa a interface `eth1` do `r1` e do `r2` (link R1–R2),
repete um `ping` do `host1` para o `host2` a cada segundo até voltar a
responder e imprime o tempo. O valor tem resolução de cerca de 1 s. Ao final,
religa o link. O RIP não guarda rotas de reserva: a rota alternativa só é
aprendida na próxima atualização periódica dos vizinhos, por isso o tempo
depende do ciclo de 30 s do protocolo (que varia ±50%). Para uma média, repita
o teste algumas vezes (espere 1 minuto entre as repetições).

Resultados coletados: `resultados/modelo_resultados.md`.

## 8. Observações

- O RIP usa o número de saltos como métrica, com limite de 15 (16 = inalcançável).
- Foi usada a versão 2 porque as redes usam máscaras /24 e /29 (a versão 1 não leva a máscara).
- Os roteadores têm uma rota padrão criada pelo Docker (para o gateway da rede). Ela não participa do RIP.
- O ambiente roda inteiro no computador local; os tempos medidos refletem uma rede virtual de baixa latência.

## 9. Próximos passos do trabalho

O segundo protocolo (OSPF) e o algoritmo próprio usam esta mesma topologia.
Para trocar de protocolo, em cada `configs/rX/daemons` troca-se `ripd=yes` por
`ripd=no` e `ospfd=no` por `ospfd=yes`, cria-se o `ospfd.conf` e reinicia-se
com `docker compose restart r1 r2 r3 r4 r5`. Os protocolos nunca ficam
ativos ao mesmo tempo.
