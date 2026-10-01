# Roteiro do vídeo (até 5 minutos): algoritmo VDPE

Comandos digitados direto no PowerShell, na pasta do projeto (nenhum script `.ps1`). Dois terminais lado a lado, fonte grande.

## Antes de gravar
1. Subir o modo VDPE e esperar 30 s:
```powershell
docker compose --profile vdpe down --remove-orphans
docker compose --env-file env/vdpe.env --profile vdpe up -d
```
2. `docker restart algo1 algo2 algo3 algo4 algo5` (zera as quedas) e esperar 30 s.
3. Conferir `docker exec algo2 cat /tmp/tabela.txt`: em `10.5.0.0/24` deve aparecer `via R3` com `R3(2 saltos, 0 quedas)` e `R4(2 saltos, 0 quedas)`.
4. Descobrir a interface do R2 do enlace com R3: `docker exec r2 ip -4 addr` e achar a `eth` com `10.0.23.2` (esperado `eth3`).
5. Medir as métricas antes (TESTES.md, seção 4) e deixar `metricas/resultados.csv` aberto.
6. Rodar o ensaio completo uma vez. Se passar de 5 min, acelerar as esperas na edição.

## Tempo

| Tempo | Parte |
|---|---|
| 0:00 a 0:35 | 1. Montagem no Docker |
| 0:35 a 1:15 | 2. Configurações executadas |
| 1:15 a 2:00 | 3. Protocolo funcionando |
| 2:00 a 2:25 | 4. Critério 1: saltos |
| 2:25 a 4:00 | 5. Critério 2: estabilidade em empate |
| 4:00 a 4:45 | 6. Métricas |
| 4:45 a 5:00 | 7. Fechamento |

## 1. Montagem no Docker (0:00 a 0:35)
**Mostrar:** diagrama da topologia (pentágono, enlace R2-R3 tracejado).

**Falar:**
> "Montamos cinco roteadores em containers Docker, R1 a R5, com uma LAN e um host
> de teste em cada um. Os enlaces entre roteadores são redes Docker. O R2-R3 é o
> caminho extra, e ele cria caminhos diferentes com o mesmo tamanho. O algoritmo
> próprio se chama VDPE. Cada roteador tem um container ao lado, o `algoX`, que
> roda o nosso programa em Node.js usando a mesma rede do roteador."

**Comando:**
```powershell
docker ps
```
**Destacar:** 15 containers (r1 a r5, host1 a host5, algo1 a algo5).

## 2. Configurações executadas (0:35 a 1:15)
**Falar e mostrar** (um comando por vez):

```powershell
docker compose --profile vdpe down --remove-orphans
docker compose --env-file env/vdpe.env --profile vdpe up -d
```
> "O primeiro comando derruba o que estiver rodando. O segundo lê o arquivo
> `env/vdpe.env`, que define o modo VDPE, e sobe os containers. Assim RIP, OSPF e VDPE nunca rodam juntos, como o enunciado pede."

Abrir `docker-compose.yml` no trecho do `algo2` (`network_mode: "service:r2"`).
> "O `network_mode` faz o agente enxergar as interfaces do R2 e mexer na tabela de
> rotas dele."

Abrir `algoritmo-proprio/vdpe_agent.js` na função `melhorQue`.
> "Aqui está a regra: primeiro menos saltos, depois menos quedas, e por último o
> menor nome."

Não precisa esperar o script terminar, se já estava rodando antes.

## 3. Protocolo funcionando (1:15 a 2:00)
```powershell
docker logs algo2 --tail 8
docker exec r2 ip route
docker exec host2 ping -c 3 10.5.0.100
```
**Falar:**
> "No log, o R2 vê os vizinhos ativos e instala rotas. No `ip route` do R2 estão
> as redes 10.1, 10.3, 10.4 e 10.5, aprendidas pelos anúncios UDP dos vizinhos e
> instaladas pelo nosso agente. O ping de uma LAN para outra funciona, passando
> por dois roteadores."

**Destacar:** linhas `10.x.0.0/24 via 10.0.xx.x`, ping sem perda.

## 4. Critério 1: número de saltos (2:00 a 2:25)
```powershell
docker exec algo1 cat /tmp/tabela.txt
```
**Falar:**
> "Para a rede 10.5, o R1 tem duas opções: via R3 com 2 saltos e via R2 com 3. Ele
> escolhe R3, porque tem menos saltos."

