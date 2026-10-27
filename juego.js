/* ---------------------------------------------------------
   JUEGO ESCONDIDO: supervivencia.
   - El jugador es la Z (no rota) y te mueves con el cursor (o el dedo en movil).
   - Dispara solo, en direccion al enemigo mas cercano. La Z no gira: solo sale la bala.
   - Los enemigos son bloques rojos, en silueta vacia, con picos arriba.
   - Cada enemigo que matas = subes de nivel. Cada nivel mejora tus stats con formulas
     que escalan a largo plazo (curvas suaves con tope, y saltos por umbrales).
   - Mas nivel = mas enemigos, mas fuertes y mas rapidos.
   Todo se dibuja en un lienzo de baja resolucion (1 unidad = S pixeles de pantalla), asi
   se ve pixel art de verdad. La interfaz usa el mismo vidrio del portafolio.
   Se enchufa en window.Juego.abrir(salir): salir() se llama cuando el jugador sale.
   --------------------------------------------------------- */
(function(){
  var S = 3;                                   // 1 unidad del juego = S px de pantalla
  var ROJO = '#ff4d4d', VERDE = '#3ddc84';

  /* ---------------------------  ESCALADO (todo en un lugar)  --------------------------- */
  /* Stats del jugador segun el nivel L. Curvas 1-exp(-L/k): suben rapido al inicio y se
     acercan a un tope; el dano y los umbrales siguen creciendo sin limite practico. */
  function stats(L){
    var k = function(n){ return 1 - Math.exp(-L / n); };
    return {
      cadencia: 2 + 9 * k(40),                         // disparos por segundo: 2 -> 11
      dano:     1 + L * 0.1,                           // sin tope
      tam:      2 + 3 * k(50),                         // tamaño de bala (unidades): 2 -> 5
      balas:    1 + Math.min(6, Math.floor(L / 9)),    // balas por disparo: +1 cada 9 niveles (max 7)
      perfora:  Math.min(8, Math.floor(L / 7)),        // enemigos que atraviesa: +1 cada 7 niveles (max 8)
      velBala:  150 + 90 * k(60),                      // velocidad de la bala (unidades/s)
      vidaMax:  5 + Math.floor(L / 5)                  // corazones: +1 cada 5 niveles
    };
  }
  /* Dificultad segun el nivel L. */
  function dificultad(L){
    return {
      intervalo: Math.max(0.2, 1.25 / (1 + L * 0.05)), // segundos entre apariciones
      maxVivos:  Math.min(140, Math.floor(6 + L * 1.3)),
      vida:      2 + L * 0.6,
      vel:       24 + Math.min(40, L * 0.7),           // unidades/s
      pesado:    Math.min(0.3, Math.max(0, (L - 8) * 0.02)),   // prob. de bloque grande
      rapido:    Math.min(0.3, Math.max(0, (L - 15) * 0.015))  // prob. de bloque chico y veloz
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
  '.jg-chip,.jg-btn,.jg-modal-caja,.jg-aviso{--rim:rgba(255,255,255,.55);position:relative;' +
  '  background:rgba(255,255,255,.04);border-radius:999px;box-shadow:0 10px 26px -14px rgba(0,0,0,.8)}' +
  '.jg-chip::after,.jg-btn::after,.jg-modal-caja::after,.jg-aviso::after{content:"";position:absolute;inset:0;' +
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
  '.jg-vida{padding:8px 12px;gap:4px}' +
  '.jg-vida svg{width:20px;height:18px;display:block;shape-rendering:crispEdges}' +
  '.jg-nivel b{font-size:1.05rem}' +
  '.jg-btn{pointer-events:auto;width:38px;height:38px;border:0;color:#eaf3ee;cursor:pointer;display:inline-grid;place-items:center;' +
  '  font:inherit;font-size:.85rem;transition:background .2s,scale .3s cubic-bezier(.3,1.5,.5,1)}' +
  '.jg-btn:hover{background:rgba(255,255,255,.1);scale:1.08}' +
  '.jg-pie{position:absolute;left:12px;right:12px;bottom:12px;display:flex;justify-content:center;gap:8px;flex-wrap:wrap}' +
  '.jg-amenaza i{display:block;width:70px;height:6px;border-radius:6px;background:rgba(255,255,255,.15);overflow:hidden}' +
  '.jg-amenaza i u{display:block;height:100%;width:0;background:' + ROJO + ';transition:width .3s}' +
  '.jg-aviso{position:absolute;left:50%;top:70px;transform:translate(-50%,-8px);padding:8px 18px;font-size:.82rem;' +
  '  letter-spacing:.06em;opacity:0;transition:opacity .25s,transform .25s;text-align:center;white-space:nowrap}' +
  '.jg-aviso.on{opacity:1;transform:translate(-50%,0)}' +
  '.jg-aviso b{color:' + VERDE + '}' +
  '.jg-rojo{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;' +
  '  box-shadow:inset 0 0 90px 10px rgba(255,60,60,.55)}' +
  '.jg-rojo.on{opacity:1;transition:none}' +
  '.jg-modal{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.55);pointer-events:auto}' +
  '.jg-modal[hidden]{display:none}' +
  '.jg-modal-caja{border-radius:28px;padding:26px 30px;text-align:center;min-width:min(86vw,340px)}' +
  '.jg-modal-caja h2{margin:0 0 6px;font-size:1.3rem;letter-spacing:.14em;color:' + VERDE + '}' +
  '.jg-modal-caja p{margin:4px 0;font-size:.85rem;color:#c7d6ce}' +
  '.jg-modal-caja p b{color:#fff}' +
  '.jg-modal-acciones{display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap}' +
  '.jg-modal-acciones .jg-btn{width:auto;height:auto;padding:10px 22px;border-radius:999px;font-size:.85rem;letter-spacing:.06em}' +
  '@media (max-width:600px){.jg-chip{padding:6px 10px;font-size:.7rem}.jg-aviso{top:62px;font-size:.74rem}}';

  /* corazon en pixel art: silueta (solo borde) y, si esta lleno, relleno rojo suave */
  var CORAZON = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];
  function svgCorazon(lleno){
    var h = CORAZON.length, w = CORAZON[0].length, r = '';
    function dentro(x, y){ return x >= 0 && y >= 0 && x < w && y < h && CORAZON[y][x] === 'X'; }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++){
      if (!dentro(x, y)) continue;
      var borde = !dentro(x - 1, y) || !dentro(x + 1, y) || !dentro(x, y - 1) || !dentro(x, y + 1);
      if (borde) r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + ROJO + '"/>';
      else if (lleno) r += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="rgba(255,77,77,.5)"/>';
    }
    return '<svg viewBox="0 0 ' + w + ' ' + h + '"' + (lleno ? '' : ' style="opacity:.4"') + '>' + r + '</svg>';
  }

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
            '<div class="jg-chip jg-vida"></div>' +
            '<div class="jg-fila"><div class="jg-chip jg-nivel">LV <b data-n="nivel">1</b></div>' +
            '<div class="jg-chip">KILLS <b data-n="kills">0</b></div></div>' +
          '</div>' +
          '<div class="jg-der">' +
            '<div class="jg-fila"><button class="jg-btn" data-a="pausa" aria-label="Pause">II</button>' +
            '<button class="jg-btn" data-a="salir" aria-label="Exit">X</button></div>' +
            '<div class="jg-fila"><div class="jg-chip">RATE <b data-n="cad">2.0</b>/s</div>' +
            '<div class="jg-chip">DMG <b data-n="dano">1.1</b></div></div>' +
            '<div class="jg-fila"><div class="jg-chip">SHOTS <b data-n="balas">1</b></div>' +
            '<div class="jg-chip">PIERCE <b data-n="perf">0</b></div>' +
            '<div class="jg-chip">SIZE <b data-n="tam">2.0</b></div></div>' +
          '</div>' +
        '</div>' +
        '<div class="jg-aviso"></div>' +
        '<div class="jg-pie">' +
          '<div class="jg-chip">TIME <b data-n="tiempo">0:00</b></div>' +
          '<div class="jg-chip jg-amenaza">THREAT <i><u></u></i></div>' +
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
    var hudVida = raiz.querySelector('.jg-vida'), aviso = raiz.querySelector('.jg-aviso'),
        rojo = raiz.querySelector('.jg-rojo'), modal = raiz.querySelector('.jg-modal'),
        caja = raiz.querySelector('.jg-modal-caja'), barra = raiz.querySelector('.jg-amenaza u');

    var mejor = { nivel:1, tiempo:0 };
    try { var g = JSON.parse(localStorage.getItem('juegoZ') || 'null'); if (g) mejor = g; } catch(e){}
    el('mejor').textContent = mejor.nivel;

    /* ---------- estado ---------- */
    var P, cola, enemigos, balas, parts, curas, nivel, kills, tiempo, vida, inv, acum, spawnT, pausado, fin, raf, ultimo;
    var tactil = window.matchMedia('(pointer: coarse)').matches;
    var tx = 0, ty = 0;                                  // hacia donde apunta el cursor (unidades)

    function reiniciar(){
      nivel = 1; kills = 0; tiempo = 0; acum = 0; rafaga = 0; rafagaT = 0; spawnT = 0.6; inv = 0; pausado = false; fin = false;
      P = { x: W / 2, y: H / 2 };
      tx = P.x; ty = P.y;
      enemigos = []; balas = []; parts = []; curas = []; cola = [];
      vida = stats(1).vidaMax;
      modal.hidden = true; raiz.classList.remove('menu');
      hud();
      ultimo = performance.now();
    }

    function hud(){
      var s = stats(nivel);
      var h = '';
      for (var i = 0; i < s.vidaMax; i++) h += svgCorazon(i < vida);
      hudVida.innerHTML = h;
      el('nivel').textContent = nivel; el('kills').textContent = kills;
      el('cad').textContent = s.cadencia.toFixed(1); el('dano').textContent = s.dano.toFixed(1);
      el('balas').textContent = s.balas; el('perf').textContent = s.perfora; el('tam').textContent = s.tam.toFixed(1);
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
    function mover(e){ if (!pausado && !fin) aPos(e); }
    raiz.addEventListener('pointermove', mover);
    raiz.addEventListener('pointerdown', function(e){
      if (e.target.closest && e.target.closest('.jg-btn, .jg-modal')) return;
      mover(e);
    });
    function tecla(e){
      if (e.key === 'Escape'){ e.preventDefault(); if (!fin) alternarPausa(); }
    }
    document.addEventListener('keydown', tecla, true);
    function oculta(){ if (document.hidden && !fin && !pausado) alternarPausa(); }
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
    });

    function alternarPausa(){
      if (fin) return;
      pausado = !pausado;
      if (pausado){
        raiz.classList.add('menu');
        caja.innerHTML = '<h2>PAUSED</h2><p>LV <b>' + nivel + '</b> · KILLS <b>' + kills + '</b> · <b>' + fmt(tiempo) + '</b></p>' +
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
      caja.innerHTML = '<h2>OVERRUN</h2><p>LEVEL <b>' + nivel + '</b></p><p>KILLS <b>' + kills + '</b> · TIME <b>' + fmt(tiempo) + '</b></p>' +
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

    /* ---------- reglas ---------- */
    function aparecer(){
      var d = dificultad(nivel);
      var lado = (Math.random() * 4) | 0, x, y, m = 10;
      if (lado === 0){ x = Math.random() * W; y = -m; }
      else if (lado === 1){ x = W + m; y = Math.random() * H; }
      else if (lado === 2){ x = Math.random() * W; y = H + m; }
      else { x = -m; y = Math.random() * H; }
      var r = Math.random(), tam = 9, hp = d.vida, vel = d.vel, tipo = 0;
      if (r < d.pesado){ tam = 17; hp = d.vida * 4; vel *= 0.6; tipo = 1; }
      else if (r < d.pesado + d.rapido){ tam = 6; hp = d.vida * 0.6; vel *= 1.6; tipo = 2; }
      enemigos.push({ x:x, y:y, s:tam, hp:hp, max:hp, v:vel, flash:0, tipo:tipo, ph:Math.random() * 6.28 });
    }

    function subirNivel(){
      var a = stats(nivel), b = stats(nivel + 1);
      nivel++;
      var msg = '<b>LEVEL ' + nivel + '</b> · +RATE +DMG';
      if (b.balas > a.balas) msg += ' · <b>+SHOT</b>';
      if (b.perfora > a.perfora) msg += ' · <b>+PIERCE</b>';
      if (b.vidaMax > a.vidaMax){ msg += ' · <b>+HEART</b>'; vida = Math.min(b.vidaMax, vida + 1); }
      mostrarAviso(msg);
      hud();
      // anillo de pixeles al subir
      for (var i = 0; i < 28; i++){
        var an = i / 28 * 6.2832;
        parts.push({ x:P.x, y:P.y, vx:Math.cos(an) * 60, vy:Math.sin(an) * 60, t:0.45, c:VERDE });
      }
    }

    /* Varias balas = una rafaga automatica: salen una tras otra, cada una apuntando al enemigo
       mas cercano EN ESE MOMENTO, con un temblor minimo (no en abanico como una escopeta). */
    function dispararA(obj, s){
      var n = s.balas;
      var sep = Math.min(0.08, 0.8 / s.cadencia / n);
      for (var i = 0; i < n; i++) cola.push({ t: i * sep, s: s });
    }
    function balaAlMasCercano(s){
      var cerca = null, dm = 1e9;
      for (var j = 0; j < enemigos.length; j++){
        var q = enemigos[j], dd = (q.x - P.x) * (q.x - P.x) + (q.y - P.y) * (q.y - P.y);
        if (dd < dm){ dm = dd; cerca = q; }
      }
      if (!cerca) return;
      var an = Math.atan2(cerca.y - P.y, cerca.x - P.x) + (Math.random() - 0.5) * 0.05;
      balas.push({ x:P.x, y:P.y, vx:Math.cos(an) * s.velBala, vy:Math.sin(an) * s.velBala,
                   d:s.dano, r:s.tam / 2, p:s.perfora, golpes:[], vida:2.2 });
    }

    function dano(){
      if (inv > 0) return;
      vida--; inv = 1.0;
      rojo.classList.add('on'); setTimeout(function(){ rojo.classList.remove('on'); }, 60);
      hud();
      for (var i = 0; i < 14; i++){
        var an = Math.random() * 6.2832, v = 30 + Math.random() * 40;
        parts.push({ x:P.x, y:P.y, vx:Math.cos(an) * v, vy:Math.sin(an) * v, t:0.4, c:ROJO });
      }
      if (vida <= 0) gameOver();
    }

    function matar(e, idx){
      enemigos.splice(idx, 1);
      kills++;
      for (var i = 0; i < 10; i++){
        var an = Math.random() * 6.2832, v = 20 + Math.random() * 50;
        parts.push({ x:e.x, y:e.y, vx:Math.cos(an) * v, vy:Math.sin(an) * v, t:0.35 + Math.random() * 0.2, c:ROJO });
      }
      if (Math.random() < 0.05) curas.push({ x:e.x, y:e.y, t:9 });     // a veces suelta un corazon
      subirNivel();                                                       // cada muerte = un nivel
    }

    /* ---------- actualizar ---------- */
    function actualizar(dt){
      var s = stats(nivel), d = dificultad(nivel);
      tiempo += dt;
      if (inv > 0) inv -= dt;

      // el jugador sigue al cursor (casi directo) y no sale de la pantalla
      var k = 1 - Math.exp(-dt * 22);
      P.x += (tx - P.x) * k; P.y += (ty - P.y) * k;
      P.x = Math.max(4, Math.min(W - 4, P.x)); P.y = Math.max(4, Math.min(H - 4, P.y));

      // aparicion
      spawnT -= dt;
      if (spawnT <= 0){
        spawnT = d.intervalo * (0.7 + Math.random() * 0.6);
        if (enemigos.length < d.maxVivos){
          var n = 1 + (nivel > 20 && Math.random() < 0.5 ? 1 : 0) + (nivel > 45 && Math.random() < 0.5 ? 1 : 0);
          for (var i = 0; i < n; i++) aparecer();
        }
      }

      // enemigos: persiguen al jugador
      for (var i = enemigos.length - 1; i >= 0; i--){
        var e = enemigos[i];
        var dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
        e.ph += dt * 4;
        e.x += (dx / dist) * e.v * dt + Math.cos(e.ph) * 3 * dt;
        e.y += (dy / dist) * e.v * dt + Math.sin(e.ph) * 3 * dt;
        if (e.flash > 0) e.flash -= dt;
        if (dist < e.s / 2 + 3) dano();
      }

      // disparo automatico hacia el enemigo mas cercano
      acum += dt * s.cadencia;
      if (acum >= 1){
        acum = Math.min(acum - 1, 1);
        if (masCercano()) rafaga = Math.min(14, rafaga + s.balas);     // encola las balas del disparo
        else acum = 1;                                               // sin objetivo, queda lista
      }
      if (rafaga > 0){
        rafagaT -= dt;
        if (rafagaT <= 0){
          var obj = masCercano();                                    // cada bala apunta al mas cercano en ese instante
          if (obj){ dispararA(obj, s); rafaga--; rafagaT = 0.055; } else rafaga = 0;
        }
      }

      // balas
      for (var b = balas.length - 1; b >= 0; b--){
        var bl = balas[b];
        bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.vida -= dt;
        var fuera = bl.x < -8 || bl.y < -8 || bl.x > W + 8 || bl.y > H + 8 || bl.vida <= 0;
        if (!fuera){
          for (var m = enemigos.length - 1; m >= 0; m--){
            var en = enemigos[m];
            if (bl.golpes.indexOf(en) >= 0) continue;
            if (Math.abs(bl.x - en.x) < en.s / 2 + bl.r && Math.abs(bl.y - en.y) < en.s / 2 + bl.r){
              en.hp -= bl.d; en.flash = 0.07; bl.golpes.push(en);
              parts.push({ x:bl.x, y:bl.y, vx:(Math.random() - 0.5) * 40, vy:(Math.random() - 0.5) * 40, t:0.15, c:'#fff' });
              if (en.hp <= 0) matar(en, m);
              if (bl.golpes.length > bl.p){ fuera = true; break; }       // se acabo la perforacion
            }
          }
        }
        if (fuera) balas.splice(b, 1);
      }

      // corazones recogibles
      for (var c = curas.length - 1; c >= 0; c--){
        var cu = curas[c]; cu.t -= dt;
        if (cu.t <= 0){ curas.splice(c, 1); continue; }
        if (Math.hypot(cu.x - P.x, cu.y - P.y) < 8){
          if (vida < stats(nivel).vidaMax){ vida++; hud(); mostrarAviso('<b>+1 HEART</b>'); }
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
      barra.style.width = Math.min(100, (enemigos.length / d.maxVivos) * 100) + '%';
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
      // resplandor tenue
      ctx.fillStyle = 'rgba(61,220,132,.12)'; ctx.fillRect(x0 - 2, y0 - 2, 11, 11);
    }

    function dibujar(){
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      // fondo: puntos tenues que dan sensacion de suelo
      ctx.fillStyle = 'rgba(61,220,132,.06)';
      for (var gy = 6; gy < H; gy += 14) for (var gx = 6; gx < W; gx += 14) ctx.fillRect(gx, gy, 1, 1);

      curas.forEach(function(cu){
        if (cu.t < 2 && Math.floor(cu.t * 6) % 2) return;
        var x0 = Math.round(cu.x - 3), y0 = Math.round(cu.y - 3);
        for (var y = 0; y < CORAZON.length; y++) for (var x = 0; x < 7; x++) if (CORAZON[y][x] === 'X') px(x0 + x, y0 + y, 1, 1, ROJO);
      });
      enemigos.forEach(dibujarEnemigo);
      balas.forEach(function(b){
        var t = Math.max(1, Math.round(b.r * 2));
        px(b.x - t / 2 - b.vx * 0.012, b.y - t / 2 - b.vy * 0.012, t, t, 'rgba(61,220,132,.45)');   // estela corta
        px(b.x - t / 2, b.y - t / 2, t, t, '#c9ffe0');
      });
      parts.forEach(function(p){ px(p.x, p.y, 1, 1, p.c); });
      if (!fin) dibujarZ();
    }

    /* ---------- bucle ---------- */
    function frame(now){
      var dt = Math.min(0.05, (now - ultimo) / 1000); ultimo = now;
      if (!pausado && !fin) actualizar(dt);
      dibujar();
      raf = requestAnimationFrame(frame);
    }
    reiniciar();
    raf = requestAnimationFrame(frame);
    mostrarAviso(tactil ? 'Drag to move · <b>auto-fire</b>' : 'Move the mouse · <b>auto-fire</b>');
  }

  window.Juego = { abrir: abrir };
})();
