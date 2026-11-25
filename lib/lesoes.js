// Histórico de lesões do jogador (campo "lesoes" do cadastro).
// Usado pelo cadastro de jogadores e pelo departamento médico.

function hoje() { return new Date().toISOString().split('T')[0]; }

// Mantém o histórico de lesões automaticamente quando o status muda.
function trackInjury(prev, next, data) {
  const dia = data || hoje();
  const lesoes = Array.isArray(prev.lesoes) ? prev.lesoes.map(l => ({ ...l })) : [];
  const aberta = lesoes.find(l => !l.fim);
  if (next.status === 'Lesão') {
    if (!aberta) lesoes.push({ inicio: dia, descricao: next.obs || 'Lesão', fim: null });
    else if (next.obs && next.obs !== aberta.descricao) aberta.descricao = next.obs;
  } else if (aberta) {
    aberta.fim = dia;
  }
  return lesoes;
}

module.exports = { trackInjury };
