const bcrypt = require('bcryptjs');
const { signToken } = require('../lib/auth');
const { getData, seedIfEmpty } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;
  await seedIfEmpty();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, senha } = req.body;
  if (!email || !senha) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  const users = await getData('users');
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || !bcrypt.compareSync(senha, user.senha)) {
    return res.status(401).json({ error: 'Email ou senha incorretos' });
  }

  if (!user.ativo) {
    return res.status(403).json({ error: 'Conta inativa. Contate o administrador.' });
  }

  const token = signToken({ id: user.id, nome: user.nome, email: user.email, role: user.role, num: user.num });

  return res.status(200).json({
    token,
    user: { id: user.id, nome: user.nome, email: user.email, role: user.role, num: user.num }
  });
};
