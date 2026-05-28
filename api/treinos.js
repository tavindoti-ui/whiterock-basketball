const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');

// Recalculates presenca % for all players based on past/today treinos
async function recalcPresenca(treinos) {
  const today = new Date().toISOString().split('T')[0]; // UTC date string
  const held = treinos.filter(t => t.data <= today);   // past + today
  const total = held.length;
  const jogadores = await getData('jogadores') || [];
  jogadores.forEach((j, i) => {
    const present = held.filter(t => (t.presentes || []).includes(j.id)).length;
    jogadores[i].presenca = total > 0 ? Math.round((present / total) * 100) : 0;
  });
  await setData('jogadores', jogadores);
}

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao', 'atleta']);
    if (!user) return;
    const treinos = await getData('treinos') || [];
    return res.json(treinos);
  }

  if (req.method === 'POST') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'capitao']);
    if (!user) return;
    const { data, hora, local, tipo } = req.body;
    if (!data) return res.status(400).json({ error: 'Data obrigatória' });
    const treinos = await getData('treinos') || [];
    const counters = await getData('counters');
    counters.treinos = (counters.treinos || 0) + 1;
    const novo = { id: counters.treinos, data, hora: hora || '20:00', local: local || '', tipo: tipo || 'Treino técnico', presentes: [] };
    treinos.push(novo);
    await setData('treinos', treinos);
    await setData('counters', counters);
    await logAction(user.id, user.nome, user.role, 'Agendou treino', `${tipo} — ${data} às ${hora || '20:00'}`);
    return res.status(201).json(novo);
  }

  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao']);
    if (!user) return;
    const { id, presentes, ...rest } = req.body;
    const treinos = await getData('treinos') || [];
    const idx = treinos.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Treino não encontrado' });
    treinos[idx] = { ...treinos[idx], ...rest };
    if (presentes !== undefined) {
      treinos[idx].presentes = presentes;
    }
    await setData('treinos', treinos);
    if (presentes !== undefined) {
      await recalcPresenca(treinos);
    }
    if (presentes !== undefined) {
      await logAction(user.id, user.nome, user.role, 'Marcou presença', `Treino ${treinos[idx].data}: ${presentes.length} jogador(es) presente(s)`);
    } else {
      await logAction(user.id, user.nome, user.role, 'Editou treino', `${treinos[idx].tipo} — ${treinos[idx].data}`);
    }
    return res.json(treinos[idx]);
  }

  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    const treinos = await getData('treinos') || [];
    const target = treinos.find(t => t.id === id);
    const remaining = treinos.filter(t => t.id !== id);
    await setData('treinos', remaining);
    await recalcPresenca(remaining);
    await logAction(user.id, user.nome, user.role, 'Excluiu treino', `${target?.tipo || ''} — ${target?.data || `ID ${id}`}`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
