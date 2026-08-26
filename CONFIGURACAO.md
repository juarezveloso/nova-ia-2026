# Como fazer o chat da Bebi funcionar — de graça

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

- **Cota gratuita:** 10.000 neurônios por dia, renovados às **00:00 UTC
  (21h de Brasília)** — não é à meia-noite daqui. Veja a seção
  "Cota e sobrecarga" mais abaixo para as contas.
- **Render mais respostas por dia:** use o modo **⚡ rápido** (Mistral Small).
  Ele gasta cerca de **4x menos** que o Llama 70B no texto que escreve.
  Não troque por `llama-3.1-8b`: a Cloudflare o desligou em 30/05/2026.
- **Sinceridade sobre a "base 2026":** o Llama não tem conhecimento real até
  2026 (o corte de treinamento dele é anterior). A página continua com a
  persona "Bebi", mas as respostas sobre fatos muito recentes podem
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

## Memória: como a IA "aprende"

Sobre o pedido de "criar uma rede neural": o modelo **já é** uma rede neural
(Llama 3.3, 70 bilhões de parâmetros). Treinar uma do zero custaria milhões em
computação e daria um resultado muito pior. O que faz a IA aprender de verdade
neste caso é **memória persistente** — e é isso que está implementado.

Como funciona:

1. Quando você conta algo duradouro (nome, profissão, cidade, como prefere as
   respostas, projetos), o modelo acrescenta ao fim da resposta marcações
   `[LEMBRAR: ...]`.
2. A página retira essas marcações do texto exibido, guarda os fatos e mostra
   um aviso discreto: *🧠 aprendi: ...*
3. Em toda conversa seguinte, esses fatos vão junto nas instruções — então ela
   te chama pelo nome e adapta os exemplos à sua área.

O botão **🧠** no cabeçalho abre o painel com tudo o que ela sabe. Cada item
tem um × para apagar, e há o botão **esquecer tudo**.

Privacidade: a memória fica **só no navegador do visitante** (localStorage).
Não vai para o servidor, não é compartilhada entre pessoas nem entre aparelhos.
Cada visitante tem a sua. Limite de 40 fatos (os mais antigos saem primeiro),
com proteção contra guardar o mesmo fato duas vezes.

## A carinha

O ícone "IA" virou um rostinho em SVG que reage ao que está acontecendo:

| Estado | O que faz |
|---|---|
| parado | pisca de vez em quando |
| pensando | olhos correm de um lado ao outro e a boca vira um traço |
| falando | a boca abre e fecha junto com a voz |
| ouvindo | olhos arregalados e leve balanço, com o microfone ligado |
| contente | sorri ao receber uma resposta — e se você clicar nela |

É SVG com animações em CSS: não usa imagem nem biblioteca, e por isso não pesa
no carregamento.

## Quando a conexão falha

A resposta leva de 8 a 10 segundos (o modelo é grande). Em rede de celular,
uma oscilação nesse intervalo derrubava a requisição e o texto digitado se
perdia. Agora:

- **Tentativa automática**: se a rede falhar, ele tenta uma segunda vez sozinho
  antes de desistir (mostrando "conexão falhou, tentando de novo…").
- **Prazo de 55 segundos**, com mensagem própria se estourar — assim dá para
  distinguir "sem internet" de "demorou demais".
- **Seu texto volta para o campo** se não der certo, e imagens anexadas voltam
  para a bandeja. Basta tocar em enviar de novo.

## Velocidade x qualidade

No cabeçalho há dois botões: **⚡ rápido** e **🎯 completo**. A escolha fica salva.

Medição feita em 26/08/2026, alternando 5 rodadas entre os modelos para diluir a
variação de carga do servidor:

| opção | modelo | mediana | acertos |
|---|---|---|---|
| ⚡ rápido (padrão) | Mistral Small 24B | **2,0s** | 3/3 |
| 🎯 completo | Llama 3.3 70B | 4,0s | 3/3 |

O rápido virou padrão por ser 50% mais veloz **com a mesma precisão** nos testes,
inclusive acertando o INCC. Use o completo em perguntas de raciocínio mais longo.

Modelos testados e descartados:

- **Llama 3.1 8B** (`@cf/meta/llama-3.1-8b-instruct`) — **descontinuado** pela
  Cloudflare em 30/05/2026. Retorna erro 5028 e a resposta chegava vazia na tela.
- **Llama 3.2 3B** (`@cf/meta/llama-3.2-3b-instruct`) — o mais veloz, mas **errou
  o INCC** (disse ser índice de preços ao consumidor, quando é de custo da
  construção) e truncou uma conta no meio. Fora da lista de propósito.

## Resposta em fluxo (streaming)

