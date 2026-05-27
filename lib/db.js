const bcrypt = require('bcryptjs');

// Upstash Redis REST API client
async function kvRequest(method, args) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    // In-memory fallback for local dev
    return memoryFallback(method, args);
  }

  const endpoint = `${url}/${[method, ...args.map(a => encodeURIComponent(a))].join('/')}`;
  const r = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await r.json();
  return data.result;
}

// In-memory fallback for local dev
const mem = {};
function memoryFallback(method, args) {
  if (method === 'get') return mem[args[0]] ?? null;
  if (method === 'set') { mem[args[0]] = args[1]; return 'OK'; }
  if (method === 'del') { delete mem[args[0]]; return 1; }
  return null;
}

async function getData(key) {
  const val = await kvRequest('get', [key]);
  if (!val) return null;
  try { return JSON.parse(val); } catch { return val; }
}

async function setData(key, value) {
  await kvRequest('set', [key, JSON.stringify(value)]);
}

async function seedIfEmpty() {
  const users = await getData('users');
  if (users) return;

  const hash = (p) => bcrypt.hashSync(p, 10);

  const initialUsers = [
    { id: 1, nome: 'Técnico Admin', email: 'admin@whiterock.com', senha: hash('admin123'), role: 'admin', num: null, ativo: true },
    { id: 2, nome: 'Rafael Mendes', email: 'rafael@whiterock.com', senha: hash('rafael123'), role: 'atleta', num: 7, ativo: true },
    { id: 3, nome: 'Lucas Andrade', email: 'lucas@whiterock.com', senha: hash('lucas123'), role: 'capitao', num: 10, ativo: true },
    { id: 4, nome: 'Thiago Costa', email: 'thiago@whiterock.com', senha: hash('thiago123'), role: 'atleta', num: 23, ativo: true },
    { id: 5, nome: 'Bruno Ferreira', email: 'bruno@whiterock.com', senha: hash('bruno123'), role: 'atleta', num: 5, ativo: true },
  ];

  const initialJogadores = [
    { id: 1, nome: 'Rafael Mendes', num: 7, pos: 'Armador', idade: 28, altura: 178, status: 'Ativo', tel: '(21) 99001-1111', obs: '', pts: 18, ast: 7, reb: 3, tpt: 2, flt: 2, jg: 8, presenca: 85 },
    { id: 2, nome: 'Lucas Andrade', num: 10, pos: 'Ala', idade: 25, altura: 192, status: 'Ativo', tel: '(21) 99002-2222', obs: '', pts: 14, ast: 3, reb: 6, tpt: 1, flt: 3, jg: 8, presenca: 92 },
    { id: 3, nome: 'Thiago Costa', num: 23, pos: 'Pivô', idade: 30, altura: 200, status: 'Lesão', tel: '(21) 99003-3333', obs: 'Torção tornozelo esq.', pts: 11, ast: 2, reb: 9, tpt: 0, flt: 4, jg: 5, presenca: 60 },
    { id: 4, nome: 'Bruno Ferreira', num: 5, pos: 'Ala-armador', idade: 26, altura: 185, status: 'Ativo', tel: '(21) 99004-4444', obs: '', pts: 9, ast: 4, reb: 4, tpt: 3, flt: 2, jg: 8, presenca: 78 },
    { id: 5, nome: 'Diego Nunes', num: 14, pos: 'Ala-pivô', idade: 29, altura: 196, status: 'Suspenso', tel: '(21) 99005-5555', obs: 'Expulso - jogo anterior', pts: 7, ast: 1, reb: 7, tpt: 0, flt: 5, jg: 7, presenca: 70 },
  ];

  const initialJogos = [
    { id: 1, adv: 'Flamengo Masters', data: '2026-06-05', hora: '19:30', local: 'Maracanãzinho', camp: 'Liga Carioca', wr: null, advPl: null },
    { id: 2, adv: 'Vasco BC', data: '2026-05-20', hora: '19:00', local: 'Ginásio Nilton Santos', camp: 'Liga Carioca', wr: 78, advPl: 65 },
    { id: 3, adv: 'Regatas BC', data: '2026-05-10', hora: '18:00', local: 'Clube de Regatas', camp: 'Liga Carioca', wr: 55, advPl: 70 },
  ];

  const initialTreinos = [
    { id: 1, data: '2026-05-29', hora: '20:00', local: 'Quadra Central WR', tipo: 'Treino técnico' },
    { id: 2, data: '2026-06-01', hora: '20:00', local: 'Quadra Central WR', tipo: 'Coletivo' },
  ];

  const initialFinanceiro = [
    { id: 1, desc: 'Mensalidade - Rafael Mendes', tipo: 'entrada', valor: 80, cat: 'Mensalidade', data: '2026-05-25' },
    { id: 2, desc: 'Aluguel quadra - Maio', tipo: 'saida', valor: 150, cat: 'Aluguel quadra', data: '2026-05-20' },
    { id: 3, desc: 'Patrocínio Rock Sports', tipo: 'entrada', valor: 200, cat: 'Patrocínio', data: '2026-05-15' },
  ];

  const initialAvisos = [
    { id: 1, titulo: 'Bem-vindos ao sistema White Rock!', msg: 'O sistema de gestão do time está no ar. Aqui você acompanha jogos, treinos, estatísticas e avisos do time.', tipo: 'info', data: '2026-05-27', autor: 'Admin' },
  ];

  await setData('users', initialUsers);
  await setData('jogadores', initialJogadores);
  await setData('jogos', initialJogos);
  await setData('treinos', initialTreinos);
  await setData('financeiro', initialFinanceiro);
  await setData('avisos', initialAvisos);
  await setData('mensalidades', { 5: 2, 4: 1 });
  await setData('counters', { users: 6, jogadores: 6, jogos: 4, treinos: 3, financeiro: 4, avisos: 2 });
}

module.exports = { getData, setData, seedIfEmpty };
