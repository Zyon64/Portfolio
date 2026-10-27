/* ---------------------------------------------------------
   JUEGO ESCONDIDO: supervivencia.
   - El jugador es la Z (no rota) y te mueves con el cursor (o el dedo en movil).
   - Dispara solo, en direccion al enemigo mas cercano. La Z no gira: solo sale la bala.
   - Los enemigos son bloques rojos, en silueta vacia, con picos arriba. No se amontonan: chocan
     entre si y rebotan. Cada uno tiene su propia forma de perseguirte (como los fantasmas de Pacman).
   - Cada muerte llena la barra de nivel (3, 5, 10, 15... kills). Al llenarla eliges 1 de 3 mejoras;
     las ofertas siguen un ARBOL oculto: 2 de las 3 estan relacionadas con lo ultimo que elegiste y la
     tercera es de otra rama.
   - Cada ~2 minutos llega una OLEADA: enemigos del nivel actual por todos los bordes.
   - La dificultad sube SOLO con los niveles, y solo para los enemigos NUEVOS (los vivos no cambian).
   - Objetos que sueltan: cura, bomba, tiempo (congela), burbuja (inmune), rayo (tormenta).
   Todo se dibuja en un lienzo de baja resolucion (1 unidad = S pixeles de pantalla), asi se ve
   pixel art de verdad. La interfaz usa el mismo vidrio del portafolio.
   Se enchufa en window.Juego.abrir(salir): salir() se llama cuando el jugador sale.
   --------------------------------------------------------- */
