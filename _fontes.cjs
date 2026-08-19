const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const CRLF = html.includes('\r\n');
const conv = (s) => CRLF ? s.split('\n').join('\r\n') : s;

// ── 1) CSS das fontes ──
if (!html.includes('.fontes-msg')) {
  const css = [
    '',
    '  /* ── Fontes consultadas na internet ─────────────────────── */',
    '  .fontes-msg {',
    '    margin-top: 10px; padding-top: 8px;',
    '    border-top: 1px dashed var(--border);',
    '    font-size: 11px; font-family: \'Space Mono\', monospace;',
    '  }',
    '  .fontes-titulo { color: var(--muted); margin-bottom: 5px; }',
    '  .fontes-msg a {',
    '    display: block; color: var(--accent2); text-decoration: none;',
    '    padding: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
    '  }',
    '  .fontes-msg a:hover { text-decoration: underline; color: #fff; }',
    ''
  ].join('\n');
  html = html.replace('</style>', conv(css) + '</style>');
}

// ── 2) appendMessage aceita as fontes ──
const marco1 = conv('function appendMessage(role, text) {');
const novo1 = conv('function appendMessage(role, text, fontes) {');
if (!html.includes(marco1)) { console.error('ERRO: appendMessage nao encontrada'); process.exit(1); }
html = html.replace(marco1, novo1);

const marco2 = conv([
  "  if (role === 'ai') falar(textoParaFala(text)); // lê em voz alta, sem a marcação",
  '}',
].join('\n'));
const novo2 = conv([
  '  if (fontes && fontes.length) bubble.appendChild(criarListaDeFontes(fontes));',
  '',
  "  if (role === 'ai') falar(textoParaFala(text)); // lê em voz alta, sem a marcação",
  '}',
  '',
  '// Mostra de onde a IA tirou a informação, para dar para conferir.',
  'function criarListaDeFontes(fontes) {',
  '  const caixa = document.createElement("div");',
  '  caixa.className = "fontes-msg";',
  '',
  '  const titulo = document.createElement("div");',
  '  titulo.className = "fontes-titulo";',
  '  titulo.textContent = "🌐 consultado na internet agora:";',
  '  caixa.appendChild(titulo);',
  '',
  '  const vistos = {};',
  '  fontes.slice(0, 5).forEach(function (f) {',
  '    if (!f || !f.url || vistos[f.url]) return;',
  '    vistos[f.url] = true;',
  '    if (!/^https?:\\/\\//i.test(f.url)) return;   // só endereços seguros',
  '    const a = document.createElement("a");',
  '    a.href = f.url;',
  '    a.target = "_blank";',
  '    a.rel = "noopener noreferrer";',
  '    a.textContent = "• " + (f.titulo || f.url);',
  '    caixa.appendChild(a);',
  '  });',
  '  return caixa;',
  '}',
].join('\n'));
if (!html.includes(marco2)) { console.error('ERRO: fim de appendMessage nao encontrado'); process.exit(1); }
html = html.replace(marco2, novo2);

// ── 3) sendMessage repassa as fontes ──
const marco3 = conv([
  "      const reply = data.reply",
  "        || 'Não consegui processar sua pergunta. Tente novamente.';",
  '',
  "      history.push({ role: 'assistant', content: reply });",
  "      appendMessage('ai', reply);",
].join('\n'));
const novo3 = conv([
  "      const reply = data.reply",
  "        || 'Não consegui processar sua pergunta. Tente novamente.';",
  '',
  "      history.push({ role: 'assistant', content: reply });",
  "      appendMessage('ai', reply, data.fontes);",
].join('\n'));
if (!html.includes(marco3)) { console.error('ERRO: trecho de resposta nao encontrado'); process.exit(1); }
html = html.replace(marco3, novo3);

// ── 4) Prompt: avisa que ela pode consultar a internet ──
const marco4 = conv('- Quando não souber algo com certeza, diz claramente');
const novo4 = conv([
  '- Quando não souber algo com certeza, diz claramente',
  '- Tem acesso a informação atual da internet: notícias, cotações e páginas da web',
].join('\n'));
if (html.includes(marco4)) html = html.replace(marco4, novo4);

html = html.replace('<div class="badge">v2026.10</div>', '<div class="badge">v2026.11</div>');

fs.writeFileSync('index.html', html);

const ok = {
  'CSS das fontes': html.includes('.fontes-msg {'),
  'lista de fontes': html.includes('function criarListaDeFontes'),
  'appendMessage recebe fontes': html.includes('function appendMessage(role, text, fontes)'),
  'sendMessage repassa': html.includes("appendMessage('ai', reply, data.fontes)"),
  'versão v2026.11': html.includes('v2026.11'),
};
let tudo = true;
for (const [k, v] of Object.entries(ok)) { console.log((v ? 'OK  ' : 'FALHA') + ' — ' + k); if (!v) tudo = false; }
process.exit(tudo ? 0 : 1);
