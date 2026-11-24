import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './worker.js';

const url = 'https://bebi.test/';
const mensagem = (content) => ({ role: 'user', content });
const chamar = (body, run, extras = {}, headers = {}) => worker.fetch(new Request(url, {
  method: 'POST',
  body: JSON.stringify(body),
  headers,
}), { AI: { run }, ...extras });

function sse(...partes) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controlador) {
      for (const parte of partes) controlador.enqueue(encoder.encode(parte));
      controlador.close();
    },
  });
}

test('valida JSON, histórico, origem e modelo', async () => {
  const run = async (modelo, entrada) => {
    assert.equal(typeof modelo, 'string');
    assert.equal(entrada.messages.at(-1).content, 'Olá');
    return { response: 'Tudo bem' };
  };
  assert.equal((await chamar(null, run)).status, 400);
  assert.equal((await chamar({ messages: [] }, run)).status, 400);
  assert.equal((await chamar({}, run, {}, { Origin: 'https://outro.test' })).status, 403);
  const resposta = await chamar({ modelo: '__proto__', messages: [null, mensagem('Olá')] }, run);
  assert.equal(resposta.status, 200);
  assert.equal((await resposta.json()).reply, 'Tudo bem');
});

test('limita o corpo da requisição mesmo sem Content-Length', async () => {
  const resposta = await chamar({ system: 'x'.repeat(16 * 1024 * 1024) }, () => assert.fail());
  assert.equal(resposta.status, 413);
});

test('usa a hora de Brasília sem chamar a IA', async () => {
  const resposta = await chamar({ messages: [mensagem('Que horas são?')], fluxo: true }, () => assert.fail());
  assert.match(await resposta.text(), /horário de Brasília/);
});

test('preserva o final da pergunta e limita o contexto', async () => {
  const pergunta = 'x'.repeat(60000) + ' Qual é a conclusão?';
  const resposta = await chamar({ system: 'z'.repeat(30000), messages: [mensagem(pergunta)] }, async (_, entrada) => {
    assert.match(entrada.messages.at(-1).content, /Qual é a conclusão\?$/);
    assert.ok(entrada.messages.reduce((total, m) => total + m.content.length, 0) <= 48000);
    return { response: 'ok' };
  });
  assert.equal(resposta.status, 200);
});

test('pesquisa BUSCAR fragmentado em SSE e preserva zero e a última linha', async (t) => {
  t.mock.method(globalThis, 'fetch', async (endereco) => {
    const host = new URL(endereco).hostname;
    if (host === 'pt.wikipedia.org') return Response.json({ query: { pages: { 1: { title: 'Assunto', extract: 'Referência' } } } });
    return new Response('');
  });
  let chamadas = 0;
  const resposta = await chamar({ messages: [mensagem('Explique o assunto')], fluxo: true }, async (_, entrada) => {
    if (++chamadas === 1) return sse('data: {"response":"BUS"}\n', 'data: {"response":"CAR: Assunto"}');
    assert.match(entrada.messages.at(-1).content, /Referência/);
    return sse('data: {"response":"Valor: "}\n', 'data: {"response":0}');
  });
  const eventos = (await resposta.text()).trim().split('\n').map(JSON.parse);
  assert.equal(chamadas, 2);
  assert.equal(eventos[0].fontes[0].titulo, 'Wikipédia: Assunto');
  assert.equal(eventos.filter(e => e.tipo === 'texto').map(e => e.t).join(''), 'Valor: 0');
  assert.equal(eventos.at(-1).tipo, 'fim');
});

test('consulta somente as duas séries do IPCA, em paralelo', async (t) => {
  const pendentes = [];
  t.mock.method(globalThis, 'fetch', (endereco) => new Promise((resolver) => {
    const destino = new URL(endereco);
    assert.equal(destino.hostname, 'api.bcb.gov.br');
    pendentes.push({ caminho: destino.pathname, resolver });
    if (pendentes.length === 2) {
      for (const p of pendentes) p.resolver(Response.json([{ valor: '3.5', data: '01/10/2026' }]));
    }
  }));
  const resposta = await chamar({ messages: [mensagem('Qual o IPCA atual?')] }, async (_, entrada) => {
    assert.match(entrada.messages.at(-1).content, /IPCA do mês: 3.5%/);
    return { response: '3.5%' };
  });
  assert.equal(resposta.status, 200);
  assert.deepEqual(pendentes.map(p => p.caminho.match(/sgs\.(\d+)/)[1]), ['13522', '433']);
});

test('valida o destino antes de ler e bloqueia redirecionamento não permitido', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    new Response(null, { status: 302, headers: { Location: 'https://outro.test/' } }));
  for (const link of ['https://outro.test/doc', 'https://www.nasa.gov/doc']) {
    const resposta = await chamar({ messages: [mensagem('Leia ' + link)] }, async (_, entrada) => {
      assert.match(entrada.messages.at(-1).content, /Não foi possível ler o link/);
      return { response: 'Sem acesso' };
    });
    assert.equal(resposta.status, 200);
  }
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(fetch.mock.calls[0].arguments[1].redirect, 'manual');
});

