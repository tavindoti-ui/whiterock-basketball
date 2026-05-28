const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');

const STATUS_VALIDOS = [
  'Pedido recebido',
  'Aguardando pagamento',
  'Pagamento confirmado',
  'Em produção',
  'Em personalização',
  'Pronto para entrega',
  'Enviado',
  'Entregue',
  'Cancelado',
];

// Generate short readable order code
function gerarCodigo(id) {
  return 'WR-' + String(id).padStart(4, '0');
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // ── GET ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { codigo, whatsapp } = req.query || {};

    // Public tracking: fan checks own order via ?codigo=WR-0001 or ?whatsapp=...
    if (codigo || whatsapp) {
      const pedidos = await getData('pedidos-torcedor') || [];
      let result;
      if (codigo) {
        result = pedidos.find(p => p.codigo === codigo.toUpperCase());
      } else {
        // Return all orders for this whatsapp (most recent first)
        const digits = whatsapp.replace(/\D/g, '');
        result = pedidos
          .filter(p => p.whatsapp.replace(/\D/g, '') === digits)
          .sort((a, b) => b.id - a.id);
      }
      if (!result) return res.status(404).json({ error: 'Pedido não encontrado' });
      return res.json(result);
    }

    // Admin/staff: return all orders
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const pedidos = await getData('pedidos-torcedor') || [];
    return res.json(pedidos);
  }

  // ── POST — public, no auth ──────────────────────────────────────
  if (req.method === 'POST') {
    const { nome, whatsapp, tamanho, numCamisa, nomeCamisa, modelo, quantidade, obs } = req.body;

    if (!nome || !whatsapp || !tamanho || !modelo) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, whatsapp, tamanho, modelo' });
    }

    const pedidos = await getData('pedidos-torcedor') || [];
    const counters = await getData('counters') || {};
    counters['pedidos-torcedor'] = (counters['pedidos-torcedor'] || 0) + 1;

    const novo = {
      id: counters['pedidos-torcedor'],
      codigo: gerarCodigo(counters['pedidos-torcedor']),
      nome: nome.trim(),
      whatsapp: whatsapp.trim(),
      tamanho,
      numCamisa: numCamisa !== undefined && numCamisa !== '' ? +numCamisa : null,
      nomeCamisa: (nomeCamisa || '').trim().toUpperCase() || null,
      modelo,          // 'principal' | 'secundario'
      quantidade: quantidade ? Math.max(1, +quantidade) : 1,
      valor: null,     // admin fills in later
      status: 'Pedido recebido',
      pagamento: 'Pendente',
      dataPedido: new Date().toISOString().split('T')[0],
      obs: (obs || '').trim() || null,
    };

    pedidos.push(novo);
    await setData('pedidos-torcedor', pedidos);
    await setData('counters', counters);

    return res.status(201).json(novo);
  }

  // ── PUT — admin/staff updates status / valor ────────────────────
  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;

    const { id, status, pagamento, valor, obs } = req.body;
    const pedidos = await getData('pedidos-torcedor') || [];
    const idx = pedidos.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (status !== undefined) {
      if (!STATUS_VALIDOS.includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      pedidos[idx].status = status;
    }
    if (pagamento !== undefined) pedidos[idx].pagamento = pagamento;
    if (valor !== undefined) pedidos[idx].valor = valor !== null && valor !== '' ? +valor : null;
    if (obs !== undefined) pedidos[idx].obs = (obs || '').trim() || null;

    await setData('pedidos-torcedor', pedidos);
    await logAction(
      user.id, user.nome, user.role,
      'Atualizou pedido torcedor',
      `${pedidos[idx].codigo} — ${pedidos[idx].nome} → ${pedidos[idx].status}`
    );
    return res.json(pedidos[idx]);
  }

  // ── DELETE — admin only ─────────────────────────────────────────
  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    const pedidos = await getData('pedidos-torcedor') || [];
    const target = pedidos.find(p => p.id === id);
    await setData('pedidos-torcedor', pedidos.filter(p => p.id !== id));
    await logAction(user.id, user.nome, user.role, 'Removeu pedido torcedor',
      target ? `${target.codigo} — ${target.nome}` : `ID ${id}`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
