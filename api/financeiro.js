const { requireAuth } = require('../lib/auth');
const { getData, setData } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const fin = await getData('financeiro') || [];
    const mens = await getData('mensalidades') || {};
    return res.json({ lancamentos: fin, mensalidades: mens });
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { desc, tipo, valor, cat } = req.body;
    if (!desc || !tipo || !valor) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    const fin = await getData('financeiro') || [];
    const counters = await getData('counters');
    counters.financeiro = (counters.financeiro || 0) + 1;
    const novo = { id: counters.financeiro, desc, tipo, valor: Number(valor), cat: cat || 'Outros', data: new Date().toISOString().split('T')[0] };
    fin.push(novo);
    await setData('financeiro', fin);
    await setData('counters', counters);
    return res.status(201).json(novo);
  }

  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    // Update mensalidades (quitar)
    const { jogadorId, meses, quitar } = req.body;
    if (quitar && jogadorId) {
      const mens = await getData('mensalidades') || {};
      const jogadores = await getData('jogadores') || [];
      const j = jogadores.find(x => x.id === jogadorId);
      if (j) {
        const m = mens[jogadorId] || 1;
        delete mens[jogadorId];
        await setData('mensalidades', mens);
        // Add payment record
        const fin = await getData('financeiro') || [];
        const counters = await getData('counters');
        counters.financeiro = (counters.financeiro || 0) + 1;
        fin.push({ id: counters.financeiro, desc: `Mensalidade quitada - ${j.nome}`, tipo: 'entrada', valor: 80 * m, cat: 'Mensalidade', data: new Date().toISOString().split('T')[0] });
        await setData('financeiro', fin);
        await setData('counters', counters);
      }
      return res.json({ success: true });
    }
    // Add debt
    if (jogadorId && meses) {
      const mens = await getData('mensalidades') || {};
      mens[jogadorId] = (mens[jogadorId] || 0) + meses;
      await setData('mensalidades', mens);
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    const fin = await getData('financeiro') || [];
    await setData('financeiro', fin.filter(f => f.id !== id));
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
