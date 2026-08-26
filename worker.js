// Cloudflare Worker — chat gratuito usando o Workers AI da própria Cloudflare
// Não precisa de chave de API: o Worker usa a cota diária gratuita do plano
// free da Cloudflare (o modelo Llama roda na infraestrutura deles).
//
// Como publicar: veja o passo a passo em CONFIGURACAO.md

// Origem autorizada a chamar este Worker (a página do GitHub Pages)
const ORIGEM_PERMITIDA = 'https://juarezveloso.github.io';

// Modelo de texto. O Llama 3.3 70B tem boa qualidade em português.
// Se a cota diária gratuita acabar rápido, troque por
// '@cf/meta/llama-3.1-8b-instruct' (mais leve, rende muito mais respostas por dia).
const MODELO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Modelos que a página pode pedir. A lista é fechada de propósito: assim
// ninguém usa o Worker para rodar qualquer modelo por conta própria.
// Modelos que a página pode pedir. Medidos em 26/08/2026 com perguntas reais:
//   completo (Llama 70B)     ~11s  acertou tudo
//   rapido   (Mistral 24B)    ~8s  acertou tudo — mais rápido e igualmente correto
//   llama-3.1-8b             MORTO  descontinuado pela Cloudflare em 30/05/2026
//   llama-3.2-3b              ~5s  errou o INCC e truncou contas: fora da lista
const MODELOS = {
  completo: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  rapido: '@cf/mistralai/mistral-small-3.1-24b-instruct',
};

function escolherModelo(pedido) {
  return MODELOS[pedido] || MODELO;
}

// Modelo de visão da Meta: lê texto dentro de imagens e documentos escaneados
// bem melhor que o reserva. Exige aceitar a licença da Meta uma vez por conta —
// abra /aceitar-licenca neste Worker para fazer isso.
const MODELO_VISAO = '@cf/meta/llama-3.2-11b-vision-instruct';

// Reserva sem exigência de licença (usado enquanto a licença não for aceita).
const MODELO_VISAO_RESERVA = '@cf/llava-hf/llava-1.5-7b-hf';

// ── Imagens ───────────────────────────────────────────────────────────────
// Desenhar sai barato: o flux-1-schnell custa cerca de 50 neurônios por
// imagem — menos que uma pergunta com documento anexado. Editar custa mais,
// porque o img2img roda 20 passos de difusão em vez de 6.
const MODELO_IMAGEM = '@cf/black-forest-labs/flux-1-schnell';

// Modelos capazes de transformar uma imagem existente (img2img), em ordem de
// preferência. Medido em 26/08/2026: o sd-1.5-img2img (Beta) vive sem
// capacidade — erro 3040 em 5 de 5 tentativas —, por isso deixou de ser o
// primeiro. A cadeia se conserta sozinha se a Cloudflare liberar capacidade.
const MODELOS_IMAGEM_EDICAO = [
  '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  '@cf/lykon/dreamshaper-8-lcm',
  '@cf/runwayml/stable-diffusion-v1-5-img2img',
];

// Teto de caracteres enviados ao modelo por requisição (protege o limite de contexto).
const LIMITE_CARACTERES = 48000;

