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

// Modelo de visão, usado quando o usuário anexa uma imagem ou um PDF escaneado.
const MODELO_VISAO = '@cf/llava-hf/llava-1.5-7b-hf';

// Teto de caracteres enviados ao modelo por requisição (protege o limite de contexto).
const LIMITE_CARACTERES = 48000;

const CORS = {
  'Access-Control-Allow-Origin': ORIGEM_PERMITIDA,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
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

  try {
    const resultado = await env.AI.run(MODELO_VISAO, {
      image: bytes,
      prompt,
      max_tokens: 1200,
    });
    // Modelos de visão devolvem o texto em campos diferentes conforme o modelo.
    const texto = resultado.response || resultado.description || resultado.text || '';
    return jsonResponse({ reply: texto }, 200);
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
