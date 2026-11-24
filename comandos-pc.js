// Somente texto digitado no chat passa por este reconhecedor local.
const comandosPC = (() => {
  const aplicativos = {
    outlook: ['outlook', 'outlook email', 'email outlook', 'e mail outlook', 'emailoutloook', 'emailoutlook', 'meu email do outlook'],
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
    const mensagem = acao === 'desligar' || acao === 'reiniciar'
      ? 'Salve seus arquivos antes de continuar. O Windows pedirá confirmação.'
      : 'Confirme a ação na janela do assistente local.';
    const bolha = appendMessage('ai', mensagem);
    const acoes = document.createElement('div');
    acoes.className = 'dispositivos-acoes';
    const abrir = document.createElement('a');
    abrir.className = 'btn-baixar destaque';
    abrir.textContent = titulos[acao];
    abrir.href = 'bebi-pc://executar/' + acao;
    const instalar = document.createElement('a');
    instalar.className = 'btn-baixar';
    instalar.textContent = 'Instalar assistente para Windows';
    instalar.href = 'bebi-pc.ps1';
    instalar.download = 'bebi-pc.ps1';
    acoes.append(abrir, instalar);
    bolha.appendChild(acoes);
    const msgs = document.getElementById('messages');
    msgs.scrollTop = msgs.scrollHeight;
  }

  return { reconhecer, mostrar };
})();
