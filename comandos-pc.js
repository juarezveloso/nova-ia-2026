// Somente texto digitado no chat passa por este reconhecedor local.
const comandosPC = (() => {
  const OUTLOOK_WEB = 'https://outlook.office.com/mail/';
  const aplicativos = {
    navegador: ['navegador', 'navegador padrao', 'browser', 'internet'],
    chrome: ['chrome', 'google chrome'],
    edge: ['edge', 'microsoft edge'],
    firefox: ['firefox', 'mozilla firefox'],
    calculadora: ['calculadora'],
    bloco: ['bloco de notas', 'notepad'],
    downloads: ['downloads', 'pasta downloads', 'pasta de downloads'],
  };
  const titulos = {
    outlook: 'Abrir o Outlook', navegador: 'Abrir o navegador padrão', chrome: 'Abrir o Chrome',
    edge: 'Abrir o Edge', firefox: 'Abrir o Firefox', calculadora: 'Abrir a Calculadora',
    bloco: 'Abrir o Bloco de Notas', downloads: 'Abrir Downloads', desligar: 'Desligar o PC',
    reiniciar: 'Reiniciar o PC', bloquear: 'Bloquear o PC',
  };

  function reconhecer(texto) {
    const comando = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
    const pedidoOutlook = comando
      .replace(/^(?:bebi[, ]+)?(?:por favor[, ]+)?/, '')
      .replace(/[, ]+por favor[?]?$/, '')
      .replace(/[?]$/, '');
    const naWeb = / (?:na web|no navegador|online)$/.test(pedidoOutlook);
    const destinoOutlook = pedidoOutlook.replace(/ (?:na web|no navegador|online)$/, '').match(
      /^(?:(?:pode|poderia|voce pode|voce poderia|consegue|voce consegue) abrir|(?:abra|abrir|abre)(?: no pc)?|(?:quero|gostaria de|preciso) abrir) (.+?)(?: para mim| pra mim)?(?: no (?:meu )?(?:pc|windows|computador))?$/
    )?.[1];
    if (destinoOutlook && /^(?:(?:o|meu) )?(?:(?:aplicativo|app|programa|e[ -]?mail|caixa de entrada)(?: (?:do|de))? )?(?:microsoft )?(?:outlo{2,3}k|out look|autluque|emailoutlo{2,3}k)(?: e[ -]?mail)?$/.test(destinoOutlook)) {
      return naWeb ? 'outlook-web' : 'outlook';
    }

    const app = comando.match(/^(?:abra|abrir|abre)(?: no pc)? (?:(?:o|a) )?(.+)$/)?.[1];
    if (app) return Object.keys(aplicativos).find((id) => aplicativos[id].includes(app.replace(/-/g, ' '))) || null;

    if (/^(?:ligar|ligue) (?:o |meu )?(?:pc|windows|computador)$/.test(comando)) return 'ligar';

    const energia = comando.match(/^(desligar?|desligue|reiniciar?|reinicie|bloquear?|bloqueie)(?: (?:o |meu )?(?:pc|windows|computador))?$/)?.[1];
    if (energia?.startsWith('deslig')) return 'desligar';
    if (energia?.startsWith('reinici')) return 'reiniciar';
    if (energia?.startsWith('bloque')) return 'bloquear';
    return null;
  }

  function mostrar(texto, acao) {
    appendMessage('user', texto);
    if (acao === 'ligar') {
      appendMessage('ai', 'Para ligar um PC que já está desligado, use o botão físico ou configure Wake-on-LAN em outro dispositivo.');
      return;
    }
    const outlook = acao === 'outlook' || acao === 'outlook-web';
    const windows = /^win/i.test(navigator.userAgentData?.platform || navigator.platform);
    const abrirOutlookWeb = outlook && (acao === 'outlook-web' || !windows);
    const mensagem = abrirOutlookWeb ? 'Abrindo o Outlook na web. Se a aba não abrir, use o botão abaixo.'
      : acao === 'desligar' || acao === 'reiniciar'
      ? 'Salve seus arquivos antes de continuar. O Windows pedirá confirmação.'
      : 'Confirme a ação na janela do assistente local.';
    const bolha = appendMessage('ai', mensagem);
    const acoes = document.createElement('div');
    acoes.className = 'dispositivos-acoes';
    const abrir = document.createElement('a');
    abrir.className = 'btn-baixar destaque';
    abrir.textContent = titulos[outlook ? 'outlook' : acao];
    abrir.href = 'bebi-pc://executar/' + (outlook ? 'outlook' : acao);
    const instalar = document.createElement('a');
    instalar.className = 'btn-baixar';
    instalar.textContent = 'Instalar assistente para Windows';
    instalar.href = 'bebi-pc.ps1';
    instalar.download = 'bebi-pc.ps1';
    acoes.append(abrir);
    if (outlook) {
      const web = document.createElement('a');
      web.className = 'btn-baixar';
      web.textContent = 'Abrir Outlook na web';
      web.href = OUTLOOK_WEB;
      web.target = '_blank';
      web.rel = 'noopener noreferrer';
      acoes.append(web);
    }
    acoes.append(instalar);
    bolha.appendChild(acoes);
    const msgs = document.getElementById('messages');
    msgs.scrollTop = msgs.scrollHeight;

    // O envio acontece durante o clique ou Enter do usuário, antes de qualquer
    // chamada ao Worker. O cartão também permite repetir a abertura.
    if (abrirOutlookWeb && navigator.onLine) window.open(OUTLOOK_WEB, '_blank', 'noopener,noreferrer');
    else if (outlook && !abrirOutlookWeb) window.location.assign(abrir.href);
  }

  return { reconhecer, mostrar };
})();
