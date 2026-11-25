const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');
const { withErrorHandling } = require('../lib/error-handler');
const { registrarAlteracao, registrarCancelamento, registrarNovo } = require('../lib/alteracoes');

// Súmula de cada jogador em cada jogo (números do jogo, não médias).
// p2 = arremessos de 2, p3 = arremessos de 3, ft = lances livres (m = certos, a = tentados).
const BOX_KEYS = ['pts', 'reb', 'ast', 'stl', 'blk', 'flt', 'p2m', 'p2a', 'p3m', 'p3a', 'ftm', 'fta'];
const SHOT_PAIRS = [['p2m', 'p2a', '2 pontos'], ['p3m', 'p3a', '3 pontos'], ['ftm', 'fta', 'lances livres']];
const GAME_FIELDS = { adv: 80, data: 10, hora: 5, local: 120, camp: 80 };

function badRequest(msg) { return Object.assign(new Error(msg), { status: 400 }); }

function cleanBox(list, jogadores) {
  if (!Array.isArray(list)) throw badRequest('Estatísticas inválidas.');
  const seen = new Set();
  return list.map(raw => {
    const id = Number(raw && raw.id);
    const jog = jogadores.find(j => j.id === id);
    if (!jog) throw badRequest('Jogador inválido nas estatísticas.');
    if (seen.has(id)) throw badRequest('Jogador repetido nas estatísticas.');
    seen.add(id);
    const out = { id, jogou: raw.jogou !== false };
    for (const k of BOX_KEYS) {
      const n = raw[k] === undefined || raw[k] === '' || raw[k] === null ? 0 : Number(raw[k]);
      if (!Number.isInteger(n) || n < 0 || n > 200) throw badRequest(`Valor inválido em ${k.toUpperCase()} de ${jog.nome}.`);
      out[k] = n;
    }
    // compatibilidade: súmulas antigas só tinham "tpt" (bolas de 3 certas)
    if (!out.p3m && Number(raw.tpt) > 0) out.p3m = Math.min(200, Math.floor(Number(raw.tpt)) || 0);
    for (const [m, a, nome] of SHOT_PAIRS) {
      if (out[a] > 0 && out[m] > out[a]) throw badRequest(`${jog.nome}: ${nome} certos maiores que tentados.`);
      if (out[a] < out[m]) out[a] = out[m]; // só os certos foram informados
    }
    out.tpt = out.p3m;
    return out;
  });
}

// Linhas de súmula de um jogador (só jogos em que ele jogou).
function boxLinhas(jogos, id) {
  const out = [];
  for (const g of jogos) {
    if (!Array.isArray(g.statsJogadores)) continue;
    const s = g.statsJogadores.find(x => x.id === id);
    if (s && s.jogou !== false) out.push(s);
  }
  return out;
}

function somar(linhas) {
  const t = Object.fromEntries(BOX_KEYS.map(k => [k, 0]));
  for (const s of linhas) {
    for (const k of BOX_KEYS) t[k] += Number(s[k]) || 0;
    if (!s.p3m && s.tpt) t.p3m += Number(s.tpt) || 0; // súmula antiga
  }
  return t;
}

// Antes desta versão as médias eram guardadas sem a súmula de cada jogo.
// Na primeira vez, separa essa parte antiga ("base") para não perder os números.
function garantirBase(jogadores, jogos) {
  for (const p of jogadores) {
    if (p.statsBase !== undefined) continue;
    const linhas = boxLinhas(jogos, p.id);
    const jg = Number(p.jg) || 0;
    const jgAntigos = jg - linhas.length;
    if (jgAntigos <= 0) { p.statsBase = null; continue; }
    const t = somar(linhas);
    const resto = (campo, k) => Math.max(0, Math.round((Number(p[campo]) || 0) * jg - t[k]));
    p.statsBase = { jg: jgAntigos, pts: resto('pts', 'pts'), reb: resto('reb', 'reb'), ast: resto('ast', 'ast'), flt: resto('flt', 'flt'), p3m: resto('tpt', 'p3m') };
  }
}

const r1 = n => Math.round(n * 10) / 10;

// Recalcula médias e totais de todos a partir das súmulas + base antiga.
function recalcular(jogadores, jogos) {
  for (const p of jogadores) {
    const linhas = boxLinhas(jogos, p.id);
    const t = somar(linhas), b = p.statsBase || null;
    const jg = linhas.length + (b ? b.jg : 0);
    const tot = { ...t };
    if (b) ['pts', 'reb', 'ast', 'flt', 'p3m'].forEach(k => { tot[k] += b[k] || 0; });
    const avg = (v, d) => (d ? r1(v / d) : 0);
    Object.assign(p, {
      jg, jgSumula: linhas.length, tot,
      pts: avg(tot.pts, jg), reb: avg(tot.reb, jg), ast: avg(tot.ast, jg), flt: avg(tot.flt, jg), tpt: avg(tot.p3m, jg),
      // roubos e tocos só existem nas súmulas novas
      stl: avg(t.stl, linhas.length), blk: avg(t.blk, linhas.length),
    });
  }
}

