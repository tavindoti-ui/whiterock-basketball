const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao', 'atleta']);
    if (!user) return;
    const jogos = await getData('jogos') || [];
    return res.json(jogos);
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
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
    await logAction(user.id, user.nome, user.role, 'Cadastrou jogo', `vs ${adv} — ${data} (${camp || 'Amistoso'})`);
    return res.status(201).json(novo);
  }

  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao']);
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
      const oldStats = jogos[idx].statsJogadores || null; // previously saved stats for this game

      statsJogadores.forEach(({ id: jId, pts, ast, reb, tpt, flt }) => {
        const jIdx = jogadores.findIndex(j => j.id === jId);
        if (jIdx === -1) return;
        const j = jogadores[jIdx];
        const games = j.jg || 0;

        if (oldStats && games > 0) {
          // Edit mode: undo previous contribution from this game, apply new values
          const old = oldStats.find(s => s.id === jId) || { pts: 0, ast: 0, reb: 0, tpt: 0, flt: 0 };
          jogadores[jIdx] = {
            ...j,
            pts: Math.max(0, Math.round((j.pts * games - old.pts + pts) / games)),
            ast: Math.max(0, Math.round((j.ast * games - old.ast + ast) / games)),
            reb: Math.max(0, Math.round((j.reb * games - old.reb + reb) / games)),
            tpt: Math.max(0, Math.round((j.tpt * games - old.tpt + tpt) / games)),
            flt: Math.max(0, Math.round((j.flt * games - old.flt + flt) / games)),
          };
        } else {
          // First registration: add as new game
          jogadores[jIdx] = {
            ...j,
            pts: games ? Math.round((j.pts * games + pts) / (games + 1)) : pts,
            ast: games ? Math.round((j.ast * games + ast) / (games + 1)) : ast,
            reb: games ? Math.round((j.reb * games + reb) / (games + 1)) : reb,
            tpt: games ? Math.round((j.tpt * games + tpt) / (games + 1)) : tpt,
            flt: games ? Math.round((j.flt * games + flt) / (games + 1)) : flt,
            jg: games + 1,
          };
        }
      });

      // Store stats on the game so edits can undo/redo correctly
      jogos[idx].statsJogadores = statsJogadores;
      await setData('jogadores', jogadores);
    }

    if (statsJogadores && Array.isArray(statsJogadores)) {
      await logAction(user.id, user.nome, user.role, 'Registrou resultado', `vs ${jogos[idx].adv}: WR ${wr} × ${advPl}`);
    } else {
      await logAction(user.id, user.nome, user.role, 'Editou jogo', `vs ${jogos[idx].adv} (${jogos[idx].data})`);
    }
    return res.json(jogos[idx]);
  }

  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const { id } = req.body;
    const jogos = await getData('jogos') || [];
    const target = jogos.find(j => j.id === id);
    await setData('jogos', jogos.filter(j => j.id !== id));
    await logAction(user.id, user.nome, user.role, 'Excluiu jogo', `vs ${target?.adv || `ID ${id}`} (${target?.data || ''})`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
