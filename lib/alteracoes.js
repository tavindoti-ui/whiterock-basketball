// Registro de mudanças em compromissos (data, horário, local, cancelamento).
// O calendário mostra o aviso de "alterado" e a central de notificações usa esta lista.
const { getData, setData } = require('./db');

const KEY = 'agenda-alteracoes';
const CAMPOS = { data: 'Data', hora: 'Horário', local: 'Local' };
const MAX = 200;

function hoje() { return new Date().toISOString().split('T')[0]; }

// ref = 'jogo:3' | 'treino:5' | 'evento:2'
async function registrarAlteracao(ref, titulo, antes, depois, user) {
  // só interessa avisar sobre compromissos que ainda vão acontecer
  if ((depois.data || antes.data || '') < hoje() && (antes.data || '') < hoje()) return null;
  const mudancas = Object.keys(CAMPOS)
    .filter(k => String(antes[k] || '') !== String(depois[k] || ''))
    .map(k => ({ campo: k, de: String(antes[k] || ''), para: String(depois[k] || '') }));
  if (!mudancas.length) return null;
  return salvar({ ref, titulo, tipo: 'alterado', mudancas, data: depois.data || antes.data || '' }, user);
}

async function registrarCancelamento(ref, titulo, item, user) {
  if (!item || (item.data || '') < hoje()) return null;
  return salvar({ ref, titulo, tipo: 'cancelado', mudancas: [], data: item.data || '' }, user);
}

async function registrarNovo(ref, titulo, item, user) {
  if (!item || (item.data || '') < hoje()) return null;
  return salvar({ ref, titulo, tipo: 'novo', mudancas: [], data: item.data || '' }, user);
}

async function salvar(reg, user) {
  const list = await getData(KEY) || [];
  const counters = await getData('counters') || {};
  counters.alteracoes = (counters.alteracoes || 0) + 1;
  const novo = { id: counters.alteracoes, ...reg, em: new Date().toISOString(), por: user ? user.nome : '' };
  list.unshift(novo);
  await setData(KEY, list.slice(0, MAX));
  await setData('counters', counters);
  return novo;
}

module.exports = { registrarAlteracao, registrarCancelamento, registrarNovo, KEY };