O texto agora aparece **conforme o modelo escreve**, em vez de surgir de uma vez
no fim. Isso resolveu a causa real das quedas de conexão no celular.

O diagnóstico: nenhuma requisição falhava por tamanho, mas respostas longas —
principalmente com documento anexado — levavam **de 13 a 25 segundos**. Vinte e
cinco segundos de silêncio é tempo de sobra para a rede do celular derrubar a
conexão (troca de WiFi para 4G, tela bloqueando, sinal oscilando).

Com o fluxo:

- O **primeiro texto chega em ~3s** em vez de 15s a 25s.
- Os dados **correm continuamente** (centenas de pedaços), o que segura a conexão
  viva — é o que impede a queda.
- Enquanto escreve, mostra texto simples; ao terminar, refaz com links, tabelas,
  arquivos e fontes.

Se o servidor responder no formato antigo (sem fluxo), a página aceita os dois —
nada quebra.

## Cota e sobrecarga — dois erros diferentes

O chat mostrava "cota diária esgotada, tente amanhã" para **qualquer** erro
parecido, porque um único teste juntava tudo:
`/capacity|limit|quota|exceed|429/`. Só que a Cloudflare devolve dois erros
bem distintos, ambos com HTTP 429:

| Código | O que é | Quanto dura |
|---|---|---|
| **3040** | os servidores do modelo encheram | segundos — repetir resolve |
| **3036 / 4006** | a cota diária da conta acabou | até as 00:00 UTC (21h de Brasília) |

Tratar o 3040 como cota mandava o usuário embora por um soluço de meio segundo.
Pior: há um defeito **conhecido e muito relatado** da Cloudflare em que ela
devolve 4006 ("cota esgotada") com o painel marcando 0 de 10.000 neurônios
usados — ou seja, nem sempre "cota esgotada" significa cota esgotada.

Como ficou (`chamarIA` no `worker.js`):

1. Tenta o modelo escolhido.
2. Falhou com erro passageiro? Espera 0,4s e tenta de novo.
3. Ainda falhou? Espera 1,2s e tenta **no outro modelo** — muitas vezes um
   tem capacidade quando o outro não tem.
4. Só então desiste, e aí diz **qual** dos dois problemas foi, com a hora
   real da renovação.

Erros definitivos (licença não aceita, modelo inexistente, pedido inválido)
falham na hora: repetir não mudaria nada e só faria o usuário esperar.

### Quantas perguntas cabem em 10.000 neurônios

O custo é por token, e o que a IA **escreve** custa muito mais caro que o que
ela **lê**. Por isso o Mistral rende bem mais que o Llama 70B:

| Modelo | Ler (por milhão) | Escrever (por milhão) |
|---|---|---|
| ⚡ rápido — Mistral Small 24B | 31.876 | 50.488 |
| 🎯 completo — Llama 3.3 70B | 26.668 | **204.805** |

Na prática, por dia:

- Pergunta comum no modo **⚡ rápido**: cerca de **120 perguntas**.
- Pergunta comum no modo **🎯 completo**: cerca de **70 perguntas**.
- Com **documento grande anexado** (o teto é de 48 mil caracteres): cerca de
  **20 a 25 perguntas**, nos dois modos — aqui o custo vem do documento lido,
  não do modelo.

Ou seja: se você passa o dia analisando documentos grandes, a cota acaba mesmo.
Para esticar, anexe só as páginas que interessam e prefira o modo ⚡ rápido.
O que **não** gasta nada de cota: gerar arquivos (Excel, Word, PDF), ler as
respostas em voz alta, e ditar pelo microfone no Chrome/Edge.

## Desenhar e tratar imagens

A Bebi desenha. Peça `desenhe uma casa moderna com telhado verde`, ou toque no
botão **🎨** ao lado do clipe e descreva a imagem.

### Como ela decide que é um desenho

O gatilho é **determinístico**, pela mesma razão da busca na internet: esperar
o modelo avisar que quer desenhar já falhou antes. A regra tem duas partes:

- **Verbos que só existem para desenhar** (`desenhe`, `desenha`, `desenhar`,
  `ilustre`) valem sozinhos — `desenhe uma casa` basta.
- **Verbos genéricos** (`crie`, `gere`, `faça`, `monte`) só valem acompanhados
  de um substantivo de imagem (`imagem`, `foto`, `logo`, `banner`, `ícone`…),
  senão `crie uma planilha` e `gere um relatório` virariam desenho.

As terminações são fechadas de propósito: o substantivo `desenho` fica de fora,
então `analise este desenho técnico` continua indo para a conversa normal.
Testado com 29 frases reais — 11 devem disparar, 18 não.

### Transformar uma imagem que você anexou

