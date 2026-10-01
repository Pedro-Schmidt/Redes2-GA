# Configuração e Avaliação do Protocolo RIP em Ambiente Containerizado

## 1. Objetivo

Este documento descreve a configuração, a execução e a avaliação do
protocolo de roteamento RIP (*Routing Information Protocol*, versão 2)
sobre uma topologia de cinco roteadores implementada com FRRouting (FRR)
em containers Docker. O experimento integra o Trabalho I da disciplina de
Fundamentos de Sistemas Operacionais (UNISINOS) e tem por finalidade
observar o funcionamento do protocolo, coletar métricas de desempenho e
analisar seu comportamento diante de uma alteração na conectividade.

## 2. Ambiente experimental

| Componente | Especificação |
|---|---|
| Plataforma de roteamento | FRRouting (imagem `frrouting/frr:latest`) |
| Virtualização | Docker Desktop com Docker Compose |
| Hosts de teste | Imagem `nicolaka/netshoot` |
| Protocolo avaliado | RIP versão 2 (daemon `ripd`) |
| Sistema hospedeiro | Windows, execução local em máquina única |

Toda a topologia é descrita de forma declarativa no arquivo
`docker-compose.yml`, o que permite reproduzir o ambiente em qualquer
máquina com Docker instalado, sem etapas manuais de criação de
containers.

## 3. Topologia e endereçamento

A topologia é composta por cinco roteadores (R1 a R5), cada um associado
a uma rede local de acesso (LAN) com um host de teste. Os roteadores são
interligados de modo a existirem ao menos dois caminhos distintos entre
a maioria dos pares de redes, condição necessária para observar o
redirecionamento de tráfego após falhas. O enlace R2–R3 constitui o
caminho redundante da topologia.

```
                 LAN1 (10.1.0.0/24)
                        |
                       R1
                    /      \
        10.0.12.0/29        10.0.13.0/29
                /              \
LAN2 --- R2 ------ 10.0.23.0/29 ------ R3 --- LAN3
(10.2.0.0/24)  \                      /  (10.3.0.0/24)
        10.0.24.0/29            10.0.35.0/29
                  \                  /
LAN4 --- R4 ------ 10.0.45.0/29 ------ R5 --- LAN5
(10.4.0.0/24)                          (10.5.0.0/24)
```

| Enlace | Rede | Endereços |
|---|---|---|
| R1–R2 | 10.0.12.0/29 | R1 = .2, R2 = .3 |
| R1–R3 | 10.0.13.0/29 | R1 = .2, R3 = .3 |
| R2–R3 (redundante) | 10.0.23.0/29 | R2 = .2, R3 = .3 |
| R2–R4 | 10.0.24.0/29 | R2 = .2, R4 = .3 |
| R3–R5 | 10.0.35.0/29 | R3 = .2, R5 = .3 |
| R4–R5 | 10.0.45.0/29 | R4 = .2, R5 = .3 |
| LAN de Rx | 10.X.0.0/24 | Rx = .1, hostX = .100 |

Cada enlace e cada LAN é modelado como uma rede Docker do tipo *bridge*
isolada. O endereço `.1` das redes de enlace e o endereço `.254` das LANs
são reservados ao gateway interno do Docker e não são utilizados pelos
roteadores (ver Seção 8).

## 4. Configuração do RIP

Os arquivos de configuração de cada roteador residem em `configs/rip/rX/` e
são montados no diretório `/etc/frr` do respectivo container por meio de
volume, de modo que alterações locais são refletidas no roteador após
reinício do container.

**`daemons`** — define os processos do FRR habilitados. Para a avaliação
do RIP, permanecem ativos apenas `zebra` (interface com o kernel),
`ripd` e `staticd`. O daemon `ospfd` permanece desabilitado, atendendo
à exigência de que protocolos distintos não sejam executados
simultaneamente.

```
zebra=yes
ripd=yes
ospfd=no
staticd=yes
```

**`zebra.conf`** — identifica as interfaces gerenciadas e habilita o
encaminhamento IP. Os endereços das interfaces não são declarados nesse
arquivo, pois são atribuídos pelo Docker no momento da criação do
container (`ipv4_address` em `docker-compose.yml`). A ordem de
declaração das redes em cada serviço determina a nomenclatura das
interfaces (`eth0`, `eth1`, ...).

