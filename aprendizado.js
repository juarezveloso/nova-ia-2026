// Treinamento por exemplos, executado no navegador. Cada exemplo corrigido
// substitui a versão anterior da mesma pergunta.
const aprendizadoBebi = (() => {
  const limite = 200;
  const ignoradas = new Set(['para', 'como', 'qual', 'quais', 'quando', 'onde', 'devo', 'sobre',
    'isso', 'essa', 'esse', 'pode', 'posso', 'fazer', 'minha', 'meus', 'você', 'voce']);

  function normalizar(texto) {
    return String(texto).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  function exemploValido(pergunta, resposta) {
    return typeof pergunta === 'string' && pergunta.length <= 300 && normalizar(pergunta).length >= 3 &&
      typeof resposta === 'string' && resposta.trim().length >= 3 && resposta.length <= 1200;
  }

  function treinar(exemplos, pergunta, resposta) {
    if (!exemploValido(pergunta, resposta)) return null;
    const chave = normalizar(pergunta);
    return exemplos.filter((exemplo) => normalizar(exemplo.pergunta) !== chave)
      .concat({ pergunta: pergunta.trim(), resposta: resposta.trim() }).slice(-limite);
  }

  function termos(texto) {
    return new Set(texto.split(' ').filter((palavra) => palavra.length >= 3 && !ignoradas.has(palavra)));
  }

  function selecionar(exemplos, consulta) {
    const chave = normalizar(consulta);
    const procurados = termos(chave);
    if (!chave) return [];

    return exemplos.map((exemplo, i) => {
      const candidato = normalizar(exemplo.pergunta);
      if (candidato === chave) return { exemplo, nota: 2, i };

      const palavras = termos(candidato);
      let comuns = 0;
      for (const termo of procurados) if (palavras.has(termo)) comuns++;
      const nota = comuns >= 2 ? (2 * comuns) / (palavras.size + procurados.size) : 0;
      return { exemplo, nota, i };
    }).filter((item) => item.nota >= 0.5)
      .sort((a, b) => b.nota - a.nota || b.i - a.i)
      .slice(0, 3).map((item) => item.exemplo);
  }

  return { limite, normalizar, exemploValido, treinar, selecionar };
})();
