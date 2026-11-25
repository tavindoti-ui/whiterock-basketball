// Departamento médico: lesões e afastamentos, atendimentos, recuperação e liberação.
// /api/modulos?r=medico
//   GET                                  → casos (atleta recebe só os próprios)
//   POST   { acao:'caso', ... }          → abre um caso (o jogador passa a "Lesão")
//   PUT    { acao:'caso', id, ... }      → edita o caso
//   POST   { acao:'atendimento', casoId, ... } → registra atendimento
//   DELETE { acao:'atendimento', casoId, atendimentoId }
//   PUT    { acao:'liberar', id, data, obs } → libera para jogos (jogador volta a "Ativo")
//   DELETE { acao:'caso', id }           → exclui um caso registrado por engano (admin)
const { requireAuth } = require('../auth');
const { getData, setData, logAction } = require('../db');
const { trackInjury } = require('../lesoes');

const ALL = ['admin', 'tecnico', 'comissao', 'capitao', 'atleta'];
const MED = ['admin', 'tecnico', 'comissao', 'capitao'];
const KEY = 'medico-casos';
const TIPOS = ['Lesão', 'Doença', 'Cirurgia', 'Outro afastamento'];
const GRAVIDADES = ['Leve', 'Moderada', 'Grave'];
const FASES = ['Em tratamento', 'Em recuperação', 'Liberado'];
const TIPOS_AT = ['Avaliação', 'Fisioterapia', 'Consulta médica', 'Exame', 'Treino adaptado', 'Retorno'];
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function hoje() { return new Date().toISOString().split('T')[0]; }
function erro(msg, status = 400) { return Object.assign(new Error(msg), { status }); }

function texto(v, max, nome) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (s.length > max) throw erro(`${nome} muito longo (máx. ${max} caracteres).`);
  return s;
}
function data(v, nome, obrigatoria) {
  const s = texto(v, 10, nome);
  if (!s) { if (obrigatoria) throw erro(`${nome} é obrigatória.`); return ''; }
  if (!DATA_RE.test(s)) throw erro(`${nome} inválida.`);
  return s;
}

function pickCaso(b, parcial) {
  const out = {};
  const has = k => b[k] !== undefined;
  if (!parcial || has('tipo')) { out.tipo = TIPOS.includes(b.tipo) ? b.tipo : 'Lesão'; }
  if (!parcial || has('gravidade')) { out.gravidade = GRAVIDADES.includes(b.gravidade) ? b.gravidade : 'Leve'; }
  if (!parcial || has('regiao')) out.regiao = texto(b.regiao, 40, 'Região');
  if (!parcial || has('descricao')) out.descricao = texto(b.descricao, 300, 'Descrição');
  if (!parcial || has('inicio')) out.inicio = data(b.inicio || (!parcial ? hoje() : ''), 'Data de início', true);
  if (!parcial || has('previsao')) out.previsao = data(b.previsao, 'Previsão de retorno', false);
  if (has('fase')) {
    if (!['Em tratamento', 'Em recuperação'].includes(b.fase)) throw erro('Fase inválida.');
    out.fase = b.fase;
  }
  if (out.previsao && out.inicio && out.previsao < out.inicio) throw erro('A previsão de retorno não pode ser antes do início.');
  return out;
}

function jogadorDoUsuario(user, jogadores) {
  if (user.num === undefined || user.num === null || user.num === '') return null;
  return jogadores.find(j => Number(j.num) === Number(user.num)) || null;
}

// Coloca o jogador como "Lesão" (ou volta a "Ativo") e mantém o histórico de lesões do cadastro.
function sincronizarJogador(jogadores, casos, jogadorId, dia) {
  const idx = jogadores.findIndex(j => j.id === jogadorId);
  if (idx === -1) return;
  const prev = jogadores[idx];
  const abertos = casos.filter(c => c.jogadorId === jogadorId && c.status !== 'Liberado')
    .sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
  let next;
  if (abertos.length) {
    const c = abertos[0];
    const obs = [c.regiao, c.descricao].filter(Boolean).join(' — ') || c.tipo;
    next = { ...prev, status: 'Lesão', obs: obs.slice(0, 300) };
  } else if (prev.status === 'Lesão') {
    next = { ...prev, status: 'Ativo', obs: '' };
  } else return;
  next.lesoes = trackInjury(prev, next, dia);
  jogadores[idx] = next;
}