```
interface eth0
 description LAN1 - rede de acesso do R1
interface eth1
 description Link para R2
interface eth2
 description Link para R3
ip forwarding
```

**`ripd.conf`** — habilita o RIP versão 2 em todas as interfaces do
roteador e redistribui as redes diretamente conectadas.

```
router rip
 version 2
 network eth0
 network eth1
 network eth2
 redistribute connected
 no auto-summary
```

Utilizou-se a configuração padrão de temporizadores do RIP (atualização
periódica a cada 30 s).

## 5. Procedimento de execução

```bash
scripts/modo.sh rip        # Linux/macOS/Git Bash
docker compose --profile vdpe down --remove-orphans
docker compose --env-file env/rip.env up -d     # Windows, sem scripts
docker ps                  # verificação do estado dos containers (10)
```

O script derruba qualquer modo anterior, grava `PROTOCOLO=rip` no `.env` e
sobe os 10 containers. O `ripd` é habilitado pelo `daemons` de
`configs/rip/rX/`; OSPF e VDPE ficam desativados.

## 6. Validação funcional

### 6.1 Tabela de roteamento

O comando `docker exec r1 vtysh -c "show ip route"` apresentou, no R1,
rotas para todas as redes da topologia, sendo as redes remotas aprendidas
via RIP (código `R`), com distância administrativa 120:

```
K>* 0.0.0.0/0 [0/0] via 10.1.0.254, eth0
C>* 10.0.12.0/29 is directly connected, eth1
C>* 10.0.13.0/29 is directly connected, eth2
R>* 10.0.23.0/29 [120/2] via 10.0.12.3, eth1
R>* 10.0.24.0/29 [120/2] via 10.0.12.3, eth1
R>* 10.0.35.0/29 [120/2] via 10.0.13.3, eth2
R>* 10.0.45.0/29 [120/3] via 10.0.12.3, eth1
C>* 10.1.0.0/24 is directly connected, eth0
R>* 10.2.0.0/24 [120/2] via 10.0.12.3, eth1
R>* 10.3.0.0/24 [120/2] via 10.0.13.3, eth2
R>* 10.4.0.0/24 [120/3] via 10.0.12.3, eth1
R>* 10.5.0.0/24 [120/3] via 10.0.13.3, eth2
```

As métricas observadas (2 e 3 saltos) são coerentes com a topologia: as
LANs de R2 e R3 distam dois saltos de R1, enquanto as de R4 e R5 distam
três.

### 6.2 Conectividade fim a fim

Foi executado `ping` entre os hosts das LANs mais distantes
(`host1` → `10.5.0.100`). Os quatro pacotes foram respondidos (0% de
perda), com RTT médio de 0,124 ms e TTL de resposta igual a 61, o que
indica a travessia de três roteadores (64 − 3 = 61).

## 7. Métricas coletadas

### 7.1 Resultados

| Métrica | Valor obtido | Método de coleta |
|---|---|---|
| Tamanho da tabela de roteamento | 12 entradas em cada roteador (1 rota padrão do kernel, 3 conectadas, 8 aprendidas via RIP, no R1) | `show ip route` |
| Pacotes de controle RIP | 20 pacotes em 155 s no enlace R1–R2 (≈ 1 pacote a cada 7,75 s) | `tcpdump -i eth1 udp port 520` |
| Tempo de convergência após falha de enlace | ≈ 8 s | Sondagem de `show ip route 10.2.0.0/24` a cada 2 s |

### 7.2 Tráfego de controle

