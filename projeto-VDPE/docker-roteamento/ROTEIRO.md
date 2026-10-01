# Roteiro de apresentação — Trabalho I (10 min)

Roteamento IP com FRRouting + Docker: **RIP**, **OSPF** e algoritmo próprio **VDPE**.
Apresentação: 01/10/2026 · Entrega no Moodle até 19h do mesmo dia.

Comandos digitados direto no **PowerShell** (nenhum script `.ps1` é usado). Os `scripts/*.sh` só servem no Git Bash/Linux.

---

## 0. Antes da aula (checklist)

- [ ] `docker pull frrouting/frr:latest nicolaka/netshoot node:20-alpine` (imagens já baixadas, sem depender de internet).
- [ ] **Ensaio completo hoje**: rodar os 3 modos e preencher `metricas/resultados.csv` (seção 4). OSPF e as novas medições ainda não foram executados em container.
- [ ] Deixar o ambiente **já no modo RIP e convergido** (comandos da seção 3 do `TESTES.md`, esperar 60 s).
- [ ] Dois terminais lado a lado, fonte grande: **T1** comandos, **T2** (opcional) `docker logs -f algo1`.
- [ ] Gráficos prontos (`python scripts\graficos.py`) abertos em slide/imagem.
- [ ] Vídeo gravado e no GitHub (ou link, se > 100 MB). Plano B se a demo falhar: abrir o vídeo.
- [ ] Cronometrar um ensaio com o relógio. Corte previsto: seção 6 (se atrasar).

**Divisão sugerida:** Gabriel = partes 1 a 4 · Pedro = partes 5 a 7 · conclusão juntos. Ajustem à vontade.

---

## 1. Visão geral do tempo

| Tempo | Parte | Quem | Item do enunciado |
|---|---|---|---|
| 0:00–0:40 | Abertura e objetivo | Gabriel | 1 |
| 0:40–1:40 | Plataforma e topologia | Gabriel | 2, 3 |
| 1:40–3:00 | RIP (demo) | Gabriel | 5 |
| 3:00–4:20 | OSPF (demo) | Gabriel | 5 |
| 4:20–6:00 | VDPE: lógica e critérios | Pedro | 4 |
| 6:00–7:30 | VDPE: demo + falha de enlace | Pedro | 5, 8 |
| 7:30–9:00 | Métricas e gráficos | Pedro | 6, 7 |
| 9:00–10:00 | Comparação e conclusão | Ambos | 7, 10 |

---

## 2. Falas e comandos

### 2.1 Abertura (0:00–0:40)

> “Boa tarde. Nosso trabalho monta um ambiente experimental para comparar
> roteamento IP na prática. Sobre **uma mesma topologia de cinco roteadores**
> vamos mostrar **dois protocolos, RIP e OSPF**, e **um algoritmo que nós
> mesmos propusemos, o VDPE**. Os três **nunca rodam ao mesmo tempo**, como
> pede o enunciado. Vamos comparar tabela de rotas, tráfego de controle,
> tempo de convergência e delay.”

### 2.2 Plataforma e topologia (0:40–1:40)

> “Usamos o **FRRouting**, uma plataforma open source, em **containers
> Docker**, orquestrados por um único `docker-compose.yml`. Cada roteador é um
> container, e cada link e cada LAN é uma rede Docker isolada. São cinco
> roteadores, cada um com uma LAN e um host de teste. O enlace **R2–R3 é o
> caminho redundante**: ele cria rotas alternativas, e é isso que nos permite
> observar o comportamento quando um enlace cai.”

Mostrar o diagrama (`RIP.md`, Seção 3). Comando:

```powershell
docker ps
```

> “Aqui estão os 10 containers: cinco roteadores e cinco hosts. No modo do
> nosso algoritmo entram mais cinco, os agentes `algo1` a `algo5`.”

### 2.3 RIP (1:40–3:00) — já rodando

