// Cloudflare Worker — chat gratuito usando o Workers AI da própria Cloudflare
// Não precisa de chave de API: o Worker usa a cota diária gratuita do plano
// free da Cloudflare (o modelo Llama roda na infraestrutura deles).
//
// Como publicar: veja o passo a passo em CONFIGURACAO.md

// Origem autorizada a chamar este Worker (a página do GitHub Pages)
const ORIGEM_PERMITIDA = 'https://juarezveloso.github.io';

// Modelo de IA usado. O Llama 3.3 70B tem boa qualidade em português.
// Se a cota diária gratuita acabar rápido, troque por
// '@cf/meta/llama-3.1-8b-instruct' (mais leve, rende muito mais respostas por dia).
const MODELO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

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

    // Limita o tamanho da conversa enviada ao modelo (economiza a cota diária)
    const recentes = historico.slice(-12);

    const messages = [];
    if (typeof body.system === 'string' && body.system) {
      messages.push({ role: 'system', content: body.system });
    }
    for (const m of recentes) {
      if ((m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
        messages.push({ role: m.role, content: m.content });
      }
    }

    try {
      const resultado = await env.AI.run(MODELO, {
        messages,
        max_tokens: 800,
      });

      return jsonResponse({ reply: resultado.response || '' }, 200);
    } catch (e) {
      return jsonResponse(
        { error: { message: 'Falha no modelo de IA (a cota diária gratuita pode ter acabado): ' + (e && e.message ? e.message : e) } },
        502,
      );
    }
  },
};

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
