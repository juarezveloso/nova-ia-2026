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

## Anexar documentos para análise

O chat tem um botão de clipe (📎) ao lado do campo de texto. Também dá para
**arrastar arquivos** para cima da página ou **colar** uma imagem com Ctrl+V.

Formatos lidos automaticamente:

| Tipo | Extensões | Como é lido |
|---|---|---|
| Texto e código | txt, md, csv, json, xml, html, py, js, sql, log, yml… | direto |
| PDF | pdf | texto extraído página a página (até 80 páginas) |
| Word | docx | texto extraído |
| Excel | xlsx, xlsm, ods | cada planilha vira uma tabela em texto |
| PowerPoint | pptx | texto de cada slide |
| OpenOffice | odt, odp | texto extraído |
| Imagens | png, jpg, gif, webp, bmp | analisadas por um modelo de visão |
| PDF escaneado | pdf sem texto | a 1ª página é analisada como imagem |

Observações:

- **Tudo é lido no navegador do visitante.** O arquivo em si não é enviado a
  lugar nenhum — só o texto extraído vai para a IA. Isso é bom para privacidade
  e não gasta banda do servidor.
- **Limites:** 25 MB por arquivo e cerca de 40 mil caracteres de texto por
  documento (o excesso é cortado, e o chip avisa quando isso acontece).
- **Imagens:** uma por mensagem (limitação do modelo de visão). Se você anexar
  várias, as demais ficam na bandeja para o envio seguinte.
- **Formatos antigos do Office** (.doc, .xls, .ppt) não são lidos — salve como
  .docx, .xlsx ou .pptx.
- **Modelo de visão:** o `worker.js` usa `@cf/meta/llama-3.2-11b-vision-instruct`,
  que lê texto dentro de imagens muito bem (bom para documentos escaneados).
  A licença da Meta já foi aceita nesta conta em 19/08/2026. Se um dia o modelo
  ficar indisponível, o Worker cai sozinho no reserva `@cf/llava-hf/llava-1.5-7b-hf`,
  que não exige licença — o chat nunca para por causa disso.
- **Reaceitar a licença** (se trocar de conta Cloudflare): abra
  `https://nova-ia-2026.juarez-veloso.workers.dev/aceitar-licenca` e clique no botão.