> “O RIP é **vetor de distância**: cada roteador anuncia sua tabela aos
> vizinhos a cada 30 segundos, e a métrica é o **número de saltos**. É simples
> de configurar, mas converge devagar e gasta tráfego periódico mesmo sem
> mudanças.”

```powershell
docker exec r1 vtysh -c "show ip route rip"
docker exec host1 ping -c 3 10.5.0.100
```

> “As rotas com código **R** foram aprendidas via RIP, distância
> administrativa 120. Métrica 3 para a LAN5, e o ping fim a fim responde com
> TTL 61: atravessou três roteadores.”

### 2.4 OSPF (3:00–4:20)

Disparar a troca **antes de falar** (leva ~20 s) e falar enquanto sobe:

```powershell
docker compose --profile vdpe down --remove-orphans
docker compose --env-file env/ospf.env up -d
```

> “O OSPF é de **estado de enlace**: cada roteador descreve seus enlaces em
> LSAs, que são inundados. Todos montam o **mesmo mapa** e rodam Dijkstra
> localmente. Configuramos **área única**, enlaces ponto a ponto, para dispensar
> eleição de DR, e a LAN como *passive*. Só envia mensagens quando algo muda,
> além de *hellos* leves, e reage ao estado da interface.”

```powershell
docker exec r1 vtysh -c "show ip ospf neighbor"
docker exec r1 vtysh -c "show ip route ospf"
```

> “Vizinhos em **Full**; rotas com código **O**, distância 110.”

### 2.5 VDPE: lógica e critérios (4:20–6:00)

Disparar a troca **antes de falar**:

```powershell
docker compose --profile vdpe down --remove-orphans
docker compose --env-file env/vdpe.env --profile vdpe up -d
```

> “O nosso algoritmo é o **VDPE, Vetor de Distância com Peso de Estabilidade**.
> É da família do RIP, mas com um critério a mais. Cada roteador conta as
> **quedas** de cada enlace (vizinho que parou de responder). Para escolher a
> rota, em ordem: **1)** menor número de saltos; **2)** em empate de saltos, o
> caminho com **menos quedas somadas**; **3)** persistindo o empate, o vizinho
> de menor nome, só para o resultado ser determinístico.”

> “**Por que isso?** Entre dois caminhos do mesmo tamanho, preferimos o que
> não passa por enlaces que já falharam. Isso evita voltar para um caminho
> que oscila.”

> “**Decisões de projeto:** anúncios a cada **5 s** e *timeout* de **15 s**,
> ou seja, três anúncios perdidos. Anunciamos **apenas as LANs**, o que mantém
> a tabela menor. Usamos *split horizon* e retirada implícita de rotas. É um
> processo Node.js por roteador, trocando vetores por **UDP real na porta
> 5001** e instalando rotas no kernel com `ip route`, como um daemon faria.”

### 2.6 VDPE: demonstração e falha de enlace (6:00–7:30)

```powershell
docker ps
docker logs algo1 --tail 6
docker exec r1 ip route
docker exec r1 vtysh -c "show ip route"
docker exec host1 ping -c 3 10.5.0.100
```

> “Quinze containers, com os agentes ativos. No log, o R1 vê os vizinhos e
> instala rotas. No kernel, as rotas das LANs foram instaladas **pelo nosso
> agente**. No `vtysh` não há nenhuma rota **R** nem **O**: o FRR só roda o
> zebra. E o ping fim a fim funciona.”

Agora a falha (leva ~20 s; falar durante):

```powershell
docker exec r1 ip link set eth1 down
$t = Get-Date; while (-not (docker exec r1 ip route show 10.2.0.0/24 | Select-String "10.0.13.3")) { Start-Sleep 1 }; ((Get-Date) - $t).TotalSeconds
```

> “Estamos **cortando o enlace R1–R2**. O R1 tinha a LAN2 via R2; ela some, e
> o agente só percebe após o **timeout de 15 s**. No próximo anúncio, o R3
> oferece o caminho alternativo, e a rota volta com **um salto a mais**.”

