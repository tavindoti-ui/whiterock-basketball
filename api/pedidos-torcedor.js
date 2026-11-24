const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');
const { withErrorHandling } = require('../lib/error-handler');

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

// What a public (not logged in) lookup may see. Codes are sequential, so
// anyone can try WR-0001, WR-0002…: never expose the fan's phone, notes or
// full name here. "Ana Paula Souza" → "Ana S."
function publicView(p) {
  const partes = String(p.nome || '').trim().split(/\s+/).filter(Boolean);
  const inicial = partes.length > 1 ? (partes[partes.length - 1].match(/\p{L}/u) || [''])[0] : '';
  const nome = inicial ? `${partes[0]} ${inicial.toUpperCase()}.` : (partes[0] || '');
  return {
    codigo: p.codigo,
    nome,
    tamanho: p.tamanho,
    numCamisa: p.numCamisa,
    nomeCamisa: p.nomeCamisa,
    modelo: p.modelo,
    quantidade: p.quantidade,
    valor: p.valor,
    status: p.status,
    pagamento: p.pagamento,
    dataPedido: p.dataPedido,
    obs: null,
  };
}

module.exports = withErrorHandling(async function handler(req, res) {
  if (cors(req, res)) return;

  // ── GET ────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { codigo, whatsapp } = req.query || {};

    // Public tracking: fan checks own order via ?codigo=WR-0001 or ?whatsapp=...
    if (codigo || whatsapp) {
      const pedidos = await getData('pedidos-torcedor') || [];
      let result;
      if (codigo) {
        const p = pedidos.find(p => p.codigo === String(codigo).toUpperCase());
        result = p ? publicView(p) : null;
      } else {
        // Return all orders for this whatsapp (most recent first)
        const digits = String(whatsapp).replace(/\D/g, '');
        if (digits.length < 10) {
          return res.status(400).json({ error: 'Informe o WhatsApp completo, com DDD.' });
        }
        result = pedidos
          .filter(p => String(p.whatsapp || '').replace(/\D/g, '') === digits)
          .sort((a, b) => b.id - a.id)
          .map(publicView);
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
    const { nome, whatsapp, tamanho, numCamisa, nomeCamisa, modelo, quantidade, obs } = req.body || {};

    if (!nome || !whatsapp || !tamanho || !modelo) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, whatsapp, tamanho, modelo' });
    }
    // Public form: cap sizes so nobody can flood the database with huge entries.
    const tooLong = [[nome, 80], [whatsapp, 25], [tamanho, 10], [modelo, 20], [nomeCamisa, 20], [obs, 500]]
      .some(([v, max]) => v != null && String(v).length > max);
    if (tooLong) return res.status(400).json({ error: 'Algum campo está longo demais.' });
    if (quantidade && (+quantidade > 50 || !Number.isFinite(+quantidade))) {
      return res.status(400).json({ error: 'Quantidade inválida.' });
    }

    const pedidos = await getData('pedidos-torcedor') || [];
    const counters = await getData('counters') || {};
    counters['pedidos-torcedor'] = (counters['pedidos-torcedor'] || 0) + 1;

    const novo = {
      id: counters['pedidos-torcedor'],
      codigo: gerarCodigo(counters['pedidos-torcedor']),
      nome: String(nome).trim(),
      whatsapp: String(whatsapp).trim(),
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

    const { id, status, pagamento, valor, obs } = req.body || {};
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
    const { id } = req.body || {};
    const pedidos = await getData('pedidos-torcedor') || [];
    const target = pedidos.find(p => p.id === id);
    await setData('pedidos-torcedor', pedidos.filter(p => p.id !== id));
    await logAction(user.id, user.nome, user.role, 'Removeu pedido torcedor',
      target ? `${target.codigo} — ${target.nome}` : `ID ${id}`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