module.exports = async function medico(req, res) {
  const b = req.body || {};

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ALL);
    if (!user) return;
    const casos = await getData(KEY) || [];
    if (MED.includes(user.role)) return res.json(casos);
    const eu = jogadorDoUsuario(user, await getData('jogadores') || []);
    return res.json(eu ? casos.filter(c => c.jogadorId === eu.id) : []);
  }

  const user = requireAuth(req, res, MED);
  if (!user) return;
  try {
    const casos = await getData(KEY) || [];
    const jogadores = await getData('jogadores') || [];
    const achar = id => { const c = casos.find(x => x.id === Number(id)); if (!c) throw erro('Caso não encontrado.', 404); return c; };
    const nomeJog = id => (jogadores.find(j => j.id === id) || {}).nome || `#${id}`;
    const salvar = async (jogadorId, dia) => {
      sincronizarJogador(jogadores, casos, jogadorId, dia);
      await setData(KEY, casos);
      await setData('jogadores', jogadores);
    };

    if (b.acao === 'caso' && req.method === 'POST') {
      const jogadorId = Number(b.jogadorId);
      if (!jogadores.some(j => j.id === jogadorId)) throw erro('Jogador não encontrado.');
      const f = pickCaso(b, false);
      const counters = await getData('counters') || {};
      counters.medico = (counters.medico || 0) + 1;
      const caso = { id: counters.medico, jogadorId, ...f, fase: 'Em tratamento', status: 'Em tratamento', fim: null, atendimentos: [], criadoEm: new Date().toISOString(), criadoPor: user.nome };
      caso.status = caso.fase;
      casos.push(caso);
      await setData('counters', counters);
      await salvar(jogadorId, caso.inicio);
      await logAction(user.id, user.nome, user.role, 'Abriu caso médico', `${nomeJog(jogadorId)} — ${caso.tipo}${caso.regiao ? ' (' + caso.regiao + ')' : ''}`);
      return res.status(201).json({ caso, jogador: jogadores.find(j => j.id === jogadorId) });
    }

    if (b.acao === 'caso' && req.method === 'PUT') {
      const c = achar(b.id);
      const f = pickCaso({ ...b }, true);
      if (c.status === 'Liberado') delete f.fase;
      if (f.previsao && (f.inicio || c.inicio) > f.previsao) throw erro('A previsão de retorno não pode ser antes do início.');
      Object.assign(c, f);
      if (f.fase) c.status = f.fase;
      await salvar(c.jogadorId);
      await logAction(user.id, user.nome, user.role, 'Editou caso médico', `${nomeJog(c.jogadorId)} — ${c.tipo}`);
      return res.json({ caso: c, jogador: jogadores.find(j => j.id === c.jogadorId) });
    }

    if (b.acao === 'caso' && req.method === 'DELETE') {
      if (user.role !== 'admin') throw erro('Só o administrador pode excluir um caso.', 403);
      const c = achar(b.id);
      casos.splice(casos.indexOf(c), 1);
      await salvar(c.jogadorId);
      await logAction(user.id, user.nome, user.role, 'Excluiu caso médico', `${nomeJog(c.jogadorId)} — ${c.tipo}`);
      return res.json({ success: true, jogador: jogadores.find(j => j.id === c.jogadorId) });
    }

    if (b.acao === 'atendimento' && req.method === 'POST') {
      const c = achar(b.casoId);
      const progresso = b.progresso === undefined || b.progresso === '' ? null : Number(b.progresso);
      if (progresso !== null && (!Number.isFinite(progresso) || progresso < 0 || progresso > 100)) throw erro('Progresso deve ser de 0 a 100.');
      const at = {
        id: (c.atendimentos.reduce((m, a) => Math.max(m, a.id), 0) || 0) + 1,
        data: data(b.data || hoje(), 'Data do atendimento', true),
        tipo: TIPOS_AT.includes(b.tipo) ? b.tipo : 'Avaliação',
        profissional: texto(b.profissional, 80, 'Profissional'),
        nota: texto(b.nota, 600, 'Anotação'),
        progresso: progresso === null ? null : Math.round(progresso),
        por: user.nome,
      };
      c.atendimentos.push(at);
      c.atendimentos.sort((x, y) => x.data.localeCompare(y.data) || x.id - y.id);
      if (c.status !== 'Liberado' && ['Em tratamento', 'Em recuperação'].includes(b.fase)) { c.fase = b.fase; c.status = b.fase; }
      await setData(KEY, casos);
      await logAction(user.id, user.nome, user.role, 'Registrou atendimento', `${nomeJog(c.jogadorId)} — ${at.tipo}`);
      return res.status(201).json({ caso: c });
    }

    if (b.acao === 'atendimento' && req.method === 'DELETE') {
      const c = achar(b.casoId);
      const n = c.atendimentos.length;
      c.atendimentos = c.atendimentos.filter(a => a.id !== Number(b.atendimentoId));
      if (c.atendimentos.length === n) throw erro('Atendimento não encontrado.', 404);
      await setData(KEY, casos);
      return res.json({ caso: c });
    }

    if (b.acao === 'liberar' && req.method === 'PUT') {
      const c = achar(b.id);
      if (c.status === 'Liberado') throw erro('Este caso já foi liberado.');
      const dia = data(b.data || hoje(), 'Data da liberação', true);
      if (dia < c.inicio) throw erro('A liberação não pode ser antes do início do afastamento.');
      Object.assign(c, { status: 'Liberado', fase: 'Liberado', fim: dia, liberadoPor: user.nome, obsLiberacao: texto(b.obs, 300, 'Observação') });
      await salvar(c.jogadorId, dia);
      await logAction(user.id, user.nome, user.role, 'Liberou para jogos', `${nomeJog(c.jogadorId)} — ${c.tipo}`);
      return res.json({ caso: c, jogador: jogadores.find(j => j.id === c.jogadorId) });
    }

    throw erro('Ação inválida.', 405);
  } catch (e) {
    if (!e.status) throw e;
    return res.status(e.status).json({ error: e.message });
  }
};

module.exports.FASES = FASES;