Anexe a foto, ligue o 🎨 e diga a mudança (`deixe em aquarela`).

**Aviso honesto:** os três modelos de img2img do plano gratuito estão **sem
capacidade** — erro 3040 em 5 de 5 tentativas, medido em 26/08/2026. Por isso o
Worker tenta os três e, se nenhum atender, **dá a volta**: o modelo de visão
descreve a imagem e o gerador a redesenha já com a mudança pedida. Não preserva
a foto pixel a pixel, mas mantém o assunto e a composição, e funciona hoje. Se
a Cloudflare liberar capacidade, a cadeia volta a usar o img2img sozinha.

### Tratar a imagem (de graça, no aparelho)

Abaixo de cada imagem há botões que trabalham **no seu próprio celular**, com
canvas: são instantâneos, funcionam sem internet e **não gastam nada de cota**.

| Botão | Para que serve |
|---|---|
| ↻ girar | endireita foto tirada de lado (90° por toque) |
| ⬛ P&B | tira a cor — deixa documento escaneado mais legível |
| ☀ clarear / 🌙 escurecer | corrige foto estourada ou escura demais |
| ◐ contraste | destaca texto apagado em papel |
| 📉 reduzir | encolhe para no máximo 1000px, para enviar por WhatsApp/e-mail |
| ⬇ baixar | salva **como está na tela**, com os efeitos aplicados |
| 🔄 outra versão | desenha de novo, com o mesmo pedido |

Os efeitos **se acumulam**: girar, depois P&B, depois contraste vai somando.
A barra inteira trava enquanto um efeito é aplicado — carregar a imagem é
assíncrono, e tocar num segundo botão antes do primeiro terminar fazia o
segundo ler a imagem antiga e desfazer o efeito do primeiro.

### Quanto custa de cota

| O que | Modelo | Custo aproximado |
|---|---|---|
| Desenhar | flux-1-schnell, 6 passos | **~60 neurônios** (~160 imagens/dia) |
| Traduzir o pedido para inglês | Mistral Small | ~3 neurônios |
| Redesenhar a partir de uma foto | visão + flux | ~90 neurônios |
| Tratar (girar, P&B, contraste…) | nenhum — é no navegador | **zero** |

O pedido em português é traduzido para um prompt em inglês antes de desenhar:
em português o gerador entrega um resultado literal e pobre, e a tradução custa
quase nada. A legenda embaixo da imagem mostra o prompt que foi realmente usado.

## Conversas guardadas, codigo, miniatura e passo a passo

### Painel de conversas (botao no canto superior esquerdo)

Toque no botao de tres tracos para abrir a lista das suas conversas. Da para
**abrir**, **fixar no topo** (alfinete), **renomear** (lapis) e **apagar**
(lixeira). "+ Nova conversa" comeca do zero sem perder as anteriores.

Cada conversa guarda **duas coisas diferentes**, porque elas sao mesmo
distintas: as linhas que aparecem na tela (onde o anexo e so "orcamento.pdf")
e o contexto que a IA recebe (onde vai o documento inteiro). Sem isso, reabrir
uma conversa despejaria o documento inteiro dentro do balao.

Limites, para nao estourar o armazenamento do navegador:

- cada mensagem guardada e cortada em **4000 caracteres**;
- a lista fica em **40 conversas** (as fixadas nao entram nessa conta);
- se a cota estourar mesmo assim, as mais antigas sao descartadas em vez de se
  perder a conversa em uso;
- **imagem gerada nao e guardada** (cada uma passa de 300 KB em base64) - fica
  o registro do que foi desenhado, e a imagem some ao reabrir.

Tudo fica **so no aparelho**, no armazenamento do navegador. Nao vai para
servidor nenhum, e nao aparece em outro celular ou computador.

### Blocos de codigo com botao de copiar

Quando a resposta traz codigo, ele aparece numa caixa escura com a linguagem no
canto e um botao **copiar**. Usa a area de transferencia do navegador e cai para
um campo escondido quando ela esta bloqueada - assim funciona ate nos
navegadores antigos do Android. A leitura em voz alta tambem parou de soletrar
codigo: ela diz apenas "bloco de codigo na tela".

### Miniatura do anexo

Imagem anexada aparece como miniatura de verdade, e nao mais como um icone
generico - da para conferir se e o arquivo certo antes de enviar.

### Passo a passo

No lugar do pontinho piscando, a Bebi diz o que esta fazendo: *olhando a
imagem*, *lendo o documento*, *consultando dados atuais*, *desenhando*. Ela so
anuncia o que realmente vai acontecer - o aviso de consulta a internet usa o
mesmo gatilho que o Worker usa para decidir buscar.
