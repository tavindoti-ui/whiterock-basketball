const bcrypt = require('bcryptjs');
const { signToken } = require('../lib/auth');
const { getData, seedIfEmpty, incrWithTTL, resetCounter, getCounter } = require('../lib/db');

const MAX_TENTATIVAS = 8;
const BLOQUEIO_MIN = 15;
const cors = require('../lib/cors');
const { withErrorHandling } = require('../lib/error-handler');

module.exports = withErrorHandling(async function handler(req, res) {
  if (cors(req, res)) return;
  await seedIfEmpty();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  // Limita tentativas erradas por email: impede adivinhar senhas por força bruta.
  const attemptsKey = `login-fail:${String(email).toLowerCase()}`;
  if (await getCounter(attemptsKey) >= MAX_TENTATIVAS) {
    return res.status(429).json({ error: `Muitas tentativas incorretas. Aguarde ${BLOQUEIO_MIN} minutos e tente novamente.` });
  }

  const users = await getData('users') || [];
  const user = users.find(u => u.email.toLowerCase() === String(email).toLowerCase());

  if (!user || !bcrypt.compareSync(String(senha), user.senha)) {
    await incrWithTTL(attemptsKey, BLOQUEIO_MIN * 60);
    return res.status(401).json({ error: 'Email ou senha incorretos' });
  }
  await resetCounter(attemptsKey);

  if (!user.ativo) {
    return res.status(403).json({ error: 'Conta inativa. Contate o administrador.' });
  }

  const token = signToken({ id: user.id, nome: user.nome, email: user.email, role: user.role, num: user.num });

  return res.status(200).json({
    token,
    user: { id: user.id, nome: user.nome, email: user.email, role: user.role, num: user.num }
  });
});
