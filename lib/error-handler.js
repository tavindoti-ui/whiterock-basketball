// Wraps an API handler so that ANY unexpected error (banco de dados fora do ar,
// variável de ambiente faltando, bug, etc.) sempre responde com um JSON claro
// em vez de deixar a função "crashar" e devolver uma página de erro HTML.
// Isso é o que fazia o front-end mostrar "Erro de conexão. Verifique a
// internet." mesmo quando o problema era outro (ex: banco Redis desconectado).
function withErrorHandling(handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (err) {
      console.error('[API ERROR]', req.url, err);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Erro no servidor. Tente novamente em instantes.',
          detalhe: err && err.message ? err.message : String(err),
        });
      }
    }
  };
}

module.exports = { withErrorHandling };
