const { requireAuth } = require('../lib/auth');
const { getData, setData } = require('../lib/db');
const cors = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (cors(req, res)) return;

  // GET - admin only
  if (req.method === 'GET') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    const logs = await getData('logs') || [];
    return res.json(logs);
  }

  // DELETE - clear all logs (admin only)
  if (req.method === 'DELETE') {
    const user = requireAuth(req, res, ['admin']);
    if (!user) return;
    await setData('logs', []);
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
