const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao', 'atleta']);
    if (!user) return;
    const pedidos = await getData('uniformes') || [];
    if (user.role === 'atleta') {
      return res.json(pedidos.filter(p => p.userId === user.id));
    }
    return res.json(pedidos);
  }

  // Place / update own order (upsert by userId) — all except admin
  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['atleta', 'capitao', 'tecnico', 'comissao']);
    if (!user) return;
    const { tamPrincipal, tamSecundario, tamCity } = req.body;
    if (!tamPrincipal && !tamSecundario && !tamCity) {
      return res.status(400).json({ error: 'Selecione pelo menos um uniforme' });
    }

    const jogadores = await getData('jogadores') || [];
    const hasNum = user.num !== null && user.num !== undefined;
    let jogadorRef = hasNum ? jogadores.find(j => j.num === user.num) : null;
    if (!jogadorRef) {
      const searchName = (user.nome || '').toLowerCase();
      jogadorRef = jogadores.find(j => j.nome.toLowerCase() === searchName);
    }
    const displayNome = jogadorRef?.apelido || jogadorRef?.nome || user.nome;
    const displayNum  = hasNum ? user.num : (jogadorRef?.num ?? 0);

    const pedidos = await getData('uniformes') || [];
    const counters = await getData('counters');
    const now = new Date().toISOString().split('T')[0];
    const existingIdx = pedidos.findIndex(p => p.userId === user.id);

    if (existingIdx !== -1) {
      const old = pedidos[existingIdx];
      pedidos[existingIdx] = {
        ...old,
        jogadorNome: displayNome,
        num: displayNum,
        tamPrincipal:  tamPrincipal  || null,
        tamSecundario: tamSecundario || null,
        tamCity:       tamCity       || null,
        statusPrincipal:  tamPrincipal  ? (old.statusPrincipal  || 'Pendente') : null,
        statusSecundario: tamSecundario ? (old.statusSecundario || 'Pendente') : null,
        statusCity:       tamCity       ? (old.statusCity       || 'Pendente') : null,
        dataPedido: now,
      };
      await setData('uniformes', pedidos);
      await logAction(user.id, user.nome, user.role, 'Atualizou pedido de uniforme',
        `${displayNome} #${displayNum} — P: ${tamPrincipal||'—'} / S: ${tamSecundario||'—'} / City: ${tamCity||'—'}`);
      return res.json(pedidos[existingIdx]);
    }

    counters.uniformes = (counters.uniformes || 0) + 1;
    const novo = {
      id: counters.uniformes,
      userId: user.id,
      jogadorNome: displayNome,
      num: displayNum,
      tamPrincipal:  tamPrincipal  || null,
      tamSecundario: tamSecundario || null,
      tamCity:       tamCity       || null,
      statusPrincipal:  tamPrincipal  ? 'Pendente' : null,
      statusSecundario: tamSecundario ? 'Pendente' : null,
      statusCity:       tamCity       ? 'Pendente' : null,
      dataPedido: now,
    };
    pedidos.push(novo);
    await setData('uniformes', pedidos);
    await setData('counters', counters);
    await logAction(user.id, user.nome, user.role, 'Fez pedido de uniforme',
      `${displayNome} #${displayNum} — P: ${tamPrincipal||'—'} / S: ${tamSecundario||'—'} / City: ${tamCity||'—'}`);
    return res.status(201).json(novo);
  }

  // Admin updates status of an order
  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const { id, statusPrincipal, statusSecundario, statusCity } = req.body;
    const pedidos = await getData('uniformes') || [];
    const idx = pedidos.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (statusPrincipal  !== undefined) pedidos[idx].statusPrincipal  = statusPrincipal;
    if (statusSecundario !== undefined) pedidos[idx].statusSecundario = statusSecundario;
    if (statusCity       !== undefined) pedidos[idx].statusCity       = statusCity;
    await setData('uniformes', pedidos);
    await logAction(user.id, user.nome, user.role, 'Atualizou status de uniforme',
      `${pedidos[idx].jogadorNome} — P: ${pedidos[idx].statusPrincipal||'—'} / S: ${pedidos[idx].statusSecundario||'—'} / City: ${pedidos[idx].statusCity||'—'}`);
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
