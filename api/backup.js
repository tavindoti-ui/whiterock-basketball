const { requireAuth } = require('../lib/auth');
const { getData, logAction } = require('../lib/db');
const cors = require('../lib/cors');
const { withErrorHandling } = require('../lib/error-handler');

// Every data key the system stores. Password hashes are left out of the file.
const KEYS = [
  'users', 'jogadores', 'jogos', 'treinos', 'financeiro', 'mensalidades',
  'avisos', 'uniformes', 'pedidos-torcedor', 'fotos-jogadores', 'eventos', 'agenda-convocacoes', 'agenda-confirmacoes', 'agenda-alteracoes', 'medico-casos', 'campeonatos',
  'counters', 'logs',
];

// GET /api/backup — admin downloads a full JSON copy of the database.
module.exports = withErrorHandling(async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res, ['admin']);
  if (!user) return;

  const dados = {};
  for (const key of KEYS) dados[key] = await getData(key);
  if (Array.isArray(dados.users)) dados.users = dados.users.map(({ senha, ...u }) => u);

  await logAction(user.id, user.nome, user.role, 'Baixou backup', 'Cópia completa dos dados');

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="whiterock-backup-${stamp}.json"`);
  return res.json({ geradoEm: new Date().toISOString(), geradoPor: user.nome, dados });
});
