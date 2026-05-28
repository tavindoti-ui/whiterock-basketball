const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao', 'atleta']);
    if (!user) return;
    const pedidos = await getData('uniformes') || [];
    // Atleta only sees their own order
    if (user.role === 'atleta') {
      return res.json(pedidos.filter(p => p.userId === user.id));
    }
    return res.json(pedidos);
  }

  // Place / update own order (upsert by userId)
  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['atleta', 'capitao', 'admin', 'tecnico', 'comissao']);
    if (!user) return;
    const { tamPrincipal, tamSecundario } = req.body;
    if (!tamPrincipal && !tamSecundario) {
      return res.status(400).json({ error: 'Selecione pelo menos um uniforme' });
    }
    const pedidos = await getData('uniformes') || [];
    const counters = await getData('counters');
    const now = new Date().toISOString().split('T')[0];
    const existingIdx = pedidos.findIndex(p => p.userId === user.id);

    if (existingIdx !== -1) {
      const old = pedidos[existingIdx];
      pedidos[existingIdx] = {
        ...old,
        tamPrincipal: tamPrincipal || null,
        tamSecundario: tamSecundario || null,
        statusPrincipal: tamPrincipal ? (old.statusPrincipal || 'Pendente') : null,
        statusSecundario: tamSecundario ? (old.statusSecundario || 'Pendente') : null,
        dataPedido: now,
      };
      await setData('uniformes', pedidos);
      await logAction(user.id, user.nome, user.role, 'Atualizou pedido de uniforme',
        `Principal: ${tamPrincipal || '—'} / Secundário: ${tamSecundario || '—'}`);
      return res.json(pedidos[existingIdx]);
    }

    counters.uniformes = (counters.uniformes || 0) + 1;
    const novo = {
      id: counters.uniformes,
      userId: user.id,
      jogadorNome: user.nome,
      num: user.num || 0,
      tamPrincipal: tamPrincipal || null,
      tamSecundario: tamSecundario || null,
      statusPrincipal: tamPrincipal ? 'Pendente' : null,
      statusSecundario: tamSecundario ? 'Pendente' : null,
      dataPedido: now,
    };
    pedidos.push(novo);
    await setData('uniformes', pedidos);
    await setData('counters', counters);
    await logAction(user.id, user.nome, user.role, 'Fez pedido de uniforme',
      `${user.nome} — Principal: ${tamPrincipal || '—'} / Secundário: ${tamSecundario || '—'}`);
    return res.status(201).json(novo);
  }

  // Admin updates status of an order
  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const { id, statusPrincipal, statusSecundario } = req.body;
    const pedidos = await getData('uniformes') || [];
    const idx = pedidos.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (statusPrincipal !== undefined) pedidos[idx].statusPrincipal = statusPrincipal;
    if (statusSecundario !== undefined) pedidos[idx].statusSecundario = statusSecundario;
    await setData('uniformes', pedidos);
    await logAction(user.id, user.nome, user.role, 'Atualizou status de uniforme',
      `${pedidos[idx].jogadorNome} — Principal: ${pedidos[idx].statusPrincipal || '—'} / Secundário: ${pedidos[idx].statusSecundario || '—'}`);
    return res.json(pedidos[idx]);
  }

  // Admin deletes an order
  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    const pedidos = await getData('uniformes') || [];
    const target = pedidos.find(p => p.id === id);
    await setData('uniformes', pedidos.filter(p => p.id !== id));
    await logAction(user.id, user.nome, user.role, 'Removeu pedido de uniforme',
      target?.jogadorNome || `ID ${id}`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
