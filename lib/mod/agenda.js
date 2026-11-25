// Calendário integrado: eventos, convocações e confirmação de presença.
// Rotas (todas em /api/modulos?r=agenda):
//   GET                              → { eventos, convocacoes, confirmacoes, alteracoes }
//   POST   { acao:'evento', ... }    → cria evento (comissão)
//   PUT    { acao:'evento', id, ...} → edita evento (comissão)
//   DELETE { acao:'evento', id }     → exclui evento (comissão)
//   PUT    { acao:'convocar', ref, jogadores:[ids] }      → define os convocados (comissão)
//   PUT    { acao:'confirmar', ref, status, motivo, jogadorId? } → atleta confirma a própria presença;
//                                                              a comissão pode marcar por qualquer um
const { requireAuth } = require('../auth');
const { getData, setData, logAction } = require('../db');
const { registrarAlteracao, registrarCancelamento, registrarNovo, KEY: ALT_KEY } = require('../alteracoes');

const ALL = ['admin', 'tecnico', 'comissao', 'capitao', 'atleta'];
const STAFF = ['admin', 'tecnico', 'capitao'];
const CONVOCA = ['admin', 'tecnico', 'comissao', 'capitao'];
const TIPOS_EVENTO = ['Evento', 'Reunião', 'Viagem', 'Confraternização', 'Avaliação física', 'Outro'];
const STATUS = ['sim', 'talvez', 'nao'];
const K = { eventos: 'eventos', conv: 'agenda-convocacoes', conf: 'agenda-confirmacoes' };

function bad(res, msg, code = 400) { res.status(code).json({ error: msg }); }
function hoje() { return new Date().toISOString().split('T')[0]; }

function pickEvento(body) {
  const out = {};
  const lim = { titulo: 80, tipo: 30, data: 10, hora: 5, local: 120, desc: 1000 };
  for (const [k, max] of Object.entries(lim)) {
    if (body[k] === undefined) continue;
    const v = body[k] === null ? '' : String(body[k]).trim();
    if (v.length > max) throw new Error(`Campo "${k}" muito longo (máx. ${max}).`);
    out[k] = v;
  }
  if (out.data !== undefined && out.data && !/^\d{4}-\d{2}-\d{2}$/.test(out.data)) throw new Error('Data inválida.');
  if (out.hora !== undefined && out.hora && !/^\d{2}:\d{2}$/.test(out.hora)) throw new Error('Horário inválido.');
  if (out.tipo !== undefined && !TIPOS_EVENTO.includes(out.tipo)) out.tipo = 'Evento';
  return out;
}

// Acha o compromisso a partir da referência "tipo:id"
async function acharRef(ref) {
  const m = /^(jogo|treino|evento):(\d+)$/.exec(String(ref || ''));
  if (!m) return null;
  const key = m[1] === 'jogo' ? 'jogos' : m[1] === 'treino' ? 'treinos' : 'eventos';
  const item = (await getData(key) || []).find(x => x.id === Number(m[2]));
  return item ? { tipo: m[1], id: Number(m[2]), item } : null;
}

function jogadorDoUsuario(user, jogadores) {
  if (user.num === undefined || user.num === null || user.num === '') return null;
  return jogadores.find(j => Number(j.num) === Number(user.num) && j.status !== 'Inativo') || null;
}