test('a licença só é aceita por POST autenticado', async () => {
  let chamadas = 0;
  const env = { CHAVE_LICENCA: 'chave-de-teste', AI: { run: async () => { chamadas++; } } };
  const rota = url + 'aceitar-licenca';
  assert.equal((await worker.fetch(new Request(rota + '?confirmar=sim'), env)).status, 200);
  for (const chave of ['inválida', env.CHAVE_LICENCA]) {
    const resposta = await worker.fetch(new Request(rota, {
      method: 'POST', headers: { Origin: new URL(url).origin }, body: new URLSearchParams({ chave }),
    }), env);
    assert.equal(resposta.status, chave === env.CHAVE_LICENCA ? 200 : 403);
  }
  assert.equal(chamadas, 1);
});

test('mantém geração, análise de imagens e transcrição nos modelos dedicados', async () => {
  const imagem = 'aW1hZ2Vt';
  const gerar = await chamar({ desenhar: 'Uma flor' }, async (modelo) => {
    if (modelo.includes('flux')) return { image: imagem };
    return { response: 'A flower' };
  });
  assert.equal((await gerar.json()).imagem, imagem);

  const analisar = await chamar({ image: imagem, messages: [mensagem('Que horas são?')] },
    async (modelo, entrada) => {
      assert.match(modelo, /vision/);
      assert.match(entrada.prompt, /Que horas são/);
      return { description: 'Relógio' };
    });
  assert.equal((await analisar.json()).reply, 'Relógio');

  const audio = await chamar({ audio: imagem }, async (modelo, entrada) => {
    assert.match(modelo, /whisper/);
    assert.equal(entrada.language, 'pt');
    return { text: ' Teste de voz ' };
  });
  assert.equal((await audio.json()).texto, 'Teste de voz');
});

test('reconhece os cômodos da planta e descarta linhas duplicadas', async () => {
  const resposta = await chamar({ planta: 'aW1hZ2Vt' }, async () => ({
    response: 'SALA;1;3 m x 4 m\nSALA;1;3 m x 4 m\nQUARTO;2;3 m x 3 m',
  }));
  assert.equal(resposta.status, 200);
  const { comodos } = await resposta.json();
  assert.deepEqual(comodos.map(({ nome, area }) => [nome, area]), [['SALA', 12], ['QUARTO', 9]]);
});

test('modo código não consulta links nem segue pedidos BUSCAR do modelo', async (t) => {
  const rede = t.mock.method(globalThis, 'fetch', () => assert.fail('consulta externa'));
  const resposta = await chamar({
    codigo: true, messages: [mensagem('Revise o preço atual em https://www.nasa.gov/')],
  }, async () => ({ response: 'BUSCAR: um termo' }));
  assert.equal(resposta.status, 200);
  assert.equal(rede.mock.callCount(), 0);
});

test('retoma o assunto econômico anterior em perguntas curtas', async (t) => {
  const rede = t.mock.method(globalThis, 'fetch', async (endereco) => {
    assert.match(String(endereco), /sgs\.432\//);
    return Response.json([{ valor: '12.25', data: '19/11/2026' }]);
  });
  const r = await chamar({ messages: [
    mensagem('O que é Selic?'), { role: 'assistant', content: 'É a taxa básica.' }, mensagem('E hoje?'),
  ] }, async (_, dados) => {
    assert.match(dados.messages.at(-1).content, /12\.25%/);
    assert.match(dados.messages.at(-1).content, /19\/11\/2026/);
    return { response: '12,25%' };
  });
  assert.equal(r.status, 200);
  assert.equal(rede.mock.callCount(), 1);
});

test('usa a moeda explicitamente pedida e cita o provedor que respondeu', async (t) => {
  const chamadas = [];
  t.mock.method(globalThis, 'fetch', async (endereco) => {
    chamadas.push(String(endereco));
    if (String(endereco).includes('frankfurter')) return new Response('', { status: 503 });
    assert.match(String(endereco), /latest\/EUR$/);
    return Response.json({ rates: { BRL: 6.32 }, time_last_update_utc: '24/11/2026' });
  });
  const r = await chamar({ messages: [mensagem('Qual é a PTAX de hoje?'), mensagem('E o euro?')] },
    async (_, dados) => {
      assert.match(dados.messages.at(-1).content, /Euro: R\$ 6\.3200/);
      assert.doesNotMatch(dados.messages.at(-1).content, /Dólar|Banco Central/);
      return { response: 'R$ 6,32' };
    });
  assert.equal(r.status, 200);
  assert.equal(chamadas.length, 2);
  assert.match((await r.json()).fontes[0].titulo, /ExchangeRate-API/);
});

test('uma retomada ambígua não dispara pesquisa automática', async (t) => {
  const rede = t.mock.method(globalThis, 'fetch', () => assert.fail('busca sem assunto'));
  const r = await chamar({ messages: [mensagem('Compare euro e Selic.'), mensagem('E agora?')] },
    async (_, dados) => {
      assert.equal(dados.messages.at(-1).content, 'E agora?');
      return { response: 'Você quer saber do euro ou da Selic?' };
    });
  assert.equal(r.status, 200);
  assert.equal(rede.mock.callCount(), 0);
});
