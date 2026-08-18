# Como fazer o chat da Nova IA 2026 funcionar — de graça

O erro "Erro de conexão" acontecia porque a página tentava chamar uma API de
IA direto do navegador, sem chave e sem os cabeçalhos obrigatórios — o
navegador bloqueava a chamada (CORS) antes mesmo de ela sair.

A solução gratuita usa o **Workers AI da Cloudflare**: um Worker (mini
servidor gratuito) roda o modelo de IA Llama, da Meta, na infraestrutura da
própria Cloudflare. Não precisa de chave de API nem de cartão de crédito —
o plano free inclui uma cota diária de uso do modelo.

```
Página (GitHub Pages)  →  Cloudflare Worker  →  Workers AI (Llama, grátis)
```

## Passo 1 — Criar o Worker na Cloudflare

1. Acesse https://dash.cloudflare.com e crie uma conta gratuita (se ainda não tiver).
2. No menu lateral, vá em **Workers & Pages** → **Create** → **Create Worker**.
3. Dê o nome `nova-ia-2026` e clique em **Deploy**.
4. Clique em **Edit code**, apague todo o código de exemplo e cole o conteúdo
   do arquivo `worker.js` deste repositório.
5. Clique em **Deploy** de novo.

## Passo 2 — Ativar a IA no Worker (vinculação "AI")

1. Na página do Worker, vá em **Settings** → **Bindings** (Vinculações).
2. Clique em **Add** → escolha **Workers AI**.
3. Em "Variable name", deixe/coloque exatamente: `AI`
4. Salve (**Deploy**).

## Passo 3 — Apontar a página para o Worker

1. Copie o endereço do Worker, algo como:
   `https://nova-ia-2026.SEU-USUARIO.workers.dev`
2. Abra o `index.html` e, no início do `<script>`, troque o valor de
   `WORKER_URL` pelo endereço copiado:

   ```js
   const WORKER_URL = 'https://nova-ia-2026.SEU-USUARIO.workers.dev';
   ```

3. Envie as alterações para o GitHub (commit + push, ou cole o arquivo
   atualizado direto pelo site do GitHub em github.com/juarezveloso/nova-ia-2026).

Pronto — depois que o GitHub Pages atualizar (1 a 2 minutos), o chat em
https://juarezveloso.github.io/nova-ia-2026/ vai responder de verdade, sem
nenhum custo.

## Observações

- **Cota gratuita:** o plano free da Cloudflare dá uma cota diária de uso da
  IA (renovada todo dia). Para uso pessoal e demonstrações, sobra. Se a cota
  do dia acabar, o chat mostra um aviso e volta a funcionar no dia seguinte.
- **Render mais respostas por dia:** o `worker.js` usa o modelo Llama 3.3 70B
  (melhor qualidade em português). Se quiser multiplicar a quantidade de
  respostas diárias, troque a constante `MODELO` no `worker.js` por
  `@cf/meta/llama-3.1-8b-instruct` (modelo mais leve).
- **Sinceridade sobre a "base 2026":** o Llama não tem conhecimento real até
  2026 (o corte de treinamento dele é anterior). A página continua com a
  persona "Nova IA 2026", mas as respostas sobre fatos muito recentes podem
  ser imprecisas.
- **Se um dia quiser usar o Claude (Anthropic):** é a versão paga — basta
  voltar o `worker.js` para chamar `api.anthropic.com` com uma chave guardada
  como segredo no Worker (me peça que eu preparo de novo).