module.exports = async function agenda(req, res) {
  const body = req.body || {};

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ALL);
    if (!user) return;
    const [eventos, convocacoes, confirmacoes, alteracoes] = await Promise.all([
      getData(K.eventos), getData(K.conv), getData(K.conf), getData(ALT_KEY),
    ]);
    let conf = confirmacoes || {};
    if (user.role === 'atleta') {
      // atleta vê quem confirmou, mas não o motivo da ausência dos colegas
      const jogadores = await getData('jogadores') || [];
      const eu = jogadorDoUsuario(user, jogadores);
      conf = Object.fromEntries(Object.entries(conf).map(([ref, porJog]) => [ref,
        Object.fromEntries(Object.entries(porJog).map(([jid, c]) => [jid, eu && Number(jid) === eu.id ? c : { status: c.status, em: c.em }]))]));
    }
    return res.json({ eventos: eventos || [], convocacoes: convocacoes || {}, confirmacoes: conf, alteracoes: (alteracoes || []).slice(0, 100) });
  }

  // ── Eventos
  if (body.acao === 'evento') {
    const user = requireAuth(req, res, STAFF);
    if (!user) return;
    let f;
    try { f = pickEvento(body); } catch (e) { return bad(res, e.message); }
    const eventos = await getData(K.eventos) || [];

    if (req.method === 'POST') {
      if (!f.titulo || !f.data) return bad(res, 'Título e data são obrigatórios.');
      const counters = await getData('counters') || {};
      counters.eventos = (counters.eventos || 0) + 1;
      const novo = { id: counters.eventos, titulo: f.titulo, tipo: f.tipo || 'Evento', data: f.data, hora: f.hora || '', local: f.local || '', desc: f.desc || '', criadoEm: new Date().toISOString(), autor: user.nome };
      eventos.push(novo);
      await setData(K.eventos, eventos);
      await setData('counters', counters);
      await registrarNovo(`evento:${novo.id}`, novo.titulo, novo, user);
      await logAction(user.id, user.nome, user.role, 'Criou evento', `${novo.titulo} — ${novo.data}`);
      return res.status(201).json(novo);
    }
    const idx = eventos.findIndex(e => e.id === Number(body.id));
    if (idx === -1) return bad(res, 'Evento não encontrado.', 404);
    if (req.method === 'PUT') {
      if (f.titulo === '' || f.data === '') return bad(res, 'Título e data são obrigatórios.');
      const antes = eventos[idx];
      const depois = { ...antes, ...f, alteradoEm: new Date().toISOString() };
      eventos[idx] = depois;
      await setData(K.eventos, eventos);
      await registrarAlteracao(`evento:${depois.id}`, depois.titulo, antes, depois, user);
      await logAction(user.id, user.nome, user.role, 'Editou evento', `${depois.titulo} — ${depois.data}`);
      return res.json(depois);
    }
    if (req.method === 'DELETE') {
      const alvo = eventos[idx];
      await setData(K.eventos, eventos.filter((_, i) => i !== idx));
      await registrarCancelamento(`evento:${alvo.id}`, alvo.titulo, alvo, user);
      // limpa convocação/confirmações do evento
      const ref = `evento:${alvo.id}`;
      const [conv, conf] = await Promise.all([getData(K.conv), getData(K.conf)]);
      if (conv && conv[ref]) { delete conv[ref]; await setData(K.conv, conv); }
      if (conf && conf[ref]) { delete conf[ref]; await setData(K.conf, conf); }
      await logAction(user.id, user.nome, user.role, 'Excluiu evento', `${alvo.titulo} — ${alvo.data}`);
      return res.json({ success: true });
    }
  }

  // ── Convocação
  if (req.method === 'PUT' && body.acao === 'convocar') {
    const user = requireAuth(req, res, CONVOCA);
    if (!user) return;
    const alvo = await acharRef(body.ref);
    if (!alvo) return bad(res, 'Compromisso não encontrado.', 404);
    if (!Array.isArray(body.jogadores)) return bad(res, 'Lista de jogadores inválida.');
    const jogadores = await getData('jogadores') || [];
    const ids = [...new Set(body.jogadores.map(Number))];
    if (ids.some(id => !jogadores.some(j => j.id === id))) return bad(res, 'Jogador inválido na convocação.');
    const conv = await getData(K.conv) || {};
    const antes = conv[body.ref] || null;
    if (ids.length) conv[body.ref] = { jogadores: ids, em: new Date().toISOString(), por: user.nome };
    else delete conv[body.ref];
    await setData(K.conv, conv);
    const novos = ids.filter(id => !(antes && antes.jogadores.includes(id)));
    await logAction(user.id, user.nome, user.role, 'Convocação', `${body.ref}: ${ids.length} convocado(s)`);
    return res.json({ success: true, convocacao: conv[body.ref] || null, novos });
  }

  // ── Confirmação de presença
  if (req.method === 'PUT' && body.acao === 'confirmar') {
    const user = requireAuth(req, res, ALL);
    if (!user) return;
    const alvo = await acharRef(body.ref);
    if (!alvo) return bad(res, 'Compromisso não encontrado.', 404);
    const status = body.status === null || body.status === '' ? null : String(body.status);
    if (status !== null && !STATUS.includes(status)) return bad(res, 'Resposta inválida.');
    const motivo = String(body.motivo || '').trim().slice(0, 200);
    const jogadores = await getData('jogadores') || [];
    const isStaff = CONVOCA.includes(user.role);
    let jogadorId;
    if (body.jogadorId !== undefined && body.jogadorId !== null) {
      jogadorId = Number(body.jogadorId);
      const eu = jogadorDoUsuario(user, jogadores);
      if (!isStaff && (!eu || eu.id !== jogadorId)) return bad(res, 'Você só pode confirmar a sua própria presença.', 403);
    } else {
      const eu = jogadorDoUsuario(user, jogadores);
      if (!eu) return bad(res, 'Seu usuário não está ligado a um jogador do elenco.', 403);
      jogadorId = eu.id;
    }
    if (!jogadores.some(j => j.id === jogadorId)) return bad(res, 'Jogador não encontrado.', 404);
    if (!isStaff && (alvo.item.data || '') < hoje()) return bad(res, 'Esse compromisso já passou.');

    const conf = await getData(K.conf) || {};
    conf[body.ref] = conf[body.ref] || {};
    if (status === null) delete conf[body.ref][jogadorId];
    else conf[body.ref][jogadorId] = { status, motivo: status === 'sim' ? '' : motivo, em: new Date().toISOString(), por: user.nome };
    await setData(K.conf, conf);
    return res.json({ success: true, confirmacoes: conf[body.ref] });
  }

  return bad(res, 'Ação inválida.', 405);
};
