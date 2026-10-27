/* ---------------------------------------------------------
   JUEGO ESCONDIDO: supervivencia.
   - El jugador es la Z (no rota) y te mueves con el cursor (o el dedo en movil).
   - Dispara solo, en direccion al enemigo mas cercano. La Z no gira: solo sale la bala.
   - Los enemigos son bloques rojos, en silueta vacia, con picos arriba.
   - Cada muerte llena la barra de nivel. Al llenarla subes de nivel y ELIGES 1 de 3 mejoras.
   - La dificultad (cantidad, vida y velocidad de enemigos) sube SOLO con los niveles.
   - La vida es un valor (HP); los enemigos a veces sueltan una cura (+ HP), nunca vida maxima.
   Todo se dibuja en un lienzo de baja resolucion (1 unidad = S pixeles de pantalla), asi
   se ve pixel art de verdad. La interfaz usa el mismo vidrio del portafolio.
   Se enchufa en window.Juego.abrir(salir): salir() se llama cuando el jugador sale.
   --------------------------------------------------------- */
(function(){
  var S = 3;                                   // 1 unidad del juego = S px de pantalla
  var ROJO = '#ff4d4d', VERDE = '#3ddc84';

  /* ---------------------------  PROGRESION (todo en un lugar)  --------------------------- */
  /* Kills necesarias para pasar del nivel L al siguiente: 3, 5, 10, 15, 20... (+5 cada nivel). */
  function requiere(L){ return L <= 1 ? 3 : 5 * (L - 1); }

  /* Mejoras: cada una cuenta cuantas veces se eligio (m[clave]). Las curvas 1-exp(-n/k)
     suben rapido y se acercan a un tope, asi escalan a largo plazo sin romper el juego. */
  var MEJORAS = {
    cad:   { nombre:'FIRE RATE',   desc:'Shoots faster',          tope:60 },
    dano:  { nombre:'DAMAGE',      desc:'Bullets hit harder',     tope:999 },
    tam:   { nombre:'BULLET SIZE', desc:'Bigger bullets',         tope:40 },
    balas: { nombre:'EXTRA SHOT',  desc:'+1 bullet per burst',    tope:9 },
    perf:  { nombre:'PIERCE',      desc:'Bullets go through +1',  tope:10 },
    vel:   { nombre:'BULLET SPEED',desc:'Faster bullets',         tope:40 },
    vida:  { nombre:'MAX HP',      desc:'+20 maximum health',     tope:999 },
    reg:   { nombre:'REGEN',       desc:'Recover HP over time',   tope:20 }
  };
  function stats(m){
    var k = function(n, c){ return 1 - Math.exp(-n / c); };
    return {
      cad:   1.8 + 9 * k(m.cad, 9),                   // rafagas por segundo: 1.8 -> 10.8
      dano:  1 + 0.5 * m.dano,                        // sin tope
      tam:   1 + 2.2 * k(m.tam, 8),                   // tamaño de bala (unidades): 1 -> 3.2
      balas: 1 + m.balas,                             // balas por rafaga
      perf:  m.perf,                                  // enemigos que atraviesa
      vel:   130 + 110 * k(m.vel, 8),                 // velocidad de bala (unidades/s)
      vida:  100 + 20 * m.vida,                       // HP maximo
      reg:   0.8 * m.reg                              // HP por segundo
    };
  }
  /* Texto "antes -> despues" de una mejora para mostrar en la carta. */
  function cambio(clave, m){
    var a = stats(m), m2 = {}; for (var k in m) m2[k] = m[k]; m2[clave]++;
    var b = stats(m2), f = function(x, d){ return x.toFixed(d); };
    switch (clave){
      case 'cad':   return f(a.cad, 1) + ' → ' + f(b.cad, 1) + ' /s';
      case 'dano':  return f(a.dano, 1) + ' → ' + f(b.dano, 1);
      case 'tam':   return f(a.tam, 1) + ' → ' + f(b.tam, 1);
      case 'balas': return a.balas + ' → ' + b.balas;
      case 'perf':  return a.perf + ' → ' + b.perf;
      case 'vel':   return Math.round(a.vel) + ' → ' + Math.round(b.vel);
      case 'vida':  return Math.round(a.vida) + ' → ' + Math.round(b.vida);
      case 'reg':   return f(a.reg, 1) + ' → ' + f(b.reg, 1) + ' /s';
    }
    return '';
  }

  /* Dificultad: depende SOLO del nivel (no del tiempo ni de las kills sueltas). */
  function dificultad(L){
    return {
      intervalo: Math.max(0.22, 1.2 / (1 + L * 0.12)),          // segundos entre apariciones
      maxVivos:  Math.min(140, Math.floor(6 + L * 3)),
      vida:      2 + L * 1.4,
      vel:       22 + Math.min(38, L * 1.6),                    // unidades/s
      golpe:     10 + L,                                        // HP que quita al tocarte
      pesado:    Math.min(0.3, Math.max(0, (L - 3) * 0.03)),    // prob. de bloque grande
      rapido:    Math.min(0.3, Math.max(0, (L - 6) * 0.025))    // prob. de bloque chico y veloz
    };
  }

  /* ---------------------------  ESTILOS (vidrio del portafolio)  --------------------------- */
  var CSS = '' +
  '.jg{position:fixed;inset:0;z-index:100003;background:#000;color:#eaf3ee;overflow:hidden;' +
  '  font-family:"Cascadia Code","JetBrains Mono",Consolas,monospace;touch-action:none;' +
  '  -webkit-user-select:none;user-select:none;cursor:none}' +
  '.jg.menu{cursor:default}' +
  '.jg-cv{position:absolute;left:0;top:0;image-rendering:crisp-edges;image-rendering:pixelated}' +
  '.jg-hud{position:absolute;inset:0;pointer-events:none;padding:12px}' +
  '.jg-chip,.jg-btn,.jg-modal-caja,.jg-aviso,.jg-carta{--rim:rgba(255,255,255,.55);position:relative;' +
  '  background:rgba(255,255,255,.05);border-radius:999px;box-shadow:0 10px 26px -14px rgba(0,0,0,.8)}' +
  '.jg-chip::after,.jg-btn::after,.jg-modal-caja::after,.jg-aviso::after,.jg-carta::after{content:"";position:absolute;inset:0;' +
  '  border-radius:inherit;padding:1.25px;pointer-events:none;' +
  '  background:linear-gradient(135deg,var(--rim) 0%,transparent 28%,transparent 66%,var(--rim) 100%);' +
  '  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;' +
  '  mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}' +
  '.jg-chip{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;font-size:.78rem;letter-spacing:.04em;white-space:nowrap}' +
  '.jg-chip b{color:' + VERDE + ';font-weight:700}' +
  '.jg-arriba{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}' +
  '.jg-izq,.jg-der{display:flex;flex-direction:column;gap:8px}' +
  '.jg-der{align-items:flex-end}' +
  '.jg-fila{display:flex;gap:6px;flex-wrap:wrap}' +
  '.jg-der .jg-fila{justify-content:flex-end}' +
  '.jg-barra{display:block;width:86px;height:7px;border-radius:7px;background:rgba(255,255,255,.14);overflow:hidden}' +
  '.jg-barra u{display:block;height:100%;width:0;transition:width .25s}' +
  '.jg-hp b{color:' + ROJO + '}.jg-hp .jg-barra{width:110px}.jg-hp .jg-barra u{background:' + ROJO + '}' +
  '.jg-xp .jg-barra u{background:' + VERDE + '}' +
  '.jg-btn{pointer-events:auto;width:38px;height:38px;border:0;color:#eaf3ee;cursor:pointer;display:inline-grid;place-items:center;' +
  '  font:inherit;font-size:.85rem;transition:background .2s,scale .3s cubic-bezier(.3,1.5,.5,1)}' +
  '.jg-btn:hover{background:rgba(255,255,255,.1);scale:1.08}' +
  '.jg-pie{position:absolute;left:12px;right:12px;bottom:12px;display:flex;justify-content:center;gap:8px;flex-wrap:wrap}' +
  '.jg-amenaza .jg-barra{width:70px}.jg-amenaza .jg-barra u{background:' + ROJO + '}' +
  '.jg-aviso{position:absolute;left:50%;top:70px;transform:translate(-50%,-8px);padding:8px 18px;font-size:.82rem;' +
  '  letter-spacing:.06em;opacity:0;transition:opacity .25s,transform .25s;text-align:center;white-space:nowrap}' +
  '.jg-aviso.on{opacity:1;transform:translate(-50%,0)}' +
  '.jg-aviso b{color:' + VERDE + '}' +
  '.jg-rojo{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;' +
  '  box-shadow:inset 0 0 90px 10px rgba(255,60,60,.55)}' +
  '.jg-rojo.on{opacity:1;transition:none}' +
  /* pausa / mejoras / fin: fondo bien oscuro para que no se vea el juego a traves */
  '.jg-modal{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.93);pointer-events:auto}' +
  '.jg-modal[hidden]{display:none}' +
  '.jg-modal-caja{border-radius:28px;padding:26px 30px;text-align:center;min-width:min(86vw,340px)}' +
  '.jg-h{margin:0 0 6px;font-size:1.3rem;letter-spacing:.14em;font-weight:700;color:' + VERDE + '}' +
  '.jg-modal-caja p{margin:4px 0;font-size:.85rem;color:#c7d6ce}' +
  '.jg-modal-caja p b{color:#fff}' +
  '.jg-modal-acciones{display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap}' +
  '.jg-modal-acciones .jg-btn{width:auto;height:auto;padding:10px 22px;border-radius:999px;font-size:.85rem;letter-spacing:.06em}' +
  '.jg-cartas{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:18px}' +
  '.jg-carta{pointer-events:auto;width:176px;border:0;border-radius:24px;padding:18px 14px;color:#eaf3ee;cursor:pointer;' +
  '  font:inherit;text-align:center;transition:background .2s,scale .3s cubic-bezier(.3,1.5,.5,1)}' +
  '.jg-carta:hover,.jg-carta:focus-visible{background:rgba(61,220,132,.12);scale:1.05;outline:none}' +
  '.jg-carta b{display:block;font-size:.92rem;letter-spacing:.08em;color:' + VERDE + ';margin-bottom:6px}' +
  '.jg-carta span{display:block;font-size:.74rem;color:#c7d6ce;line-height:1.5}' +
  '.jg-carta em{display:block;font-style:normal;margin-top:10px;font-size:.82rem;color:#fff}' +
  '.jg-carta i{display:block;margin-top:8px;font-style:normal;font-size:.66rem;color:#7d968a}' +
  '@media (max-width:600px){.jg-chip{padding:6px 10px;font-size:.7rem}.jg-aviso{top:62px;font-size:.74rem}' +
  '  .jg-carta{width:100%;max-width:300px}.jg-barra{width:60px}.jg-hp .jg-barra{width:80px}}';

  var Z_PIX = ['XXXXXXX', '.....X.', '....X..', '...X...', '..X....', '.X.....', 'XXXXXXX'];
  function fmt(t){ var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }

  /* =====================================  JUEGO  ===================================== */
  function abrir(salir){
    if (!document.getElementById('jg-css')){
      var st = document.createElement('style'); st.id = 'jg-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    var raiz = document.createElement('div');
    raiz.className = 'jg';
    raiz.innerHTML =
      '<canvas class="jg-cv"></canvas><div class="jg-rojo"></div>' +
      '<div class="jg-hud">' +
        '<div class="jg-arriba">' +
          '<div class="jg-izq">' +
            '<div class="jg-chip jg-hp">HP <b data-n="hp">100</b>/<span data-n="hpmax">100</span><i class="jg-barra"><u data-n="hpbarra"></u></i></div>' +
            '<div class="jg-chip jg-xp">LV <b data-n="nivel">1</b><i class="jg-barra"><u data-n="xpbarra"></u></i><span data-n="xp">0/3</span></div>' +
            '<div class="jg-fila"><div class="jg-chip">KILLS <b data-n="kills">0</b></div></div>' +
          '</div>' +
          '<div class="jg-der">' +
            '<div class="jg-fila"><button class="jg-btn" data-a="pausa" aria-label="Pause">II</button>' +
            '<button class="jg-btn" data-a="salir" aria-label="Exit">X</button></div>' +
            '<div class="jg-fila"><div class="jg-chip">RATE <b data-n="cad">1.8</b>/s</div>' +
            '<div class="jg-chip">DMG <b data-n="dano">1.0</b></div></div>' +
            '<div class="jg-fila"><div class="jg-chip">SHOTS <b data-n="balas">1</b></div>' +
            '<div class="jg-chip">PIERCE <b data-n="perf">0</b></div>' +
            '<div class="jg-chip">SIZE <b data-n="tam">1.0</b></div></div>' +
          '</div>' +
        '</div>' +
        '<div class="jg-aviso"></div>' +
        '<div class="jg-pie">' +
          '<div class="jg-chip">TIME <b data-n="tiempo">0:00</b></div>' +
          '<div class="jg-chip jg-amenaza">THREAT <i class="jg-barra"><u data-n="amenaza"></u></i></div>' +
          '<div class="jg-chip">BEST LV <b data-n="mejor">1</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="jg-modal" hidden><div class="jg-modal-caja"></div></div>';
    document.body.appendChild(raiz);

    var cv = raiz.querySelector('.jg-cv'), ctx = cv.getContext('2d');
    var W = 0, H = 0;                                   // tamaño del mundo en unidades
    function medir(){
      W = Math.ceil(window.innerWidth / S); H = Math.ceil(window.innerHeight / S);
      cv.width = W; cv.height = H;
      cv.style.width = (W * S) + 'px'; cv.style.height = (H * S) + 'px';
      ctx.imageSmoothingEnabled = false;
    }
    medir();
    window.addEventListener('resize', medir);

    var el = function(n){ return raiz.querySelector('[data-n="' + n + '"]'); };
    var aviso = raiz.querySelector('.jg-aviso'), rojo = raiz.querySelector('.jg-rojo'),
        modal = raiz.querySelector('.jg-modal'), caja = raiz.querySelector('.jg-modal-caja');

    var mejor = { nivel:1, tiempo:0 };
    try { var g = JSON.parse(localStorage.getItem('juegoZ') || 'null'); if (g) mejor = g; } catch(e){}
    el('mejor').textContent = mejor.nivel;

    /* ---------- estado ---------- */
    var rafaga = 0, rafagaT = 0;
    var P, enemigos, balas, parts, curas, nivel, xp, kills, tiempo, hp, inv, acum, spawnT, pausado, eligiendo, fin, raf, ultimo, m, pendientes;
    var tactil = window.matchMedia('(pointer: coarse)').matches;
    var tx = 0, ty = 0;                                  // hacia donde apunta el cursor (unidades)

    function reiniciar(){
      m = { cad:0, dano:0, tam:0, balas:0, perf:0, vel:0, vida:0, reg:0 };
      nivel = 1; xp = 0; kills = 0; tiempo = 0; acum = 0; rafaga = 0; rafagaT = 0; spawnT = 0.6; inv = 0;
      pausado = false; eligiendo = false; fin = false; pendientes = 0;
      P = { x: W / 2, y: H / 2 };
      tx = P.x; ty = P.y;
      enemigos = []; balas = []; parts = []; curas = [];
      hp = stats(m).vida;
      modal.hidden = true; raiz.classList.remove('menu');
      hud();
      ultimo = performance.now();
    }

    function hud(){
      var s = stats(m), req = requiere(nivel);
      el('hp').textContent = Math.ceil(hp); el('hpmax').textContent = Math.round(s.vida);
      el('hpbarra').style.width = Math.max(0, hp / s.vida * 100) + '%';
      el('nivel').textContent = nivel; el('kills').textContent = kills;
      el('xp').textContent = xp + '/' + req; el('xpbarra').style.width = Math.min(100, xp / req * 100) + '%';
      el('cad').textContent = s.cad.toFixed(1); el('dano').textContent = s.dano.toFixed(1);
      el('balas').textContent = s.balas; el('perf').textContent = s.perf; el('tam').textContent = s.tam.toFixed(1);
    }

    var avisoT = 0;
    function mostrarAviso(html){
      aviso.innerHTML = html; aviso.classList.add('on');
      clearTimeout(avisoT); avisoT = setTimeout(function(){ aviso.classList.remove('on'); }, 1500);
    }

    /* ---------- entradas ---------- */
    function aPos(e){
      tx = e.clientX / S; ty = (e.clientY - (e.pointerType === 'touch' ? 52 : 0)) / S;   // el dedo no tapa la Z
    }
    function mover(e){ if (!pausado && !eligiendo && !fin) aPos(e); }
    raiz.addEventListener('pointermove', mover);
    raiz.addEventListener('pointerdown', function(e){
      if (e.target.closest && e.target.closest('.jg-btn, .jg-modal')) return;
      mover(e);
    });
    function tecla(e){
      if (e.key === 'Escape'){ e.preventDefault(); if (!fin && !eligiendo) alternarPausa(); }
      else if (eligiendo && /^[1-3]$/.test(e.key)){
        var c = caja.querySelectorAll('.jg-carta')[+e.key - 1]; if (c) c.click();
      }
    }
    document.addEventListener('keydown', tecla, true);
    function oculta(){ if (document.hidden && !fin && !pausado && !eligiendo) alternarPausa(); }
    document.addEventListener('visibilitychange', oculta);

    raiz.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('[data-a]');
      if (!b) return;
      e.stopPropagation();
      var a = b.getAttribute('data-a');
      if (a === 'pausa') alternarPausa();
      else if (a === 'seguir') alternarPausa();
      else if (a === 'reiniciar'){ reiniciar(); }
      else if (a === 'salir') cerrar();
      else if (a === 'mejora') elegir(b.getAttribute('data-k'));
    });

    function alternarPausa(){
      if (fin || eligiendo) return;
      pausado = !pausado;
      if (pausado){
        raiz.classList.add('menu');
        caja.innerHTML = '<div class="jg-h">PAUSED</div><p>LV <b>' + nivel + '</b> · KILLS <b>' + kills + '</b> · <b>' + fmt(tiempo) + '</b></p>' +
          '<div class="jg-modal-acciones"><button class="jg-btn" data-a="seguir">RESUME</button>' +
          '<button class="jg-btn" data-a="reiniciar">RESTART</button><button class="jg-btn" data-a="salir">EXIT</button></div>';
        modal.hidden = false;
      } else {
        modal.hidden = true; raiz.classList.remove('menu'); ultimo = performance.now();
      }
    }

    function gameOver(){
      fin = true;
      var nuevo = nivel > mejor.nivel || (nivel === mejor.nivel && tiempo > mejor.tiempo);
      if (nuevo){ mejor = { nivel:nivel, tiempo:tiempo }; try { localStorage.setItem('juegoZ', JSON.stringify(mejor)); } catch(e){} }
      el('mejor').textContent = mejor.nivel;
      raiz.classList.add('menu');
      caja.innerHTML = '<div class="jg-h">OVERRUN</div><p>LEVEL <b>' + nivel + '</b></p><p>KILLS <b>' + kills + '</b> · TIME <b>' + fmt(tiempo) + '</b></p>' +
        '<p>BEST: LV <b>' + mejor.nivel + '</b> · <b>' + fmt(mejor.tiempo) + '</b>' + (nuevo ? ' · NEW!' : '') + '</p>' +
        '<div class="jg-modal-acciones"><button class="jg-btn" data-a="reiniciar">TRY AGAIN</button>' +
        '<button class="jg-btn" data-a="salir">EXIT</button></div>';
      modal.hidden = false;
    }

    function cerrar(){
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', tecla, true);
      document.removeEventListener('visibilitychange', oculta);
      window.removeEventListener('resize', medir);
      raiz.remove();
      salir();
    }

    /* ---------- subida de nivel: elegir 1 de 3 mejoras ---------- */
    function ofrecer(){
      eligiendo = true;
      raiz.classList.add('menu');
      var claves = Object.keys(MEJORAS).filter(function(k){ return m[k] < MEJORAS[k].tope; });
      for (var i = claves.length - 1; i > 0; i--){ var j = (Math.random() * (i + 1)) | 0, t = claves[i]; claves[i] = claves[j]; claves[j] = t; }
      var elegidas = claves.slice(0, 3);
      var h = '<div class="jg-h">LEVEL ' + nivel + '</div><p>Choose an upgrade</p><div class="jg-cartas">';
      elegidas.forEach(function(k, i){
        h += '<button class="jg-carta" data-a="mejora" data-k="' + k + '"><b>' + MEJORAS[k].nombre + '</b>' +
             '<span>' + MEJORAS[k].desc + '</span><em>' + cambio(k, m) + '</em><i>[' + (i + 1) + ']</i></button>';
      });
      caja.innerHTML = h + '</div>';
      modal.hidden = false;
    }
    function elegir(k){
      if (!eligiendo || !MEJORAS[k]) return;
      var antes = stats(m).vida, txt = cambio(k, m);
      m[k]++;
      if (k === 'vida') hp += stats(m).vida - antes;               // +20 maximo tambien llena esos 20
      eligiendo = false; modal.hidden = true; raiz.classList.remove('menu'); ultimo = performance.now();
      mostrarAviso('<b>' + MEJORAS[k].nombre + '</b> · ' + txt);
      hud();
      for (var i = 0; i < 28; i++){                                // anillo de pixeles
        var an = i / 28 * 6.2832;
        parts.push({ x:P.x, y:P.y, vx:Math.cos(an) * 60, vy:Math.sin(an) * 60, t:0.45, c:VERDE });
      }
      if (pendientes > 0){ pendientes--; subirNivel(); }
    }
    function subirNivel(){
      xp -= requiere(nivel);
      nivel++;
      hud();
      ofrecer();
    }

    /* ---------- reglas ---------- */
    function aparecer(){
      var d = dificultad(nivel);
      var lado = (Math.random() * 4) | 0, x, y, mg = 10;
      if (lado === 0){ x = Math.random() * W; y = -mg; }
      else if (lado === 1){ x = W + mg; y = Math.random() * H; }
      else if (lado === 2){ x = Math.random() * W; y = H + mg; }
      else { x = -mg; y = Math.random() * H; }
      var r = Math.random(), tam = 9, vida = d.vida, vel = d.vel, tipo = 0;
      if (r < d.pesado){ tam = 17; vida = d.vida * 4; vel *= 0.6; tipo = 1; }
      else if (r < d.pesado + d.rapido){ tam = 6; vida = d.vida * 0.6; vel *= 1.6; tipo = 2; }
      enemigos.push({ x:x, y:y, s:tam, hp:vida, max:vida, v:vel, flash:0, tipo:tipo, ph:Math.random() * 6.28 });
    }

    /* Varias balas = una rafaga automatica: salen una tras otra, con una pausa visible
       entre cada una, y cada bala apunta al enemigo mas cercano EN ESE MOMENTO. */
    function masCercano(){
      var cerca = null, dm = 1e9;
      for (var j = 0; j < enemigos.length; j++){
        var q = enemigos[j], dd = (q.x - P.x) * (q.x - P.x) + (q.y - P.y) * (q.y - P.y);
        if (dd < dm){ dm = dd; cerca = q; }
      }
      return cerca;
    }
    function dispararA(obj, s){
      var an = Math.atan2(obj.y - P.y, obj.x - P.x) + (Math.random() - 0.5) * 0.03;   // temblor minimo
      balas.push({ x:P.x, y:P.y, vx:Math.cos(an) * s.vel, vy:Math.sin(an) * s.vel,
                   d:s.dano, r:s.tam / 2, t:Math.max(1, Math.round(s.tam)), p:s.perf, golpes:[], vida:2.2 });
    }

    function herir(cant){
      if (inv > 0) return;
      hp -= cant; inv = 0.8;
      rojo.classList.add('on'); setTimeout(function(){ rojo.classList.remove('on'); }, 60);
      hud();
      for (var i = 0; i < 14; i++){
        var an = Math.random() * 6.2832, v = 30 + Math.random() * 40;
        parts.push({ x:P.x, y:P.y, vx:Math.cos(an) * v, vy:Math.sin(an) * v, t:0.4, c:ROJO });
      }
      if (hp <= 0){ hp = 0; hud(); gameOver(); }
    }

    function matar(e, idx){
      enemigos.splice(idx, 1);
      kills++; xp++;
      for (var i = 0; i < 10; i++){
        var an = Math.random() * 6.2832, v = 20 + Math.random() * 50;
        parts.push({ x:e.x, y:e.y, vx:Math.cos(an) * v, vy:Math.sin(an) * v, t:0.35 + Math.random() * 0.2, c:ROJO });
      }
      if (Math.random() < 0.07) curas.push({ x:e.x, y:e.y, t:9 });     // a veces suelta una cura
      hud();
      if (xp >= requiere(nivel)){
        if (eligiendo) pendientes++; else subirNivel();
      }
    }

    /* ---------- actualizar ---------- */
    function actualizar(dt){
      var s = stats(m), d = dificultad(nivel);
      tiempo += dt;
      if (inv > 0) inv -= dt;
      if (s.reg > 0 && hp < s.vida){ hp = Math.min(s.vida, hp + s.reg * dt); }

      // el jugador sigue al cursor (casi directo) y no sale de la pantalla
      var k = 1 - Math.exp(-dt * 22);
      P.x += (tx - P.x) * k; P.y += (ty - P.y) * k;
      P.x = Math.max(4, Math.min(W - 4, P.x)); P.y = Math.max(4, Math.min(H - 4, P.y));

      // aparicion: depende solo del nivel
      spawnT -= dt;
      if (spawnT <= 0){
        spawnT = d.intervalo * (0.7 + Math.random() * 0.6);
        if (enemigos.length < d.maxVivos){
          var n = 1 + (nivel > 8 && Math.random() < 0.5 ? 1 : 0) + (nivel > 16 && Math.random() < 0.5 ? 1 : 0);
          for (var i = 0; i < n; i++) aparecer();
        }
      }

      // enemigos: persiguen al jugador
      for (var i2 = enemigos.length - 1; i2 >= 0; i2--){
        var e = enemigos[i2];
        var dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
        e.ph += dt * 4;
        e.x += (dx / dist) * e.v * dt + Math.cos(e.ph) * 3 * dt;
        e.y += (dy / dist) * e.v * dt + Math.sin(e.ph) * 3 * dt;
        if (e.flash > 0) e.flash -= dt;
        if (dist < e.s / 2 + 3) herir(d.golpe);
        if (fin) return;
      }

      // disparo automatico: una rafaga nueva solo cuando termino la anterior; bala por bala
      acum += dt * s.cad;
      if (acum >= 1 && rafaga === 0 && masCercano()){
        acum = Math.min(acum - 1, 1);
        rafaga = s.balas;
        rafagaT = 0;
      } else if (acum >= 1 && rafaga === 0) acum = 1;       // sin objetivo, queda lista
      if (rafaga > 0){
        rafagaT -= dt;
        if (rafagaT <= 0){
          var obj = masCercano();
          if (obj){ dispararA(obj, s); rafaga--; rafagaT = 0.09; } else rafaga = 0;
        }
      }

      // balas
      for (var b = balas.length - 1; b >= 0; b--){
        var bl = balas[b];
        bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.vida -= dt;
        var fuera = bl.x < -8 || bl.y < -8 || bl.x > W + 8 || bl.y > H + 8 || bl.vida <= 0;
        if (!fuera){
          for (var q = enemigos.length - 1; q >= 0; q--){
            var en = enemigos[q];
            if (bl.golpes.indexOf(en) >= 0) continue;
            if (Math.abs(bl.x - en.x) < en.s / 2 + bl.r && Math.abs(bl.y - en.y) < en.s / 2 + bl.r){
              en.hp -= bl.d; en.flash = 0.07; bl.golpes.push(en);
              parts.push({ x:bl.x, y:bl.y, vx:(Math.random() - 0.5) * 40, vy:(Math.random() - 0.5) * 40, t:0.15, c:'#fff' });
              if (en.hp <= 0) matar(en, q);
              if (bl.golpes.length > bl.p){ fuera = true; break; }       // se acabo la perforacion
            }
          }
        }
        if (fuera) balas.splice(b, 1);
        if (eligiendo) break;                                            // el juego se detiene al elegir
      }

      // curas: SOLO recuperan HP, nunca suben el maximo
      for (var c = curas.length - 1; c >= 0; c--){
        var cu = curas[c]; cu.t -= dt;
        if (cu.t <= 0){ curas.splice(c, 1); continue; }
        if (Math.hypot(cu.x - P.x, cu.y - P.y) < 8){
          var cura = Math.min(25, s.vida - hp);
          if (cura > 0){ hp += cura; hud(); mostrarAviso('<b>+' + Math.round(cura) + ' HP</b>'); }
          curas.splice(c, 1);
        }
      }

      // particulas
      for (var p = parts.length - 1; p >= 0; p--){
        var pa = parts[p]; pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.t -= dt;
        if (pa.t <= 0) parts.splice(p, 1);
      }

      // hud vivo
      el('tiempo').textContent = fmt(tiempo);
      el('amenaza').style.width = Math.min(100, (enemigos.length / d.maxVivos) * 100) + '%';
      el('hp').textContent = Math.ceil(hp);
      el('hpbarra').style.width = Math.max(0, hp / s.vida * 100) + '%';
    }

    /* ---------- dibujo (todo en pixeles enteros) ---------- */
    function px(x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

    function dibujarEnemigo(e){
      var s = Math.round(e.s), x0 = Math.round(e.x - s / 2), y0 = Math.round(e.y - s / 2);
      var col = e.flash > 0 ? '#ffd0d0' : ROJO, g = e.tipo === 1 ? 2 : 1;
      if (e.flash > 0) px(x0 + g, y0 + g, s - 2 * g, s - 2 * g, 'rgba(255,77,77,.45)');
      // contorno vacio
      px(x0, y0, s, g, col); px(x0, y0 + s - g, s, g, col);
      px(x0, y0, g, s, col); px(x0 + s - g, y0, g, s, col);
      // picos arriba (silueta): cada pico es una "^" de 1px de trazo
      var n = Math.max(2, Math.floor(s / 5)), w = s / n;
      for (var i = 0; i < n; i++){
        var bx = Math.round(x0 + i * w), bw = Math.round(w), alto = Math.min(4, Math.floor(bw / 2) + 1);
        for (var k = 1; k <= alto; k++){
          px(bx + k - 1, y0 - k, 1, 1, col);
          px(bx + bw - k, y0 - k, 1, 1, col);
        }
      }
    }

    function dibujarZ(){
      var parpadeo = inv > 0 && Math.floor(inv * 14) % 2 === 0;
      if (parpadeo) return;
      var x0 = Math.round(P.x - 3), y0 = Math.round(P.y - 3);
      for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++)
        if (Z_PIX[y][x] === 'X') px(x0 + x, y0 + y, 1, 1, VERDE);
      ctx.fillStyle = 'rgba(61,220,132,.12)'; ctx.fillRect(x0 - 2, y0 - 2, 11, 11);    // resplandor tenue
    }

    function dibujar(){
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(61,220,132,.06)';                           // puntos tenues: sensacion de suelo
      for (var gy = 6; gy < H; gy += 14) for (var gx = 6; gx < W; gx += 14) ctx.fillRect(gx, gy, 1, 1);

      curas.forEach(function(cu){                                       // cura: una cruz roja con centro claro
        if (cu.t < 2 && Math.floor(cu.t * 6) % 2) return;
        var x = Math.round(cu.x), y = Math.round(cu.y);
        px(x - 1, y - 3, 3, 7, ROJO); px(x - 3, y - 1, 7, 3, ROJO); px(x, y, 1, 1, '#fff');
      });
      enemigos.forEach(dibujarEnemigo);
      balas.forEach(function(b){
        px(b.x - b.t / 2 - b.vx * 0.014, b.y - b.t / 2 - b.vy * 0.014, b.t, b.t, 'rgba(61,220,132,.45)');   // estela corta
        px(b.x - b.t / 2, b.y - b.t / 2, b.t, b.t, '#c9ffe0');
      });
      parts.forEach(function(p){ px(p.x, p.y, 1, 1, p.c); });
      if (!fin) dibujarZ();
    }

    /* ---------- bucle ---------- */
    function frame(now){
      var dt = Math.min(0.05, (now - ultimo) / 1000); ultimo = now;
      if (!pausado && !eligiendo && !fin) actualizar(dt);
      dibujar();
      raf = requestAnimationFrame(frame);
    }
    reiniciar();
    raf = requestAnimationFrame(frame);
    mostrarAviso(tactil ? 'Drag to move · <b>auto-fire</b>' : 'Move the mouse · <b>auto-fire</b>');
  }

  window.Juego = { abrir: abrir };
})();
