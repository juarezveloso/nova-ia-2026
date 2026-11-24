import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const js = readFileSync(new URL('./codigo.js', import.meta.url), 'utf8');
const oficina = runInNewContext(js + '\noficinaCodigo');

test('abre código de texto e filtra nomes de arquivos de credenciais', () => {
  for (const nome of ['app.js', 'src.tsx', 'README.md', 'settings.toml']) assert.ok(oficina.podeAbrir(nome));
  for (const nome of ['.env.json', 'credentials.yaml', 'secret.txt', 'id_rsa.json', 'foto.png']) {
    assert.equal(oficina.podeAbrir(nome), false, nome);
  }
});

test('prepara uma proposta sem alterar o arquivo e rejeita trecho ambíguo', () => {
  const resposta = JSON.stringify({ resumo: 'Altere o retorno.', trecho: 'return 1;', substituicao: 'return 2;' });
  assert.equal(oficina.analisarResposta(resposta, 'function f() { return 1; }').proposta, 'function f() { return 2; }');
  assert.throws(() => oficina.analisarResposta(resposta, 'return 1;\nreturn 1;'), /trecho único/);
  assert.throws(() => oficina.analisarResposta(resposta, 'return 3;'), /trecho único/);
  assert.equal(oficina.analisarResposta('{"resumo":"Pode manter.","trecho":null}', 'return 3;').proposta, null);
});

test('limita o contexto auxiliar e mantém o código fora do gatilho de pesquisa', () => {
  const ativo = { nome: 'app.js', texto: 'const a = 1;' };
  const pedido = oficina.montarPedido(ativo, ativo.texto, [ativo, { nome: 'outro.js', texto: 'x'.repeat(10000) }], 'revise');
  const contexto = JSON.parse(pedido.messages[0].content);
  assert.equal(contexto.ativo.conteudo, ativo.texto);
  assert.equal(contexto.apoio[0].trecho.length, 8000);
  assert.doesNotMatch(pedido.messages.at(-1).content, /const a/);
  assert.equal(pedido.codigo, true);
});
