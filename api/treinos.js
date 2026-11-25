const { requireAuth } = require('../lib/auth');
const { getData, setData, logAction } = require('../lib/db');
const cors = require('../lib/cors');
const { withErrorHandling } = require('../lib/error-handler');
const { registrarAlteracao, registrarCancelamento, registrarNovo } = require('../lib/alteracoes');

// Recalculates presenca % for all players based on past/today treinos
async function recalcPresenca(treinos) {
  const today = new Date().toISOString().split('T')[0]; // UTC date string
  const held = treinos.filter(t => t.data <= today);   // past + today
  const jogadores = await getData('jogadores') || [];
  jogadores.forEach((j, i) => {
    // Só contam os treinos a partir do cadastro do jogador (quando a data é conhecida)
    const seus = j.criadoEm ? held.filter(t => t.data >= j.criadoEm) : held;
    const present = seus.filter(t => (t.presentes || []).includes(j.id)).length;
    jogadores[i].presenca = seus.length > 0 ? Math.round((present / seus.length) * 100) : 100;
  });
  await setData('jogadores', jogadores);
}

module.exports = withErrorHandling(async function handler(req, res) {
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
    const { data, hora, local, tipo } = req.body || {};
    if (!data) return res.status(400).json({ error: 'Data obrigatória' });
    const treinos = await getData('treinos') || [];
    const counters = await getData('counters') || {};
    counters.treinos = (counters.treinos || 0) + 1;
    const novo = { id: counters.treinos, data, hora: hora || '20:00', local: local || '', tipo: tipo || 'Treino técnico', presentes: [] };
    treinos.push(novo);
    await setData('treinos', treinos);
    await setData('counters', counters);
    await registrarNovo(`treino:${novo.id}`, novo.tipo, novo, user);
    await logAction(user.id, user.nome, user.role, 'Agendou treino', `${tipo} — ${data} às ${hora || '20:00'}`);
    return res.status(201).json(novo);
  }

  if (req.method === 'PUT') {
    const user = requireAuth(req, res, ['admin', 'tecnico', 'comissao', 'capitao']);
    if (!user) return;
    const { id, presentes, ...rest } = req.body || {};
    const treinos = await getData('treinos') || [];
    const idx = treinos.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Treino não encontrado' });
    const antes = treinos[idx];
    // só campos do treino (presença vem em 'presentes')
    const campos = {};
    for (const k of ['data', 'hora', 'local', 'tipo']) if (rest[k] !== undefined) campos[k] = String(rest[k] || '').trim().slice(0, 120);
    treinos[idx] = { ...treinos[idx], ...campos };
    if (presentes !== undefined) {
      treinos[idx].presentes = presentes;
    }
    await setData('treinos', treinos);
    if (presentes !== undefined) {
      await recalcPresenca(treinos);
    } else {
      await registrarAlteracao(`treino:${treinos[idx].id}`, treinos[idx].tipo || 'Treino', antes, treinos[idx], user);
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
    const { id } = req.body || {};
    const treinos = await getData('treinos') || [];
    const target = treinos.find(t => t.id === id);
    const remaining = treinos.filter(t => t.id !== id);
    await setData('treinos', remaining);
    if (target) await registrarCancelamento(`treino:${target.id}`, target.tipo || 'Treino', target, user);
    await recalcPresenca(remaining);
    await logAction(user.id, user.nome, user.role, 'Excluiu treino', `${target?.tipo || ''} — ${target?.data || `ID ${id}`}`);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