function pickGame(body) {
  const out = {};
  for (const [k, max] of Object.entries(GAME_FIELDS)) {
    if (body[k] === undefined) continue;
    const v = body[k] === null ? '' : String(body[k]).trim();
    if (v.length > max) throw badRequest(`Campo "${k}" muito longo.`);
    out[k] = v;
  }
  return out;
}

function score(v) {
  if (v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 300) throw badRequest('Placar inválido.');
  return n;
}

module.exports = withErrorHandling(async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao', 'atleta']);
    if (!user) return;
    const jogos = await getData('jogos') || [];
    return res.json(jogos);
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    let f;
    try { f = pickGame(req.body || {}); } catch (e) { return res.status(400).json({ error: e.message }); }
    if (!f.adv || !f.data) return res.status(400).json({ error: 'Adversário e data são obrigatórios' });
    const jogos = await getData('jogos') || [];
    const counters = await getData('counters') || {};
    counters.jogos = (counters.jogos || 0) + 1;
    const novo = { id: counters.jogos, adv: f.adv, data: f.data, hora: f.hora || '19:00', local: f.local || '', camp: f.camp || 'Amistoso', wr: null, advPl: null };
    jogos.push(novo);
    await setData('jogos', jogos);
    await setData('counters', counters);
    await registrarNovo(`jogo:${novo.id}`, `WR × ${novo.adv}`, novo, user);
    await logAction(user.id, user.nome, user.role, 'Cadastrou jogo', `vs ${f.adv} — ${f.data} (${novo.camp})`);
    return res.status(201).json(novo);
  }

  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao']);
    if (!user) return;
    const body = req.body || {};
    const id = Number(body.id);
    const jogos = await getData('jogos') || [];
    const idx = jogos.findIndex(j => j.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Jogo não encontrado' });
    const hasStats = Array.isArray(body.statsJogadores);

    let f, wr, advPl, box, jogadores;
    try {
      f = pickGame(body);
      if (f.adv === '' || f.data === '') throw badRequest('Adversário e data são obrigatórios');
      if (body.wr !== undefined) wr = score(body.wr);
      if (body.advPl !== undefined) advPl = score(body.advPl);
      if (hasStats) {
        jogadores = await getData('jogadores') || [];
        box = cleanBox(body.statsJogadores, jogadores);
      }
    } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }

    if (hasStats) garantirBase(jogadores, jogos); // com as súmulas de antes da mudança
    const jogo = { ...jogos[idx], ...f };
    if (wr !== undefined) jogo.wr = wr;
    if (advPl !== undefined) jogo.advPl = advPl;
    if (hasStats) jogo.statsJogadores = box;
    const antes = jogos[idx];
    jogos[idx] = jogo;
    await setData('jogos', jogos);
    if (jogo.wr === null || jogo.wr === undefined) await registrarAlteracao(`jogo:${jogo.id}`, `WR × ${jogo.adv}`, antes, jogo, user);

    if (hasStats) {
      recalcular(jogadores, jogos);
      await setData('jogadores', jogadores);
      await logAction(user.id, user.nome, user.role, 'Registrou resultado', `vs ${jogo.adv}: WR ${jogo.wr} × ${jogo.advPl}`);
    } else {
      await logAction(user.id, user.nome, user.role, 'Editou jogo', `vs ${jogo.adv} (${jogo.data})`);
    }
    return res.json(jogo);
  }

  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const id = Number((req.body || {}).id);
    const jogos = await getData('jogos') || [];
    const target = jogos.find(j => j.id === id);
    const restantes = jogos.filter(j => j.id !== id);
    // se o jogo tinha súmula, os números dele saem das médias
    if (target && Array.isArray(target.statsJogadores) && target.statsJogadores.length) {
      const jogadores = await getData('jogadores') || [];
      garantirBase(jogadores, jogos);
      recalcular(jogadores, restantes);
      await setData('jogadores', jogadores);
    }
    await setData('jogos', restantes);
    if (target && (target.wr === null || target.wr === undefined)) await registrarCancelamento(`jogo:${target.id}`, `WR × ${target.adv}`, target, user);
    await logAction(user.id, user.nome, user.role, 'Excluiu jogo', `vs ${target?.adv || `ID ${id}`} (${target?.data || ''})`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
