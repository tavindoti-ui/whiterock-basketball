// Neutraliza caracteres que permitiriam injetar HTML/JavaScript quando os
// dados são exibidos no front-end (que monta telas com innerHTML).
//
// Aplicado em TODA leitura e escrita do banco (lib/db.js), então protege
// tanto dados novos quanto dados antigos já gravados — inclusive o que chega
// pelo formulário público de pedidos de torcedores.
//
// As trocas preservam a leitura do texto:
//   <  >  → removidos
//   "     → ”   (aspas tipográficas)
//   '     → ’   (apóstrofo tipográfico — "D'Ávila" vira "D’Ávila")
//   `  \  → removidos
const REPLACEMENTS = [
  [/[<>`\\]/g, ''],
  [/"/g, '”'],
  [/'/g, '’'],
];

function cleanString(s) {
  let out = s;
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

function sanitize(value) {
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v);
    return out;
  }
  return value;
}

module.exports = { sanitize };
