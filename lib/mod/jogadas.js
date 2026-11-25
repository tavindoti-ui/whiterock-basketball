// Quadro tático: jogadas salvas.
// /api/modulos?r=jogadas
//   GET                            → todas as jogadas (todos os níveis podem ver e estudar)
//   POST   { ...jogada }           → cria (comissão)
//   PUT    { id, ...jogada }       → atualiza (comissão)
//   DELETE { id }                  → exclui (comissão)
const { requireAuth } = require('../auth');
const { getData, setData, logAction } = require('../db');

const ALL = ['admin', 'tecnico', 'comissao', 'capitao', 'atleta'];
const STAFF = ['admin', 'tecnico', 'comissao', 'capitao'];
const KEY = 'jogadas';
const CATEGORIAS = ['Ataque', 'Defesa', 'Lateral / fundo', 'Contra-ataque', 'Saída de pressão', 'Outro'];
const TOKENS = ['o1', 'o2', 'o3', 'o4', 'o5', 'd1', 'd2', 'd3', 'd4', 'd5'];
const DESENHOS = ['mov', 'passe', 'drible', 'bloqueio'];
const W = 500, H = { meia: 470, inteira: 940 };

function erro(msg, status = 400) { return Object.assign(new Error(msg), { status }); }
function txt(v, max, nome) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (s.length > max) throw erro(`${nome} muito longo (máx. ${max} caracteres).`);
  return s;
}
function coord(v, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw erro('Posição inválida na jogada.');
  return Math.round(Math.min(max, Math.max(0, n)) * 10) / 10;
}

function limpar(b, jogadores) {
  const nome = txt(b.nome, 60, 'Nome');
  if (!nome) throw erro('Dê um nome para a jogada.');
  const quadra = b.quadra === 'inteira' ? 'inteira' : 'meia';
  const altura = H[quadra];
  if (!Array.isArray(b.frames) || !b.frames.length) throw erro('A jogada precisa de pelo menos uma etapa.');
  if (b.frames.length > 12) throw erro('No máximo 12 etapas por jogada.');
  const frames = b.frames.map(f => {
    const tokens = {};
    for (const k of TOKENS) {
      const t = f && f.tokens && f.tokens[k];
      if (t) tokens[k] = { x: coord(t.x, W), y: coord(t.y, altura) };
    }
    let bola = null;
    if (f && f.bola) {
      if (f.bola.at && TOKENS.includes(f.bola.at)) bola = { at: f.bola.at };
      else if (f.bola.x !== undefined) bola = { x: coord(f.bola.x, W), y: coord(f.bola.y, altura) };
    }
    const desenhos = Array.isArray(f && f.desenhos) ? f.desenhos : [];
    if (desenhos.length > 40) throw erro('No máximo 40 desenhos por etapa.');
    return {
      tokens, bola,
      desenhos: desenhos.filter(d => d && DESENHOS.includes(d.t) && Array.isArray(d.p) && d.p.length >= 2).map(d => {
        if (d.p.length > 150) throw erro('Desenho com pontos demais.');
        return { t: d.t, p: d.p.map(pt => [coord(pt[0], W), coord(pt[1], altura)]) };
      }),
      nota: txt(f && f.nota, 200, 'Anotação da etapa'),
    };
  });
  const escalacao = {};
  if (b.escalacao && typeof b.escalacao === 'object') {
    for (const k of TOKENS.slice(0, 5)) {
      const id = Number(b.escalacao[k]);
      if (id && jogadores.some(j => j.id === id)) escalacao[k] = id;
    }
  }
  return {
    nome, quadra, frames, escalacao,
    categoria: CATEGORIAS.includes(b.categoria) ? b.categoria : 'Ataque',
    descricao: txt(b.descricao, 600, 'Descrição'),
    defesa: !!b.defesa,
  };
}

module.exports = async function jogadas(req, res) {
  const b = req.body || {};
  if (req.method === 'GET') {
    const user = requireAuth(req, res, ALL);
    if (!user) return;
    return res.json(await getData(KEY) || []);
  }
  const user = requireAuth(req, res, STAFF);
  if (!user) return;
  try {
    const lista = await getData(KEY) || [];
    if (req.method === 'DELETE') {
      const alvo = lista.find(j => j.id === Number(b.id));
      if (!alvo) throw erro('Jogada não encontrada.', 404);
      await setData(KEY, lista.filter(j => j.id !== alvo.id));
      await logAction(user.id, user.nome, user.role, 'Excluiu jogada', alvo.nome);
      return res.json({ success: true });
    }
    if (JSON.stringify(b).length > 150000) throw erro('Jogada grande demais.');
    const jogadores = await getData('jogadores') || [];
    const f = limpar(b, jogadores);
    if (req.method === 'POST') {
      if (lista.length >= 300) throw erro('Limite de 300 jogadas salvas atingido.');
      const counters = await getData('counters') || {};
      counters.jogadas = (counters.jogadas || 0) + 1;
      const nova = { id: counters.jogadas, ...f, criadoPor: user.nome, criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
      lista.push(nova);
      await setData(KEY, lista);
      await setData('counters', counters);
      await logAction(user.id, user.nome, user.role, 'Criou jogada', nova.nome);
      return res.status(201).json(nova);
    }
    if (req.method === 'PUT') {
      const idx = lista.findIndex(j => j.id === Number(b.id));
      if (idx === -1) throw erro('Jogada não encontrada.', 404);
      lista[idx] = { ...lista[idx], ...f, atualizadoEm: new Date().toISOString(), atualizadoPor: user.nome };
      await setData(KEY, lista);
      await logAction(user.id, user.nome, user.role, 'Editou jogada', lista[idx].nome);
      return res.json(lista[idx]);
    }
    throw erro('Ação inválida.', 405);
  } catch (e) {
    if (!e.status) throw e;
    return res.status(e.status).json({ error: e.message });
  }
};
