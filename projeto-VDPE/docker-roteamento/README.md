# Roteamento IP com FRRouting e Docker: RIP, OSPF e Algoritmo Próprio (VDPE)

Trabalho I — Fundamentos de Sistemas Operacionais (UNISINOS).
Autores: Gabriel e Pedro.

## Descrição

Ambiente experimental com **cinco roteadores** em containers Docker (FRRouting)
para estudar, sobre a mesma topologia, **dois protocolos** (RIP e OSPF) e um
**algoritmo próprio** (VDPE — Vetor de Distância com Peso de Estabilidade).
Os três **nunca executam simultaneamente**: um único arquivo (`.env`) define
qual está ativo.

## Estrutura

```
docker-compose.yml        Topologia (roteadores, hosts, redes, agentes VDPE)
.env                      Seleção do modo ativo (PROTOCOLO e COMPOSE_PROFILES)
env/                      Arquivos rip.env, ospf.env, vdpe.env (escolhem o modo)
configs/
  rip/rX/                 FRR com ripd  (daemons, zebra.conf, ripd.conf)
  ospf/rX/                FRR com ospfd (daemons, zebra.conf, ospfd.conf)
  vdpe/rX/                FRR só com zebra (rotas vêm do agente algoX)
algoritmo-proprio/        Agente VDPE em Node.js + README próprio
scripts/                  modo, convergência, captura de tráfego de controle, gráficos
metricas/resultados.csv   Valores medidos (alimenta os gráficos)
RIP.md / OSPF.md          Configuração, validação e análise de cada protocolo
TESTES.md                 Testes de saltos, estabilidade e coleta de métricas
ROTEIRO.md                Roteiro da apresentação em aula (10 min)
ROTEIRO-VIDEO.md          Roteiro do vídeo de demonstração (5 min)
```

## Topologia

R1..R5, cada um com uma LAN (10.X.0.0/24) e um host (`hostX`, .100),
ligados por enlaces /29. O enlace R2–R3 é o caminho redundante. Diagrama e
tabela de endereços em [`RIP.md`](RIP.md), Seção 3.

## Requisitos

Docker com Compose v2 (`docker compose`) — Docker Desktop no Windows/macOS ou
Docker Engine + plugin no Linux. Internet só para o primeiro `pull` das imagens.

## Execução

```bash
docker pull frrouting/frr:latest
docker pull nicolaka/netshoot
docker pull node:20-alpine

scripts/modo.sh rip      # ou: ospf | vdpe          (Linux/macOS/Git Bash)
# Windows (PowerShell ou CMD), sem scripts:
docker compose --profile vdpe down --remove-orphans
docker compose --env-file env/vdpe.env --profile vdpe up -d
```

O script derruba o modo anterior, grava o `.env` e sobe o novo. Como o `.env`
é a fonte da verdade, `docker compose up -d` simples também sobe o **último
modo escolhido** (inclusive `algo1..algo5` no modo `vdpe`).

> **Por que `algo1..algo5` não subiam?** Os agentes pertencem a um *profile* do
> Compose e só sobem quando `COMPOSE_PROFILES=vdpe`. Um `docker compose up`
> sem esse profile ignora os serviços — de propósito, para não rodarem junto
> com RIP/OSPF. Agora o profile vem do `.env`.

## Verificação rápida

```bash
docker ps                                      # RIP/OSPF: 10 containers | VDPE: 15
docker exec r1 ip route                        # tabela do kernel (vale p/ os 3 modos)
docker exec host1 ping -c 4 10.5.0.100         # fim a fim LAN1 -> LAN5
docker logs algo1 --tail 20                    # só no modo vdpe
docker exec algo1 cat /tmp/tabela.txt          # rotas, opções e contadores do VDPE
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [`RIP.md`](RIP.md) | RIP: configuração, validação, métricas, análise |
| [`OSPF.md`](OSPF.md) | OSPF: configuração e como medir |
| [`algoritmo-proprio/README.md`](algoritmo-proprio/README.md) | VDPE: lógica, critérios, execução |
| [`TESTES.md`](TESTES.md) | Testes do VDPE (saltos, estabilidade) e métricas |
| [`ROTEIRO.md`](ROTEIRO.md) | Roteiro de falas e comandos da apresentação |
| [`ROTEIRO-VIDEO.md`](ROTEIRO-VIDEO.md) | Roteiro do vídeo de 5 minutos |
