// Algoritmo proprio de roteamento: VDPE (Vetor de Distancia com Peso de Estabilidade)
//
// Cada roteador roda uma copia deste programa. Os vizinhos trocam vetores de
// distancia por UDP e as rotas escolhidas sao instaladas no kernel (ip route).
//
// Escolha da rota para cada destino (nesta ordem):
//   1) menor numero de saltos
//   2) em empate, menos quedas de enlace somadas ao longo do caminho
//   3) em novo empate, menor nome de vizinho (R2 antes de R3, por exemplo)
//
// Uso: node vdpe_agent.js --router R1 --topology topologia_docker.json

const dgram = require('dgram');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PORTA = 5001;
const INTERVALO = 5000;   // envia anuncio a cada 5 s
const TIMEOUT = 15000;    // 15 s sem anuncio = vizinho caiu
const INFINITO = 16;      // mesmo limite do RIP
const ARQUIVO_TABELA = '/tmp/tabela.txt';

// ---------- leitura dos argumentos e da topologia ----------
const args = process.argv.slice(2);
const nome = args[args.indexOf('--router') + 1];
const arquivoTopologia = args[args.indexOf('--topology') + 1];
if (!nome || !arquivoTopologia) {
  console.log('uso: node vdpe_agent.js --router R1 --topology topologia_docker.json');
  process.exit(1);
}
const topologia = JSON.parse(fs.readFileSync(arquivoTopologia, 'utf8'));
const meu = topologia[nome];

// ---------- estado do roteador ----------
// vizinhos[R2] = { ip, ativo, ultimoAnuncio, quedas }
const vizinhos = {};
for (const l of meu.links) {
  vizinhos[l.neighbor] = { ip: l.neighbor_ip, ativo: false, ultimoAnuncio: 0, quedas: 0 };
}

// candidatas[destino][vizinho] = { saltos, quedas }  -> o que cada vizinho anunciou
const candidatas = {};

// rotas[destino] = { vizinho, saltos, quedas }  -> a rota escolhida
const rotas = {};

let pacotesEnviados = 0, pacotesRecebidos = 0;
let bytesEnviados = 0, bytesRecebidos = 0;

let socket;

// ---------- kernel ----------
function ipRoute(argumentos, mostrarErro) {
  const r = spawnSync('ip', ['route'].concat(argumentos), { encoding: 'utf8' });
  if (r.status !== 0 && mostrarErro) {
    console.log(`[${nome}] erro: ip route ${argumentos.join(' ')} -> ${r.stderr.trim()}`);
  }
  return r.status === 0;
}

// ---------- escolha da rota ----------
// retorna true se a rota a e melhor que a rota b
function melhorQue(a, b) {
  if (a.saltos !== b.saltos) return a.saltos < b.saltos;   // criterio 1
  if (a.quedas !== b.quedas) return a.quedas < b.quedas;   // criterio 2
  return a.vizinho < b.vizinho;                            // criterio 3
}

// lista as rotas possiveis para o destino (so de vizinhos ativos)
function listarOpcoes(destino) {
  const opcoes = [];
  for (const viz in candidatas[destino]) {
    if (!vizinhos[viz].ativo) continue;
    const c = candidatas[destino][viz];
    opcoes.push({
      vizinho: viz,
      saltos: c.saltos,
      quedas: c.quedas + vizinhos[viz].quedas,   // quedas do caminho = anunciadas + enlace ate o vizinho
    });
  }
  return opcoes;
}

function escolherMelhor(opcoes) {
  let melhor = null;
  for (const o of opcoes) {
    if (melhor === null || melhorQue(o, melhor)) melhor = o;
  }
  return melhor;
}

function explicar(escolhida, opcoes) {
  const outras = opcoes.filter(o => o.vizinho !== escolhida.vizinho);
  if (outras.length === 0) return 'unica rota';
  const empatadas = outras.filter(o => o.saltos === escolhida.saltos);
  if (empatadas.length === 0) return 'menos saltos';
  if (empatadas.some(o => o.quedas === escolhida.quedas)) return 'empate em saltos e quedas, menor nome';
  return 'EMPATE EM SALTOS, venceu a de menos quedas (estabilidade)';
}

function textoOpcoes(opcoes) {
  return opcoes.map(o => `${o.vizinho}(${o.saltos} saltos, ${o.quedas} quedas)`).join('  ');
}

// recalcula a rota de todos os destinos e mexe no kernel quando a rota muda
function atualizarRotas() {
  for (const destino in candidatas) {
    const opcoes = listarOpcoes(destino);
    const nova = escolherMelhor(opcoes);
    const antiga = rotas[destino];

    if (nova === null) {
      if (antiga) {
        delete rotas[destino];
        ipRoute(['del', destino], false);
        console.log(`[${nome}] ${destino}: sem rota`);
      }
      continue;
    }

    const mudouVizinho = !antiga || antiga.vizinho !== nova.vizinho;
    rotas[destino] = nova;
    if (mudouVizinho) {
      ipRoute(['replace', destino, 'via', vizinhos[nova.vizinho].ip], true);
      console.log(`[${nome}] ${destino}: via ${nova.vizinho} | opcoes: ${textoOpcoes(opcoes)} | motivo: ${explicar(nova, opcoes)}`);
    }
  }
  salvarTabela();
}

