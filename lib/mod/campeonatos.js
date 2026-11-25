// Gestão de campeonatos: cadastro, equipes, resultados entre outras equipes (para a tabela).
// Os jogos do White Rock continuam em /api/jogos e entram no campeonato pelo nome (campo "camp").
// /api/modulos?r=campeonatos
//   GET                                   → lista de campeonatos
//   POST   { acao:'camp', ... }           → cria
//   PUT    { acao:'camp', id, ... }       → edita (renomear atualiza os jogos do campeonato)
//   DELETE { acao:'camp', id }            → exclui (os jogos continuam, só perdem o cadastro)
//   POST   { acao:'resultado', campId, data, casa, fora, pc, pf } → jogo entre outras equipes
//   DELETE { acao:'resultado', campId, resultadoId }
const { requireAuth } = require('../auth');
const { getData, setData, logAction } = require('../db');

const ALL = ['admin', 'tecnico', 'comissao', 'capitao', 'atleta'];
const STAFF = ['admin', 'tecnico', 'capitao'];
const KEY = 'campeonatos';
const FORMATOS = ['Pontos corridos', 'Grupos + mata-mata', 'Mata-mata', 'Torneio / festival', 'Amistosos'];
const STATUS = ['Previsto', 'Em andamento', 'Encerrado'];
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const WR = 'White Rock';

function erro(msg, status = 400) { return Object.assign(new Error(msg), { status }); }
function txt(v, max, nome) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (s.length > max) throw erro(`${nome} muito longo (máx. ${max} caracteres).`);
  return s;
}
function dt(v, nome) {
  const s = txt(v, 10, nome);
  if (s && !DATA_RE.test(s)) throw erro(`${nome} inválida.`);
  return s;
}
function int(v, nome, min, max) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw erro(`${nome} inválido.`);
  return n;
}
const norm = s => String(s || '').trim().toLowerCase();

function pickCamp(b, parcial) {
  const out = {};
  const has = k => b[k] !== undefined;
  if (!parcial || has('nome')) { out.nome = txt(b.nome, 80, 'Nome'); if (!out.nome) throw erro('Informe o nome do campeonato.'); }
  if (!parcial || has('temporada')) out.temporada = int(b.temporada, 'Temporada', 1990, 2100) || new Date().getFullYear();
  if (!parcial || has('formato')) out.formato = FORMATOS.includes(b.formato) ? b.formato : 'Pontos corridos';
  if (!parcial || has('status')) out.status = STATUS.includes(b.status) ? b.status : 'Em andamento';
  if (!parcial || has('inicio')) out.inicio = dt(b.inicio, 'Data de início');
  if (!parcial || has('fim')) out.fim = dt(b.fim, 'Data de término');
  if (!parcial || has('organizador')) out.organizador = txt(b.organizador, 80, 'Organizador');
  if (!parcial || has('categoria')) out.categoria = txt(b.categoria, 40, 'Categoria');
  if (!parcial || has('colocacao')) out.colocacao = txt(b.colocacao, 60, 'Colocação final');
  if (!parcial || has('obs')) out.obs = txt(b.obs, 500, 'Observações');
  if (!parcial || has('pontosVitoria')) out.pontosVitoria = int(b.pontosVitoria, 'Pontos por vitória', 0, 10) ?? 2;
  if (!parcial || has('pontosDerrota')) out.pontosDerrota = int(b.pontosDerrota, 'Pontos por derrota', 0, 10) ?? 1;
  if (!parcial || has('equipes')) {
    const lista = Array.isArray(b.equipes) ? b.equipes : String(b.equipes || '').split('\n');
    const vistos = new Set();
    out.equipes = lista.map(e => txt(e, 60, 'Nome de equipe')).filter(e => {
      const k = norm(e);
      if (!k || k === norm(WR) || vistos.has(k)) return false;
      vistos.add(k); return true;
    });
    if (out.equipes.length > 40) throw erro('No máximo 40 equipes.');
  }
  if (out.inicio && out.fim && out.fim < out.inicio) throw erro('O término não pode ser antes do início.');
  return out;
}

