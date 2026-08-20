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

## Falar em vez de digitar

Ao lado do clipe há um botão de **microfone** (🎤). Clique, fale, clique de novo
para parar — o texto cai no campo de digitação, onde você pode revisar e editar
antes de enviar.

Funciona por dois caminhos, escolhidos automaticamente:

1. **Reconhecimento nativo do navegador** (Chrome, Edge, Safari): o texto
   aparece na tela enquanto você fala, em tempo real. É instantâneo e **não
   consome a cota diária de IA**.
2. **Whisper no Worker** (Firefox e navegadores sem o recurso nativo): grava o
   áudio, converte para WAV 16 kHz no próprio navegador e envia ao modelo
   `@cf/openai/whisper-large-v3-turbo`. Consome a cota, mas funciona em
   qualquer lugar.

Observações:

- **Precisa de HTTPS.** Abrir o `index.html` direto do disco não ativa o
  microfone — use o endereço do site.
- **O navegador vai pedir permissão** do microfone na primeira vez. Se você
  negar sem querer, libere no cadeado ao lado do endereço.
- Se o navegador não tiver nenhum dos dois caminhos, o botão some sozinho.
- **Pausas não encerram a gravação.** O navegador para de ouvir sozinho depois
  de alguns segundos de silêncio; o código reinicia a escuta automaticamente e
  continua acrescentando ao que já foi dito. Só para quando você clica no
  microfone de novo.
- O idioma está fixado em português do Brasil (`pt-BR`).

## Voz feminina da IA (ler as respostas em voz alta)

No cabeçalho há um botão de alto-falante (🔊). Ligado, ele lê cada resposta da
IA em voz alta com uma **voz feminina em português**. A preferência fica salva
no navegador.

- **Escolha automática:** entre as vozes de português instaladas no aparelho, o
  código prefere as femininas conhecidas (Maria, Luciana, Francisca, Joana,
  "Google português do Brasil"…) e evita as masculinas (Daniel, Felipe…).
  Se só houver voz masculina no aparelho, usa a que existe.
- **Troca manual:** quando o aparelho tem mais de uma voz em português, aparece
  um seletor logo abaixo do cabeçalho para você escolher outra.
- **Gratuito:** usa a síntese de voz do próprio navegador — não passa pelo
  Worker e não consome nada da cota diária de IA.
- **Textos longos** são quebrados em trechos de até 180 caracteres, porque
  alguns navegadores cortam falas muito longas.
- A leitura para sozinha quando você envia uma nova mensagem, e não fala
  enquanto você está ditando pelo microfone (evita eco).

A escolha prioriza **naturalidade** (vozes neurais), não o gênero: uma voz
masculina natural é preferida a uma feminina robótica, porque soa muito melhor.
Entre vozes de qualidade parecida, a feminina ganha no desempate. As vozes
naturais aparecem no seletor marcadas com ★.

Onde encontrar mais vozes: no Android, em *Configurações → Idiomas → Saída de
texto para voz*, dá para instalar vozes adicionais do Google. No Windows, em
*Configurações → Hora e idioma → Fala*.

## Gerar arquivos e links nas respostas

As respostas da IA agora viram conteúdo interativo:

- **Links** — endereços começando com `https://` viram links clicáveis.
- **Tabelas** — tabelas em markdown aparecem formatadas, com botões
  **⬇ Excel** e **⬇ CSV** logo abaixo.
- **Arquivos** — quando você pede um arquivo, a IA responde com um bloco
  ` ```arquivo:nome.xlsx ` e a página transforma isso num cartão com botão
  de download e prévia do conteúdo.

Formatos que a página sabe gerar:

| Extensão | Como é montado |
|---|---|
| .xlsx | SheetJS, com largura de coluna ajustada |
| .csv | separador `;` e BOM (o Excel abre os acentos certos) |
| .docx | OOXML de verdade, montado com JSZip |
| .pdf | jsPDF, com quebra de linha e paginação |
| .txt | texto puro |

Exemplos do que pedir: *"monte uma planilha com os materiais e preços"*,
*"gere um relatório em Word sobre isso"*, *"exporte essa lista em CSV"*.

Observações:

- **Tudo é montado no navegador.** O arquivo não passa pelo Worker nem pela
  internet — é criado no seu aparelho na hora que você clica em baixar. Isso
  não consome nada da cota diária de IA.
- As bibliotecas (SheetJS, JSZip, jsPDF) são carregadas só quando você baixa
  um arquivo daquele tipo, para a página continuar leve.
- **Links inventados:** o modelo é instruído a não chutar endereços, mas
  nenhum modelo é perfeito nisso. Confira antes de confiar num link.

## Informação em tempo real

A IA deixou de depender só do que aprendeu no treinamento. Agora ela consulta a
internet quando a pergunta exige dado atual, e mostra as fontes no fim da
resposta para você conferir.

| O que | Fonte | Observação |
|---|---|---|
| Data e hora | relógio do servidor | sempre injetado (horário de Brasília) |
| Cotações | PTAX do **Banco Central** | reserva: frankfurter.app / open.er-api |
| Bitcoin | CoinGecko | só quando você pergunta |
| Notícias | Bing Notícias | reserva: Agência Brasil e G1, filtrados |
| Enciclopédia | Wikipédia em português | pulada em perguntas de notícia |
| Qualquer página | leitura direta | mande o endereço e ela lê e resume |

Como funciona: o modelo responde `BUSCAR: <termos>` quando percebe que precisa
de dado atual; o Worker consulta as fontes em paralelo (com prazo de 6s cada,
para uma fonte lenta não travar a resposta) e refaz a pergunta já com os dados.
Isso gasta duas chamadas ao modelo, então só acontece quando é necessário.

PTAX e indicadores oficiais: além do dólar comercial, a IA consulta a **PTAX**
(compra e venda) e as séries do Banco Central — **Selic**, **IPCA** (mês e 12
meses) e **INCC** (custo da construção civil). A PTAX de fechamento só sai por
volta das 13h em dias úteis; antes disso a IA informa a do dia útil anterior e
explica o motivo, em vez de apresentá-la como sendo de hoje.

Armadilhas encontradas na montagem — anotadas para não repetir:

- **Nem toda API funciona de dentro da Cloudflare.** A AwesomeAPI (cotações)
  responde **429** e o Google Notícias responde **503** aos IPs dos Workers,
  que são compartilhados. Por isso as fontes acima foram escolhidas por teste,
  não por suposição.
- **Sempre verificar `response.ok`.** Sem isso, o corpo de um erro 429 era
  interpretado como dado e virava "undefined" na resposta da IA.
- **Dados devem ir dentro da pergunta**, não como aviso de sistema: entregues
  como sistema, o modelo os ignorava e repetia "não tenho acesso a informações
  em tempo real".
- **Não dependa do modelo pedir a pesquisa.** A pergunta "qual a PTAX de hoje?"
  não disparava busca de cotação: o modelo não escrevia BUSCAR e a palavra
  "PTAX" não estava na lista de gatilhos. Hoje há uma verificação determinística
  na própria pergunta do usuário, além do pedido do modelo.
- **Nunca devolver dado fora do assunto.** Quando a busca de notícias não
  encontrava nada, o código caía para as manchetes gerais — e a IA respondia
  sobre outro tema. Agora, sem resultado relevante, não vai notícia nenhuma.
