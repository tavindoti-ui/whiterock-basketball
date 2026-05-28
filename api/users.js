const bcrypt = require('bcryptjs');
const { requireAuth } = require('../lib/auth');
const { getData, setData } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // GET - list users (admin only)
  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const users = await getData('users');
    const safe = users.map(({ senha, ...u }) => u);
    return res.json(safe);
  }

  // POST - create user (admin only)
  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;

    const { nome, email, senha, role, num } = req.body;
    if (!nome || !email || !senha || !role) return res.status(400).json({ error: 'Campos obrigatórios faltando' });

    const users = await getData('users');
    if (users.find(u => u.email === email)) return res.status(409).json({ error: 'Email já cadastrado' });

    const counters = await getData('counters');
    counters.users = (counters.users || 0) + 1;
    const newUser = { id: counters.users, nome, email, senha: bcrypt.hashSync(senha, 10), role, num: num || null, ativo: true };
    users.push(newUser);
    await setData('users', users);
    await setData('counters', counters);

    const { senha: _, ...safeUser } = newUser;
    return res.status(201).json(safeUser);
  }

  // PUT - update user (admin only)
  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;

    const { id, nome, email, senha, role, num, ativo } = req.body;
    const users = await getData('users');
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado' });

    users[idx] = {
      ...users[idx],
      ...(nome && { nome }),
      ...(email && { email }),
      ...(senha && { senha: bcrypt.hashSync(senha, 10) }),
      ...(role && { role }),
      ...(num !== undefined && { num }),
      ...(ativo !== undefined && { ativo }),
    };
    await setData('users', users);
    const { senha: _, ...safeUser } = users[idx];
    return res.json(safeUser);
  }

  // DELETE - permanently remove user (admin only, cannot delete self)
  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    if (id === user.id) return res.status(400).json({ error: 'Você não pode excluir sua própria conta' });
    const users = await getData('users');
    if (!users.find(u => u.id === id)) return res.status(404).json({ error: 'Usuário não encontrado' });
    await setData('users', users.filter(u => u.id !== id));
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