```powershell
docker logs algo1 --tail 4
docker exec host1 ping -c 3 10.2.0.100
```

> “O log registra o vizinho R2 inativo e as **quedas do enlace subindo para 1**. O TTL do ping caiu de 62 para 61: o tráfego agora passa pelo R3.”

Restaurar em seguida (rodar enquanto Pedro fala da próxima parte):

```powershell
docker exec r1 ip link set eth1 up
```

> ⚠ O ping logo após a convergência do R1 pode falhar por alguns segundos até
> o R2 também convergir. Se acontecer, repetir o ping.

### 2.7 Métricas e gráficos (7:30–9:00)

Mostrar os gráficos (`metricas/graficos/*.png`). Roteiro de fala (completar com
os números medidos):

> “Coletamos as mesmas métricas nos três modos, **sempre na tabela do kernel e
> no mesmo enlace R1–R2**, para a comparação ser justa.”
>
> “**Tabela de rotas no R1:** RIP e OSPF têm 12 entradas, porque aprendem
> também os enlaces entre roteadores. O VDPE tem **8**, porque só anuncia
> LANs. **[confirmar com a medição]**”
>
> “**Tráfego de controle:** o RIP manda a cada 30 s; o VDPE a cada 5 s, com
> mensagens em JSON; o OSPF manda *hellos* pequenos. Esperamos **mais
> pacotes/bytes no VDPE**: é o preço de convergir mais rápido que o RIP.
> **[confirmar]**”
>
> “**Convergência:** RIP ≈ 8 s (medido), OSPF **[__ s]**, VDPE **[__ s]**.
> O OSPF e o RIP detectam o enlace caindo pela interface; o VDPE só por
> *timeout*, e isso aparece no tempo.”
>
> “**Delay:** sem falha, o delay é praticamente igual nos três (~0,1 ms, rede
> virtual). O que muda é o caminho após a falha.”

### 2.8 Comparação e conclusão (9:00–10:00)

| Critério | RIP | OSPF | VDPE |
|---|---|---|---|
| Princípio | Vetor de distância | Estado de enlace (Dijkstra) | Vetor de distância + estabilidade |
| Seleção de rota | Menor nº de saltos | Menor custo (mapa completo) | Saltos → menos quedas → nome |
| Mudança de topologia | Lento (30 s / 180 s) | Rápido, usa estado da interface | 15 s *timeout* + até 5 s |
| Controle | Periódico, baixo | Por evento + *hellos* | Periódico, 5 s, mais frequente |
| Escalabilidade | Limitada (16 saltos) | Alta (áreas) | Limitada (vetor, JSON) |
| Complexidade | Baixa | Média | Código próprio |
| Cenário ideal | Redes pequenas/simples | Redes médias e grandes | Redes pequenas com enlaces instáveis |

> “Em resumo: o **RIP** é o mais simples, mas o mais lento. O **OSPF** é o
> mais robusto e escala melhor. O **VDPE** mostrou que um critério simples de
> estabilidade funciona e converge mais rápido que o RIP, mas
> **perde para o OSPF** por não detectar falha pela interface. Como
> melhorias: monitorar o estado do link, enviar *triggered updates* e
> recuperar a estabilidade com o tempo. Código, configurações e vídeo estão
> no GitHub. Obrigado, ficamos à disposição para perguntas.”

---

## 3. Perguntas prováveis e respostas curtas

**O VDPE não é só um RIP com desempate?** É da mesma família e dizemos isso de
propósito, para isolar o efeito do critério novo. As diferenças são: estabilidade
histórica como critério, só LANs anunciadas, timers de 5/15 s, retirada
implícita e instalação real de rotas por um agente próprio.

**Por que o OSPF converge mais rápido?** Detecta a queda pela interface e
recalcula o SPF localmente com o mapa completo, sem esperar *timeout* de vizinho.

