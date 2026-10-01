#!/usr/bin/env python3
"""Gera os graficos comparativos (RIP x OSPF x VDPE) a partir de metricas/resultados.csv.

Preencha o CSV com os valores medidos (ver ROTEIRO.md, secao de metricas).
Celulas vazias sao ignoradas. Requer: pip install matplotlib
Saida: metricas/graficos/*.png
"""
import csv, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

RAIZ = os.path.join(os.path.dirname(__file__), "..", "metricas")
METRICAS = [
    ("tabela_entradas_r1",   "Tamanho da tabela de rotas no R1 (entradas)", "entradas"),
    ("pacotes_controle_60s", "Pacotes de controle em 60 s (enlace R1-R2)",   "pacotes"),
    ("bytes_controle_60s",   "Bytes de controle em 60 s (enlace R1-R2)",     "bytes"),
    ("convergencia_s",       "Tempo de convergencia apos falha R1-R2",       "segundos"),
    ("delay_ms",             "Delay medio host1 -> host5 (ping)",            "ms"),
]
CORES = {"RIP": "#4C78A8", "OSPF": "#F58518", "VDPE": "#54A24B"}

with open(os.path.join(RAIZ, "resultados.csv"), newline="", encoding="utf-8") as f:
    linhas = list(csv.DictReader(f))

os.makedirs(os.path.join(RAIZ, "graficos"), exist_ok=True)
for coluna, titulo, unidade in METRICAS:
    dados = [(l["protocolo"], float(l[coluna])) for l in linhas if l.get(coluna, "").strip()]
    if not dados:
        print(f"[pulado] {coluna}: sem dados")
        continue
    nomes, valores = zip(*dados)
    fig, ax = plt.subplots(figsize=(5.5, 3.6))
    barras = ax.bar(nomes, valores, color=[CORES.get(n, "#888") for n in nomes])
    ax.bar_label(barras, fmt="%g", padding=2)
    ax.set_title(titulo, fontsize=10)
    ax.set_ylabel(unidade)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    saida = os.path.join(RAIZ, "graficos", f"{coluna}.png")
    fig.savefig(saida, dpi=150)
    plt.close(fig)
    print(f"[ok] {saida}")