A captura no enlace R1–R2 registrou mensagens RIPv2 enviadas ao endereço
multicast 224.0.0.9 (porta UDP 520). Observou-se que R2 emite
anúncios de 164 bytes aproximadamente a cada 30 s, em conformidade com
o temporizador de atualização periódica do protocolo, enquanto R1 emite
anúncios de 124 bytes, transmitidos em pares. A diferença de tamanho decorre
da quantidade distinta de rotas anunciadas por cada roteador: uma
mensagem RIPv2 ocupa 4 bytes de cabeçalho mais 20 bytes por entrada, de
modo que 164 bytes correspondem a 8 rotas (R2) e 124 bytes a 6 rotas
(R1). Esses valores são consistentes com a aplicação de *split horizon*,
segundo a qual cada roteador omite, no anúncio enviado por uma
interface, as rotas cujo próximo salto está nessa mesma interface. A captura inicial sem filtro
incluiu ainda tráfego IGMP e ARP, não relacionado ao roteamento, motivo
pelo qual a contagem final adotou o filtro `udp port 520`.

### 7.3 Convergência após falha de enlace

O enlace R1–R2 foi removido por meio de
`docker network disconnect docker-roteamento_link12 r1`, enquanto a
rota para 10.2.0.0/24 era consultada a cada 2 s. Antes da falha, a rota
utilizava o próximo salto 10.0.12.3 (R2) com métrica 2. Após a falha,
quatro consultas consecutivas retornaram ausência de rota, seguidas do
restabelecimento por meio de 10.0.13.3 (R3), com métrica 3, isto é, um
salto adicional, conforme esperado para o caminho alternativo
R1 → R3 → R2.

O tempo de convergência de aproximadamente 8 s é bastante inferior ao
tempo de expiração padrão de rotas do RIP (180 s). Atribui-se esse
resultado ao fato de a falha ter sido induzida pela remoção da
interface de rede, evento detectado imediatamente pelo sistema
operacional, e não pela ausência de anúncios do vizinho. Falhas em que o
enlace permanece ativo sem transmitir dados tenderiam a apresentar
tempos de convergência substancialmente maiores. A resolução da medida
é limitada pelo intervalo de sondagem (2 s).

## 8. Dificuldades técnicas e soluções adotadas

**Conflito entre endereço do roteador e gateway do Docker.** Em uma
primeira versão, os enlaces utilizavam sub-redes /30 e os roteadores
ocupavam os endereços `.1` e `.2`. O Docker reserva automaticamente o
primeiro endereço utilizável de cada rede para seu gateway interno, o
que resultou no erro `Address already in use` na criação dos
containers. A solução consistiu em adotar sub-redes /29 nos enlaces, com
o gateway explicitamente fixado em `.1` e os roteadores em `.2` e `.3`, e
em fixar o gateway das LANs em `.254`, mantendo `.1` para o roteador.

**Rota padrão dos hosts de teste.** Os hosts aprendem, por padrão, uma
rota apontando para o gateway interno do Docker, e não para o roteador
FRR, o que ocasionou 100% de perda de pacotes entre LANs distintas. A
correção foi aplicada no `command` de cada host, que substitui a rota
padrão pelo endereço do roteador da respectiva LAN
(`ip route replace default via 10.X.0.1`).

**Restauração do enlace após o teste de falha.** A reconexão do
container à rede removida (`docker network connect`) falhou devido a uma
rota residual da sub-rede do enlace, instalada no kernel a partir de
informação aprendida pelo RIP durante a falha. O simples reinício do
container (`docker compose restart`) também se mostrou inadequado, por
alterar a correspondência entre redes e interfaces. O procedimento
confiável adotado foi a recriação do container
(`docker compose up -d --force-recreate r1`, ou `scripts/restaurar.sh`), que reconecta todas as
redes declaradas no `docker-compose.yml`.

## 9. Reprodutibilidade

O experimento é integralmente reproduzível a partir dos arquivos deste
repositório: `docker-compose.yml` (topologia e endereçamento) e
`configs/rip/` (configuração de cada daemon). Requer-se apenas Docker e
Docker Compose instalados. Os comandos de coleta empregados constam nas
Seções 5 a 7.

## 10. Considerações finais

O RIP convergiu corretamente na topologia proposta, permitindo
conectividade fim a fim entre todas as LANs e redirecionando o tráfego
pelo caminho redundante após a falha do enlace R1–R2. O protocolo
mostrou-se de configuração simples, ao custo de tráfego de controle
periódico independente de mudanças na rede. Os valores aqui registrados
servem de referência para a comparação com o OSPF e com o algoritmo
próprio, avaliados sobre a mesma topologia.
