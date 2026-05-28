const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao', 'atleta']);
    if (!user) return;
    const avisos = await getData('avisos') || [];
    return res.json(avisos.sort((a, b) => b.data.localeCompare(a.data)));
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const { titulo, msg, tipo } = req.body;
    if (!titulo || !msg) return res.status(400).json({ error: 'Título e mensagem obrigatórios' });
    const avisos = await getData('avisos') || [];
    const counters = await getData('counters');
    counters.avisos = (counters.avisos || 0) + 1;
    const novo = { id: counters.avisos, titulo, msg, tipo: tipo || 'info', data: new Date().toISOString().split('T')[0], autor: user.nome };
    avisos.push(novo);
    await setData('avisos', avisos);
    await setData('counters', counters);
    await logAction(user.id, user.nome, user.role, 'Publicou aviso', `"${titulo}"`);
    return res.status(201).json(novo);
  }

  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const { id } = req.body;
    const avisos = await getData('avisos') || [];
    const target = avisos.find(a => a.id === id);
    await setData('avisos', avisos.filter(a => a.id !== id));
    await logAction(user.id, user.nome, user.role, 'Excluiu aviso', `"${target?.titulo || `ID ${id}`}"`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