module.exports = async function campeonatos(req, res) {
  const b = req.body || {};
  if (req.method === 'GET') {
    const user = requireAuth(req, res, ALL);
    if (!user) return;
    return res.json(await getData(KEY) || []);
  }

  const user = requireAuth(req, res, STAFF);
  if (!user) return;
  try {
    const camps = await getData(KEY) || [];
    const achar = id => { const c = camps.find(x => x.id === Number(id)); if (!c) throw erro('Campeonato não encontrado.', 404); return c; };
    const nomeRepetido = (nome, temporada, id) => camps.some(c => c.id !== id && norm(c.nome) === norm(nome));

    if (b.acao === 'camp' && req.method === 'POST') {
      const f = pickCamp(b, false);
      if (nomeRepetido(f.nome, f.temporada)) throw erro('Já existe um campeonato com esse nome.');
      const counters = await getData('counters') || {};
      counters.campeonatos = (counters.campeonatos || 0) + 1;
      const novo = { id: counters.campeonatos, ...f, resultados: [], criadoEm: new Date().toISOString() };
      camps.push(novo);
      await setData(KEY, camps);
      await setData('counters', counters);
      await logAction(user.id, user.nome, user.role, 'Cadastrou campeonato', `${novo.nome} (${novo.temporada})`);
      return res.status(201).json(novo);
    }

    if (b.acao === 'camp' && req.method === 'PUT') {
      const c = achar(b.id);
      const f = pickCamp(b, true);
      if (f.nome && nomeRepetido(f.nome, f.temporada || c.temporada, c.id)) throw erro('Já existe um campeonato com esse nome.');
      const antigo = c.nome;
      Object.assign(c, f);
      if (f.inicio !== undefined || f.fim !== undefined) { if (c.inicio && c.fim && c.fim < c.inicio) throw erro('O término não pode ser antes do início.'); }
      await setData(KEY, camps);
      let renomeados = 0;
      if (f.nome && f.nome !== antigo) {
        const jogos = await getData('jogos') || [];
        jogos.forEach(j => { if (norm(j.camp) === norm(antigo)) { j.camp = f.nome; renomeados++; } });
        if (renomeados) await setData('jogos', jogos);
      }
      await logAction(user.id, user.nome, user.role, 'Editou campeonato', `${c.nome}${renomeados ? ` (${renomeados} jogo(s) renomeado(s))` : ''}`);
      return res.json({ ...c, renomeados });
    }

    if (b.acao === 'camp' && req.method === 'DELETE') {
      const c = achar(b.id);
      await setData(KEY, camps.filter(x => x.id !== c.id));
      await logAction(user.id, user.nome, user.role, 'Excluiu campeonato', c.nome);
      return res.json({ success: true });
    }

    if (b.acao === 'resultado' && req.method === 'POST') {
      const c = achar(b.campId);
      const casa = txt(b.casa, 60, 'Equipe da casa'), fora = txt(b.fora, 60, 'Equipe visitante');
      if (!casa || !fora) throw erro('Informe as duas equipes.');
      if (norm(casa) === norm(fora)) throw erro('As duas equipes precisam ser diferentes.');
      if (norm(casa) === norm(WR) || norm(fora) === norm(WR)) throw erro('Jogos do White Rock são lançados na página Jogos.');
      const pc = int(b.pc, 'Placar da casa', 0, 300), pf = int(b.pf, 'Placar do visitante', 0, 300);
      if (pc === null || pf === null) throw erro('Informe o placar.');
      const r = { id: (c.resultados || []).reduce((m, x) => Math.max(m, x.id), 0) + 1, data: dt(b.data, 'Data'), casa, fora, pc, pf, fase: txt(b.fase, 40, 'Fase') };
      c.resultados = [...(c.resultados || []), r];
      // equipes novas entram na lista do campeonato
      c.equipes = c.equipes || [];
      [casa, fora].forEach(e => { if (!c.equipes.some(x => norm(x) === norm(e))) c.equipes.push(e); });
      await setData(KEY, camps);
      await logAction(user.id, user.nome, user.role, 'Lançou resultado', `${c.nome}: ${casa} ${pc} × ${pf} ${fora}`);
      return res.status(201).json(c);
    }

    if (b.acao === 'resultado' && req.method === 'DELETE') {
      const c = achar(b.campId);
      const n = (c.resultados || []).length;
      c.resultados = (c.resultados || []).filter(r => r.id !== Number(b.resultadoId));
      if (c.resultados.length === n) throw erro('Resultado não encontrado.', 404);
      await setData(KEY, camps);
      return res.json(c);
    }

    throw erro('Ação inválida.', 405);
  } catch (e) {
    if (!e.status) throw e;
    return res.status(e.status).json({ error: e.message });
  }
};
