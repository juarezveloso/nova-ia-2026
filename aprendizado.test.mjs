import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const codigo = readFileSync(new URL('./aprendizado.js', import.meta.url), 'utf8');
const { exemploValido, selecionar, treinar } = runInNewContext(codigo + '\naprendizadoBebi');

test('limites de armazenamento, validade e prioridade de correspondência exata', () => {
  let exemplos = [];
  for (let i = 0; i <= 200; i++) {
    exemplos = treinar(exemplos, 'Pergunta ' + i, 'Resposta ' + i);
  }
  assert.equal(exemplos.length, 200);
  assert.equal(exemplos[0].pergunta, 'Pergunta 1');
  assert.equal(selecionar(exemplos, 'Pergunta 100')[0].resposta, 'Resposta 100');
  assert.equal(exemploValido('É?!', 'Resposta'), false);
  assert.equal(treinar(exemplos, 'Pergunta', 'x'.repeat(1201)), null);
});

test('um milhão de casos gerados para seleção e correção de exemplos', () => {
  const grupos = ['estoque', 'projeto', 'contrato', 'serviço', 'equipamento'];
  for (let i = 0; i < 250_000; i++) {
    const grupo = grupos[i % grupos.length];
    const assunto = 'Inspeção do ' + grupo + ' código ' + i;
    const resposta = 'Resposta de referência ' + i;
    const exemplo = { pergunta: assunto, resposta };

    // Caso 1: consulta equivalente com acentuação e pontuação diferentes.
    assert.equal(selecionar([exemplo], 'INSPECAO do ' + grupo + ' CODIGO ' + i + '?')[0]?.resposta, resposta);

    // Caso 2: consulta semelhante, sem repetir a frase original.
    assert.equal(selecionar([exemplo], 'Como verificar ' + grupo + ' pelo código ' + i + '?')[0]?.resposta, resposta);

    // Caso 3: assunto diferente não recebe o exemplo.
    assert.equal(selecionar([exemplo], 'Biografia de cantora ' + i).length, 0);

    // Caso 4: correção substitui a resposta original, inclusive sem acentos.
    const corrigidos = treinar([exemplo], 'Inspecao do ' + grupo + ' codigo ' + i, 'Resposta corrigida ' + i);
    assert.equal(corrigidos.length, 1);
    assert.equal(corrigidos[0].resposta, 'Resposta corrigida ' + i);
  }
});
