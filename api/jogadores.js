const { requireAuth } = require('../lib/auth');
const { getData, setData } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // GET - all roles can read
  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'capitao', 'atleta']);
    if (!user) return;
    const jogadores = await getData('jogadores') || [];
    return res.json(jogadores);
  }

  // POST - admin and capitao only
  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin', 'capitao']);
    if (!user) return;
    const { nome, num, pos, idade, altura, status, tel, obs } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    const jogadores = await getData('jogadores') || [];
    const counters = await getData('counters');
    counters.jogadores = (counters.jogadores || 0) + 1;
    const novo = { id: counters.jogadores, nome, num: num || 0, pos: pos || 'Armador', idade: idade || 0, altura: altura || 0, status: status || 'Ativo', tel: tel || '', obs: obs || '', pts: 0, ast: 0, reb: 0, tpt: 0, flt: 0, jg: 0, presenca: 100 };
    jogadores.push(novo);
    await setData('jogadores', jogadores);
    await setData('counters', counters);
    return res.status(201).json(novo);
  }

  // PUT - admin and capitao only
  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'capitao']);
    if (!user) return;
    const { id, ...updates } = req.body;
    const jogadores = await getData('jogadores') || [];
    const idx = jogadores.findIndex(j => j.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Jogador não encontrado' });
    jogadores[idx] = { ...jogadores[idx], ...updates };
    await setData('jogadores', jogadores);
    return res.json(jogadores[idx]);
  }

  // DELETE - admin only
  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    const jogadores = await getData('jogadores') || [];
    const filtered = jogadores.filter(j => j.id !== id);
    await setData('jogadores', filtered);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
