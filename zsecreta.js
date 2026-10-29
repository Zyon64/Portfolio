/* ---------------------------------------------------------
   Puerta del juego escondido.
   PC: de vez en cuando una Z verde (pixel art) cruza flotando el fondo. Va DETRAS de
       los paneles, asi que solo se puede tocar cuando pasa por un hueco.
   Movil: los paneles tapan casi todo, asi que la Z vive abajo, en el pie de pagina, a
       la derecha del "© 2026 Zyon64". Hay que tocarla varias veces seguidas (como el
       huevo de pascua de Android).
   En ambos casos sale un circulo negro desde la Z que crece hasta cubrir toda la
   pagina; cuando todo esta cubierto se entra al juego (window.Juego.abrir).
   Para probar la Z flotante rapido: agrega #z a la URL.
   --------------------------------------------------------- */
(function(){
  var reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MOVIL = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var TAM = 30;

  var SVG = function(px){
    return '<svg viewBox="0 0 7 7" width="' + px + '" height="' + px + '" shape-rendering="crispEdges">' +
      '<g fill="#3ddc84"><rect x="0" y="0" width="7" height="1"/><rect x="5" y="1" width="1" height="1"/>' +
      '<rect x="4" y="2" width="1" height="1"/><rect x="3" y="3" width="1" height="1"/>' +
      '<rect x="2" y="4" width="1" height="1"/><rect x="1" y="5" width="1" height="1"/>' +
      '<rect x="0" y="6" width="7" height="1"/></g></svg>';
  };

  var css = document.createElement('style');
  css.textContent =
    '.z-secreta{position:fixed;left:0;top:0;width:' + TAM + 'px;height:' + TAM + 'px;z-index:0;' +
    '  opacity:0;pointer-events:none;cursor:pointer;will-change:transform,opacity;' +
    '  filter:drop-shadow(0 0 7px rgba(61,220,132,.75));transition:opacity .8s}' +
    '.z-secreta.visible{opacity:.9;pointer-events:auto}' +
    '.z-secreta.llamando{opacity:1;z-index:2}' +
    '.z-secreta svg,.z-pie svg{display:block}' +
    '.z-estela{position:fixed;left:0;top:0;width:' + TAM + 'px;height:' + TAM + 'px;z-index:0;opacity:0;' +
    '  pointer-events:none;will-change:transform,opacity;filter:drop-shadow(0 0 4px rgba(61,220,132,.5))}' +
    '.z-estela svg{display:block}' +
    '.z-pie{position:absolute;right:20px;top:50%;margin-top:-14px;width:28px;height:28px;padding:0;border:0;' +
    '  background:transparent;opacity:.55;z-index:6;-webkit-tap-highlight-color:transparent;' +
    '  filter:drop-shadow(0 0 5px rgba(61,220,132,.6));transition:transform .15s,opacity .2s}' +
    '.z-pie.toque{transform:scale(1.35);opacity:1}' +
    /* llamar la atencion: la Z late y suelta un aro que se expande, para que la noten */
    '@keyframes z-late{0%,100%{transform:scale(1)}50%{transform:scale(1.22)}}' +
    '@keyframes z-aro{0%{transform:scale(.7);opacity:.75}100%{transform:scale(2.1);opacity:0}}' +
    '@keyframes z-regresa{0%{transform:translate(var(--zx),calc(100vh + 35px)) scale(.9)}55%{transform:translate(var(--zx),calc(100vh - 106px)) scale(1.16)}72%{transform:translate(var(--zx),calc(100vh - 84px)) scale(.96)}100%{transform:translate(var(--zx),calc(100vh - 92px)) scale(1)}}' +
    '.z-secreta.regresa{animation:z-regresa 1.05s cubic-bezier(.2,.9,.25,1) both}' +
    '.z-secreta svg,.z-pie svg{animation:z-late 1.5s ease-in-out infinite}' +
    '.z-secreta::after,.z-pie::after{content:"";position:absolute;inset:-4px;border:2px solid rgba(61,220,132,.8);' +
    '  border-radius:50%;pointer-events:none;animation:z-aro 1.8s ease-out infinite}' +
    '.z-pie{opacity:.9!important}' +
    '@media (prefers-reduced-motion:reduce){.z-secreta svg,.z-pie svg,.z-secreta::after,.z-pie::after{animation:none}}' +
    '.z-circulo{position:fixed;z-index:100002;border-radius:50%;background:#000;pointer-events:auto}' +
    '.z-juego{position:fixed;inset:0;z-index:100003;display:grid;place-items:center;text-align:center;' +
    '  color:#dbe7e0;font-family:"Cascadia Code","JetBrains Mono",Consolas,monospace}' +
    '.z-juego b{display:block;font-size:3rem;color:#3ddc84;text-shadow:0 0 18px rgba(61,220,132,.7)}' +
    '.z-juego small{display:block;margin-top:12px;color:#8da398;font-size:.8rem}';
  document.head.appendChild(css);

  var W = window.innerWidth, H = window.innerHeight;
  window.addEventListener('resize', function(){ W = window.innerWidth; H = window.innerHeight; });
  var entrando = false;

  /* Recuerda que ya encontraste el juego: desde entonces la Z tambien vive en el pie. */
  var DESBLOQUEADO = false;
  try { DESBLOQUEADO = localStorage.getItem('zJuego') === '1'; } catch(e){}
  function desbloquear(){
    DESBLOQUEADO = true;
    try { localStorage.setItem('zJuego', '1'); } catch(e){}
  }

  /* ---------- Circulo negro que tapa todo y luego el juego ---------- */
  function entrar(cx, cy, alSalir){
    if (entrando) return;
    entrando = true;
    desbloquear();
    var R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 20;
    var c = document.createElement('div');
    c.className = 'z-circulo';
    c.style.cssText = 'left:' + (cx - R) + 'px;top:' + (cy - R) + 'px;width:' + (2 * R) + 'px;height:' + (2 * R) + 'px';
    document.body.appendChild(c);
    var a = c.animate([{ transform:'scale(0)' }, { transform:'scale(1)' }],
                      { duration:1000, easing:'cubic-bezier(.65,0,.35,1)', fill:'forwards' });
    var listoJuego = cargarJuego();                       // se baja mientras crece el circulo
    Promise.all([a.finished, listoJuego]).then(function(){
      document.body.style.overflow = 'hidden';
      (window.Juego && window.Juego.abrir ? window.Juego.abrir : pantallaProvisoria)(function salir(){
        document.body.style.overflow = '';
        var b = c.animate([{ transform:'scale(1)' }, { transform:'scale(0)' }],
                          { duration:700, easing:'cubic-bezier(.65,0,.35,1)', fill:'forwards' });
        b.finished.then(function(){ c.remove(); entrando = false; if (alSalir) alSalir(); });
      });
    });
  }

  /* juego.js solo se descarga cuando alguien llega hasta aqui: el resto de visitantes no paga su peso */
  function cargarJuego(){
    if (window.Juego) return Promise.resolve();
    return new Promise(function(res){
      var s = document.createElement('script');
      s.src = 'juego.js?v=sheet-layers-v7'; s.onload = res; s.onerror = res; // version nueva: activa todas las capas funcionales desde cache limpia
      document.head.appendChild(s);
    });
  }

  /* Pantalla provisoria hasta que exista el juego real. */
  function pantallaProvisoria(salir){
    var s = document.createElement('div');
    s.className = 'z-juego';
    s.innerHTML = '<div><b>Z</b><small>coming soon · ' + (MOVIL ? 'tap to leave' : 'press Esc to leave') + '</small></div>';
    document.body.appendChild(s);
    function cerrar(ev){
      if (ev.type === 'keydown' && ev.key !== 'Escape') return;
      document.removeEventListener('keydown', cerrar); s.removeEventListener('click', cerrar);
      s.remove(); salir();
    }
    document.addEventListener('keydown', cerrar);
    s.addEventListener('click', cerrar);
  }

  /* =====================  Z en el pie de pagina  =====================
     Movil: es la unica puerta (5 toques seguidos). PC: aparece ahi tambien una vez que ya
     entraste al juego una vez, ademas de seguir flotando en el fondo (2 lugares). Una vez
     desbloqueado el juego, basta un toque o click. */
  var zPie = null;
  function crearZPie(){
    if (zPie) return;
    var pie = document.querySelector('footer .wrap');
    if (!pie) return;
    zPie = document.createElement('button');
    zPie.type = 'button'; zPie.className = 'z-pie'; zPie.setAttribute('aria-hidden', 'true'); zPie.tabIndex = -1;
    zPie.innerHTML = SVG(28);
    pie.appendChild(zPie);

    var toques = 0, reinicio = 0;
    zPie.addEventListener('click', function(e){
      e.stopPropagation();
      toques++;
      clearTimeout(reinicio);
      reinicio = setTimeout(function(){ toques = 0; }, 1400);        // hay que tocar seguido
      zPie.classList.add('toque'); setTimeout(function(){ zPie.classList.remove('toque'); }, 120);
      if (DESBLOQUEADO || toques >= 5){
        toques = 0;
        var r = zPie.getBoundingClientRect();
        entrar(r.left + r.width / 2, r.top + r.height / 2);
      }
    });
  }
  // La puerta inferior existe siempre: la Z flotante puede apuntar hacia ella antes del primer desbloqueo.
  crearZPie();
  if (MOVIL) return;

  /* =====================  PC: Z flotante en el fondo  ===================== */
  var el = document.createElement('div');
  el.className = 'z-secreta';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = SVG(TAM);
  document.body.appendChild(el);

  var activo = false, raf = 0, t0 = 0, dur = 0, p = null, bajando = false, vuelveT = 0;
  /* estela: copias mas chicas y tenues de la Z que siguen su trayectoria reciente */
  var N_ESTELA = 6, hist = [], fant = [];
  for (var q = 0; q < N_ESTELA; q++){
    var g = document.createElement('div'); g.className = 'z-estela'; g.innerHTML = SVG(TAM);
    document.body.appendChild(g); fant.push(g);
  }
  function pintarEstela(){
    for (var i = 0; i < N_ESTELA; i++){
      var h = hist[hist.length - 1 - (i + 1) * 4], g2 = fant[i];
      if (!h){ g2.style.opacity = 0; continue; }
      var esc = 1 - (i + 1) * 0.1;
      g2.style.opacity = (0.34 * (1 - i / N_ESTELA)).toFixed(2);
      g2.style.transform = 'translate(' + (h[0] - TAM / 2) + 'px,' + (h[1] - TAM / 2) + 'px) rotate(' + h[2].toFixed(1) + 'deg) scale(' + esc.toFixed(2) + ')';
    }
  }
  function limpiarEstela(){ hist = []; fant.forEach(function(g2){ g2.style.opacity = 0; }); }

  /* Recorrido: entra por un borde al azar y cruza lento hacia el lado opuesto, con una
     ondulacion suave; sale por el otro lado. */
  function empezar(){
    if (activo || entrando) return;
    if (document.hidden){ programar(4000); return; }         // pestaña en segundo plano: reintenta
    activo = true;
    var lado = (Math.random() * 4) | 0, m = TAM + 10;
    var a, b;
    if (lado === 0){ a = [Math.random() * W, -m];     b = [Math.random() * W, H + m]; }
    else if (lado === 1){ a = [W + m, Math.random() * H]; b = [-m, Math.random() * H]; }
    else if (lado === 2){ a = [Math.random() * W, H + m]; b = [Math.random() * W, -m]; }
    else { a = [-m, Math.random() * H];                b = [W + m, Math.random() * H]; }
    p = { a:a, b:b, ph:Math.random() * 6.28, amp:20 + Math.random() * 30 };
    var dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
    dur = Math.max(14000, dist / 42 * 1000);              // ~42 px/s: lenta, dificil de agarrar
    t0 = performance.now();
    el.classList.add('visible');
    raf = requestAnimationFrame(mover);
  }
  function mover(now){
    var k = (now - t0) / dur;
    if (k >= 1){ terminar(); return; }
    var x = p.a[0] + (p.b[0] - p.a[0]) * k, y = p.a[1] + (p.b[1] - p.a[1]) * k;
    var dx = p.b[0] - p.a[0], dy = p.b[1] - p.a[1], L = Math.hypot(dx, dy) || 1;
    var o = Math.sin(k * 14 + p.ph) * p.amp;              // ondulacion perpendicular al avance
    x += (-dy / L) * o; y += (dx / L) * o;
    var giro = Math.sin(k * 9 + p.ph) * 8;
    el.style.transform = 'translate(' + (x - TAM / 2) + 'px,' + (y - TAM / 2) + 'px) rotate(' + giro.toFixed(1) + 'deg)';
    hist.push([x, y, giro]); if (hist.length > 40) hist.shift();
    pintarEstela();
    raf = requestAnimationFrame(mover);
  }
  function terminar(){
    cancelAnimationFrame(raf);
    limpiarEstela();
    el.classList.remove('visible');
    activo = false;
    programar(35000 + Math.random() * 45000);
  }
  function programar(ms){ setTimeout(empezar, ms); }

  /* Al acercar el cursor, la Z cae hacia la puerta del pie. Si no se baja a buscarla,
     reaparece desde abajo, alineada con esa puerta, y rebota una sola vez como pista. */
  function bajarAlPie(x, y){
    if (!activo || bajando || entrando) return;
    bajando = true; cancelAnimationFrame(raf); limpiarEstela();
    var r = zPie && zPie.getBoundingClientRect(), dx = r ? r.left + r.width / 2 : W - 34;
    var desdeX = x, desdeY = y, inicio = performance.now(), tarda = 760;
    function caer(now){
      var k = Math.min(1, (now - inicio) / tarda), e = 1 - Math.pow(1 - k, 3);
      var xx = desdeX + (dx - desdeX) * e, yy = desdeY + (H + TAM) * e;
      el.style.transform = 'translate(' + (xx - TAM / 2) + 'px,' + (yy - TAM / 2) + 'px)';
      if (k < 1) requestAnimationFrame(caer);
      else {
        el.classList.remove('visible'); activo = false; bajando = false;
        vuelveT = setTimeout(function(){
          // Si el usuario ya llego al pie, no duplicamos la senal delante suyo.
          var pr = zPie && zPie.getBoundingClientRect();
          if (pr && pr.top > H * .7){
            el.style.setProperty('--zx', Math.round(dx - TAM / 2) + 'px');
            el.style.transform = 'translate(' + Math.round(dx - TAM / 2) + 'px,' + (H - 92) + 'px)';
            el.classList.add('visible', 'llamando', 'regresa'); activo = true;
            setTimeout(function(){ el.classList.remove('regresa'); }, 1100);
          } else programar(26000 + Math.random() * 16000);
        }, 3400);
      }
    }
    requestAnimationFrame(caer);
  }

  if (!reducido) programar(/#z\b/.test(location.hash) ? 1500 : 22000 + Math.random() * 12000);

  el.addEventListener('click', function(e){
    e.stopPropagation();
    if (!activo) return;
    var r = el.getBoundingClientRect();
    limpiarEstela();
    cancelAnimationFrame(raf);
    el.classList.remove('visible');
    activo = false;
    entrar(r.left + r.width / 2, r.top + r.height / 2, function(){ crearZPie(); programar(40000); });
  });
  window.addEventListener('pointermove', function(e){
    if (!activo || bajando || !p) return;
    var k = (performance.now() - t0) / dur;
    var x = p.a[0] + (p.b[0] - p.a[0]) * k, y = p.a[1] + (p.b[1] - p.a[1]) * k;
    if (Math.hypot(e.clientX - x, e.clientY - y) < 82) bajarAlPie(x, y);
  }, { passive:true });
})();
