const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao', 'atleta']);
    if (!user) return;
    const uniformes = await getData('uniformes') || [];
    return res.json(uniformes);
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const b = req.body;
    const uniformes = await getData('uniformes') || [];
    const counters = await getData('counters');
    counters.uniformes = (counters.uniformes || 0) + 1;
    const novo = {
      id: counters.uniformes,
      jogadorId: b.jogadorId || null,
      jogadorNome: b.jogadorNome || '',
      num: b.num || 0,
      tamanhoJogo: b.tamanhoJogo || 'M',
      tamanhoTreino: b.tamanhoTreino || 'M',
      valorUniforme: +b.valorUniforme || 150,
      valorPago: +b.valorPago || 0,
      kitJogo: b.kitJogo || 'Pendente',
      kitTreino: b.kitTreino || 'Pendente',
      temporada: b.temporada || '2026',
      obs: b.obs || ''
    };
    uniformes.push(novo);
    await setData('uniformes', uniformes);
    await setData('counters', counters);
    await logAction(user.id, user.nome, user.role, 'Registrou kit de uniforme', `${b.jogadorNome} — #${b.num || 0} (Temporada ${b.temporada || '2026'})`);
    return res.status(201).json(novo);
  }

  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const { id, ...updates } = req.body;
    const uniformes = await getData('uniformes') || [];
    const idx = uniformes.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Kit não encontrado' });
    uniformes[idx] = { ...uniformes[idx], ...updates };
    await setData('uniformes', uniformes);
    await logAction(user.id, user.nome, user.role, 'Editou kit de uniforme', `${uniformes[idx].jogadorNome} — #${uniformes[idx].num}`);
    return res.json(uniformes[idx]);
  }

  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    const uniformes = await getData('uniformes') || [];
    const target = uniformes.find(u => u.id === id);
    await setData('uniformes', uniformes.filter(u => u.id !== id));
    await logAction(user.id, user.nome, user.role, 'Excluiu kit de uniforme', `${target?.jogadorNome || `ID ${id}`}`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