**Destacar:** a linha `10.5.0.0/24 via R3 saltos=2` e as `opcoes`.

## 5. Critério 2: estabilidade em empate (2:25 a 4:00)
**a) Mostrar o empate:**
```powershell
docker exec algo2 cat /tmp/tabela.txt
```
> "O R2 chega à rede 10.5 de dois jeitos: por R3 e por R4. Os dois têm 2 saltos e
> 0 quedas. É empate total, e ele usa R3 pelo menor nome."

**b) Provocar a queda no enlace R2-R3:**
```powershell
docker exec r2 ip link set eth3 down
```
> "Vamos derrubar o enlace R2-R3. O agente só percebe depois de 15 segundos sem
> anúncios. Enquanto isso: a estabilidade no nosso algoritmo é a contagem de
> quedas de cada enlace. Cada anúncio leva os saltos e as quedas do caminho."

Esperar ~20 s e mostrar o log:
```powershell
docker logs algo2 --tail 5
```
**Destacar:** `vizinho R3 caiu (timeout). quedas do enlace: 1`.

**c) Subir o enlace de novo:**
```powershell
docker exec r2 ip link set eth3 up
```
Esperar ~15 s.

**d) Mostrar o resultado:**
```powershell
docker exec algo2 cat /tmp/tabela.txt
docker exec host2 traceroute -n 10.5.0.100
```
> "O enlace R3 voltou, mas agora tem 1 queda. Para a rede 10.5, as duas opções
> continuam com 2 saltos: R3 com 1 queda e R4 com 0. O R2 passou a usar R4."
>
> "Isso prova o critério. Os saltos empatam, então não foram eles. O R3 tem nome
> menor, então também não foi o nome. A única diferença é a quantidade de quedas.
> O traceroute confirma: o primeiro salto agora é 10.0.24.3, que é o R4."

**Destacar (nessa ordem):** linha de `10.5.0.0/24` com `via R4`; as duas opções com `2 saltos`; a diferença `1 quedas` x `0 quedas`; primeiro salto do traceroute.

**e) Saltos antes de estabilidade** (na mesma tabela):
> "Na rede 10.3, o R2 usa o R3 mesmo com 1 queda, porque tem 1 salto. A opção via
> R1 tem 0 quedas, mas 2 saltos. Saltos têm prioridade."

## 6. Métricas (4:00 a 4:45)
Mostrar os valores já medidos em `metricas/resultados.csv` (ou o gráfico) e rodar ao vivo só dois comandos curtos:

```powershell
docker exec algo2 cat /tmp/tabela.txt
docker exec host2 ping -c 5 10.5.0.100
```

| Métrica | O que falar |
|---|---|
| Tamanho da tabela | "O R2 aprende 4 rotas, só as LANs. Não anunciamos os enlaces entre roteadores, por isso a tabela é menor." |
| Pacotes e bytes de controle | "O contador mostra enviados e recebidos. São 3 vizinhos x 1 anúncio a cada 5 s. Medimos também com tcpdump na porta 5001." |
| Taxa de transmissão | "Medimos em bits por segundo no enlace R1-R2, contando os bytes pelo tcpdump em 30 s. É um valor baixo, mas constante, porque mandamos o vetor inteiro a cada 5 s." |
| Delay | "Antes e depois da mudança, o delay é parecido (rede virtual). O que muda é o caminho." |
| Convergência | "Medimos cortando o enlace R1-R2 com `ip link set eth1 down` e cronometrando até voltar a rota: cerca de 15 a 20 s, dominado pelo timeout de 15 s." |

## 7. Fechamento (4:45 a 5:00)
> "O VDPE escolhe pelo menor número de saltos e, em empate, pelo caminho com menos
> quedas. Mostramos os dois critérios funcionando em roteadores reais em Docker. O
> código e os testes estão no GitHub."

## Plano B
- Se o traceroute não mostrar o R4, repetir depois de mais 10 s (falta propagar).
- Se a interface não for `eth3`, usar a que aparece com `10.0.23.2` no `ip -4 addr`.
- Se os containers travarem: repetir os dois comandos de subida do modo VDPE e depois `docker restart algo1 algo2 algo3 algo4 algo5`.
