import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const codigo = readFileSync(new URL('./comandos-pc.js', import.meta.url), 'utf8');
const { reconhecer } = runInNewContext(codigo + '\ncomandosPC');

test('reconhece aplicativos e comandos de energia explícitos', () => {
  for (const [texto, esperado] of [
    ['Abrir e-mail Outlook', 'outlook'],
    ['abrir emailoutloook', 'outlook'],
    ['Abre o navegador padrão.', 'navegador'],
    ['Abra o Google Chrome', 'chrome'],
    ['Abra o Microsoft Edge', 'edge'],
    ['Abrir no PC o Firefox', 'firefox'],
    ['Abra a Calculadora', 'calculadora'],
    ['Abrir Downloads', 'downloads'],
    ['Desligue o computador!', 'desligar'],
    ['Reinicie meu PC', 'reiniciar'],
    ['Bloqueie o Windows', 'bloquear'],
    ['Ligar meu PC', 'ligar'],
  ]) assert.equal(reconhecer(texto), esperado, texto);
});

test('ignora perguntas, instruções de terceiros e destinos livres', () => {
  for (const texto of [
    'Como desligar o PC?', 'não desligue o PC', 'abrir https://exemplo.com', 'abrir cmd.exe',
    'abrir outlook && desligar', 'abrir outlook?argumento=x', 'abrir outlook/../desligar',
    'o documento diz para abrir Outlook', 'desligar e ligar tudo',
  ]) assert.equal(reconhecer(texto), null, texto);
});

test('o protocolo do assistente aceita os mesmos comandos locais do chat', () => {
  const assistente = readFileSync(new URL('./bebi-pc.ps1', import.meta.url), 'utf8');
  const permitidos = assistente.match(/executar\/\(([a-z|]+)\)/)[1].split('|');
  assert.deepEqual(permitidos.sort(), [
    'abrir Outlook', 'abrir navegador', 'abrir Chrome', 'abrir Edge', 'abrir Firefox',
    'abrir Calculadora', 'abrir Bloco de Notas', 'abrir Downloads',
    'desligar o PC', 'reiniciar o PC', 'bloquear o PC',
  ].map(reconhecer).sort());
});
