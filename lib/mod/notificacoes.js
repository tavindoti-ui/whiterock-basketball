// Central de notificações: estado de leitura e preferências de cada usuário.
// As notificações em si são montadas no app a partir de jogos, treinos, eventos,
// alterações, convocações, comunicados e mensalidades (dados que já existem).
// /api/modulos?r=notificacoes
//   GET                                       → { lidoAte, ocultas, prefs, navegador }
//   PUT { lidoAte?, ocultar?, prefs?, navegador? } → atualiza e devolve o estado
const { requireAuth } = require('../auth');
const { getData, setData } = require('../db');

const ALL = ['admin', 'tecnico', 'comissao', 'capitao', 'atleta'];
const KEY = 'notificacoes-estado';
const CATS = ['jogos', 'treinos', 'alteracoes', 'convocacoes', 'comunicados', 'mensalidades'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z?$/;

function padrao() {
  return { lidoAte: '', ocultas: [], prefs: Object.fromEntries(CATS.map(c => [c, true])), navegador: false };
}

module.exports = async function notificacoes(req, res) {
  const user = requireAuth(req, res, ALL);
  if (!user) return;
  const todos = await getData(KEY) || {};
  const meu = { ...padrao(), ...(todos[user.id] || {}) };
  meu.prefs = { ...padrao().prefs, ...(meu.prefs || {}) };

  if (req.method === 'GET') return res.json(meu);

  if (req.method === 'PUT') {
    const b = req.body || {};
    if (b.lidoAte !== undefined) {
      const v = String(b.lidoAte);
      if (!ISO_RE.test(v)) return res.status(400).json({ error: 'Data inválida.' });
      if (v > meu.lidoAte) meu.lidoAte = v;
    }
    if (b.ocultar !== undefined) {
      const id = String(b.ocultar).slice(0, 80);
      if (id && !meu.ocultas.includes(id)) meu.ocultas = [...meu.ocultas, id].slice(-300);
    }
    if (b.prefs && typeof b.prefs === 'object') {
      for (const c of CATS) if (b.prefs[c] !== undefined) meu.prefs[c] = !!b.prefs[c];
    }
    if (b.navegador !== undefined) meu.navegador = !!b.navegador;
    todos[user.id] = meu;
    await setData(KEY, todos);
    return res.json(meu);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
