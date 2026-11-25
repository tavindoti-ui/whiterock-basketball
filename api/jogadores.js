const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');
const { withErrorHandling } = require('../lib/error-handler');

const STAFF = ['admin', 'tecnico', 'capitao'];
const ALL = ['admin', 'tecnico', 'comissao', 'capitao', 'atleta'];

// Campos que o cadastro/edição pode gravar, com tamanho máximo de texto.
// (Estatísticas e presença são calculadas em jogos.js / treinos.js.)
const TEXT_FIELDS = {
  nome: 120, apelido: 40, pos: 20, dataNasc: 10, naturalidade: 80, rg: 30, cpf: 20,
  status: 20, tel: 30, obs: 300, endereco: 120, numero: 20, bairro: 80, cidade: 80, cep: 15,
  historico: 3000, emergencia: 120, maoDominante: 15,
};
const NUM_FIELDS = ['num', 'altura', 'peso', 'envergadura'];
const STATUS_VALIDOS = ['Ativo', 'Lesão', 'Suspenso', 'Inativo'];

// Dados pessoais que um atleta não vê dos colegas (só do próprio cadastro).
const PRIVATE_FIELDS = ['rg', 'cpf', 'tel', 'endereco', 'numero', 'bairro', 'cep', 'emergencia', 'dataNasc'];

// Fotos ficam numa chave separada para não pesar a lista de jogadores.
const FOTOS_KEY = 'fotos-jogadores';
const FOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const FOTO_MAX = 200 * 1024; // ~200 KB por foto (o app reduz para ~15 KB antes de enviar)

function badRequest(msg) { return Object.assign(new Error(msg), { status: 400 }); }

function pickFields(body) {
  const out = {};
  for (const [k, max] of Object.entries(TEXT_FIELDS)) {
    if (body[k] === undefined) continue;
    const v = body[k] === null ? '' : String(body[k]).trim();
    if (v.length > max) throw badRequest(`Campo "${k}" muito longo (máx. ${max} caracteres).`);
    out[k] = v;
  }
  for (const k of NUM_FIELDS) {
    if (body[k] === undefined) continue;
    const n = body[k] === '' || body[k] === null ? 0 : Number(body[k]);
    if (!Number.isFinite(n) || n < 0 || n > 999) throw badRequest(`Valor inválido em "${k}".`);
    out[k] = n;
  }
  if (out.status !== undefined && !STATUS_VALIDOS.includes(out.status)) throw badRequest('Status inválido.');
  return out;
}

// Mantém o histórico de lesões automaticamente quando o status muda.
function trackInjury(prev, next) {
  const hoje = new Date().toISOString().split('T')[0];
  const lesoes = Array.isArray(prev.lesoes) ? prev.lesoes.map(l => ({ ...l })) : [];
  const aberta = lesoes.find(l => !l.fim);
  if (next.status === 'Lesão') {
    if (!aberta) lesoes.push({ inicio: hoje, descricao: next.obs || 'Lesão', fim: null });
    else if (next.obs && next.obs !== aberta.descricao) aberta.descricao = next.obs;
  } else if (aberta) {
    aberta.fim = hoje;
  }
  return lesoes;
}

function isOwnRecord(user, j) {
  return user.num !== undefined && user.num !== null && user.num !== '' && Number(user.num) === Number(j.num);
}

module.exports = withErrorHandling(async function handler(req, res) {
  if (cors(req, res)) return;

  // GET - todos leem; atleta não recebe documentos/endereço/contato dos colegas
  if (req.method === 'GET') {
    const user = requireAuth(req, res, ALL);
    if (!user) return;
    if ((req.query || {}).fotos) {
      return res.json(await getData(FOTOS_KEY) || {});
    }
    const jogadores = await getData('jogadores') || [];
    if (user.role !== 'atleta') return res.json(jogadores);
    return res.json(jogadores.map(j => {
      if (isOwnRecord(user, j)) return j;
      const copy = { ...j };
      PRIVATE_FIELDS.forEach(k => { delete copy[k]; });
      return copy;
    }));
  }

  // POST - admin, tecnico e capitao
  if (req.method === 'POST') {
    const user = requireAuth(req, res, STAFF);
    if (!user) return;
    let fields;
    try { fields = pickFields(req.body || {}); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    if (!fields.nome) return res.status(400).json({ error: 'Nome obrigatório' });
    const jogadores = await getData('jogadores') || [];
    const counters = await getData('counters') || {};
    counters.jogadores = (counters.jogadores || 0) + 1;
    const base = {
      apelido: '', num: 0, pos: 'Armador', idade: 0, dataNasc: '', naturalidade: '', rg: '', cpf: '',
      altura: 0, peso: 0, envergadura: 0, maoDominante: '', status: 'Ativo', tel: '', obs: '',
      endereco: '', numero: '', bairro: '', cidade: '', cep: '', historico: '', emergencia: '',
      pts: 0, ast: 0, reb: 0, tpt: 0, flt: 0, jg: 0, presenca: 100,
    };
    // criadoEm: treinos anteriores ao cadastro não contam como falta
    const novo = { ...base, ...fields, id: counters.jogadores, criadoEm: new Date().toISOString().split('T')[0] };
    novo.lesoes = trackInjury({ lesoes: [] }, novo);
    jogadores.push(novo);
    await setData('jogadores', jogadores);
    await setData('counters', counters);
    await logAction(user.id, user.nome, user.role, 'Cadastrou jogador', `${novo.nome}${novo.apelido ? ` (${novo.apelido})` : ''} — #${novo.num} ${novo.pos}`);
    return res.status(201).json(novo);
  }

  // PUT - admin, tecnico e capitao. Com { id, foto } troca (ou remove, foto: null) só a foto.
  if (req.method === 'PUT') {
    const user = requireAuth(req, res, STAFF);
    if (!user) return;
    const body = req.body || {};
    const id = Number(body.id);
    const jogadores = await getData('jogadores') || [];
    const idx = jogadores.findIndex(j => j.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Jogador não encontrado' });

    if (body.foto !== undefined) {
      const fotos = await getData(FOTOS_KEY) || {};
      if (!body.foto) {
        delete fotos[id];
      } else {
        const foto = String(body.foto);
        if (foto.length > FOTO_MAX || !FOTO_RE.test(foto)) {
          return res.status(400).json({ error: 'Foto inválida ou grande demais.' });
        }
        fotos[id] = foto;
      }
      await setData(FOTOS_KEY, fotos);
      await logAction(user.id, user.nome, user.role, body.foto ? 'Atualizou foto do jogador' : 'Removeu foto do jogador', jogadores[idx].nome);
      return res.json({ success: true, id });
    }

    let fields;
    try { fields = pickFields(body); } catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    if (fields.nome === '') return res.status(400).json({ error: 'Nome obrigatório' });
    const prev = jogadores[idx];
    const next = { ...prev, ...fields };
    next.lesoes = trackInjury(prev, next);
    jogadores[idx] = next;
    await setData('jogadores', jogadores);
    await logAction(user.id, user.nome, user.role, 'Editou jogador', `${next.nome} (#${next.num})`);
    return res.json(next);
  }

  // DELETE - admin
  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const id = Number((req.body || {}).id);
    const jogadores = await getData('jogadores') || [];
    const target = jogadores.find(j => j.id === id);
    await setData('jogadores', jogadores.filter(j => j.id !== id));
    const fotos = await getData(FOTOS_KEY) || {};
    if (fotos[id]) { delete fotos[id]; await setData(FOTOS_KEY, fotos); }
    await logAction(user.id, user.nome, user.role, 'Excluiu jogador', `${target?.nome || `ID ${id}`}`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
