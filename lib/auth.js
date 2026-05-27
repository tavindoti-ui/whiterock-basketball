const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'whiterock-secret-2026';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function getTokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function requireAuth(req, res, roles = []) {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Não autenticado' });
    return null;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'Token inválido ou expirado' });
    return null;
  }
  if (roles.length && !roles.includes(user.role)) {
    res.status(403).json({ error: 'Sem permissão para esta ação' });
    return null;
  }
  return user;
}

module.exports = { signToken, verifyToken, getTokenFromRequest, requireAuth };