const CORS = {
  'Access-Control-Allow-Origin': ORIGEM_PERMITIDA,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Página de aceite da licença do modelo de visão da Meta.
    // O aceite é um ato do titular da conta, por isso exige um clique humano.
    if (url.pathname === '/aceitar-licenca') {
      return await paginaAceite(url, env);
    }

    // Resposta ao preflight do navegador
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: { message: 'Use POST' } }, 405);
    }

    if (!env.AI) {
      return jsonResponse(
        { error: { message: 'Vinculação "AI" (Workers AI) não configurada no Worker — veja CONFIGURACAO.md' } },
        500,
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: { message: 'Corpo JSON inválido' } }, 400);
    }

    const historico = Array.isArray(body.messages) ? body.messages : [];
    const sistema = typeof body.system === 'string' ? body.system : '';

    // ── Caminho 0: pedido de desenho → gera ou edita uma imagem ──────────────
    // Campo 'desenhar' (e não 'image', que já é a imagem enviada para análise).
    if (typeof body.desenhar === 'string' && body.desenhar) {
      return await gerarImagem(env, body);
    }

    // ── Caminho 0: áudio enviado → transcrição (voz para texto) ──────────────
    if (typeof body.audio === 'string' && body.audio) {
      return await transcreverAudio(env, body);
    }

    // ── Caminho 1: imagem anexada → modelo de visão ──────────────────────────
    if (typeof body.image === 'string' && body.image) {
      return await analisarImagem(env, body, sistema);
    }

    // ── Caminho 2: conversa em texto ─────────────────────────────────────────
    // Quando há documento anexado, a última mensagem é grande: mantém menos
    // histórico para caber no contexto do modelo.
    const ultima = historico[historico.length - 1];
    const temDocumento = ultima && typeof ultima.content === 'string' && ultima.content.length > 4000;
    const recentes = historico.slice(temDocumento ? -3 : -12);

    const messages = [];
    if (sistema) messages.push({ role: 'system', content: sistema });

    for (const m of recentes) {
      if ((m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
        messages.push({ role: m.role, content: m.content });
      }
    }

    // Corta o excesso a partir das mensagens mais antigas, preservando a última.
    let total = messages.reduce((s, m) => s + m.content.length, 0);
    while (total > LIMITE_CARACTERES && messages.length > 2) {
      const removida = messages.splice(sistema ? 1 : 0, 1)[0];
      total -= removida.content.length;
    }
    const alvo = messages[messages.length - 1];
    if (alvo && alvo.content.length > LIMITE_CARACTERES) {
      alvo.content = alvo.content.slice(0, LIMITE_CARACTERES) +
        '\n\n[...documento cortado por limite de tamanho...]';
    }

    const fontes = [];
    const modeloEmUso = escolherModelo(body.modelo);

    // Data e hora reais: sozinho, o modelo não sabe que dia é hoje.
    messages.splice(sistema ? 1 : 0, 0, {
      role: 'system',
      content: 'Agora é ' + agoraNoBrasil() + '. Use esta data sempre que a pergunta ' +
        'depender do tempo ("hoje", "atualmente", "este ano").\n' +
        'Se a resposta exigir informação atual que você não possui (notícias, cotações, ' +
        'preços, fatos recentes), responda APENAS com: BUSCAR: <termos>',
    });

    // Endereço na mensagem: lemos a página e entregamos o conteúdo ao modelo.
    const enderecos = (alvo && alvo.content ? alvo.content.match(/https?:\/\/[^\s<>")]+/g) : null) || [];
    if (enderecos.length) {
      try {
        const pagina = await comPrazo(lerPagina(enderecos[0]), PRAZO_BUSCA);
        alvo.content = 'Conteúdo lido da página ' + pagina.url + ' ("' + pagina.titulo + '"):\n' +
          pagina.texto + '\n\n---\nPergunta do usuário: ' + alvo.content;
        fontes.push({ titulo: pagina.titulo, url: pagina.url });
      } catch (e) { /* sem a página, segue com o que tem */ }
    }

    // Perguntas claramente dependentes de dado atual disparam a pesquisa sozinhas.
    // Antes dependíamos só do modelo escrever BUSCAR, e ele nem sempre escrevia —
    // foi assim que "qual a PTAX de hoje?" passou sem consultar cotação nenhuma.
    const PADRAO_ATUAL = /ptax|d[óo]lar|dolar|euro|c[âa]mbio|cota[çc][ãa]o|moeda|bitcoin|cripto|selic|ipca|incc|infla[çc][ãa]o|juros|ibovespa|b[óo]lsa|not[íi]cia|[úu]ltimas|hoje|agora|atual|recente|pre[çc]o|quanto (est[áa]|custa)|o que (aconteceu|houve)/i;

    let jaPesquisou = false;
    if (alvo && !enderecos.length && PADRAO_ATUAL.test(alvo.content)) {
      try {
        const achado = await pesquisar(alvo.content.slice(0, 200));
        if (achado.texto) {
          achado.fontes.forEach(function (f) { fontes.push(f); });
          alvo.content = 'Dados consultados na internet agora (' + agoraNoBrasil() +
            '). São reais e atuais.\n\n' + achado.texto +
            '\n\n---\nUsando os dados acima, responda: ' + alvo.content +
            '\n\nCite os números e as datas. Se os dados acima não cobrirem a pergunta, ' +
            'diga isso claramente em vez de inventar. Nunca diga que não tem acesso a ' +
            'informação em tempo real.';
          jaPesquisou = true;
        }
      } catch (e) { /* segue sem a pesquisa */ }
    }

    // Modo fluxo: a resposta sai em pedaços, conforme o modelo escreve.
    // Uma resposta longa levava 25s de espera em silêncio — tempo suficiente
    // para a rede do celular derrubar a conexão. Em fluxo, o primeiro pedaço
    // chega em ~1s e os dados continuam correndo, o que segura a conexão viva.
    if (body.fluxo) {
      try {
        const r = await chamarIA(env, modeloEmUso, {
          messages: messages, max_tokens: 1200, stream: true,
        });
        return new Response(montarFluxo(r.resultado, fontes), {
          status: 200,
          headers: Object.assign({}, CORS, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
          }),
        });
      } catch (e) {
        return jsonResponse({ error: { message: descreverErro(e) } }, 502);
      }
    }

    try {
      let r = await chamarIA(env, modeloEmUso, { messages, max_tokens: 1200 });
      let resultado = r.resultado;
      let modeloRespondeu = r.modelo;
      let resposta = (resultado.response || '');
      if (jaPesquisou) resposta = resposta.replace(/BUSCAR:.*/gi, '').trim();

      // O modelo pediu pesquisa: buscamos e perguntamos de novo com os dados.
      const pedido = jaPesquisou ? null : resposta.match(/BUSCAR:\s*(.+)/i);
      if (pedido && alvo) {
        const termos = pedido[1].split('\n')[0].trim().slice(0, 120);
        const achado = await pesquisar(termos);
        achado.fontes.forEach(function (f) { fontes.push(f); });

        // Os dados vão DENTRO da pergunta. Entregues como aviso do sistema, o
        // modelo os ignorava e repetia "não tenho acesso a informações em tempo real".
        const perguntaOriginal = alvo.content;
        alvo.content = achado.texto
          ? 'Os dados abaixo foram consultados na internet agora (' + agoraNoBrasil() +
            '). São reais, atuais e confiáveis.\n\n' + achado.texto +
            '\n\n---\nUsando os dados acima, responda: ' + perguntaOriginal +
            '\n\nCite os números e as datas encontrados. Nunca diga que não tem acesso a ' +
            'informação em tempo real: os dados atuais estão logo acima.'
          : 'A consulta à internet sobre "' + termos + '" não trouxe resultados.\n\n' +
            'Responda com o que você sabe e avise que não conseguiu confirmar dados atuais.\n' +
            'Pergunta: ' + perguntaOriginal;

        r = await chamarIA(env, modeloEmUso, { messages, max_tokens: 1200 });
        resultado = r.resultado; modeloRespondeu = r.modelo;
        resposta = (resultado.response || '').replace(/BUSCAR:.*/gi, '').trim();

        // Se os dados não serviram, o modelo às vezes devolve vazio: refazemos
        // a pergunta original em vez de deixar o usuário sem resposta.
        if (!resposta) {
          alvo.content = perguntaOriginal;
          r = await chamarIA(env, modeloEmUso, { messages, max_tokens: 1200 });
          resultado = r.resultado; modeloRespondeu = r.modelo;
          resposta = (resultado.response || '').replace(/BUSCAR:.*/gi, '').trim();
        }
      }

      const saida = { reply: resposta, fontes: fontes, modelo: modeloRespondeu };
      if (body.debug) saida.contexto = alvo ? alvo.content.slice(0, 1200) : null;
      return jsonResponse(saida, 200);
    } catch (e) {
      return jsonResponse({ error: { message: descreverErro(e) } }, 502);
    }
  },
};

// O gerador entende inglês muito melhor que português: em português o pedido
// sai literal e pobre. Traduzir custa cerca de 3 neurônios e muda o resultado.
async function promptDeImagem(env, pedido) {
  try {
    const r = await chamarIA(env, MODELOS.rapido, {
      messages: [
        { role: 'system', content: 'Turn the user request (written in Portuguese) into ' +
          'ONE English prompt for an image generator. Reply with the prompt only: no ' +
          'quotes, no preamble, no explanation, no line breaks. Add concrete visual ' +
          'detail — subject, setting, lighting, style. Maximum 60 words.' },
        { role: 'user', content: pedido },
      ],
      max_tokens: 120,
    });
    const bruto = (r.resultado.response || '').trim();
    const primeira = bruto.split('\n').filter(function (l) { return l.trim(); })[0] || '';
    const limpo = primeira.replace(/^["'`\s]+|["'`\s]+$/g, '').slice(0, 600);
    return limpo || pedido;
  } catch (e) {
    return pedido;   // sem tradução, tenta o pedido original mesmo
  }
}

// O flux devolve base64; o img2img devolve um fluxo binário. Uniformizamos os
// dois no mesmo JSON, senão a página teria de tratar dois formatos diferentes.
async function fluxoParaBase64(fluxo) {
  const leitor = fluxo.getReader();
  const pedacos = [];
  let total = 0;
  while (true) {
    const p = await leitor.read();
    if (p.done) break;
    pedacos.push(p.value);
    total += p.value.length;
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (let i = 0; i < pedacos.length; i++) { tudo.set(pedacos[i], pos); pos += pedacos[i].length; }
  // Em blocos: String.fromCharCode(...vetor) estoura a pilha com imagem grande.
  let texto = '';
  for (let i = 0; i < tudo.length; i += 8192) {
    texto += String.fromCharCode.apply(null, tudo.subarray(i, i + 8192));
  }
  return btoa(texto);
}

function base64ParaBytes(base64) {
  const binario = atob(base64);
  const bytes = new Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

// Descreve uma imagem em inglês, para depois redesenhá-la.
async function descreverImagem(env, bytes) {
  const modelos = [MODELO_VISAO, MODELO_VISAO_RESERVA];
  for (let i = 0; i < modelos.length; i++) {
    try {
      const saida = await env.AI.run(modelos[i], {
        image: bytes,
        prompt: 'Describe this image in one detailed English sentence: main subject, ' +
          'colors, composition and style. Reply with the description only.',
        max_tokens: 200,
      });
      const t = (saida.response || saida.description || saida.text || '').trim();
      if (t) return t;
    } catch (e) { /* sem esse modelo, tenta o próximo */ }
  }
  return '';
}

// Volta por cima quando os modelos de img2img estão sem capacidade: a visão
// descreve a imagem e o flux desenha de novo já com a mudança pedida. Não
// preserva a foto pixel a pixel, mas resolve o caso comum ("deixe em
// aquarela", "versão futurista") usando só modelos que funcionam.
async function recriarComVisao(env, origem, pedido) {
  try {
    const descricao = await descreverImagem(env, base64ParaBytes(origem));
    if (!descricao) return null;
    const prompt = await promptDeImagem(env,
      'Imagem original: ' + descricao + '\nMudança pedida: ' + pedido +
      '\nDescreva a imagem final, já com a mudança aplicada.');
    const r = await chamarIA(env, MODELO_IMAGEM, { prompt: prompt, steps: 6 }, null);
    if (!r.resultado || !r.resultado.image) return null;
    return {
      imagem: r.resultado.image, tipo: 'image/jpeg', prompt: prompt,
      modelo: MODELO_IMAGEM, recriada: true, descricao: descricao,
    };
  } catch (e) {
    return null;
  }
}

// Gera uma imagem nova, ou transforma a que o usuário anexou (img2img).
async function gerarImagem(env, body) {
  const pedido = String(body.desenhar).slice(0, 600).trim();
  if (!pedido) {
    return jsonResponse({ error: { message: 'Diga o que eu devo desenhar.' } }, 400);
  }

  const prompt = await promptDeImagem(env, pedido);
  const editando = typeof body.origem === 'string' && body.origem.length > 0;

  try {
    if (editando) {
      // força: 0 mantém o original, 1 ignora ele. 0,6 muda o visual e ainda
      // deixa a foto reconhecível, que é o que se espera de "mude o estilo".
      const forca = Math.min(0.9, Math.max(0.2, Number(body.forca) || 0.6));
      const entrada = {
        prompt: prompt,
        image_b64: body.origem,
        strength: forca,
        guidance: 7.5,
        num_steps: 20,
      };
      // Uma tentativa por modelo: a própria cadeia já é a insistência, e
      // repetir três vezes em cada um levaria a espera para mais de 25s.
      let ultima = null;
      for (let i = 0; i < MODELOS_IMAGEM_EDICAO.length; i++) {
        try {
          const saida = await env.AI.run(MODELOS_IMAGEM_EDICAO[i], entrada);
          return jsonResponse({
            imagem: await fluxoParaBase64(saida),
            tipo: 'image/png',
            prompt: prompt,
            modelo: MODELOS_IMAGEM_EDICAO[i],
          }, 200);
        } catch (e) {
          ultima = e;   // sem capacidade ou indisponível: tenta o próximo
        }
      }

      // Nenhum modelo de edição atendeu: redesenha a partir da descrição.
      const recriada = await recriarComVisao(env, body.origem, pedido);
      if (recriada) return jsonResponse(recriada, 200);
      throw ultima;
    }

    // 6 passos em vez dos 4 padrão: melhora visivelmente o traço e ainda
    // deixa a imagem por volta de 60 neurônios.
    const r = await chamarIA(env, MODELO_IMAGEM, { prompt: prompt, steps: 6 }, null);
    const base64 = r.resultado && r.resultado.image;
    if (!base64) {
      return jsonResponse({ error: { message: 'O gerador não devolveu imagem.' } }, 502);
    }
    return jsonResponse({
      imagem: base64, tipo: 'image/jpeg', prompt: prompt, modelo: MODELO_IMAGEM,
    }, 200);
  } catch (e) {
    const erro = { message: descreverErro(e) };
    // O texto cru do erro so sai a pedido: ajuda a diagnosticar sem poluir a tela.
    if (body.debug) erro.bruto = e && e.message ? e.message : String(e);
    return jsonResponse({ error: erro }, 502);
  }
}

// Analisa uma imagem (ou página escaneada) com o modelo de visão.
async function analisarImagem(env, body, sistema) {
  let bytes;
  try {
    const binario = atob(body.image);
    bytes = new Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  } catch {
    return jsonResponse({ error: { message: 'Imagem inválida (base64 malformado)' } }, 400);
  }

  const ultima = Array.isArray(body.messages) && body.messages.length
    ? body.messages[body.messages.length - 1]
    : null;
  const pergunta = ultima && typeof ultima.content === 'string' && ultima.content.trim()
    ? ultima.content
    : 'Descreva e analise em detalhes o conteúdo desta imagem ou documento.';

  const prompt = (sistema ? sistema + '\n\n' : '') +
    'Responda sempre em português brasileiro.\n\n' + pergunta;

  // Tenta o modelo da Meta; se a licença ainda não foi aceita, cai para o reserva.
  const modelos = [MODELO_VISAO, MODELO_VISAO_RESERVA];
  for (let i = 0; i < modelos.length; i++) {
    try {
      const r = await chamarIA(env, modelos[i], { image: bytes, prompt, max_tokens: 1200 }, null);
      const resultado = r.resultado;
      const texto = resultado.response || resultado.description || resultado.text || '';
      return jsonResponse({ reply: texto, modelo: modelos[i] }, 200);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      const licencaPendente = /must submit the prompt/i.test(msg);
      if (!licencaPendente || i === modelos.length - 1) {
        return jsonResponse({ error: { message: descreverErro(e) } }, 502);
      }
      // licença pendente: tenta o próximo modelo da lista
    }
  }
  return jsonResponse({ error: { message: 'Nenhum modelo de visão disponível' } }, 502);
}

// Página de aceite da licença (aberta pelo titular da conta no navegador).
async function paginaAceite(url, env) {
  if (url.searchParams.get('confirmar') !== 'sim') {
    return html('Aceitar a licença do modelo de visão', [
      '<p>Este passo libera o modelo de visão da Meta (<code>llama-3.2-11b-vision</code>),',
      'que lê texto dentro de imagens e documentos escaneados muito melhor que o modelo atual.</p>',
      '<p>Ao confirmar, você aceita a <b>Licença Comunitária do Llama 3.2</b> e a',
      '<b>Política de Uso Aceitável</b> da Meta, e declara que não é domiciliado na União Europeia.</p>',
      '<p><a class="botao" href="/aceitar-licenca?confirmar=sim">Li e aceito a licença</a></p>',
      '<p class="links">',
      '<a href="https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/LICENSE" target="_blank">Ler a licença</a> &middot;',
      '<a href="https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/USE_POLICY.md" target="_blank">Ler a política de uso</a>',
      '</p>',
    ].join(' '));
  }

  if (!env.AI) return html('Erro', '<p>Vinculação "AI" não configurada neste Worker.</p>');

  try {
    await env.AI.run(MODELO_VISAO, { prompt: 'agree' });
    return html('Licença aceita', [
      '<p>Pronto — o modelo de visão da Meta está liberado nesta conta da Cloudflare.</p>',
      '<p>Pode voltar ao chat e anexar imagens ou PDFs escaneados.</p>',
      '<p class="links"><a href="https://juarezveloso.github.io/nova-ia-2026/">Ir para o chat</a></p>',
    ].join(' '));
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    return html('Não deu certo', '<p>' + escaparHtml(msg) + '</p>');
  }
}

function html(titulo, corpo) {
  const pagina = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + titulo + '</title><style>' +
    'body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0f;color:#e8e8f0;' +
    'display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}' +
    'main{max-width:540px;line-height:1.7}h1{font-size:20px;color:#00e5ff;margin-bottom:16px}' +
    'code{background:#1a1a24;padding:2px 6px;border-radius:4px;font-size:13px}' +
    '.botao{display:inline-block;background:linear-gradient(135deg,#6c63ff,#8b5cf6);color:#fff;' +
    'text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;margin-top:8px}' +
    '.links{font-size:13px;color:#8888aa;margin-top:20px}.links a{color:#8888aa}' +
    '</style></head><body><main><h1>' + titulo + '</h1>' + corpo + '</main></body></html>';
  return new Response(pagina, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escaparHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Transcreve áudio gravado pelo visitante (usado quando o navegador não tem
// reconhecimento de voz nativo). Tenta o Whisper turbo e cai para o básico.
async function transcreverAudio(env, body) {
  try {
    const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: body.audio,
      task: 'transcribe',
      language: 'pt',
    });
    if (r && typeof r.text === 'string') {
      return jsonResponse({ texto: r.text.trim(), modelo: 'whisper-large-v3-turbo' }, 200);
    }
  } catch (e) {
    // segue para o modelo básico
  }

  try {
    const binario = atob(body.audio);
    const bytes = new Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    const r = await env.AI.run('@cf/openai/whisper', { audio: bytes });
    return jsonResponse({ texto: (r && r.text ? r.text : '').trim(), modelo: 'whisper' }, 200);
  } catch (e) {
    return jsonResponse({ error: { message: descreverErro(e) } }, 502);
  }
}

// ── Informação em tempo real ──────────────────────────────────────────────
// Todas as fontes abaixo são públicas e gratuitas: nenhuma exige chave.

const FUSO = 'America/Sao_Paulo';
const PRAZO_BUSCA = 6000;   // ms por fonte: uma fonte lenta não trava a resposta

function agoraNoBrasil() {
  const agora = new Date();
  try {
    const data = agora.toLocaleDateString('pt-BR', {
      timeZone: FUSO, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
    const hora = agora.toLocaleTimeString('pt-BR', {
      timeZone: FUSO, hour: '2-digit', minute: '2-digit',
    });
    return data + ' às ' + hora + ' (horário de Brasília)';
  } catch (e) {
    return agora.toISOString();
  }
}

function comPrazo(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise(function (_, rejeitar) {
      setTimeout(function () { rejeitar(new Error('tempo esgotado')); }, ms);
    }),
  ]);
}

function limparTags(s) {
  return String(s)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#([0-9]+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-fA-F]+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/\s+/g, ' ').trim();
}

// Notícias. O Google Notícias responde 503 aos IPs da Cloudflare, então usamos
// o Bing (que aceita busca por termos) e, como reserva, feeds brasileiros
// filtrados pelas palavras da pergunta.
const FEEDS_BRASIL = [
  'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml',
  'https://g1.globo.com/rss/g1/',
];

function semAcento(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extrairItens(xml, limite) {
  const itens = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let bloco;
  while ((bloco = regex.exec(xml)) !== null && itens.length < limite) {
    const corpo = bloco[1];
    const t = corpo.match(/<title>([\s\S]*?)<\/title>/);
    const l = corpo.match(/<link>([\s\S]*?)<\/link>/);
    const p = corpo.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!t) continue;
    itens.push({
      titulo: limparTags(t[1]),
      url: l ? limparTags(l[1]) : '',
      data: p ? limparTags(p[1]).slice(0, 22) : '',
    });
  }
  return itens;
}

function filtrarPorTermos(itens, termos) {
  const palavras = semAcento(termos).split(/[^a-z0-9]+/)
    .filter(function (p) { return p.length > 3; });
  if (!palavras.length) return itens;
  return itens.filter(function (it) {
    const alvo = semAcento(it.titulo);
    return palavras.some(function (p) { return alvo.indexOf(p) !== -1; });
  });
}

async function buscarNoticias(termos) {
  // 1ª opção: busca por termos no Bing Notícias
  try {
    const url = 'https://www.bing.com/news/search?q=' + encodeURIComponent(termos) +
      '&format=RSS&cc=br&setlang=pt-BR';
    const r = await fetch(url, { headers: { 'User-Agent': 'NovaIA2026/1.0' } });
    if (r.ok) {
      const itens = extrairItens(await r.text(), 6);
      if (itens.length) return itens;
    }
  } catch (e) { /* cai para os feeds brasileiros */ }

  // 2ª opção: feeds brasileiros filtrados pelas palavras da pergunta
  const respostas = await Promise.all(FEEDS_BRASIL.map(function (endereco) {
    return comPrazo(fetch(endereco, { headers: { 'User-Agent': 'NovaIA2026/1.0' } })
      .then(function (r) { return r.ok ? r.text() : ''; }), PRAZO_BUSCA)
      .catch(function () { return ''; });
  }));

  let todos = [];
  respostas.forEach(function (xml) {
    if (xml) todos = todos.concat(extrairItens(xml, 40));
  });

  // Só devolvemos manchetes que casem com a pergunta. Antes, quando nada casava,
  // devolvíamos as manchetes gerais — e o modelo respondia sobre outro assunto.
  const genericas = ['noticia', 'noticias', 'ultimas', 'ultimo', 'hoje', 'agora',
    'recente', 'recentes', 'atual', 'atuais', 'sobre', 'quais', 'brasil'];
  const especificas = semAcento(termos).split(/[^a-z0-9]+/).filter(function (p) {
    return p.length > 3 && genericas.indexOf(p) === -1;
  });
  if (!especificas.length) return todos.slice(0, 6);   // pedido genérico de notícias

  const filtrados = filtrarPorTermos(todos, especificas.join(' '));
  return filtrados.slice(0, 6);
}
// Resumo enciclopédico (Wikipédia em português)
async function buscarWikipedia(termos) {
  const busca = 'https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
    encodeURIComponent(termos) + '&format=json&srlimit=1&origin=*';
  const r = await fetch(busca, { headers: { 'User-Agent': 'NovaIA2026/1.0' } });
  const d = await r.json();
  const primeiro = d && d.query && d.query.search && d.query.search[0];
  if (!primeiro) return null;

  const titulo = primeiro.title;
  const endereco = 'https://pt.wikipedia.org/wiki/' + encodeURIComponent(titulo.replace(/ /g, '_'));
  try {
    const resumo = await fetch('https://pt.wikipedia.org/api/rest_v1/page/summary/' +
      encodeURIComponent(titulo.replace(/ /g, '_')),
      { headers: { 'User-Agent': 'NovaIA2026/1.0' } });
    const rd = await resumo.json();
    return { titulo: titulo, texto: (rd.extract || '').slice(0, 900), url: endereco };
  } catch (e) {
    return { titulo: titulo, texto: limparTags(primeiro.snippet), url: endereco };
  }
}

// Cotações de moedas em tempo real
// Cotações. A AwesomeAPI foi descartada: dos IPs da Cloudflare ela responde
// 429 (cota compartilhada estourada). Usamos o Banco Central como fonte
// oficial e fontes internacionais como reserva.
async function pegarJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'NovaIA2026/1.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);   // sem isto, um erro vira dado vazio
  return await r.json();
}

function dataParaPtax(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return mm + '-' + dd + '-' + d.getUTCFullYear();
}

// Dólar oficial (PTAX do Banco Central), buscando os últimos dias úteis
async function cotacaoBancoCentral() {
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 7 * 24 * 3600 * 1000);
  const url = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/' +
    'CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)' +
    '?@dataInicial=%27' + dataParaPtax(inicio) + '%27' +
    '&@dataFinalCotacao=%27' + dataParaPtax(hoje) + '%27' +
    '&$top=1&$orderby=dataHoraCotacao%20desc&$format=json';
  const d = await pegarJson(url);
  const c = d && d.value && d.value[0];
  if (!c || !c.cotacaoVenda) throw new Error('sem cotação do BC');
  return {
    nome: 'PTAX do Banco Central (dólar oficial) — compra R$ ' +
      Number(c.cotacaoCompra).toFixed(4) + ' / venda',
    valor: Number(c.cotacaoVenda).toFixed(4),
    quando: String(c.dataHoraCotacao).slice(0, 19),
  };
}

// Dólar e euro por fontes internacionais (reserva)
async function cotacaoInternacional() {
  try {
    const d = await pegarJson('https://api.frankfurter.app/latest?from=USD&to=BRL,EUR');
    const saida = [];
    if (d.rates && d.rates.BRL) {
      saida.push({ nome: 'Dólar americano', valor: Number(d.rates.BRL).toFixed(4), quando: d.date });
    }
    if (d.rates && d.rates.BRL && d.rates.EUR) {
      saida.push({
        nome: 'Euro',
        valor: (Number(d.rates.BRL) / Number(d.rates.EUR)).toFixed(4),
        quando: d.date,
      });
    }
    if (saida.length) return saida;
    throw new Error('sem taxas');
  } catch (e) {
    const d = await pegarJson('https://open.er-api.com/v6/latest/USD');
    if (!d.rates || !d.rates.BRL) throw new Error('sem taxas');
    return [{
      nome: 'Dólar americano',
      valor: Number(d.rates.BRL).toFixed(4),
      quando: d.time_last_update_utc || '',
    }];
  }
}

async function cotacaoBitcoin() {
  const d = await pegarJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl');
  if (!d.bitcoin || !d.bitcoin.brl) throw new Error('sem bitcoin');
  return { nome: 'Bitcoin', valor: Number(d.bitcoin.brl).toLocaleString('pt-BR'), quando: 'agora' };
}

// Indicadores econômicos oficiais (séries do Banco Central)
const SERIES_BC = [
  { codigo: 432, nome: 'Taxa Selic (meta, ao ano)', sufixo: '%' },
  { codigo: 13522, nome: 'IPCA acumulado em 12 meses', sufixo: '%' },
  { codigo: 433, nome: 'IPCA do mês', sufixo: '%' },
  { codigo: 192, nome: 'INCC (custo da construção civil), no mês', sufixo: '%' },
];

async function buscarIndicadores() {
  const achados = await Promise.all(SERIES_BC.map(function (s) {
    return comPrazo(
      pegarJson('https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + s.codigo + '/dados/ultimos/1?formato=json'),
      PRAZO_BUSCA
    ).then(function (d) {
      const ponto = d && d[0];
      if (!ponto) return null;
      return { nome: s.nome, valor: ponto.valor + s.sufixo, quando: ponto.data };
    }).catch(function () { return null; });
  }));
  return achados.filter(Boolean);
}

async function buscarCotacoes(termos) {
  const querBitcoin = /bitcoin|btc|cripto/i.test(termos || '');
  const r = await Promise.all([
    comPrazo(cotacaoBancoCentral(), PRAZO_BUSCA).catch(function () { return null; }),
    comPrazo(cotacaoInternacional(), PRAZO_BUSCA).catch(function () { return null; }),
    querBitcoin ? comPrazo(cotacaoBitcoin(), PRAZO_BUSCA).catch(function () { return null; })
                : Promise.resolve(null),
  ]);
  const lista = [];
  if (r[0]) lista.push(r[0]);
  if (r[1]) r[1].forEach(function (c) { lista.push(c); });
  if (r[2]) lista.push(r[2]);
  if (!lista.length) throw new Error('nenhuma fonte de cotação respondeu');
  return lista;
}
// Lê uma página da web e devolve o texto principal
async function lerPagina(endereco) {
  const r = await fetch(endereco, { headers: { 'User-Agent': 'NovaIA2026/1.0' } });
  if (!r.ok) throw new Error('status ' + r.status);
  const tipo = r.headers.get('content-type') || '';
  if (tipo.indexOf('text/') === -1 && tipo.indexOf('json') === -1) {
    throw new Error('conteúdo não textual');
  }
  let html = await r.text();
  html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
             .replace(/<style[\s\S]*?<\/style>/gi, ' ')
             .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
             .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const achadoTitulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return {
    titulo: limparTags(achadoTitulo ? achadoTitulo[1] : endereco),
    texto: limparTags(html).slice(0, 6000),
    url: endereco,
  };
}

// Consulta as fontes em paralelo e monta um bloco de contexto
async function pesquisar(termos) {
  const fontes = [];
  const partes = [];

  const querCotacao = /ptax|d[óo]lar|dolar|euro|c[âa]mbio|cota[çc][ãa]o|moeda|bitcoin|cripto|usd|brl/i.test(termos);
  const querIndicador = /selic|ipca|incc|infla[çc][ãa]o|juros|[íi]ndice|economia|custo da constru/i.test(termos);
  const resultados = await Promise.all([
    comPrazo(buscarNoticias(termos), PRAZO_BUSCA).catch(function () { return null; }),
    /not[íi]cia|recente|[úu]ltimas|hoje|agora|atual/i.test(termos)
      ? Promise.resolve(null)   // pergunta de notícia: enciclopédia só atrapalha
      : comPrazo(buscarWikipedia(termos), PRAZO_BUSCA).catch(function () { return null; }),
    querCotacao ? comPrazo(buscarCotacoes(termos), PRAZO_BUSCA).catch(function () { return null; })
                : Promise.resolve(null),
    querIndicador ? buscarIndicadores().catch(function () { return null; })
                  : Promise.resolve(null),
  ]);
  const noticias = resultados[0], wiki = resultados[1], moedas = resultados[2];
  const indicadores = resultados[3];

  if (moedas && moedas.length) {
    partes.push('COTAÇÕES NESTE MOMENTO:\n' + moedas.map(function (c) {
      return '- ' + c.nome + ': R$ ' + c.valor + ' (medido em ' + c.quando + ')';
    }).join('\n'));
    partes.push('Observação: a PTAX de fechamento é divulgada pelo Banco Central por volta ' +
      'das 13h em dias úteis. Antes disso, a PTAX mais recente é a do dia útil anterior — ' +
      'diga isso ao usuário em vez de apresentá-la como sendo de hoje.');
    fontes.push({ titulo: 'Cotações e PTAX (Banco Central)', url: 'https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes' });
  }
  if (indicadores && indicadores.length) {
    partes.push('INDICADORES OFICIAIS (Banco Central):\n' + indicadores.map(function (i) {
      return '- ' + i.nome + ': ' + i.valor + ' (referência: ' + i.quando + ')';
    }).join('\n'));
    fontes.push({ titulo: 'Banco Central do Brasil — séries oficiais', url: 'https://www.bcb.gov.br' });
  }
  if (noticias && noticias.length) {
    partes.push('NOTÍCIAS RECENTES:\n' + noticias.map(function (n) {
      return '- ' + n.titulo + ' [publicado em ' + n.data + ']';
    }).join('\n'));
    noticias.slice(0, 4).forEach(function (n) { fontes.push({ titulo: n.titulo, url: n.url }); });
  }
  if (wiki && wiki.texto) {
    partes.push('ENCICLOPÉDIA (' + wiki.titulo + '):\n' + wiki.texto);
    fontes.push({ titulo: 'Wikipédia: ' + wiki.titulo, url: wiki.url });
  }

  return { texto: partes.join('\n\n'), fontes: fontes };
}
// Converte o fluxo do modelo (formato SSE) em linhas JSON simples, uma por
// pedaço. A primeira linha leva as fontes consultadas.
function montarFluxo(fluxoIA, fontes) {
  const codificar = new TextEncoder();
  const decodificar = new TextDecoder();

  return new ReadableStream({
    async start(controlador) {
      controlador.enqueue(codificar.encode(
        JSON.stringify({ tipo: 'fontes', fontes: fontes }) + '\n'));

      const leitor = fluxoIA.getReader();
      let sobra = '';
      try {
        while (true) {
          const pedaco = await leitor.read();
          if (pedaco.done) break;
          sobra += decodificar.decode(pedaco.value, { stream: true });

          const linhas = sobra.split('\n');
          sobra = linhas.pop();
          for (const linha of linhas) {
            const limpa = linha.trim();
            if (limpa.indexOf('data:') !== 0) continue;
            const dados = limpa.slice(5).trim();
            if (!dados || dados === '[DONE]') continue;
            try {
              const j = JSON.parse(dados);
              if (j.response) {
                controlador.enqueue(codificar.encode(
                  JSON.stringify({ tipo: 'texto', t: j.response }) + '\n'));
              }
            } catch (e) { /* pedaço incompleto: ignora */ }
          }
        }
      } catch (e) {
        controlador.enqueue(codificar.encode(
          JSON.stringify({ tipo: 'erro', mensagem: descreverErro(e) }) + '\n'));
      } finally {
        controlador.enqueue(codificar.encode(JSON.stringify({ tipo: 'fim' }) + '\n'));
        controlador.close();
      }
    },
  });
}
// Erros do Workers AI, pelos códigos oficiais da Cloudflare:
// https://developers.cloudflare.com/workers-ai/platform/errors/
//   3040 — sem capacidade no momento (passageiro: repetir na hora resolve)
//   3036 / 4006 — cota diária da conta (só volta às 00:00 UTC)
//   3007 / 3008 — tempo esgotado / abortado (passageiro)
//   5016 — licença do modelo não aceita (definitivo, não adianta repetir)
// Antes, um único teste (capacity|limit|quota|exceed|429) juntava tudo e
// dizia "cota esgotada, volte amanhã" — inclusive para um soluço de meio
// segundo, mandando o usuário embora sem motivo.
function classificarErro(e) {
  const msg = e && e.message ? e.message : String(e);
  if (/\b3040\b|no more data centers|capacity temporarily exceeded|out of capacity/i.test(msg)) {
    return { tipo: 'capacidade', msg: msg };
  }
  if (/\b(3036|4006)\b|daily free allocation|free allocation of|neuron/i.test(msg)) {
    return { tipo: 'cota', msg: msg };
  }
  if (/\b(3007|3008)\b|timeout|timed out|aborted/i.test(msg)) {
    return { tipo: 'tempo', msg: msg };
  }
  if (/\b5016\b|has not agreed|must submit the prompt/i.test(msg)) {
    return { tipo: 'licenca', msg: msg };
  }
  return { tipo: 'outro', msg: msg };
}

function esperar(ms) {
  return new Promise(function (pronto) { setTimeout(pronto, ms); });
}

// Uma tentativa só é frágil demais. A Cloudflare devolve 3040 por alguns
// segundos quando os servidores do modelo enchem, e há um defeito conhecido e
// muito relatado em que ela devolve "cota esgotada" com o painel marcando
// 0 de 10.000 neurônios usados. Nos dois casos, repetir resolve — e, se o
// modelo escolhido continuar sem capacidade, o outro modelo costuma atender.
// Só depois disso é que desistimos e explicamos o motivo.
const ESPERA_ENTRE_TENTATIVAS = [400, 1200];

async function chamarIA(env, modelo, entrada, alternativo) {
  // Por padrão, o plano B é o outro modelo de texto da lista.
  const reserva = alternativo === undefined
    ? (modelo === MODELOS.rapido ? MODELOS.completo : MODELOS.rapido)
    : alternativo;
  let ultimaFalha = null;

  for (let i = 0; i < 3; i++) {
    // Duas tentativas no modelo pedido; na terceira, o de reserva.
    const usando = (i === 2 && reserva) ? reserva : modelo;
    try {
      return { resultado: await env.AI.run(usando, entrada), modelo: usando };
    } catch (e) {
      const falha = classificarErro(e);
      ultimaFalha = e;
      // Licença pendente, modelo inexistente, pedido inválido: repetir não muda nada.
      if (falha.tipo === 'licenca' || falha.tipo === 'outro') throw e;
      if (i < 2) await esperar(ESPERA_ENTRE_TENTATIVAS[i]);
    }
  }
  throw ultimaFalha;
}

// A cota gratuita se renova às 00:00 UTC — 21h de Brasília, não "amanhã".
function faltaParaRenovar() {
  const agora = new Date();
  const minutos = 24 * 60 - (agora.getUTCHours() * 60 + agora.getUTCMinutes());
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h <= 0) return 'faltam ' + m + ' min';
  return 'faltam cerca de ' + h + 'h' + (m ? ' ' + m + 'min' : '');
}

function descreverErro(e) {
  const falha = classificarErro(e);
  if (falha.tipo === 'cota') {
    return 'A cota gratuita de IA do dia acabou (10.000 neurônios). Ela se renova ' +
      'às 21h de Brasília — ' + faltaParaRenovar() + '. Já tentei de novo e com o ' +
      'outro modelo, e a resposta foi a mesma.';
  }
  if (falha.tipo === 'capacidade') {
    return 'Os servidores de IA estão sobrecarregados agora — isto não é a sua cota. ' +
      'Tentei três vezes, inclusive no outro modelo. Espere alguns segundos e envie de novo.';
  }
  if (falha.tipo === 'tempo') {
    return 'O modelo demorou demais para responder. Tente de novo, ou faça uma pergunta mais curta.';
  }
  if (falha.tipo === 'licenca') {
    return 'O modelo exige aceitar a licença: abra /aceitar-licenca neste Worker.';
  }
  return 'Falha no modelo de IA: ' + falha.msg;
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
