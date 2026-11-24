(() => {
  const painel = document.getElementById('painel-dispositivos');
  const video = document.getElementById('dispositivos-video');
  const nivel = document.getElementById('dispositivos-nivel');
  const parar = document.getElementById('dispositivos-parar');
  const anexar = document.getElementById('dispositivos-anexar');
  const status = document.getElementById('dispositivos-status');
  const captura = navigator.mediaDevices;
  const Audio = window.AudioContext || window.webkitAudioContext;
  let fluxo = null;
  let medidor = null;
  let quadro = 0;
  let sessao = 0;
  let som = null;

  function encerrar() {
    sessao++;
    fluxo?.getTracks().forEach((faixa) => faixa.stop());
    fluxo = null;
    video.srcObject = null;
    video.hidden = true;
    nivel.hidden = true;
    nivel.value = 0;
    cancelAnimationFrame(quadro);
    if (medidor) void medidor.close().catch(() => {});
    medidor = null;
    parar.disabled = true;
    anexar.disabled = true;
  }

  function mensagemErro(erro) {
    if (erro.name === 'NotAllowedError') return 'A permissão foi recusada ou a seleção foi cancelada.';
    if (erro.name === 'NotFoundError') return 'Nenhum dispositivo foi selecionado ou encontrado.';
    if (erro.name === 'NotReadableError') return 'O dispositivo está indisponível ou em uso.';
    return 'Não consegui acessar esse dispositivo.';
  }

  document.getElementById('abrir-dispositivos').onclick = () => {
    fecharPainel();
    status.textContent = '';
    painel.showModal();
  };
  function fecharDispositivos() {
    encerrar();
    if (som) void som.close().catch(() => {});
    som = null;
  }
  painel.addEventListener('close', () => {
    if (painel.open) return;
    fecharDispositivos();
    if (document.activeElement === document.body) document.getElementById('menu-btn').focus();
  });
  window.addEventListener('pagehide', fecharDispositivos);
  parar.onclick = () => {
    encerrar();
    status.textContent = 'Captura encerrada.';
  };

  function medirMicrofone() {
    medidor = new Audio();
    const analisador = medidor.createAnalyser();
    medidor.createMediaStreamSource(fluxo).connect(analisador);
    const amostras = new Float32Array(analisador.fftSize);
    nivel.hidden = false;
    function medir() {
      analisador.getFloatTimeDomainData(amostras);
      let soma = 0;
      for (const amostra of amostras) soma += amostra * amostra;
      nivel.value = Math.min(1, Math.sqrt(soma / amostras.length) * 4);
      quadro = requestAnimationFrame(medir);
    }
    medir();
  }

  const fontes = {
    camera: captura?.getUserMedia && (() => captura.getUserMedia({ video: true, audio: false })),
    tela: captura?.getDisplayMedia && (() => captura.getDisplayMedia({ video: true, audio: false })),
    microfone: captura?.getUserMedia && Audio && (() => captura.getUserMedia({ audio: true, video: false })),
  };

  for (const botao of painel.querySelectorAll('[data-captura]')) {
    const tipo = botao.dataset.captura;
    const obter = fontes[tipo];
    botao.disabled = !obter;
    botao.onclick = async () => {
      encerrar();
      const tentativa = sessao;
      parar.disabled = false;
      status.textContent = 'Aguardando permissão do navegador…';
      try {
        const selecionado = await obter();
        if (sessao !== tentativa || !painel.open) {
          selecionado.getTracks().forEach((faixa) => faixa.stop());
          return;
        }
        fluxo = selecionado;
        for (const faixa of fluxo.getTracks()) {
          faixa.addEventListener('ended', () => {
            if (sessao === tentativa) parar.click();
          });
        }
        if (tipo === 'microfone') {
          medirMicrofone();
          status.textContent = 'Fale para testar o nível do microfone.';
        } else {
          video.srcObject = fluxo;
          video.hidden = false;
          await video.play();
          if (tentativa !== sessao || !painel.open) return;
          anexar.disabled = false;
          status.textContent = 'Prévia local ativa.';
        }
      } catch (erro) {
        if (tentativa !== sessao || !painel.open) return;
        encerrar();
        status.textContent = mensagemErro(erro);
      }
    };
  }

  anexar.onclick = async () => {
    if (!video.videoWidth) return;
    const tentativa = sessao;
    anexar.disabled = true;
    const canvas = document.createElement('canvas');
    const escala = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * escala));
    canvas.height = Math.max(1, Math.round(video.videoHeight * escala));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const imagem = await new Promise((resolver) => canvas.toBlob(resolver, 'image/png'));
    if (tentativa !== sessao || !painel.open) return;
    if (!imagem) {
      anexar.disabled = false;
      status.textContent = 'Não consegui criar a imagem.';
      return;
    }
    painel.close();
    encerrar();
    document.getElementById('user-input').focus();
    await adicionarArquivos([new File([imagem], 'captura.png', { type: imagem.type })]);
  };

  const somBtn = document.getElementById('dispositivos-som');
  somBtn.disabled = !Audio;
  somBtn.onclick = async () => {
    if (som) return;
    const audio = new Audio();
    som = audio;
    try {
      await audio.resume();
      if (som !== audio) return;
      const onda = audio.createOscillator();
      const volume = audio.createGain();
      volume.gain.value = 0.07;
      onda.connect(volume);
      volume.connect(audio.destination);
      onda.onended = () => {
        if (som !== audio) return;
        som = null;
        void audio.close().catch(() => {});
      };
      onda.start();
      onda.stop(audio.currentTime + 0.3);
      status.textContent = 'Som de teste enviado à saída padrão.';
    } catch (erro) {
      if (som !== audio) return;
      som = null;
      void audio.close().catch(() => {});
      status.textContent = mensagemErro(erro);
    }
  };

  const seletores = {
    usb: navigator.usb && (async () => (await navigator.usb.requestDevice({ filters: [] })).productName || 'Dispositivo USB'),
    hid: navigator.hid && (async () => (await navigator.hid.requestDevice({ filters: [] })).map((item) => item.productName).join(', ')),
    serial: navigator.serial && (async () => {
      await navigator.serial.requestPort();
      return 'Porta serial';
    }),
    bluetooth: navigator.bluetooth && (async () => (await navigator.bluetooth.requestDevice({ acceptAllDevices: true })).name || 'Dispositivo Bluetooth'),
    midi: navigator.requestMIDIAccess && (async () => {
      const acesso = await navigator.requestMIDIAccess({ sysex: false });
      return [...acesso.inputs.values(), ...acesso.outputs.values()].map((porta) => porta.name).filter(Boolean).join(', ');
    }),
  };

  for (const botao of painel.querySelectorAll('[data-dispositivo]')) {
    const selecionar = seletores[botao.dataset.dispositivo];
    botao.disabled = !selecionar;
    botao.onclick = async () => {
      try {
        const nome = await selecionar();
        status.textContent = nome ? 'Identificado: ' + nome : 'Nenhum dispositivo selecionado ou encontrado.';
      } catch (erro) {
        status.textContent = mensagemErro(erro);
      }
    };
  }

  const controles = document.getElementById('dispositivos-controles');
  controles.disabled = !navigator.getGamepads;
  controles.onclick = () => {
    const nomes = Array.from(navigator.getGamepads()).filter(Boolean).map((controle) => controle.id);
    status.textContent = nomes.length ? nomes.join(', ') : 'Aperte um botão do controle e tente novamente.';
  };
})();
