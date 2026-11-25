// Uma função só para os módulos novos (calendário, departamento médico,
// campeonatos, quadro tático e notificações). O plano gratuito da Vercel
// aceita no máximo 12 funções em /api, então cada módulo fica em lib/mod/
// e é escolhido pelo parâmetro ?r= (ex.: /api/modulos?r=agenda).
const cors = require('../lib/cors');
const { withErrorHandling } = require('../lib/error-handler');

const MODULOS = {
  agenda: () => require('../lib/mod/agenda'),
  medico: () => require('../lib/mod/medico'),
  campeonatos: () => require('../lib/mod/campeonatos'),
  jogadas: () => require('../lib/mod/jogadas'),
};

module.exports = withErrorHandling(async function handler(req, res) {
  if (cors(req, res)) return;
  const r = String((req.query || {}).r || '');
  const carregar = Object.prototype.hasOwnProperty.call(MODULOS, r) ? MODULOS[r] : null;
  if (!carregar) return res.status(404).json({ error: 'Módulo não encontrado' });
  return carregar()(req, res);
});