**Como garantem que não rodam juntos?** `.env` define `PROTOCOLO` e o profile;
cada modo monta uma pasta de configuração distinta (`configs/rip|ospf|vdpe`) e
`scripts/modo.*` derruba o modo anterior antes de subir o novo. No modo VDPE,
`vtysh` não mostra rotas R nem O.

**Por que o VDPE não tem rotas dos enlaces entre roteadores?** Só anuncia LANs
(tabela menor). Consequência: IPs de enlace de roteadores distantes não são
alcançáveis; os hosts não são afetados.

**O que é a estabilidade se nunca se recupera?** É uma limitação assumida;
melhoria futura: decaimento da penalidade com o tempo.

**Por que /29 e não /30?** O Docker reserva o primeiro endereço de cada rede
para o gateway; o /29 deixa espaço (`RIP.md`, Seção 8).

**Por que os agentes não subiam no `docker compose up`?** Estavam num *profile*
do Compose, só ativado por flag. Agora o profile vem do `.env`
(`algoritmo-proprio/README.md`, 4d).

---

## 4. Coleta de métricas (rodar uma vez por modo, na mesma ordem)

Fazer **RIP → OSPF → VDPE**, cada um com ~60 s de convergência antes de medir.
Anotar em `metricas/resultados.csv`.

```powershell
docker compose --profile vdpe down --remove-orphans
docker compose --env-file env/rip.env up -d   # (ou ospf / vdpe)
Start-Sleep 60

# 1) Tamanho da tabela de rotas no R1 (kernel)
docker exec r1 sh -c "ip route | wc -l"

# 2) Tráfego de controle por 60 s no enlace R1-R2 (pacotes e bytes)
docker run --rm --net container:r1 -v "${PWD}/scripts:/scripts" nicolaka/netshoot sh /scripts/contar.sh 60 eth1

# 3) Delay fim a fim host1 -> host5 (ver a linha "rtt min/avg/max")
docker exec host1 sh -c "ping -c 20 -i 0.2 10.5.0.100 | tail -2"

# 4) Convergência após cortar R1-R2 (enlace precisa estar intacto)
docker exec r1 ip link set eth1 down
$t = Get-Date; while (-not (docker exec r1 ip route show 10.2.0.0/24 | Select-String "10.0.13.3")) { Start-Sleep 1 }; ((Get-Date) - $t).TotalSeconds
docker exec r1 ip link set eth1 up
```

Para cada modo: repetir a convergência **3 vezes** e registrar a média.
No VDPE, também guardar a saída de `docker exec algo1 cat /tmp/tabela.txt`
(rotas, quedas, pacotes e bytes do agente).

Preencher o CSV e gerar os gráficos:

```powershell
pip install matplotlib
python scripts\graficos.py        # saída em metricas\graficos\*.png
```

Valores já registrados: RIP → tabela 12, convergência ≈ 8 s, RTT 0,124 ms
(`RIP.md`, Seção 7).

**Previsões (hipóteses, a confirmar com a medição):** VDPE ≈ 15–20 s de
convergência (simulação em memória: 21 s); tabela do VDPE com 8 entradas no R1.

---

## 5. Entrega (até 19h)

- [ ] Repositório GitHub com código, configurações, README de uso e **vídeo** (ou link, se > 100 MB: Release do GitHub ou YouTube não listado).
- [ ] Vídeo mostrando os **três modos** funcionando (ping fim a fim + falha de enlace + rota alternativa). Gravar sem cortes visíveis, com os comandos desta seção 2.
- [ ] Submissão no Moodle com o link do repositório.

## 6. Se o tempo apertar (cortes, na ordem)

1. Pular `show ip ospf neighbor`.
2. Não rodar `docker logs algo1` no início do VDPE; mostrar só depois da falha.
3. Mostrar a tabela de comparação (2.8) em vez de lê-la.
4. Dizer “o OSPF está no vídeo e nos gráficos” e ir direto ao VDPE.
