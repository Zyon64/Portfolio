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
  var TAM = 46;

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
    '.z-secreta svg,.z-pie svg{display:block}' +
    '.z-pie{position:absolute;right:20px;top:50%;margin-top:-14px;width:28px;height:28px;padding:0;border:0;' +
    '  background:transparent;opacity:.55;z-index:6;-webkit-tap-highlight-color:transparent;' +
    '  filter:drop-shadow(0 0 5px rgba(61,220,132,.6));transition:transform .15s,opacity .2s}' +
    '.z-pie.toque{transform:scale(1.35);opacity:1}' +
    '.z-circulo{position:fixed;z-index:100002;border-radius:50%;background:#000;pointer-events:auto}' +
    '.z-juego{position:fixed;inset:0;z-index:100003;display:grid;place-items:center;text-align:center;' +
    '  color:#dbe7e0;font-family:"Cascadia Code","JetBrains Mono",Consolas,monospace}' +
    '.z-juego b{display:block;font-size:3rem;color:#3ddc84;text-shadow:0 0 18px rgba(61,220,132,.7)}' +
    '.z-juego small{display:block;margin-top:12px;color:#8da398;font-size:.8rem}';
  document.head.appendChild(css);

  var W = window.innerWidth, H = window.innerHeight;
  window.addEventListener('resize', function(){ W = window.innerWidth; H = window.innerHeight; });
  var entrando = false;

  /* ---------- Circulo negro que tapa todo y luego el juego ---------- */
  function entrar(cx, cy, alSalir){
    if (entrando) return;
    entrando = true;
    var R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 20;
    var c = document.createElement('div');
    c.className = 'z-circulo';
    c.style.cssText = 'left:' + (cx - R) + 'px;top:' + (cy - R) + 'px;width:' + (2 * R) + 'px;height:' + (2 * R) + 'px';
    document.body.appendChild(c);
    var a = c.animate([{ transform:'scale(0)' }, { transform:'scale(1)' }],
                      { duration:1000, easing:'cubic-bezier(.65,0,.35,1)', fill:'forwards' });
    a.finished.then(function(){
      document.body.style.overflow = 'hidden';
      (window.Juego && window.Juego.abrir ? window.Juego.abrir : pantallaProvisoria)(function salir(){
        document.body.style.overflow = '';
        var b = c.animate([{ transform:'scale(1)' }, { transform:'scale(0)' }],
                          { duration:700, easing:'cubic-bezier(.65,0,.35,1)', fill:'forwards' });
        b.finished.then(function(){ c.remove(); entrando = false; if (alSalir) alSalir(); });
      });
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

  /* =====================  MOVIL: Z en el pie de pagina  ===================== */
  if (MOVIL){
    var pie = document.querySelector('footer .wrap');
    if (!pie) return;
    var z = document.createElement('button');
    z.type = 'button'; z.className = 'z-pie'; z.setAttribute('aria-hidden', 'true'); z.tabIndex = -1;
    z.innerHTML = SVG(28);
    pie.appendChild(z);

    var toques = 0, reinicio = 0;
    z.addEventListener('click', function(e){
      e.stopPropagation();
      toques++;
      clearTimeout(reinicio);
      reinicio = setTimeout(function(){ toques = 0; }, 1400);        // hay que tocar seguido
      z.classList.add('toque'); setTimeout(function(){ z.classList.remove('toque'); }, 120);
      if (toques >= 5){
        toques = 0;
        var r = z.getBoundingClientRect();
        entrar(r.left + r.width / 2, r.top + r.height / 2);
      }
    });
    return;
  }

  /* =====================  PC: Z flotante en el fondo  ===================== */
  var el = document.createElement('div');
  el.className = 'z-secreta';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = SVG(TAM);
  document.body.appendChild(el);

  var activo = false, raf = 0, t0 = 0, dur = 0, p = null;

  /* Recorrido: entra por un borde al azar y cruza lento hacia el lado opuesto, con una
     ondulacion suave; sale por el otro lado. */
  function empezar(){
    if (activo || entrando || document.hidden) return;
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
    raf = requestAnimationFrame(mover);
  }
  function terminar(){
    cancelAnimationFrame(raf);
    el.classList.remove('visible');
    activo = false;
    programar(35000 + Math.random() * 45000);
  }
  function programar(ms){ setTimeout(empezar, ms); }

  if (!reducido) programar(/#z\b/.test(location.hash) ? 1500 : 22000 + Math.random() * 12000);

  el.addEventListener('click', function(e){
    e.stopPropagation();
    if (!activo) return;
    var r = el.getBoundingClientRect();
    cancelAnimationFrame(raf);
    el.classList.remove('visible');
    activo = false;
    entrar(r.left + r.width / 2, r.top + r.height / 2, function(){ programar(40000); });
  });
})();