// reinstala todas as rotas no kernel (caso o container tenha sido reiniciado)
function reinstalarRotas() {
  for (const destino in rotas) {
    ipRoute(['replace', destino, 'via', vizinhos[rotas[destino].vizinho].ip], false);
  }
}

// ---------- troca de mensagens ----------
// vetor enviado a um vizinho: { destino: [saltos, quedas] }
function montarVetor(para) {
  const vetor = {};
  vetor[meu.lan] = [0, 0];
  for (const destino in rotas) {
    if (rotas[destino].vizinho === para) continue;   // split horizon
    vetor[destino] = [rotas[destino].saltos, rotas[destino].quedas];
  }
  return vetor;
}

function enviarAnuncios() {
  for (const viz in vizinhos) {
    const msg = Buffer.from(JSON.stringify({ from: nome, vetor: montarVetor(viz) }));
    socket.send(msg, PORTA, vizinhos[viz].ip, (erro) => {
      if (!erro) {
        pacotesEnviados++;
        bytesEnviados += msg.length;
      }
    });
  }
}

function receberAnuncio(origem, vetor, tamanho) {
  const v = vizinhos[origem];
  if (!v) return;   // nao e vizinho direto

  pacotesRecebidos++;
  bytesRecebidos += tamanho;
  v.ultimoAnuncio = Date.now();
  if (!v.ativo) {
    v.ativo = true;
    console.log(`[${nome}] vizinho ${origem} ativo`);
  }

  // o novo vetor substitui o anterior: o que o vizinho parou de anunciar some
  for (const destino in candidatas) delete candidatas[destino][origem];

  for (const destino in vetor) {
    if (destino === meu.lan) continue;
    const saltos = vetor[destino][0] + 1;
    const quedas = vetor[destino][1];
    if (saltos >= INFINITO) continue;
    if (!candidatas[destino]) candidatas[destino] = {};
    candidatas[destino][origem] = { saltos: saltos, quedas: quedas };
  }
  atualizarRotas();
}

// ---------- falha de vizinho ----------
function verificarTimeouts() {
  let houveQueda = false;
  for (const viz in vizinhos) {
    const v = vizinhos[viz];
    if (v.ativo && Date.now() - v.ultimoAnuncio > TIMEOUT) {
      v.ativo = false;
      v.quedas++;
      houveQueda = true;
      console.log(`[${nome}] vizinho ${viz} caiu (timeout). quedas do enlace: ${v.quedas}`);
    }
  }
  if (houveQueda) atualizarRotas();
}

// ---------- tabela para consulta: docker exec algoX cat /tmp/tabela.txt ----------
function salvarTabela() {
  let txt = `Roteador ${nome}  (LAN ${meu.lan})\n\n`;
  txt += 'Vizinhos:\n';
  for (const viz in vizinhos) {
    const v = vizinhos[viz];
    txt += `  ${viz}  ${v.ip}  ${v.ativo ? 'ativo' : 'INATIVO'}  quedas=${v.quedas}\n`;
  }
  txt += '\nRotas (escolhida e opcoes):\n';
  for (const destino of Object.keys(rotas).sort()) {
    const r = rotas[destino];
    txt += `  ${destino}  via ${r.vizinho}  saltos=${r.saltos}  quedas=${r.quedas}\n`;
    txt += `      opcoes: ${textoOpcoes(listarOpcoes(destino))}\n`;
  }
  txt += `\nTamanho da tabela: ${Object.keys(rotas).length} rotas\n`;
  txt += `Pacotes: enviados=${pacotesEnviados} recebidos=${pacotesRecebidos}\n`;
  txt += `Bytes: enviados=${bytesEnviados} recebidos=${bytesRecebidos}\n`;
  fs.writeFileSync(ARQUIVO_TABELA, txt);
}

// ---------- inicio ----------
socket = dgram.createSocket('udp4');
socket.on('message', (dados) => {
  try {
    const msg = JSON.parse(dados.toString());
    receberAnuncio(msg.from, msg.vetor, dados.length);
  } catch (e) {
    // mensagem invalida, ignora
  }
});
socket.on('error', (e) => console.log(`[${nome}] erro no socket: ${e.message}`));
socket.bind(PORTA, '0.0.0.0', () => {
  console.log(`[${nome}] agente iniciado. LAN=${meu.lan} vizinhos=${Object.keys(vizinhos).join(',')}`);
  enviarAnuncios();
});

setInterval(() => { enviarAnuncios(); reinstalarRotas(); salvarTabela(); }, INTERVALO);
setInterval(verificarTimeouts, 2000);
