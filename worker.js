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

// Modelo de visão da Meta: lê texto dentro de imagens e documentos escaneados
// bem melhor que o reserva. Exige aceitar a licença da Meta uma vez por conta —
// abra /aceitar-licenca neste Worker para fazer isso.
const MODELO_VISAO = '@cf/meta/llama-3.2-11b-vision-instruct';

// Reserva sem exigência de licença (usado enquanto a licença não for aceita).
const MODELO_VISAO_RESERVA = '@cf/llava-hf/llava-1.5-7b-hf';

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

    try {
      const resultado = await env.AI.run(MODELO, { messages, max_tokens: 1200 });
      return jsonResponse({ reply: resultado.response || '' }, 200);
    } catch (e) {
      return jsonResponse({ error: { message: descreverErro(e) } }, 502);
    }
  },
};

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
      const resultado = await env.AI.run(modelos[i], { image: bytes, prompt, max_tokens: 1200 });
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

function descreverErro(e) {
  const msg = e && e.message ? e.message : String(e);
  if (/capacity|limit|quota|exceed|429/i.test(msg)) {
    return 'A cota diária gratuita de IA parece ter acabado. Tente novamente amanhã. (' + msg + ')';
  }
  return 'Falha no modelo de IA: ' + msg;
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
