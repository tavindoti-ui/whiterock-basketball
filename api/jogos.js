const { requireAuth } = require('../lib/auth');
const { getData, setData } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'capitao', 'atleta']);
    if (!user) return;
    const jogos = await getData('jogos') || [];
    return res.json(jogos);
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin', 'capitao']);
    if (!user) return;
    const { adv, data, hora, local, camp } = req.body;
    if (!adv || !data) return res.status(400).json({ error: 'Adversário e data são obrigatórios' });
    const jogos = await getData('jogos') || [];
    const counters = await getData('counters');
    counters.jogos = (counters.jogos || 0) + 1;
    const novo = { id: counters.jogos, adv, data, hora: hora || '19:00', local: local || '', camp: camp || 'Amistoso', wr: null, advPl: null };
    jogos.push(novo);
    await setData('jogos', jogos);
    await setData('counters', counters);
    return res.status(201).json(novo);
  }

  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'capitao']);
    if (!user) return;
    const { id, wr, advPl, statsJogadores, ...rest } = req.body;
    const jogos = await getData('jogos') || [];
    const idx = jogos.findIndex(j => j.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Jogo não encontrado' });
    jogos[idx] = { ...jogos[idx], ...rest };
    if (wr !== undefined) jogos[idx].wr = wr;
    if (advPl !== undefined) jogos[idx].advPl = advPl;
    await setData('jogos', jogos);

    // Update player stats if provided
    if (statsJogadores && Array.isArray(statsJogadores)) {
      const jogadores = await getData('jogadores') || [];
      statsJogadores.forEach(({ id: jId, pts, ast, reb, tpt, flt }) => {
        const jIdx = jogadores.findIndex(j => j.id === jId);
        if (jIdx === -1) return;
        const j = jogadores[jIdx];
        const games = j.jg || 0;
        jogadores[jIdx] = {
          ...j,
          pts: games ? Math.round((j.pts * games + pts) / (games + 1)) : pts,
          ast: games ? Math.round((j.ast * games + ast) / (games + 1)) : ast,
          reb: games ? Math.round((j.reb * games + reb) / (games + 1)) : reb,
          tpt: games ? Math.round((j.tpt * games + tpt) / (games + 1)) : tpt,
          flt: games ? Math.round((j.flt * games + flt) / (games + 1)) : flt,
          jg: games + 1,
        };
      });
      await setData('jogadores', jogadores);
    }

    return res.json(jogos[idx]);
  }

  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    const jogos = await getData('jogos') || [];
    await setData('jogos', jogos.filter(j => j.id !== id));
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