(function(){
  var S = 3;                                   // 1 unidad del juego = S px de pantalla
  var ROJO = '#ff4d4d', VERDE = '#3ddc84';

  /* ---------------------------  PROGRESION (todo en un lugar)  --------------------------- */
  /* Kills necesarias para pasar del nivel L al siguiente: 3, 5, 10, 15, 20... (+5 cada nivel). */
  function requiere(L){ return L <= 1 ? 3 : 5 * (L - 1); }

  var OLEADA_PRIMERA = 90, OLEADA_CADA = 120;      // segundos

  /* Mejoras: cada una cuenta cuantas veces se eligio (m[clave]). Las curvas 1-exp(-n/k) suben rapido
     y se acercan a un tope, asi escalan a largo plazo sin romper el juego. */
  var MEJORAS = {
    cad:      { nombre:'FIRE RATE',    desc:'+20% fire rate',               tope:12 },
    dano:     { nombre:'DAMAGE',       desc:'Bullets hit harder',           tope:999 },
    tam:      { nombre:'BULLET SIZE',  desc:'Bigger bullets, bigger hitbox', tope:10 },
    balas:    { nombre:'EXTRA SHOT',   desc:'+1 bullet per burst',          tope:9 },
    lineas:   { nombre:'EXTRA LINE',   desc:'+1 parallel line of bullets',  tope:4 },
    perf:     { nombre:'PIERCE',       desc:'Bullets go through +1',        tope:10 },
    vel:      { nombre:'BULLET SPEED', desc:'Faster bullets',               tope:40 },
    vida:     { nombre:'MAX HP',       desc:'+20 maximum health',           tope:999 },
    reg:      { nombre:'REGEN',        desc:'Recover HP over time',         tope:20 },
    cura:     { nombre:'HEAL BOOST',   desc:'Heal pickups restore more',    tope:20 },
    suerte:   { nombre:'LUCK',         desc:'Enemies drop more items',      tope:15 },
    duracion: { nombre:'ITEM POWER',   desc:'Item effects last longer',     tope:15 }
  };
  /* ARBOL OCULTO: que mejoras salen "cerca" de la ultima elegida. */
  var REL = {
    dano:     ['cad', 'perf', 'tam'],
    cad:      ['dano', 'balas', 'vel'],
    tam:      ['dano', 'perf', 'vel'],
    balas:    ['cad', 'lineas', 'dano'],
    lineas:   ['balas', 'cad', 'vel'],
    perf:     ['dano', 'tam', 'vel'],
    vel:      ['cad', 'perf', 'lineas'],
    vida:     ['reg', 'cura', 'duracion'],
    reg:      ['vida', 'cura', 'suerte'],
    cura:     ['reg', 'vida', 'suerte'],
    suerte:   ['cura', 'duracion', 'reg'],
    duracion: ['suerte', 'cura', 'vida']
  };
  function stats(m){
    var k = function(n, c){ return 1 - Math.exp(-n / c); };
    return {
      cad:    Math.min(14, 1.8 * Math.pow(1.2, m.cad)),   // rafagas por segundo: +20% por mejora (tope 14)
      dano:   1 + 0.5 * m.dano,                       // sin tope
      tam:    1 + 0.4 * m.tam,                        // tamaño de bala (unidades): +0.4 por mejora
      balas:  1 + m.balas,                            // balas por rafaga
      lineas: 1 + m.lineas,                           // lineas paralelas de balas
      perf:   m.perf,                                 // enemigos que atraviesa
      vel:    130 + 110 * k(m.vel, 8),                // velocidad de bala (unidades/s)
      vida:   100 + 20 * m.vida,                      // HP maximo
      reg:    0.8 * m.reg,                            // HP por segundo
      cura:   25 + 8 * m.cura,                        // HP que da una cura
      suerte: Math.min(0.32, 0.09 * (1 + 0.22 * m.suerte)),   // probabilidad de soltar objeto
      dur:    5 * (1 + 0.2 * m.duracion)              // segundos de los efectos (tiempo, burbuja, rayo)
    };
  }
  /* Texto "antes -> despues" de una mejora para mostrar en la carta. */
  function cambio(clave, m){
    var a = stats(m), m2 = {}; for (var k in m) m2[k] = m[k]; m2[clave]++;
    var b = stats(m2), f = function(x, d){ return x.toFixed(d); };
    switch (clave){
      case 'cad':      return f(a.cad, 1) + ' → ' + f(b.cad, 1) + ' /s';
      case 'dano':     return f(a.dano, 1) + ' → ' + f(b.dano, 1);
      case 'tam':      return f(a.tam, 1) + ' → ' + f(b.tam, 1);
      case 'balas':    return a.balas + ' → ' + b.balas;
      case 'lineas':   return a.lineas + ' → ' + b.lineas + ' lines';
      case 'perf':     return a.perf + ' → ' + b.perf;
      case 'vel':      return Math.round(a.vel) + ' → ' + Math.round(b.vel);
      case 'vida':     return Math.round(a.vida) + ' → ' + Math.round(b.vida);
      case 'reg':      return f(a.reg, 1) + ' → ' + f(b.reg, 1) + ' /s';
      case 'cura':     return '+' + Math.round(a.cura) + ' → +' + Math.round(b.cura) + ' HP';
      case 'suerte':   return Math.round(a.suerte * 100) + '% → ' + Math.round(b.suerte * 100) + '%';
      case 'duracion': return f(a.dur, 1) + ' → ' + f(b.dur, 1) + ' s';
    }
    return '';
  }

  /* Dificultad: depende SOLO del nivel, y se "congela" en cada enemigo al aparecer. El ataque sube
     un poco mas que la vida. */
  function dificultad(L){
    return {
      intervalo: Math.max(0.22, 1.2 / (1 + L * 0.12)),          // segundos entre apariciones
      maxVivos:  Math.min(140, Math.floor(6 + L * 3)),
      vida:      2 + L * 1.0,
      vel:       22 + Math.min(38, L * 1.6),                    // unidades/s
      golpe:     10 + L * 1.6,                                  // HP que quita al tocarte
      pesado:    Math.min(0.3, Math.max(0, (L - 3) * 0.03)),    // prob. de bloque grande
      rapido:    Math.min(0.3, Math.max(0, (L - 6) * 0.025))    // prob. de bloque chico y veloz
    };
  }
  /* Comportamientos de persecucion (como los fantasmas de Pacman). Los niveles bajos solo traen
     "directo"; luego se van sumando los demas. */
  var COMPORTAMIENTOS = [
    { id:'directo',   desde:1, peso:5, color:'#ff4d4d' },    // va recto hacia ti
    { id:'emboscada', desde:3, peso:3, color:'#ff6b8a' },    // apunta a donde VAS a estar
    { id:'flanco',    desde:5, peso:3, color:'#ff8a4d' },    // rodea y entra por el costado
    { id:'cerco',     desde:7, peso:3, color:'#ff5fb0' },    // cada uno toma un lugar alrededor tuyo
    { id:'timido',    desde:9, peso:2, color:'#d93a3a' }     // te persigue de lejos, huye si te acercas
  ];
  function elegirComportamiento(L){
    var pool = COMPORTAMIENTOS.filter(function(c){ return L >= c.desde; });
    var tot = pool.reduce(function(a, c){ return a + c.peso; }, 0), r = Math.random() * tot;
    for (var i = 0; i < pool.length; i++){ r -= pool[i].peso; if (r <= 0) return pool[i]; }
    return pool[0];
  }

  /* Objetos que sueltan los enemigos. */
  var OBJETOS = [
    { id:'cura',    peso:34, color:'#ff4d4d' },
    { id:'bomba',   peso:18, color:'#ffa23d' },
    { id:'tiempo',  peso:16, color:'#7fd6ff' },
    { id:'burbuja', peso:16, color:'#8fa8ff' },
    { id:'rayo',    peso:16, color:'#ffe14d' },
    { id:'barrido', peso:3,  color:'#ffffff' }          // muy raro: barre toda la pantalla
  ];
  var SPR = {
    cura:    ['..XXX..', '..XXX..', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '..XXX..', '..XXX..'],
    bomba:   ['....o..', '...o...', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.'],
    tiempo:  ['.XXXXX.', 'X..o..X', 'X..o..X', 'X..ooXX', 'X.....X', 'X.....X', '.XXXXX.'],
    burbuja: ['..XXX..', '.X...X.', 'X.o...X', 'X.....X', 'X.....X', '.X...X.', '..XXX..'],
    rayo:    ['...XXX.', '..XXX..', '.XXX...', 'XXXXXX.', '..XXX..', '.XX....', 'X......'],
    barrido: ['.......', '.X..X..', '..X..X.', '...X..X', '..X..X.', '.X..X..', '.......']
  };
  var Z_PIX = ['XXXXXXX', '.....X.', '....X..', '...X...', '..X....', '.X.....', 'XXXXXXX'];

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
  '.jg-arriba{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}' +
  '.jg-izq,.jg-der{display:flex;flex-direction:column;gap:8px}' +
  '.jg-der{align-items:flex-end}' +
  '.jg-fila{display:flex;gap:6px;flex-wrap:wrap}' +
  '.jg-der .jg-fila{justify-content:flex-end}' +
  '.jg-stats{display:flex;flex-direction:column;gap:8px;align-items:flex-end}' +
  '.jg-efectos{display:flex;gap:6px;flex-wrap:wrap}' +
  '.jg-efectos .jg-chip{padding:5px 11px;font-size:.7rem}' +
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
  '.jg-aviso.alerta{--rim:rgba(255,90,90,.9);color:#ffb3b3}' +
  '.jg-aviso b{color:' + VERDE + '}.jg-aviso.alerta b{color:' + ROJO + '}' +
  '.jg-rojo{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s;' +
  '  box-shadow:inset 0 0 90px 10px rgba(255,60,60,.55)}' +
  '.jg-rojo.on{opacity:1;transition:none}' +
  /* pausa / mejoras / fin: fondo bien oscuro para que no se vea el juego a traves */
  '.jg-modal{position:absolute;inset:0;display:grid;place-items:center;background:rgba(0,0,0,.93);pointer-events:auto;overflow:auto}' +
  '.jg-modal[hidden]{display:none}' +
  '.jg-modal-caja{border-radius:28px;padding:26px 30px;text-align:center;min-width:min(86vw,340px);max-width:94vw}' +
  '.jg-h{margin:0 0 6px;font-size:1.3rem;letter-spacing:.14em;font-weight:700;color:' + VERDE + '}' +
  '.jg-modal-caja p{margin:4px 0;font-size:.85rem;color:#c7d6ce}' +
  '.jg-modal-caja p b{color:#fff}' +
  '.jg-lista{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;margin:12px 0 0;font-size:.74rem;color:#9bb0a5;text-align:left}' +
  '.jg-lista b{color:#fff;float:right}' +
  '.jg-modal-acciones{display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap}' +
  '.jg-modal-acciones .jg-btn{width:auto;height:auto;padding:10px 22px;border-radius:999px;font-size:.85rem;letter-spacing:.06em}' +
  '.jg-rank{display:flex;flex-direction:column;gap:3px;margin:12px 0 0;min-width:min(78vw,300px)}' +
  '.jg-fr{display:grid;grid-template-columns:44px 20px 1fr auto;gap:8px;align-items:center;padding:6px 12px;border-radius:14px;' +
  '  font-size:.8rem;color:#b9c9c0;text-align:left}' +
  '.jg-fr i{display:grid;place-items:center;color:#7d968a}.jg-fr em{font-style:normal}.jg-fr b{color:#fff}' +
  '.jg-fr.me{background:rgba(61,220,132,.16);color:#fff}.jg-fr.me i{color:' + VERDE + '}' +
  '.jg-rank.todos{max-height:42vh;overflow-y:auto;padding-right:4px;gap:2px}' +
  '.jg-puntos-r{color:#4a5c53;font-size:.8rem;line-height:1}' +
  '.jg-nombre{display:block;margin:10px auto 0;width:150px;padding:10px 14px;border:0;border-radius:999px;text-align:center;' +
  '  font:inherit;font-size:1rem;letter-spacing:.3em;text-transform:uppercase;color:#fff;background:rgba(255,255,255,.07);' +
  '  box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);outline:none;cursor:text}' +
  '.jg-nombre:focus{box-shadow:inset 0 0 0 1px ' + VERDE + '}' +
  '.jg-btn.off{opacity:.4}' +
  '.jg-cartas{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-top:18px}' +
  '.jg-carta{pointer-events:auto;width:176px;border:0;border-radius:24px;padding:18px 14px;color:#eaf3ee;cursor:pointer;' +
  '  font:inherit;text-align:center;transition:background .2s,scale .3s cubic-bezier(.3,1.5,.5,1)}' +
  '.jg-carta:hover,.jg-carta:focus-visible{background:rgba(61,220,132,.12);scale:1.05;outline:none}' +
  '.jg-carta b{display:block;font-size:.92rem;letter-spacing:.08em;color:' + VERDE + ';margin-bottom:6px}' +
  '.jg-carta span{display:block;font-size:.74rem;color:#c7d6ce;line-height:1.5}' +
  '.jg-carta em{display:block;font-style:normal;margin-top:10px;font-size:.82rem;color:#fff}' +
  '.jg-carta i{display:block;margin-top:8px;font-style:normal;font-size:.66rem;color:#7d968a}' +
  /* movil: menos cosas a la vez. Arriba: HP + nivel a la izquierda y botones a la derecha; los
     stats se ven en la pausa; abajo solo kills, tiempo y amenaza. */
  '@media (max-width:600px){' +
  '  .jg-hud{padding:8px}' +
  '  .jg-arriba{flex-wrap:nowrap}' +
  '  .jg-izq{flex:1;min-width:0;gap:6px}' +
  '  .jg-izq>.jg-chip{width:100%;justify-content:space-between;padding:6px 12px;font-size:.72rem}' +
  '  .jg-izq>.jg-chip .jg-barra{flex:1;width:auto;min-width:40px}' +
  '  .jg-hp .jg-barra{width:auto}' +
  '  .jg-der{flex-direction:row}' +
  '  .jg-stats{display:none}' +
  '  .jg-btn{width:34px;height:34px}' +
  '  .jg-pie{left:8px;right:8px;bottom:8px;gap:6px}' +
  '  .jg-pie .jg-chip{padding:5px 10px;font-size:.68rem}' +
  '  .jg-pie .jg-mejor{display:none}' +
  '  .jg-aviso{top:auto;bottom:52px;font-size:.72rem;padding:6px 12px;white-space:normal;max-width:88vw}' +
  '  .jg-carta{width:100%;max-width:300px;padding:14px}' +
  '  .jg-cartas{gap:10px}' +
  '  .jg-modal-caja{padding:20px 16px}' +
  '  .jg-lista{grid-template-columns:1fr}' +
  '}';

  /* ---------------------------  RANKING (jugadores inventados + los tuyos)  --------------------------- */
  /* Los jugadores "del mundo" se generan SIEMPRE igual a partir de una semilla y de la semana (UTC):
     asi todos los dispositivos ven los mismos nombres y puntajes, y cada semana la tabla cambia un
     poco (algunos suben de puntaje y entran jugadores nuevos), como si siguiera jugando gente. */
  var LANZAMIENTO = Math.floor(Date.UTC(2026, 9, 27) / (7 * 864e5));     // semana del lanzamiento
  var JUG_INICIAL = 170, JUG_MAX = 360;
  function mulberry(a){
    return function(){
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var MALAS = ['SEX', 'ASS', 'FUC', 'FUK', 'CUL', 'PUT', 'PEN', 'COG', 'CAC', 'NAZI', 'GAY', 'KKK', 'TIT', 'DIC', 'POR', 'MIE'];
  var NOMBRES = (function(){
    var ON = 'KVZNRMLTBDSPFGHJXCQWY'.split(''), VO = 'AEIOU'.split(''), CO = ['', '', 'N', 'X', 'K', 'R', 'L', 'S', 'T', 'Z'];
    var usados = {}, lista = [];
    for (var i = 0; i < JUG_MAX; i++){
      var r = mulberry(i * 7919 + 13), pick = function(a){ return a[(r() * a.length) | 0]; }, p = r(), n;
      if (p < 0.30)      n = pick(ON) + pick(VO) + pick(ON) + pick(VO);
      else if (p < 0.55) n = pick(ON) + pick(VO) + pick(CO);
      else if (p < 0.75) n = pick(ON) + pick(VO) + pick(ON) + pick(VO) + pick(CO);
      else if (p < 0.88) n = pick(ON) + pick(VO) + pick(ON) + (1 + ((r() * 9) | 0));
      else               n = pick(['X', 'Z', 'N', 'K']) + pick(VO) + '_' + ((r() * 100) | 0);
      n = n.slice(0, 5);
      if (n.length < 3) n += pick(VO);
      var intentos = 0;
      while ((usados[n] || MALAS.some(function(m){ return n.indexOf(m) >= 0; })) && intentos < 40){
        n = (n.slice(0, 3) + pick(ON) + pick(VO)).slice(0, 5); intentos++;
      }
      usados[n] = 1; lista.push(n);
    }
    return lista;
  })();
  /* Puntaje de cada jugador en la semana "sem" desde el lanzamiento. */
  function puntajeMundo(i, sem){
    var s = 120 + 3200 * Math.pow(mulberry(i * 104729 + 7)(), 1.9);
    for (var k = 1; k <= sem; k++){
      var rr = mulberry(i * 65537 + k * 9973);
      if (rr() < 0.35) s += rr() * 140;
    }
    return Math.min(3650, Math.round(s / 5) * 5);
  }
  var MUNDO = (function(){
    var sem = Math.max(0, Math.floor(Date.now() / (7 * 864e5)) - LANZAMIENTO), l = [];
    for (var i = 0; i < JUG_MAX; i++){
      var entra = i < JUG_INICIAL ? 0 : 1 + Math.floor((i - JUG_INICIAL) / 2.5);   // los nuevos entran poco a poco
      if (entra > sem) continue;
      l.push({ id:'f' + i, n:NOMBRES[i], s:puntajeMundo(i, sem), d:(mulberry(i * 31 + 5)() < 0.46 ? 'm' : 'p') });
    }
    return l;
  })();
  /* Puntaje de una partida: kills, nivel alcanzado y tiempo sobrevivido. */
  function puntaje(nivel, kills, t){ return kills * 10 + nivel * 50 + Math.floor(t * 2); }
  function propios(){ try { return JSON.parse(localStorage.getItem('juegoZ_rank') || '[]'); } catch(e){ return []; } }
  function guardarPropio(e){
    var l = propios(); l.push(e); l = l.slice(-40);
    try { localStorage.setItem('juegoZ_rank', JSON.stringify(l)); } catch(x){}
  }
  var ICO_PC  = '<svg viewBox="0 0 12 10" width="14" height="12"><rect x="1" y="1" width="10" height="6" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="4" y="8" width="4" height="1.3" fill="currentColor"/></svg>';
  var ICO_MOV = '<svg viewBox="0 0 8 12" width="10" height="14"><rect x="1" y="1" width="6" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="3" y="9" width="2" height="1.1" fill="currentColor"/></svg>';
  /* Tabla ordenada: jugadores inventados + tus entradas guardadas + (opcional) una temporal. */
  function tabla(yo){
    var l = MUNDO.slice();
    propios().forEach(function(e){ l.push({ id:'o' + e.f, n:e.n, s:e.s, d:e.d, yo:true }); });
    if (yo && yo.temp) l.push({ id:'yo', n:'YOU', s:yo.s, d:yo.d, yo:true });
    l.sort(function(a, b){ return b.s - a.s || (b.yo ? 1 : 0) - (a.yo ? 1 : 0); });
    return l;
  }
  /* "Estas en el puesto N del mundo" + las filas cercanas (top 3 y vecinos), o la lista completa. */
  function htmlRanking(yo, todos){
    var l = tabla(yo), idx = -1;
    for (var i = 0; i < l.length; i++) if (l[i].id === yo.id) idx = i;
    if (idx < 0) idx = l.length - 1;
    var mostrar = {};
    if (todos){ for (var q = 0; q < l.length; q++) mostrar[q] = 1; }
    else {
      [0, 1, 2].forEach(function(k){ mostrar[k] = 1; });
      for (var k = idx - 2; k <= idx + 2; k++) if (k >= 0 && k < l.length) mostrar[k] = 1;
    }
    var h = '<div class="jg-rank' + (todos ? ' todos' : '') + '">', prev = -1;
    Object.keys(mostrar).map(Number).sort(function(a, b){ return a - b; }).forEach(function(i){
      if (prev >= 0 && i > prev + 1) h += '<div class="jg-puntos-r">···</div>';
      var e = l[i];
      h += '<div class="jg-fr' + (i === idx ? ' me' : '') + '"><span>#' + (i + 1) + '</span><i>' + (e.d === 'm' ? ICO_MOV : ICO_PC) +
           '</i><em>' + e.n + '</em><b>' + e.s + '</b></div>';
      prev = i;
    });
    return { html:h + '</div>', pos:idx + 1, total:l.length };
  }

  /* ---------------------------  SONIDOS 8-bit (Web Audio, sin archivos)  --------------------------- */
  var AC = null, NB = null, SFX_ON = true, ultimoSfx = {};
  try { SFX_ON = localStorage.getItem('juegoZ_sfx') !== 'off'; } catch(e){}
  function ac(){
    if (!AC){
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { AC = new C(); } catch(e){ return null; }
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  /* ===== Sonido estilo NES (2A03) =====
     - Canal de RUIDO: registro de desplazamiento de 15 bits (LFSR) con los periodos reales de la
       consola, envolvente de volumen de 4 bits que baja por pasos a 60 cuadros/s. Es el sonido
       de las explosiones de Battle City / Tank 1990 y de los truenos.
     - Canales de PULSO: ondas cuadradas con ciclo de trabajo 12.5 / 25 / 50 %.
     - Canal TRIANGULO para los graves.
     Todo cambia de frecuencia y volumen por pasos de 1/60 s, como el hardware original. */
  var PT = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];   // periodos del canal de ruido (NTSC)
  var ONDAS = {};
  function onda(a, duty){
    var k = String(duty);
    if (ONDAS[k]) return ONDAS[k];
    var N = 48, re = new Float32Array(N), im = new Float32Array(N);
    for (var n = 1; n < N; n++){
      var c = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty);
      re[n] = c * Math.cos(n * Math.PI * duty); im[n] = c * Math.sin(n * Math.PI * duty);
    }
    return (ONDAS[k] = a.createPeriodicWave(re, im));
  }
  function lim(k, ms){ var n = performance.now(); if (n - (ultimoSfx[k] || 0) < ms) return false; ultimoSfx[k] = n; return true; }
  function vr(){ return 0.88 + Math.random() * 0.26; }       // ligera variacion en cada sonido
  function nota(n){ return 440 * Math.pow(2, n / 12); }      // semitonos desde La4

  /* Canal de ruido. idx0 -> idx1: indice del periodo (0 agudo .. 15 grave), se interpola por pasos.
     modo 1 = ruido corto "metalico". trem: parpadeo de volumen cada N cuadros (para truenos). */
  function ruidoNES(idx0, idx1, modo, dur, vol, delay, trem){
    if (!SFX_ON) return;
    var a = ac(); if (!a) return;
    var sr = a.sampleRate, n = Math.floor(dur * sr), buf = a.createBuffer(1, n, sr), d = buf.getChannelData(0);
    var lfsr = 1, acc = 0, bit = 1, frames = Math.max(1, Math.round(dur * 60));
    for (var i = 0; i < n; i++){
      var f = Math.min(frames - 1, Math.floor(i / sr * 60)), frac = f / Math.max(1, frames - 1);
      var per = PT[idx0] * Math.pow(PT[idx1] / PT[idx0], frac);
      acc += (1789773 / per) / sr;
      while (acc >= 1){
        acc -= 1;
        var fb = (lfsr & 1) ^ ((lfsr >> (modo ? 6 : 1)) & 1);
        lfsr = (lfsr >> 1) | (fb << 14);
        bit = (lfsr & 1) ? -1 : 1;
      }
      var niv = Math.round(15 * (1 - f / frames));                  // 15 niveles, baja por pasos
      if (trem && (f % trem) >= trem / 2) niv = Math.max(0, niv - 5);
      d[i] = bit * niv / 15;
    }
    var s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; g.gain.value = vol; s.connect(g); g.connect(a.destination);
    s.start(a.currentTime + (delay || 0));
  }
  /* Canal de pulso (duty .125/.25/.5) o triangulo ('tri'). Frecuencia y volumen por pasos de 1/60 s. */
  function pulsoNES(f0, f1, dur, duty, vol, delay, plano){
    if (!SFX_ON) return;
    var a = ac(); if (!a) return;
    var t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain(), frames = Math.max(1, Math.round(dur * 60));
    if (duty === 'tri') o.type = 'triangle'; else o.setPeriodicWave(onda(a, duty));
    for (var f = 0; f < frames; f++){
      var tt = t0 + f / 60;
      o.frequency.setValueAtTime(f0 + (f1 - f0) * (f / Math.max(1, frames - 1)), tt);
      g.gain.setValueAtTime(vol * (plano ? (f < frames - 2 ? 1 : 0.4) : Math.round(15 * (1 - f / frames)) / 15), tt);
    }
    g.gain.setValueAtTime(0, t0 + frames / 60);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + frames / 60 + 0.03);
  }
  var sfx = {
    disparo: function(){ if (lim('d', 55)) pulsoNES(1250, 620, 0.06, 0.25, 0.02); },
    golpe:   function(){ if (lim('g', 45)) ruidoNES(3, 4, 0, 0.04, 0.03); },
    /* muerte de enemigo: la rafaga de ruido de la explosion de un tanque en Battle City: corta, rapida,
       con el tono cayendo; ligera variacion de periodo y duracion cada vez */
    matar:   function(){
      if (!lim('m', 35)) return;
      var v = vr(), i0 = 5 + ((Math.random() * 2) | 0), i1 = 9 + ((Math.random() * 2) | 0);
      ruidoNES(i0, i1, 0, 0.28 * v, 0.11);
    },
    dano:    function(){ ruidoNES(7, 11, 0, 0.3, 0.1); pulsoNES(240, 90, 0.2, 0.5, 0.045); },
    nivel:   function(){ [3, 7, 10, 15].forEach(function(n, i){ pulsoNES(nota(n), nota(n), 0.085, 0.5, 0.05, i * 0.085, true); }); },
    elegir:  function(){ pulsoNES(nota(3), nota(3), 0.05, 0.25, 0.05, 0, true); pulsoNES(nota(10), nota(10), 0.09, 0.25, 0.05, 0.05, true); },
    cura:    function(){ pulsoNES(nota(3), nota(3), 0.06, 0.5, 0.05, 0, true); pulsoNES(nota(10), nota(10), 0.1, 0.5, 0.05, 0.06, true); },
    /* explosion: el mismo ruido pero mas grave y largo, con un golpe de triangulo bajo */
    bomba:   function(){ var v = vr(); ruidoNES(9, 14, 0, 0.95 * v, 0.16); ruidoNES(6, 10, 0, 0.35, 0.1, 0.02); pulsoNES(90, 32, 0.7, 'tri', 0.14); },
    barrido: function(){ ruidoNES(13, 3, 0, 0.9, 0.09); pulsoNES(150, 1300, 0.9, 0.125, 0.04, 0, true); },
    eshot:   function(){ if (lim('e', 120)) pulsoNES(420 * vr(), 160, 0.09, 0.125, 0.035); },
    carga:   function(){ pulsoNES(180, 520, 0.35, 0.25, 0.03, 0, true); },
    divide:  function(){ var v = vr(); pulsoNES(520 * v, 980 * v, 0.09, 0.5, 0.04); },
    tiempo:  function(){ pulsoNES(1100, 160, 0.5, 0.125, 0.05); },
    burbuja: function(){ pulsoNES(300, 1100, 0.25, 0.5, 0.05, 0, true); },
    /* trueno: un chasquido de ruido agudo y luego un retumbo larguisimo de ruido en el periodo mas
       grave, con el volumen parpadeando */
    rayoOn:  function(){ ruidoNES(12, 15, 0, 0.7, 0.12, 0, 4); pulsoNES(70, 28, 0.6, 'tri', 0.1); },
    zap:     function(){
      if (!lim('z', 110)) return;
      var v = vr();
      ruidoNES(2, 5, 0, 0.07, 0.13);
      ruidoNES(12, 15, 0, 1.0 * v, 0.15, 0.06, 5);
      pulsoNES(80 * v, 26, 0.7, 'tri', 0.09, 0.06);
    },
    alarma:  function(){ [0, 1, 2].forEach(function(i){ pulsoNES(i % 2 ? nota(-5) : nota(7), i % 2 ? nota(-5) : nota(7), 0.14, 0.5, 0.055, i * 0.16, true); }); },
    oleada:  function(){ pulsoNES(110, 55, 0.5, 'tri', 0.14); ruidoNES(14, 15, 0, 0.5, 0.08); },
    click:   function(){ pulsoNES(nota(3), nota(3), 0.04, 0.5, 0.04, 0, true); },
    fin:     function(){ [3, 0, -4, -9].forEach(function(n, i){ pulsoNES(nota(n), nota(n) * 0.96, 0.2, 0.5, 0.055, i * 0.2, true); }); }
  };

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
            '<div class="jg-chip jg-hp">HP <span><b data-n="hp">100</b>/<span data-n="hpmax">100</span></span><i class="jg-barra"><u data-n="hpbarra"></u></i></div>' +
            '<div class="jg-chip jg-xp">LV <b data-n="nivel">1</b><i class="jg-barra"><u data-n="xpbarra"></u></i><span data-n="xp">0/3</span></div>' +
            '<div class="jg-efectos" data-n="efectos"></div>' +
          '</div>' +
          '<div class="jg-der">' +
            '<div class="jg-fila"><button class="jg-btn' + (SFX_ON ? '' : ' off') + '" data-a="sonido" aria-label="Sound">♪</button>' +
            '<button class="jg-btn" data-a="pausa" aria-label="Pause">II</button>' +
            '<button class="jg-btn" data-a="salir" aria-label="Exit">X</button></div>' +
            '<div class="jg-stats">' +
              '<div class="jg-fila"><div class="jg-chip">RATE <b data-n="cad">1.8</b>/s</div>' +
              '<div class="jg-chip">DMG <b data-n="dano">1.0</b></div></div>' +
              '<div class="jg-fila"><div class="jg-chip">SHOTS <b data-n="balas">1</b></div>' +
              '<div class="jg-chip">LINES <b data-n="lineas">1</b></div>' +
              '<div class="jg-chip">PIERCE <b data-n="perf">0</b></div>' +
              '<div class="jg-chip">SIZE <b data-n="tam">1.0</b></div></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="jg-aviso"></div>' +
        '<div class="jg-pie">' +
          '<div class="jg-chip">KILLS <b data-n="kills">0</b></div>' +
          '<div class="jg-chip">TIME <b data-n="tiempo">0:00</b></div>' +
          '<div class="jg-chip jg-amenaza">THREAT <i class="jg-barra"><u data-n="amenaza"></u></i></div>' +
          '<div class="jg-chip jg-mejor">BEST LV <b data-n="mejor">1</b></div>' +
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
    var ebalas, barrido;
    var P, enemigos, balas, parts, objetos, rayos, nivel, xp, kills, tiempo, hp, inv, acum, spawnT, pausado, eligiendo,
        fin, raf, ultimo, m, pendientes, ultimaMejora, oleadaT, oleadaAvisada, pulsoT, pulsos, efectos, rayoT, efectosTxt, slotCerco;
    var tactil = window.matchMedia('(pointer: coarse)').matches;
    var tx = 0, ty = 0;                                  // hacia donde apunta el cursor (unidades)

    function reiniciar(){
      m = { cad:0, dano:0, tam:0, balas:0, lineas:0, perf:0, vel:0, vida:0, reg:0, cura:0, suerte:0, duracion:0 };
      nivel = 1; xp = 0; kills = 0; tiempo = 0; acum = 0; rafaga = 0; rafagaT = 0; spawnT = 0.6; inv = 0; pulsoT = 1.2; pulsos = [];
      pausado = false; eligiendo = false; fin = false; pendientes = 0; ultimaMejora = null;
      oleadaT = OLEADA_PRIMERA; oleadaAvisada = false; rayoT = 0; efectosTxt = ''; slotCerco = 0;
      efectos = { tiempo:0, burbuja:0, rayo:0 };
      P = { x: W / 2, y: H / 2, vx:0, vy:0 };
      tx = P.x; ty = P.y;
      enemigos = []; balas = []; parts = []; objetos = []; rayos = []; ebalas = []; barrido = null;
      hp = stats(m).vida;
      el('efectos').innerHTML = '';
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
      el('balas').textContent = s.balas; el('lineas').textContent = s.lineas;
      el('perf').textContent = s.perf; el('tam').textContent = s.tam.toFixed(1);
    }

    var avisoT = 0;
    function mostrarAviso(html, alerta, ms){
      aviso.innerHTML = html; aviso.classList.toggle('alerta', !!alerta); aviso.classList.add('on');
      clearTimeout(avisoT); avisoT = setTimeout(function(){ aviso.classList.remove('on'); }, ms || 1500);
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
    raiz.addEventListener('input', function(e){
      if (e.target.classList && e.target.classList.contains('jg-nombre'))
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_\-]/g, '').slice(0, 5);
    });
    raiz.addEventListener('keydown', function(e){
      if (e.target.classList && e.target.classList.contains('jg-nombre') && e.key === 'Enter'){ e.preventDefault(); guardarNombre(); }
    });
    document.addEventListener('keydown', tecla, true);
    function oculta(){ if (document.hidden && !fin && !pausado && !eligiendo) alternarPausa(); }
    document.addEventListener('visibilitychange', oculta);

    raiz.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('[data-a]');
      if (!b) return;
      e.stopPropagation();
      var a = b.getAttribute('data-a');
      if (a !== 'mejora' && a !== 'sonido') sfx.click();
      if (a === 'sonido'){
        SFX_ON = !SFX_ON; b.classList.toggle('off', !SFX_ON);
        try { localStorage.setItem('juegoZ_sfx', SFX_ON ? 'on' : 'off'); } catch(x){}
        if (SFX_ON) sfx.click();
      }
      else if (a === 'guardar') guardarNombre();
      else if (a === 'omitir') verRanking({ temp:true, s:puntos, d:tactil ? 'm' : 'p', id:'yo' }, 'fin');
      else if (a === 'ranking') verRanking({ temp:true, s:puntaje(nivel, kills, tiempo), d:tactil ? 'm' : 'p', id:'yo' }, 'pausa');
      else if (a === 'todos') verRanking(rankYo, rankModo, !rankTodos);
      else if (a === 'volverpausa'){ pausado = false; alternarPausa(); }
      else if (a === 'pausa') alternarPausa();
      else if (a === 'seguir') alternarPausa();
      else if (a === 'reiniciar'){ reiniciar(); }
      else if (a === 'salir') cerrar();
      else if (a === 'mejora') elegir(b.getAttribute('data-k'));
    });

    /* Al volver de un menu el cursor esta sobre un boton: la Z espera donde estaba hasta que
       muevas el mouse, y es inmune un momento para que el salto no te cueste vida. */
    function reanudar(){
      modal.hidden = true; raiz.classList.remove('menu'); ultimo = performance.now();
      tx = P.x; ty = P.y; inv = Math.max(inv, 1.6);
    }

    function listaStats(){
      var s = stats(m);
      var f = function(a, b){ return '<div>' + a + '<b>' + b + '</b></div>'; };
      return '<div class="jg-lista">' + f('Fire rate', s.cad.toFixed(1) + '/s') + f('Damage', s.dano.toFixed(1)) +
        f('Shots', s.balas) + f('Lines', s.lineas) + f('Pierce', s.perf) + f('Bullet size', s.tam.toFixed(1)) +
        f('Max HP', Math.round(s.vida)) + f('Regen', s.reg.toFixed(1) + '/s') + f('Heal', '+' + Math.round(s.cura)) +
        f('Drop rate', Math.round(s.suerte * 100) + '%') + f('Item time', s.dur.toFixed(1) + 's') + '</div>';
    }
    function alternarPausa(){
      if (fin || eligiendo) return;
      pausado = !pausado;
      if (pausado){
        raiz.classList.add('menu');
        caja.innerHTML = '<div class="jg-h">PAUSED</div><p>LV <b>' + nivel + '</b> · KILLS <b>' + kills + '</b> · <b>' + fmt(tiempo) + '</b></p>' +
          listaStats() +
          '<div class="jg-modal-acciones"><button class="jg-btn" data-a="seguir">RESUME</button>' +
          '<button class="jg-btn" data-a="ranking">RANKING</button><button class="jg-btn" data-a="reiniciar">RESTART</button>' +
          '<button class="jg-btn" data-a="salir">EXIT</button></div>';
        modal.hidden = false;
      } else reanudar();
    }

    var puntos = 0;
    function gameOver(){
      fin = true; sfx.fin();
      puntos = puntaje(nivel, kills, tiempo);
      var nuevo = nivel > mejor.nivel || (nivel === mejor.nivel && tiempo > mejor.tiempo);
      if (nuevo){ mejor = { nivel:nivel, tiempo:tiempo }; try { localStorage.setItem('juegoZ', JSON.stringify(mejor)); } catch(e){} }
      el('mejor').textContent = mejor.nivel;
      raiz.classList.add('menu');
      var nombre = '';
      try { nombre = localStorage.getItem('juegoZ_nombre') || ''; } catch(e){}
      caja.innerHTML = '<div class="jg-h">OVERRUN</div><p>LEVEL <b>' + nivel + '</b> · KILLS <b>' + kills + '</b> · TIME <b>' + fmt(tiempo) + '</b></p>' +
        '<p>SCORE <b>' + puntos + '</b></p><p>Name for the ranking (5 max)</p>' +
        '<input class="jg-nombre" maxlength="5" value="' + nombre + '" placeholder="NAME" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
        '<div class="jg-modal-acciones"><button class="jg-btn" data-a="guardar">SAVE</button><button class="jg-btn" data-a="omitir">SKIP</button></div>';
      modal.hidden = false;
      setTimeout(function(){ var i = caja.querySelector('.jg-nombre'); if (i) i.focus(); }, 60);
    }
    function guardarNombre(){
      var i = caja.querySelector('.jg-nombre'), nombre = ((i && i.value) || '').trim() || 'ANON';
      try { localStorage.setItem('juegoZ_nombre', nombre); } catch(e){}
      var e = { n:nombre, s:puntos, d:tactil ? 'm' : 'p', f:Date.now() };
      guardarPropio(e);
      verRanking({ id:'o' + e.f, s:puntos }, 'fin');
    }
    /* Vista de ranking. modo 'fin': tras la partida. modo 'pausa': como vas ahora (sin guardar). */
    var rankYo = null, rankModo = 'fin', rankTodos = false;
    function verRanking(yo, modo, todos){
      rankYo = yo; rankModo = modo; rankTodos = !!todos;
      var r = htmlRanking(yo, rankTodos);
      var txt = yo.temp ? (modo === 'pausa' ? 'At this pace you would be' : 'You would be') : "You're";
      caja.innerHTML = '<div class="jg-h">RANKING</div><p>' + txt + ' <b>#' + r.pos + '</b> in the world · <b>' + yo.s + '</b> pts</p>' + r.html +
        '<p style="font-size:.7rem;color:#5d7268">' + r.total + ' players</p>' +
        '<div class="jg-modal-acciones"><button class="jg-btn" data-a="todos">' + (rankTodos ? 'TOP' : 'ALL') + '</button>' + (modo === 'pausa'
          ? '<button class="jg-btn" data-a="volverpausa">BACK</button>'
          : '<button class="jg-btn" data-a="reiniciar">TRY AGAIN</button><button class="jg-btn" data-a="salir">EXIT</button>') + '</div>';
      modal.hidden = false;
      if (rankTodos) setTimeout(function(){ var m2 = caja.querySelector('.jg-fr.me'); if (m2 && m2.scrollIntoView) m2.scrollIntoView({ block:'center' }); }, 30);
    }

    function cerrar(){
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', tecla, true);
      document.removeEventListener('visibilitychange', oculta);
      window.removeEventListener('resize', medir);
      raiz.remove();
      salir();
    }

    /* ---------- subida de nivel: arbol oculto de mejoras ---------- */
    function disponibles(){ return Object.keys(MEJORAS).filter(function(k){ return m[k] < MEJORAS[k].tope; }); }
    function mezclar(a){
      for (var i = a.length - 1; i > 0; i--){ var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    /* Si ya elegiste algo: 2 de las 3 cartas son vecinas de esa mejora en el arbol, la 3ra es de
       otra rama (para poder cambiar de camino). Sin eleccion previa: 3 al azar. */
    function ofertas(){
      var disp = disponibles(), res = [];
      if (ultimaMejora && REL[ultimaMejora]){
        var cerca = mezclar(REL[ultimaMejora].filter(function(k){ return disp.indexOf(k) >= 0; }));
        res = cerca.slice(0, 2);
        var otras = mezclar(disp.filter(function(k){
          return res.indexOf(k) < 0 && REL[ultimaMejora].indexOf(k) < 0 && k !== ultimaMejora;
        }));
        if (otras.length) res.push(otras[0]);
      }
      var resto = mezclar(disp.filter(function(k){ return res.indexOf(k) < 0; }));
      while (res.length < 3 && resto.length) res.push(resto.shift());
      return mezclar(res);
    }
    function ofrecer(){
      eligiendo = true; sfx.nivel();
      raiz.classList.add('menu');
      var elegidas = ofertas();
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
      m[k]++; ultimaMejora = k; sfx.elegir();
      if (k === 'vida') hp += stats(m).vida - antes;               // +20 maximo tambien llena esos 20
      eligiendo = false;
      reanudar();
      mostrarAviso('<b>' + MEJORAS[k].nombre + '</b> · ' + txt);
      hud();
      anillo(P.x, P.y, 28, 60, 0.45, VERDE);
      if (xp >= requiere(nivel)) subirNivel();            // si una racha de kills dejo xp de sobra
    }
    function subirNivel(){
      xp -= requiere(nivel);
      nivel++;
      hud();
      ofrecer();
    }

    /* ---------- enemigos ---------- */
    /* Especies raras: solo aparecen desde cierto nivel. Cada una con su forma y su forma de atacar. */
    var ESPECIES = [
      { id:'embestida', desde:6,  p:0.09 },     // se detiene, carga y embiste en linea recta
      { id:'divisor',   desde:8,  p:0.07 },     // al morir se parte en 3 mini bloques
      { id:'espinoso',  desde:10, p:0.06 },     // rombo giratorio con picos, zigzaguea
      { id:'fantasma',  desde:11, p:0.07 },     // se vuelve intangible a ratos (las balas lo atraviesan)
      { id:'torreta',   desde:12, p:0.06 },     // mantiene la distancia y dispara
      { id:'masa',      desde:15, p:0.035 }     // enorme, redondo, lleno de picos, muy resistente
    ];
    function especieAleatoria(){
      var r = Math.random(), acc = 0;
      for (var i = 0; i < ESPECIES.length; i++){
        if (nivel < ESPECIES[i].desde) continue;
        acc += ESPECIES[i].p;
        if (r < acc) return ESPECIES[i].id;
      }
      return null;
    }
    function crearEnemigo(x, y, forzar){
      var d = dificultad(nivel), r = Math.random(), tam = 9, vida = d.vida, vel = d.vel, tipo = 0, golpe = d.golpe;
      var sp = forzar || especieAleatoria(), col = null, extra = {};
      switch (sp){
        case 'embestida': tam = 10; vida = d.vida * 1.1; vel = d.vel * 0.55; golpe = d.golpe * 1.1; col = '#ff9a3d';
                          extra = { est:'acecha', et:0.8 + Math.random(), dx:0, dy:0 }; break;
        case 'divisor':   tam = 15; vida = d.vida * 3; vel = d.vel * 0.5; col = '#ff6bd6'; break;
        case 'espinoso':  tam = 9;  vida = d.vida * 1.2; vel = d.vel; col = '#ffd94d'; extra = { at:0, ang:0 }; break;
        case 'fantasma':  tam = 10; vida = d.vida * 1.3; vel = d.vel * 0.8; col = '#c9a0ff'; extra = { fase:false, ft:1.2 + Math.random() }; break;
        case 'torreta':   tam = 12; vida = d.vida * 1.6; vel = d.vel * 0.7; col = '#ff5b5b'; extra = { ft:1 + Math.random() * 1.5 }; break;
        case 'masa':      tam = 26; vida = d.vida * 9; vel = d.vel * 0.35; golpe = d.golpe * 1.8; col = '#ff3b6b'; break;
        case 'orbital':   tam = 5;  vida = d.vida * 0.35; vel = d.vel * 1.1; col = '#ff8ae0'; extra = { rad:38 + Math.random() * 14 }; break;
        case 'muro':      tam = 9;  vida = d.vida * 0.8; vel = 0; col = '#ff7a7a'; break;
        default:
          sp = null;
          if (r < d.pesado){ tam = 17; vida = d.vida * 4; vel *= 0.6; tipo = 1; }
          else if (r < d.pesado + d.rapido){ tam = 6; vida = d.vida * 0.6; vel *= 1.6; tipo = 2; }
      }
      var c = elegirComportamiento(sp === 'orbital' ? 7 : nivel);
      // todo se "congela" aqui: subir de nivel despues NO cambia a los que ya estan vivos
      var e = { x:x, y:y, s:tam, hp:vida, max:vida, v:vel, golpe:golpe, flash:0, tipo:tipo, ph:Math.random() * 6.28, sp:sp,
                kx:0, ky:0, beh:(sp === 'orbital' ? 'cerco' : c.id), col:col || c.color, slot:(slotCerco++) % 8, rad:30 + Math.random() * 20 };
      for (var k in extra) e[k] = extra[k];
      enemigos.push(e);
      return e;
    }
    function crearMini(e, an){
      enemigos.push({ x:e.x, y:e.y, s:6, hp:e.max * 0.28, max:e.max * 0.28, v:e.v * 2.4, golpe:e.golpe * 0.6, flash:0, tipo:3, ph:Math.random() * 6.28,
                      sp:'mini', kx:Math.cos(an) * 70, ky:Math.sin(an) * 70, beh:'directo', col:e.col, slot:0, rad:30 });
    }
    function aparecerBorde(){
      var lado = (Math.random() * 4) | 0, x, y, mg = 10;
      if (lado === 0){ x = Math.random() * W; y = -mg; }
      else if (lado === 1){ x = W + mg; y = Math.random() * H; }
      else if (lado === 2){ x = Math.random() * W; y = H + mg; }
      else { x = -mg; y = Math.random() * H; }
      crearEnemigo(x, y);
    }
    function puntoBorde(t, mg){                         // punto del perimetro (t en 0..2(W+H))
      if (t < W) return [t, -mg];
      if (t < W + H) return [W + mg, t - W];
      if (t < 2 * W + H) return [W - (t - W - H), H + mg];
      return [-mg, H - (t - 2 * W - H)];
    }
    /* Tipos de oleada (los raros solo existen en oleadas): anillo por todos los bordes, enjambre de
       orbitales que giran y se cierran, y muro de bloques que cruza la pantalla con un hueco. */
    function oleada(){
      var tipos = ['anillo'];
      if (nivel >= 7) tipos.push('enjambre');
      if (nivel >= 10) tipos.push('muro');
      var tipo = tipos[(Math.random() * tipos.length) | 0], per = 2 * (W + H);
      if (tipo === 'anillo'){
        var n = Math.min(70, 10 + nivel * 3);
        for (var i = 0; i < n; i++){
          var pt = puntoBorde((i + Math.random() * 0.6) / n * per, 10);
          crearEnemigo(pt[0], pt[1]);
        }
        sfx.oleada(); mostrarAviso('<b>WAVE</b> · ' + n + ' enemies from every side', true, 2400);
      } else if (tipo === 'enjambre'){
        // grupos repartidos por LOS CUATRO lados (arriba, derecha, abajo, izquierda), mas algunos extra al azar
        var grupos = 4 + ((nivel / 8) | 0), lados = [[0, W], [W, H], [W + H, W], [2 * W + H, H]];
        for (var g = 0; g < grupos; g++){
          var seg = lados[g % 4], base = puntoBorde(seg[0] + 2 + Math.random() * Math.max(1, seg[1] - 4), 12);
          for (var j = 0; j < 9; j++) crearEnemigo(base[0] + (Math.random() - 0.5) * 14, base[1] + (Math.random() - 0.5) * 14, 'orbital');
        }
        sfx.oleada(); mostrarAviso('<b>SWARM</b> · they circle and close in', true, 2400);
      } else {
        // dos muros a la vez, desde lados OPUESTOS, cada uno con su propio hueco
        var lado0 = (Math.random() * 4) | 0;
        muroDe(lado0); muroDe((lado0 + 2) % 4);
        sfx.oleada(); mostrarAviso('<b>WALLS</b> · find the gaps', true, 2400);
      }
    }
    /* Un muro de bloques que cruza la pantalla en linea recta, con un hueco de 4 para escapar.
       lado: 0 arriba, 1 derecha, 2 abajo, 3 izquierda. */
    function muroDe(lado){
      var horiz = lado % 2 === 0, largo = horiz ? W : H, v = 38;
      var cuantos = Math.floor(largo / 12), hueco = (Math.random() * (cuantos - 4)) | 0;
      for (var m2 = 0; m2 < cuantos; m2++){
        if (m2 >= hueco && m2 < hueco + 4) continue;
        var pos = (m2 + 0.5) * largo / cuantos, wx, wy, vx = 0, vy = 0;
        if (lado === 0){ wx = pos; wy = -10; vy = v; }
        else if (lado === 2){ wx = pos; wy = H + 10; vy = -v; }
        else if (lado === 1){ wx = W + 10; wy = pos; vx = -v; }
        else { wx = -10; wy = pos; vx = v; }
        crearEnemigo(wx, wy, 'muro').lin = { vx:vx, vy:vy };
      }
    }
    function disparoEnemigo(e, ux, uy){
      ebalas.push({ x:e.x, y:e.y, vx:ux * 55, vy:uy * 55, d:e.golpe * 0.6, t:6 });
      sfx.eshot();
    }
    /* Movimiento propio de cada especie. */
    function moverEnemigo(e, dt, dist){
      var dx = P.x - e.x, dy = P.y - e.y, ux = dx / dist, uy = dy / dist;
      switch (e.sp){
        case 'embestida':
          e.et -= dt;
          if (e.est === 'acecha'){
            e.x += ux * e.v * dt; e.y += uy * e.v * dt;
            if (e.et <= 0){ if (dist < 100){ e.est = 'carga'; e.et = 0.55; sfx.carga(); } else e.et = 0.4; }
          } else if (e.est === 'carga'){
            e.dx = ux; e.dy = uy;                                // sigue apuntando mientras carga
            if (e.et <= 0){ e.est = 'embiste'; e.et = 0.5; }
          } else {
            e.x += e.dx * 240 * dt; e.y += e.dy * 240 * dt;
            if (e.et <= 0){ e.est = 'acecha'; e.et = 1.3 + Math.random(); }
          }
          return;
        case 'fantasma':
          e.ft -= dt; if (e.ft <= 0){ e.fase = !e.fase; e.ft = e.fase ? 1.1 : 1.8; }
          e.x += ux * e.v * dt; e.y += uy * e.v * dt;
          return;
        case 'espinoso':
          e.at -= dt;
          if (e.at <= 0){ e.at = 0.25 + Math.random() * 0.35; e.ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 2.4; }
          e.x += Math.cos(e.ang) * e.v * 1.5 * dt; e.y += Math.sin(e.ang) * e.v * 1.5 * dt;
          return;
        case 'torreta': {
          var dir = dist < 55 ? -1 : (dist > 80 ? 1 : 0);          // mantiene la distancia
          e.x += ux * e.v * dir * dt; e.y += uy * e.v * dir * dt;
          e.ft -= dt;
          if (e.ft <= 0 && dist < 170){ e.ft = 2.2; disparoEnemigo(e, ux, uy); }
          return;
        }
      }
      if (e.sp === 'orbital') e.rad = Math.max(3, e.rad - dt * 8);   // espiral que se cierra
      var ob = objetivo(e, dist), ex = ob[0] - e.x, ey = ob[1] - e.y, ed = Math.hypot(ex, ey) || 1;
      e.ph += dt * 4;
      e.x += (ex / ed) * e.v * dt + Math.cos(e.ph) * 3 * dt;
      e.y += (ey / ed) * e.v * dt + Math.sin(e.ph) * 3 * dt;
    }

    /* Hacia donde va cada enemigo segun su comportamiento (como los fantasmas de Pacman). */
    function objetivo(e, dist){
      switch (e.beh){
        case 'emboscada': {                               // apunta a donde vas a estar
          var f = Math.min(1, dist / 40) * 0.9;
          return [P.x + P.vx * f, P.y + P.vy * f];
        }
        case 'flanco': {                                  // entra por el costado: punto lateral a ti
          var a = Math.atan2(e.y - P.y, e.x - P.x) + (e.slot % 2 ? 1.2 : -1.2);
          var r = Math.min(dist, 42);
          return [P.x + Math.cos(a) * r, P.y + Math.sin(a) * r];
        }
        case 'cerco': {                                   // cada uno toma un lugar alrededor tuyo
          var an = e.slot / 8 * 6.2832 + tiempo * 0.25;
          return [P.x + Math.cos(an) * e.rad, P.y + Math.sin(an) * e.rad];
        }
        case 'timido':                                    // te persigue de lejos; si te acercas, huye
          if (dist < 48) return [e.x + (e.x - P.x), e.y + (e.y - P.y)];
          return [P.x, P.y];
      }
      return [P.x, P.y];                                  // directo
    }

    /* Los enemigos no se amontonan: se empujan y rebotan (rejilla para no revisar todos contra todos). */
    function separar(){
      var cel = 14, rej = {};
      enemigos.forEach(function(e, i){
        var k = ((e.x / cel) | 0) + ',' + ((e.y / cel) | 0);
        (rej[k] = rej[k] || []).push(i);
      });
      enemigos.forEach(function(a, i){
        var cx = (a.x / cel) | 0, cy = (a.y / cel) | 0;
        for (var gx = cx - 1; gx <= cx + 1; gx++) for (var gy = cy - 1; gy <= cy + 1; gy++){
          var lst = rej[gx + ',' + gy]; if (!lst) continue;
          for (var q = 0; q < lst.length; q++){
            var j = lst[q]; if (j <= i) continue;
            if (a.lin || enemigos[j].lin) continue;
            var b = enemigos[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
            var min = (a.s + b.s) / 2 + 0.5;
            if (d >= min) continue;
            var nx = dx / d, ny = dy / d, sol = (min - d) / 2;
            a.x -= nx * sol; a.y -= ny * sol; b.x += nx * sol; b.y += ny * sol;
            a.kx -= nx * 22; a.ky -= ny * 22; b.kx += nx * 22; b.ky += ny * 22;     // rebote
          }
        }
      });
    }

    /* ---------- disparo ---------- */
    function masCercano(){
      var cerca = null, dm = 1e9;
      for (var j = 0; j < enemigos.length; j++){
        var q = enemigos[j], dd = (q.x - P.x) * (q.x - P.x) + (q.y - P.y) * (q.y - P.y);
        if (dd < dm){ dm = dd; cerca = q; }
      }
      return cerca;
    }
    /* Una bala por llamada y por linea: varias lineas = varios chorros paralelos (no abanico). */
    function dispararA(obj, s){
      sfx.disparo();
      var an = Math.atan2(obj.y - P.y, obj.x - P.x) + (Math.random() - 0.5) * 0.03;
      var nx = -Math.sin(an), ny = Math.cos(an);
      for (var li = 0; li < s.lineas; li++){
        var off = (li - (s.lineas - 1) / 2) * 3.4;
        balas.push({ x:P.x + nx * off, y:P.y + ny * off, vx:Math.cos(an) * s.vel, vy:Math.sin(an) * s.vel,
                     d:s.dano, r:s.tam / 2 + 1.2, t:Math.max(1, Math.round(s.tam)), p:s.perf, golpes:[], vida:2.2 });
      }
    }

    function anillo(x, y, n, v, t, c){
      for (var i = 0; i < n; i++){
        var an = i / n * 6.2832;
        parts.push({ x:x, y:y, vx:Math.cos(an) * v, vy:Math.sin(an) * v, t:t, c:c });
      }
    }

    function herir(cant){
      if (inv > 0 || efectos.burbuja > 0) return;
      hp -= cant; inv = 0.8; sfx.dano();
      rojo.classList.add('on'); setTimeout(function(){ rojo.classList.remove('on'); }, 60);
      hud();
      for (var i = 0; i < 14; i++){
        var an = Math.random() * 6.2832, v = 30 + Math.random() * 40;
        parts.push({ x:P.x, y:P.y, vx:Math.cos(an) * v, vy:Math.sin(an) * v, t:0.4, c:ROJO });
      }
      if (hp <= 0){ hp = 0; hud(); gameOver(); }
    }

    function matar(e){
      var idx = enemigos.indexOf(e); if (idx < 0) return;
      enemigos.splice(idx, 1);
      kills++; xp++; sfx.matar();
      for (var i = 0; i < 10; i++){
        var an = Math.random() * 6.2832, v = 20 + Math.random() * 50;
        parts.push({ x:e.x, y:e.y, vx:Math.cos(an) * v, vy:Math.sin(an) * v, t:0.35 + Math.random() * 0.2, c:ROJO });
      }
      if (e.sp === 'divisor'){                           // se parte en 3
        sfx.divide();
        for (var q = 0; q < 3; q++) crearMini(e, q / 3 * 6.2832 + Math.random());
      }
      // los enemigos muertos junto al jugador NO sueltan objetos (solo los que mueren a distancia)
      var lejos = Math.hypot(e.x - P.x, e.y - P.y) > 28;
      if (lejos && Math.random() < stats(m).suerte){
        var tot = OBJETOS.reduce(function(a, o){ return a + o.peso; }, 0), r = Math.random() * tot, tipo = OBJETOS[0].id;
        for (var q3 = 0; q3 < OBJETOS.length; q3++){ r -= OBJETOS[q3].peso; if (r <= 0){ tipo = OBJETOS[q3].id; break; } }
        objetos.push({ x:e.x, y:e.y, t:10, tipo:tipo });
      }
      hud();
      if (!eligiendo && xp >= requiere(nivel)) subirNivel();
    }

    /* ---------- objetos ---------- */
    function recoger(o, s){
      switch (o.tipo){
        case 'cura': {
          var cura = Math.min(s.cura, s.vida - hp);
          if (cura > 0){ hp += cura; hud(); mostrarAviso('<b>+' + Math.round(cura) + ' HP</b>'); }
          anillo(P.x, P.y, 14, 30, 0.35, '#ff8a8a'); sfx.cura();
          break;
        }
        case 'bomba': {                                    // dano grande en una gran area
          var R = 78, dmg = s.dano * 5;                 // exactamente 5 veces tu dano actual
          sfx.bomba(); anillo(o.x, o.y, 60, R / 0.45, 0.45, '#ffa23d');
          anillo(o.x, o.y, 36, R / 0.7, 0.5, '#fff3c4');
          enemigos.slice().forEach(function(e){
            if (Math.hypot(e.x - o.x, e.y - o.y) <= R){ e.hp -= dmg; e.flash = 0.1; if (e.hp <= 0) matar(e); }
          });
          mostrarAviso('<b>BOMB</b>');
          break;
        }
        case 'tiempo':  sfx.tiempo(); ebalas = []; efectos.tiempo = s.dur * 0.8; mostrarAviso('<b>TIME STOP</b> · enemies frozen'); break;
        case 'burbuja': sfx.burbuja(); efectos.burbuja = s.dur; mostrarAviso('<b>SHIELD</b> · no damage'); break;
        case 'rayo':    sfx.rayoOn(); efectos.rayo = s.dur; rayoT = 0; mostrarAviso('<b>STORM</b> · lightning strikes'); break;
        case 'barrido': sfx.barrido(); barrido = { eje:(Math.random() < 0.5 ? 'x' : 'y'), pos:-4, vel:0 };
                        barrido.vel = (barrido.eje === 'x' ? W : H) / 0.9; mostrarAviso('<b>SWEEP</b> · clears the screen'); break;
      }
    }

    /* ---------- actualizar ---------- */
    function actualizar(dt){
      var s = stats(m), d = dificultad(nivel);
      tiempo += dt;
      if (inv > 0) inv -= dt;
      if (s.reg > 0 && hp < s.vida){ hp = Math.min(s.vida, hp + s.reg * dt); }
      ['tiempo', 'burbuja', 'rayo'].forEach(function(k){ if (efectos[k] > 0) efectos[k] -= dt; });

      // el jugador esta SIEMPRE donde esta el cursor (sin suavizado ni limite de velocidad)
      var ox = P.x, oy = P.y;
      P.x = Math.max(4, Math.min(W - 4, tx)); P.y = Math.max(4, Math.min(H - 4, ty));
      var ks = 1 - Math.exp(-dt * 8);
      P.vx += ((P.x - ox) / dt - P.vx) * ks; P.vy += ((P.y - oy) / dt - P.vy) * ks;   // velocidad suavizada

      // aparicion normal: depende solo del nivel (y se detiene con el tiempo congelado)
      spawnT -= dt;
      if (spawnT <= 0 && efectos.tiempo <= 0){
        spawnT = d.intervalo * (0.7 + Math.random() * 0.6);
        if (enemigos.length < d.maxVivos){
          var n = 1 + (nivel > 8 && Math.random() < 0.5 ? 1 : 0) + (nivel > 16 && Math.random() < 0.5 ? 1 : 0);
          for (var i = 0; i < n; i++) aparecerBorde();
        }
      }

      // pulso semitransparente cada tanto: ayuda a no perder de vista a la Z
      pulsoT -= dt;
      if (pulsoT <= 0){ pulsoT = 2.8; pulsos.push({ t:0 }); }
      for (var pi2 = pulsos.length - 1; pi2 >= 0; pi2--){ pulsos[pi2].t += dt; if (pulsos[pi2].t > 1) pulsos.splice(pi2, 1); }

      // oleadas periodicas
      oleadaT -= dt;
      if (oleadaT <= 2.5 && !oleadaAvisada){ oleadaAvisada = true; sfx.alarma(); mostrarAviso('<b>WAVE</b> incoming!', true, 2400); }
      if (oleadaT <= 0){ oleada(); oleadaT = OLEADA_CADA; oleadaAvisada = false; }

      // enemigos: cada uno persigue a su manera; congelados no se mueven ni hacen dano
      var congelado = efectos.tiempo > 0;
      for (var i2 = enemigos.length - 1; i2 >= 0; i2--){
        var e = enemigos[i2];
        var dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
        if (e.flash > 0) e.flash -= dt;
        if (congelado) continue;
        if (e.lin){                                            // muro: avanza recto y sale por el otro lado
          e.x += e.lin.vx * dt; e.y += e.lin.vy * dt;
          if (e.x < -30 || e.y < -30 || e.x > W + 30 || e.y > H + 30){ enemigos.splice(i2, 1); continue; }
        } else {
          moverEnemigo(e, dt, dist);
          e.x += e.kx * dt; e.y += e.ky * dt;
          var amort = Math.exp(-dt * 6); e.kx *= amort; e.ky *= amort;
        }
        if (dist < e.s / 2 + 3) herir(e.golpe);
        if (fin) return;
      }
      // disparos enemigos (torretas)
      for (var eb = ebalas.length - 1; eb >= 0; eb--){
        var q2 = ebalas[eb];
        if (!congelado){ q2.x += q2.vx * dt; q2.y += q2.vy * dt; q2.t -= dt; }
        if (q2.t <= 0 || q2.x < -6 || q2.y < -6 || q2.x > W + 6 || q2.y > H + 6){ ebalas.splice(eb, 1); continue; }
        if (Math.hypot(q2.x - P.x, q2.y - P.y) < 4){ ebalas.splice(eb, 1); herir(q2.d); if (fin) return; }
      }
      // barrido: una linea que cruza toda la pantalla y elimina lo que toca
      if (barrido){
        barrido.pos += barrido.vel * dt;
        enemigos.slice().forEach(function(en2){
          var cc = barrido.eje === 'x' ? en2.x : en2.y;
          if (!en2.bar && cc <= barrido.pos){
            en2.bar = true;
            if (en2.sp === 'masa') en2.hp -= en2.max * 0.6; else en2.hp = 0;
            en2.flash = 0.1;
            if (en2.hp <= 0) matar(en2);
          }
        });
        ebalas = ebalas.filter(function(b2){ return (barrido.eje === 'x' ? b2.x : b2.y) > barrido.pos; });
        if (barrido.pos > (barrido.eje === 'x' ? W : H) + 12) barrido = null;
      }
      if (!congelado) separar();

      // disparo automatico: una rafaga nueva solo cuando termino la anterior; bala por bala
      acum += dt * s.cad;
      if (acum >= 1 && rafaga === 0 && masCercano()){
        acum = Math.min(acum - 1, 1);
        rafaga = s.balas;
        rafagaT = 0;
      } else if (acum >= 1 && rafaga === 0) acum = 1;       // sin objetivo, queda lista
      if (rafaga > 0){
        // la rafaga entera dura como maximo el 60% del periodo: asi subir la cadencia siempre acelera
        // el disparo, aunque lleves muchas balas por rafaga (antes la rafaga limitaba la cadencia)
        var esp = Math.min(0.09, 0.6 / (s.cad * s.balas));
        rafagaT -= dt;
        while (rafaga > 0 && rafagaT <= 0){
          var obj = masCercano();
          if (obj){ dispararA(obj, s); rafaga--; rafagaT += esp; } else rafaga = 0;
        }
      }

      // rayos de la tormenta: caen en enemigos al azar mientras dura
      if (efectos.rayo > 0){
        rayoT -= dt;
        if (rayoT <= 0 && enemigos.length){
          rayoT = 0.28;
          var v = enemigos[(Math.random() * enemigos.length) | 0];
          v.hp -= s.dano * 3 + nivel; v.flash = 0.1;
          rayos.push({ x:v.x, y:v.y, t:0.16 }); sfx.zap();
          if (v.hp <= 0) matar(v);
        }
      }
      for (var ri = rayos.length - 1; ri >= 0; ri--){ rayos[ri].t -= dt; if (rayos[ri].t <= 0) rayos.splice(ri, 1); }

      // balas
      for (var b = balas.length - 1; b >= 0; b--){
        var bl = balas[b];
        bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.vida -= dt;
        var fuera = bl.x < -8 || bl.y < -8 || bl.x > W + 8 || bl.y > H + 8 || bl.vida <= 0;
        if (!fuera){
          for (var q = enemigos.length - 1; q >= 0; q--){
            var en = enemigos[q];
            if (bl.golpes.indexOf(en) >= 0 || (en.sp === 'fantasma' && en.fase)) continue;
            if (Math.abs(bl.x - en.x) < en.s / 2 + bl.r && Math.abs(bl.y - en.y) < en.s / 2 + bl.r){
              en.hp -= bl.d; en.flash = 0.07; bl.golpes.push(en); sfx.golpe();
              parts.push({ x:bl.x, y:bl.y, vx:(Math.random() - 0.5) * 40, vy:(Math.random() - 0.5) * 40, t:0.15, c:'#fff' });
              if (en.hp <= 0) matar(en);
              if (bl.golpes.length > bl.p){ fuera = true; break; }       // se acabo la perforacion
            }
          }
        }
        if (fuera) balas.splice(b, 1);
        if (eligiendo) break;                                            // el juego se detiene al elegir
      }

      // objetos
      for (var c = objetos.length - 1; c >= 0; c--){
        var ob2 = objetos[c]; ob2.t -= dt;
        if (ob2.t <= 0){ objetos.splice(c, 1); continue; }
        if (Math.hypot(ob2.x - P.x, ob2.y - P.y) < 9){ objetos.splice(c, 1); recoger(ob2, s); }
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
      var tx2 = (efectos.tiempo > 0 ? '<div class="jg-chip">FREEZE <b>' + Math.ceil(efectos.tiempo) + 's</b></div>' : '') +
                (efectos.burbuja > 0 ? '<div class="jg-chip">SHIELD <b>' + Math.ceil(efectos.burbuja) + 's</b></div>' : '') +
                (efectos.rayo > 0 ? '<div class="jg-chip">STORM <b>' + Math.ceil(efectos.rayo) + 's</b></div>' : '');
      if (tx2 !== efectosTxt){ efectosTxt = tx2; el('efectos').innerHTML = tx2; }
    }

    /* ---------- dibujo (todo en pixeles enteros) ---------- */
    function px(x, y, w, h, c){ ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
    function sprite(arr, x, y, color){
      var x0 = Math.round(x) - 3, y0 = Math.round(y) - 3;
      for (var j = 0; j < arr.length; j++) for (var i = 0; i < arr[j].length; i++){
        var c = arr[j][i]; if (c === '.') continue;
        px(x0 + i, y0 + j, 1, 1, c === 'o' ? '#fff' : color);
      }
    }

    function lineaPx(x0, y0, x1, y1, c){
      var dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1);
      for (var k = 0; k <= n; k++) px(x0 + dx * k / n, y0 + dy * k / n, 1, 1, c);
    }
    function dibujarEnemigo(e, congelado){
      var s = Math.round(e.s), cx = Math.round(e.x), cy = Math.round(e.y), x0 = Math.round(e.x - s / 2), y0 = Math.round(e.y - s / 2);
      var col = e.flash > 0 ? '#ffd0d0' : (congelado ? '#8fd8ff' : e.col), g = e.tipo === 1 ? 2 : 1;
      if (e.sp === 'masa'){                                  // blob redondo lleno de picos
        var r = s / 2, np = Math.ceil(r * 6.2832);
        for (var i = 0; i < np; i++){ var a = i / np * 6.2832; px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1, col); }
        for (var j = 0; j < 14; j++){
          var a2 = j / 14 * 6.2832 + tiempo * 0.25;
          lineaPx(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r, cx + Math.cos(a2) * (r + 4), cy + Math.sin(a2) * (r + 4), col);
        }
        return;
      }
      if (e.sp === 'espinoso'){                              // rombo giratorio con picos en las puntas
        var rr = s / 2 + 2, rot = tiempo * 3 + e.ph, vs = [];
        for (var v = 0; v < 4; v++){ var av = rot + v * 1.5708; vs.push([cx + Math.cos(av) * rr, cy + Math.sin(av) * rr, av]); }
        for (var v2 = 0; v2 < 4; v2++){
          var p1 = vs[v2], p2 = vs[(v2 + 1) % 4];
          lineaPx(p1[0], p1[1], p2[0], p2[1], col);
          lineaPx(p1[0], p1[1], p1[0] + Math.cos(p1[2]) * 4, p1[1] + Math.sin(p1[2]) * 4, col);
        }
        return;
      }
      if (e.sp === 'fantasma'){                              // silueta de fantasma; en fase se ve tenue
        if (e.fase) ctx.globalAlpha = 0.3;
        px(x0 + 1, y0, s - 2, 1, col); px(x0, y0 + 1, 1, s - 2, col); px(x0 + s - 1, y0 + 1, 1, s - 2, col);
        for (var z = 0; z < s - 1; z += 2){ px(x0 + z, y0 + s - 1, 1, 1, col); px(x0 + z + 1, y0 + s - 2, 1, 1, col); }
        px(x0 + 2, y0 + 3, 1, 2, col); px(x0 + s - 3, y0 + 3, 1, 2, col);
        ctx.globalAlpha = 1;
        return;
      }
      if (e.flash > 0) px(x0 + g, y0 + g, s - 2 * g, s - 2 * g, 'rgba(255,77,77,.45)');
      if (e.sp === 'embestida' && e.est === 'carga' && Math.floor(tiempo * 20) % 2) col = '#ffffff';   // parpadea al cargar
      // contorno vacio
      px(x0, y0, s, g, col); px(x0, y0 + s - g, s, g, col);
      px(x0, y0, g, s, col); px(x0 + s - g, y0, g, s, col);
      if (e.sp === 'divisor'){ px(cx, y0, 1, s, col); px(x0, cy, s, 1, col); }          // cruz: se va a partir
      if (e.sp === 'torreta'){                                                          // canon hacia el jugador
        var ddx = P.x - e.x, ddy = P.y - e.y, dd = Math.hypot(ddx, ddy) || 1;
        lineaPx(cx, cy, cx + ddx / dd * (s / 2 + 4), cy + ddy / dd * (s / 2 + 4), col);
        lineaPx(cx + 1, cy, cx + 1 + ddx / dd * (s / 2 + 4), cy + ddy / dd * (s / 2 + 4), col);
      }
      if (e.sp === 'embestida' && e.est === 'carga') lineaPx(cx, cy, cx + e.dx * 14, cy + e.dy * 14, '#fff');   // avisa hacia donde embiste
      // picos arriba (silueta): cada pico es una "^" de 1px de trazo
      var n = Math.max(2, Math.floor(s / 5)), w = s / n;
      for (var i3 = 0; i3 < n; i3++){
        var bx = Math.round(x0 + i3 * w), bw = Math.round(w), alto = Math.min(4, Math.floor(bw / 2) + 1);
        for (var k = 1; k <= alto; k++){
          px(bx + k - 1, y0 - k, 1, 1, col);
          px(bx + bw - k, y0 - k, 1, 1, col);
        }
      }
    }

    function dibujarPulsos(){
      pulsos.forEach(function(pl){
        var r = 5 + pl.t * 34, a = 0.38 * (1 - pl.t), n = Math.ceil(r * 6.2832 / 1.4);
        ctx.fillStyle = 'rgba(61,220,132,' + a.toFixed(3) + ')';
        for (var i = 0; i < n; i++){
          var an = i / n * 6.2832;
          ctx.fillRect(Math.round(P.x + Math.cos(an) * r), Math.round(P.y + Math.sin(an) * r), 1, 1);
        }
      });
    }
    function dibujarZ(){
      var parpadeo = inv > 0 && efectos.burbuja <= 0 && Math.floor(inv * 14) % 2 === 0;
      var x0 = Math.round(P.x - 3), y0 = Math.round(P.y - 3);
      if (efectos.burbuja > 0 && (efectos.burbuja > 1.5 || Math.floor(efectos.burbuja * 8) % 2)){
        for (var i = 0; i < 28; i++){                                   // burbuja protectora
          var an = i / 28 * 6.2832 + tiempo * 1.5;
          px(P.x + Math.cos(an) * 8, P.y + Math.sin(an) * 8, 1, 1, '#8fa8ff');
        }
      }
      if (parpadeo) return;
      for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++)
        if (Z_PIX[y][x] === 'X') px(x0 + x, y0 + y, 1, 1, VERDE);
      ctx.fillStyle = 'rgba(61,220,132,.12)'; ctx.fillRect(x0 - 2, y0 - 2, 11, 11);    // resplandor tenue
    }

    function dibujar(){
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(61,220,132,.06)';                           // puntos tenues: sensacion de suelo
      for (var gy = 6; gy < H; gy += 14) for (var gx = 6; gx < W; gx += 14) ctx.fillRect(gx, gy, 1, 1);

      objetos.forEach(function(o){
        if (o.t < 2.5 && Math.floor(o.t * 6) % 2) return;                // parpadea al acabarse
        var info = OBJETOS.filter(function(q){ return q.id === o.tipo; })[0];
        sprite(SPR[o.tipo], o.x, o.y + Math.round(Math.sin(tiempo * 4 + o.x)), info.color);
      });
      var cong = efectos.tiempo > 0;
      enemigos.forEach(function(e){ dibujarEnemigo(e, cong); });
      ebalas.forEach(function(b){                                        // disparos de las torretas
        px(b.x - 1 - b.vx * 0.03, b.y - 1 - b.vy * 0.03, 2, 2, 'rgba(255,77,77,.4)');
        px(b.x - 1, b.y - 1, 2, 2, '#ff9a9a');
      });
      if (barrido){                                                      // linea blanca con estela
        for (var bk = 0; bk < 12; bk++){
          var al = (0.85 * (1 - bk / 12)).toFixed(2);
          if (barrido.eje === 'x') px(barrido.pos - bk, 0, 1, H, 'rgba(255,255,255,' + al + ')');
          else px(0, barrido.pos - bk, W, 1, 'rgba(255,255,255,' + al + ')');
        }
      }
      balas.forEach(function(b){
        px(b.x - b.t / 2 - b.vx * 0.014, b.y - b.t / 2 - b.vy * 0.014, b.t, b.t, 'rgba(61,220,132,.45)');   // estela corta
        px(b.x - b.t / 2, b.y - b.t / 2, b.t, b.t, '#c9ffe0');
      });
      rayos.forEach(function(r){                                         // rayo: zigzag del borde de arriba al enemigo
        var x = r.x, y = 0, pasos = Math.max(4, Math.floor(r.y / 7));
        for (var i = 0; i < pasos; i++){
          var nx = r.x + (Math.random() - 0.5) * 10 * (1 - i / pasos), ny = r.y * (i + 1) / pasos;
          var dx = nx - x, dy = ny - y, n = Math.max(Math.abs(dx), Math.abs(dy), 1);
          for (var k = 0; k <= n; k++) px(x + dx * k / n, y + dy * k / n, 1, 1, i % 2 ? '#ffe14d' : '#fff');
          x = nx; y = ny;
        }
      });
      parts.forEach(function(p){ px(p.x, p.y, 1, 1, p.c); });
      if (!fin){ dibujarPulsos(); dibujarZ(); }
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
