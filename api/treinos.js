const { requireAuth } = require('../lib/auth');
const { getData, setData } = require('../lib/db');
const cors = require('../lib/cors');

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
      // Update player attendance
      const jogadores = await getData('jogadores') || [];
      const totalTreinos = treinos.filter(t => new Date(t.data) < new Date()).length;
      if (totalTreinos > 0) {
        jogadores.forEach((j, i) => {
          const presentCount = treinos.filter(t => (t.presentes || []).includes(j.id)).length;
          jogadores[i].presenca = Math.round((presentCount / totalTreinos) * 100);
        });
        await setData('jogadores', jogadores);
      }
    }
    await setData('treinos', treinos);
    return res.json(treinos[idx]);
  }

  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const { id } = req.body;
    const treinos = await getData('treinos') || [];
    await setData('treinos', treinos.filter(t => t.id !== id));
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
