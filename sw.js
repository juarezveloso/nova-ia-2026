// Service Worker da Bebi — faz o app abrir e trabalhar sem internet.
//
// O que NÃO funciona offline, e não tem jeito: as respostas da IA. Elas rodam
// no Workers AI da Cloudflare, e não existe modelo de qualidade que caiba no
// navegador de um celular — os que existem exigem baixar de 1 a 4 GB e uma
// placa de vídeo que o aparelho não tem. Dizer o contrário seria mentira.
//
// O que passa a funcionar sem internet: abrir o app, ler as conversas
// guardadas, anexar e ler documentos (PDF, Word, Excel), gerar planilha, Word e
// PDF, tratar imagens (girar, P&B, contraste) e a leitura em voz alta.

const VERSAO = 'bebi-v24';
const CACHE_APP = 'app-' + VERSAO;
const CACHE_LIBS = 'libs-' + VERSAO;

const APP = [
  './',
  './index.html',
  './manifest.json',
  './icone-192.png',
  './icone-512.png',
];

// Bibliotecas com a versão fixa na URL: nunca mudam de conteúdo, então podem
// ficar no cache para sempre.
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
];

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE_APP)
      .then(function (c) { return c.addAll(APP); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) {
        if (n !== CACHE_APP && n !== CACHE_LIBS) return caches.delete(n);
        return null;
      }));
    }).then(function () {
      // As bibliotecas vêm depois, em segundo plano: baixar 2 MB durante a
      // instalação atrasaria a primeira abertura sem necessidade nenhuma.
      return caches.open(CACHE_LIBS).then(function (c) {
        return Promise.all(LIBS.map(function (u) {
          return c.match(u).then(function (achado) {
            if (achado) return null;
            // Uma biblioteca que falhe não pode derrubar a instalação inteira.
            return c.add(new Request(u, { mode: 'cors' })).catch(function () { return null; });
          });
        }));
      });
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (evento) {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  let url;
  try { url = new URL(pedido.url); } catch (e) { return; }

  // A IA nunca sai do cache: entregar resposta velha seria pior que um erro
  // honesto de conexão.
  if (url.hostname.indexOf('workers.dev') !== -1) return;

  // Biblioteca e fonte: cache primeiro, rede só na primeira vez.
  if (url.hostname === 'cdnjs.cloudflare.com' ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    evento.respondWith(
      caches.match(pedido).then(function (achado) {
        if (achado) return achado;
        return fetch(pedido).then(function (resposta) {
          const copia = resposta.clone();
          caches.open(CACHE_LIBS).then(function (c) { c.put(pedido, copia); });
          return resposta;
        });
      })
    );
    return;
  }

  // A página: rede primeiro, para a atualização chegar sozinha; o cache entra
  // quando está offline.
  evento.respondWith(
    fetch(pedido).then(function (resposta) {
      const copia = resposta.clone();
      caches.open(CACHE_APP).then(function (c) { c.put(pedido, copia); });
      return resposta;
    }).catch(function () {
      return caches.match(pedido).then(function (achado) {
        return achado || caches.match('./index.html');
      });
    })
  );
});
