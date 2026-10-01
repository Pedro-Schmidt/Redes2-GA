# Algoritmo próprio: VDPE
Vetor de Distância com Peso de Estabilidade.

## Ideia
É um vetor de distância, como o RIP. Cada roteador envia aos vizinhos, a cada
5 s, a lista de redes que alcança e quantos saltos são necessários. Cada
roteador também conta as **quedas** de cada enlace: se um vizinho fica 15 s
sem enviar anúncio, o enlace "caiu" e o contador dele aumenta em 1.

Para cada rede destino, a rota é escolhida assim:

1. menor número de saltos;
2. se empatar, menos quedas somadas ao longo do caminho (caminho mais estável);
3. se ainda empatar, vizinho de menor nome (R2 antes de R3). Serve só para o
   resultado ser sempre o mesmo.

Cada anúncio leva, para cada destino, o par `[saltos, quedas]`. Quem recebe soma
1 salto e soma as quedas do enlace por onde o anúncio chegou.

## Decisões de projeto
| Decisão | Motivo |
|---|---|
| Vetor de distância | Simples de explicar e comparável com o RIP |
| Quedas como medida de estabilidade | É um número inteiro, fácil de observar e de provocar no teste |
| Soma das quedas do caminho | Um caminho com enlaces que já caíram vale pior |
| Só as LANs são anunciadas | Tabela menor e menos bytes de controle |
| Anúncio a cada 5 s, timeout de 15 s | Aceita perder 2 anúncios seguidos; mais rápido que o RIP |
| Split horizon | Não anuncia a um vizinho as rotas aprendidas dele |
| Vetor novo substitui o anterior | Rota que o vizinho deixou de anunciar some da tabela |

## Limitações
- A queda só é percebida por timeout (RIP e OSPF percebem pelo estado da interface).
- As quedas nunca diminuem com o tempo (só zeram se o agente reiniciar).
- Sem autenticação e sem triggered updates.
- Os enlaces entre roteadores não são anunciados, só as LANs.

## Como funciona no Docker
Cada roteador `rX` tem um container `algoX` que compartilha a rede dele
(`network_mode: service:rX`). O `algoX` roda `vdpe_agent.js`, troca mensagens
UDP (porta 5001) com os vizinhos e instala as rotas no kernel com
`ip route replace`. O FRR dos roteadores roda só o zebra.

## Arquivos
- `vdpe_agent.js`: o algoritmo.
- `topologia_docker.json`: LAN e vizinhos de cada roteador. Só `neighbor` e
  `neighbor_ip` são usados pelo código.

## Ver o estado de um roteador
```bash
docker logs algo2 --tail 20
docker exec algo2 cat /tmp/tabela.txt
docker exec r2 ip route
```
