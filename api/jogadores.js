const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // GET - all roles can read
  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao', 'atleta']);
    if (!user) return;
    const jogadores = await getData('jogadores') || [];
    return res.json(jogadores);
  }

  // POST - admin, tecnico and capitao only
  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const { nome, apelido, num, pos, idade, altura, status, tel, obs } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    const jogadores = await getData('jogadores') || [];
    const counters = await getData('counters');
    counters.jogadores = (counters.jogadores || 0) + 1;
    const novo = { id: counters.jogadores, nome, apelido: apelido || '', num: num || 0, pos: pos || 'Armador', idade: idade || 0, altura: altura || 0, status: status || 'Ativo', tel: tel || '', obs: obs || '', pts: 0, ast: 0, reb: 0, tpt: 0, flt: 0, jg: 0, presenca: 100 };
    jogadores.push(novo);
    await setData('jogadores', jogadores);
    await setData('counters', counters);
    await logAction(user.id, user.nome, user.role, 'Cadastrou jogador', `${nome}${apelido ? ` (${apelido})` : ''} — #${num || 0} ${pos || ''}`);
    return res.status(201).json(novo);
  }

  // PUT - admin, tecnico and capitao only
  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const { id, ...updates } = req.body;
    const jogadores = await getData('jogadores') || [];
    const idx = jogadores.findIndex(j => j.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Jogador não encontrado' });
    const prev = jogadores[idx];
    jogadores[idx] = { ...prev, ...updates };
    await setData('jogadores', jogadores);
    await logAction(user.id, user.nome, user.role, 'Editou jogador', `${jogadores[idx].nome} (#${jogadores[idx].num})`);
    return res.json(jogadores[idx]);
  }

  // DELETE - admin only
  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    const jogadores = await getData('jogadores') || [];
    const target = jogadores.find(j => j.id === id);
    const filtered = jogadores.filter(j => j.id !== id);
    await setData('jogadores', filtered);
    await logAction(user.id, user.nome, user.role, 'Excluiu jogador', `${target?.nome || `ID ${id}`}`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
