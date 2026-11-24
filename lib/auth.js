const jwt = require('jsonwebtoken');

// Em produção (Vercel) a chave PRECISA vir da variável de ambiente JWT_SECRET.
// Uma chave escrita no código é pública (o repositório é aberto) e permitiria
// que qualquer pessoa fabricasse um login de admin. Sem a variável, o login
// falha com uma mensagem clara em vez de funcionar de forma insegura.
// Fora da Vercel (testes locais) usa uma chave de desenvolvimento.
function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.VERCEL) {
    throw new Error('JWT_SECRET não configurada nas variáveis de ambiente da Vercel');
  }
  return 'dev-only-secret-local';
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret());
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
