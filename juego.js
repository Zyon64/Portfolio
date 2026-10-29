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
    duracion: { nombre:'ITEM POWER',   desc:'Item effects last longer',     tope:15 },
    /* aura de pulso: daña a todo lo cercano cada cierto tiempo */
    pulso:       { nombre:'PULSE',       desc:'A damaging pulse around you',      tope:12 },
    pulsoArea:   { nombre:'PULSE RANGE', desc:'Bigger pulse area',                tope:10, req:'pulso' },
    pulsoRapido: { nombre:'PULSE SPEED', desc:'Pulses more often',                tope:10, req:'pulso' },
    /* veneno: lo golpeado pierde vida cada tanto */
    veneno:      { nombre:'POISON',      desc:'Hits poison enemies over time',    tope:12 },
    venenoDur:   { nombre:'POISON TIME', desc:'Poison lasts longer',              tope:10, req:'veneno' },
    /* fuego: quita mas que el veneno y se CONTAGIA a los enemigos que se tocan */
    fuego:       { nombre:'FIRE',        desc:'Hits burn enemies; spreads on touch', tope:12 },
    fuegoDur:    { nombre:'FIRE TIME',   desc:'Burning lasts longer',             tope:10, req:'fuego' }
  };
  /* ARBOL OCULTO: que mejoras salen "cerca" de la ultima elegida. */
  var REL = {
    dano:     ['cad', 'perf', 'tam', 'veneno', 'fuego'],
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
    duracion: ['suerte', 'cura', 'vida'],
    pulso:       ['pulsoArea', 'pulsoRapido', 'dano'],
    pulsoArea:   ['pulsoRapido', 'pulso', 'vida'],
    pulsoRapido: ['pulsoArea', 'pulso', 'cad'],
    veneno:      ['venenoDur', 'fuego', 'dano'],
    venenoDur:   ['veneno', 'fuego', 'suerte'],
    fuego:       ['fuegoDur', 'veneno', 'dano'],
    fuegoDur:    ['fuego', 'veneno', 'duracion']
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
      dur:    5 * (1 + 0.2 * m.duracion),             // segundos de los efectos (tiempo, burbuja, rayo)
      // aura de pulso
      pulsoOn:  m.pulso > 0,
      pulsoDano:1.2 + 0.3 * m.pulso * (1 + 0.5 * m.dano),             // crece con la mejora Y con tu daño
      pulsoR:   22 + 6 * m.pulsoArea,                                 // radio (unidades)
      pulsoInt: Math.max(0.25, 1.0 * Math.pow(0.88, m.pulsoRapido)),  // segundos entre pulsos
      // veneno y fuego (por segundo; fuego quita mas)
      venenoOn: m.veneno > 0, venenoDps: (0.35 + 0.22 * m.veneno) * (1 + 0.5 * m.dano), venenoDur: 3 + 1.2 * m.venenoDur,
      fuegoOn:  m.fuego > 0,  fuegoDps:  (0.7 + 0.4 * m.fuego) * (1 + 0.5 * m.dano),   fuegoDur:  2.2 + 0.8 * m.fuegoDur
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
      case 'pulso':       return a.pulsoOn ? f(a.pulsoDano, 1) + ' → ' + f(b.pulsoDano, 1) + ' dmg' : 'unlock · ' + f(b.pulsoDano, 1) + ' dmg / ' + f(b.pulsoInt, 2) + 's';
      case 'pulsoArea':   return Math.round(a.pulsoR) + ' → ' + Math.round(b.pulsoR) + ' range';
      case 'pulsoRapido': return f(a.pulsoInt, 2) + ' → ' + f(b.pulsoInt, 2) + ' s';
      case 'veneno':      return a.venenoOn ? f(a.venenoDps, 1) + ' → ' + f(b.venenoDps, 1) + ' /s' : 'unlock · ' + f(b.venenoDps, 1) + ' /s';
      case 'venenoDur':   return f(a.venenoDur, 1) + ' → ' + f(b.venenoDur, 1) + ' s';
      case 'fuego':       return a.fuegoOn ? f(a.fuegoDps, 1) + ' → ' + f(b.fuegoDps, 1) + ' /s' : 'unlock · ' + f(b.fuegoDps, 1) + ' /s';
      case 'fuegoDur':    return f(a.fuegoDur, 1) + ' → ' + f(b.fuegoDur, 1) + ' s';
    }
    return '';
  }

  /* Dificultad: depende SOLO del nivel, y se "congela" en cada enemigo al aparecer. El ataque sube
     un poco mas que la vida. */
  function dificultad(L){
    return {
      intervalo: Math.max(0.22, 1.2 / (1 + L * 0.12)),          // segundos entre apariciones
      // El campo comienza legible: 30 enemigos, y solo gana un hueco cada 5 niveles.
      // Todas las apariciones (incluidas oleadas) consultan este mismo limite.
      maxVivos:  30 + Math.floor((L - 1) / 5),
      // Vida cuadratica: al inicio te sientes superior, pero en niveles altos tus mejoras tienen que
      // seguirle el paso (L10: 15, L30: 111, L50: 303, L70: 591). Antes crecia solo +1 por nivel.
      vida:      3 + 0.12 * L * L,
      vel:       22 + Math.min(44, L * 1.5),                    // unidades/s
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
    { id:'curaLenta', peso:12, color:'#ff91c9' },
    { id:'bomba',   peso:18, color:'#ffa23d' },
    { id:'tiempo',  peso:16, color:'#7fd6ff' },
    { id:'burbuja', peso:16, color:'#8fa8ff' },
    { id:'rayo',    peso:16, color:'#ffe14d' },
    { id:'nucleo',  peso:2,  color:'#c783ff' },          // raro: media barra de experiencia
    { id:'barrido', peso:1,  color:'#ffffff' }          // rarisimo: barre toda la pantalla (y con enfriamiento largo)
  ];
  var SPR = {
    cura:    ['..XXX..', '..XXX..', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '..XXX..', '..XXX..'],
    curaLenta:['..X.X..', '.X...X.', 'X.XXX.X', 'X.XoX.X', 'X.XXX.X', '.X...X.', '..X.X..'],
    bomba:   ['....o..', '...o...', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.'],
    tiempo:  ['.XXXXX.', 'X..o..X', 'X..o..X', 'X..ooXX', 'X.....X', 'X.....X', '.XXXXX.'],
    burbuja: ['..XXX..', '.X...X.', 'X.o...X', 'X.....X', 'X.....X', '.X...X.', '..XXX..'],
    rayo:    ['...XXX.', '..XXX..', '.XXX...', 'XXXXXX.', '..XXX..', '.XX....', 'X......'],
    nucleo:  ['...X...', '..XXX..', '.XXoXX.', 'XXXXXXX', '.XX.XX.', '..X.X..', '...X...'],
    barrido: ['.......', '.X..X..', '..X..X.', '...X..X', '..X..X.', '.X..X..', '.......']
  };
  /* Tipos de disparo: se consiguen al derrotar a un jefe. TODOS usan tus mejoras: daño, cadencia, tamaño de
     bala, balas por rafaga, lineas, perforacion, velocidad, veneno y fuego. "fc" = factor de cadencia. */
  var ARMAS = {
    normal:    { nombre:'STANDARD',  fc:1,    desc:'Bursts of bullets in lines',           uso:'your normal bursts' },
    dirigidas: { nombre:'HOMING',    fc:1,    desc:'Each bullet steers to its own enemy',  uso:'shots = homing bullets' },
    s:         { nombre:'SPREAD S',  fc:0.9,  desc:'A fan of bullets, like Contra',        uso:'3 + 2 per shot × line' },
    escopeta:  { nombre:'SHOTGUN',   fc:0.55, desc:'Short-range cone of pellets',          uso:'6 + 3 pellets per shot × line' },
    laser:     { nombre:'LASER',     fc:0.85, desc:'Instant beam through enemies',         uso:'shots = beams, pierce = targets' },
    sniper:    { nombre:'SNIPER',    fc:0.28, desc:'One slow, huge, piercing shot',        uso:'all your bullets in ONE shot' },
    bumeran:   { nombre:'BOOMERANG', fc:0.5,  desc:'Flies out and comes back',             uso:'hits twice: going and returning' },
    granadas:  { nombre:'GRENADES',  fc:0.55, desc:'Explode on impact for 3× damage',      uso:'area = 3× damage, bigger with size' }
  };
  /* Cada 10 niveles llega un JEFE al azar. Todos son distintos entre si y distintos a los enemigos comunes:
     varios ataques, fases al 66% y 33% de vida, y pocos minions (para poder esquivar). */
  var JEFES = {
    triturador: { nombre:'CRUSHER',  col:'#ff6a3d', s:34 },     // cuerpo a cuerpo: saltos con onda, embestidas, temblores
    centinela:  { nombre:'SENTINEL', col:'#ff4dd2', s:28 },     // a distancia: rayos giratorios, espiral de balas, teletransporte
    colmena:    { nombre:'HIVE',     col:'#c8ff6a', s:32 },     // invocador: crias, lluvia de esporas, anillos de gas
    rey:        { nombre:'KING',     col:'#ffd94d', s:30 },     // muros de balas con hueco, coronas de balas, embestidas
    vacio:      { nombre:'VOID',     col:'#b48cff', s:30 }      // cuchillas orbitales, meteoros avisados, ondas con hueco
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
  '.jg-efectos{display:flex;flex-direction:column;gap:5px}' +
  '.jg-ef{display:grid;grid-template-columns:10px auto 1fr;align-items:center;gap:4px 8px;padding:6px 12px;border-radius:16px;' +
  '  background:rgba(255,255,255,.05);box-shadow:0 0 0 1px rgba(255,255,255,.1);font-size:.7rem;letter-spacing:.05em;min-width:150px}' +
  '.jg-ef i{width:8px;height:8px;border-radius:50%}.jg-ef b{color:#fff;text-align:right}' +
  '.jg-ef em{grid-column:1 / -1;display:block;height:4px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}' +
  '.jg-ef em u{display:block;height:100%;transition:width .3s}' +
  '.jg-panel{display:flex;flex-direction:column;gap:5px;min-width:190px;padding:12px 16px;border-radius:20px;' +
  '  background:rgba(255,255,255,.05);box-shadow:0 0 0 1px rgba(255,255,255,.12),0 10px 26px -14px rgba(0,0,0,.8)}' +
  '.jg-st{display:flex;justify-content:space-between;gap:20px;font-size:.72rem;letter-spacing:.06em;color:#8da398}' +
  '.jg-st b{color:' + VERDE + ';font-weight:700}' +
  '.jg-st[hidden]{display:none}.jg-ex span{color:#c7a66a}' +
  '.jg-sep{height:1px;background:rgba(255,255,255,.12);margin:1px 0}' +
  '.jg-barra{display:block;width:86px;height:7px;border-radius:7px;background:rgba(255,255,255,.14);overflow:hidden}' +
  '.jg-barra u{display:block;height:100%;width:0;transition:width .25s}' +
  '.jg-hp b{color:' + ROJO + '}.jg-hp .jg-barra{width:110px}.jg-hp .jg-barra u{background:' + ROJO + '}' +
  '.jg-xp .jg-barra u{background:' + VERDE + '}' +
  '.jg-btn{pointer-events:auto;width:38px;height:38px;border:0;color:#eaf3ee;cursor:pointer;display:inline-grid;place-items:center;' +
  '  font:inherit;font-size:.85rem;transition:background .2s,scale .3s cubic-bezier(.3,1.5,.5,1)}' +
  '.jg-btn:hover{background:rgba(255,255,255,.1);scale:1.08}' +
  '.jg-pie{position:absolute;left:12px;right:12px;bottom:12px;display:flex;justify-content:center;gap:8px;flex-wrap:wrap}' +
  '.jg-amenaza .jg-barra{width:70px}.jg-amenaza .jg-barra u{background:' + ROJO + '}' +
  '.jg-conteo{position:absolute;left:50%;top:92px;transform:translateX(-50%);min-width:64px;padding:6px 18px;border-radius:999px;' +
  '  background:rgba(127,214,255,.1);box-shadow:0 0 0 1px rgba(127,214,255,.5),0 10px 26px -14px rgba(0,0,0,.8);color:#7fd6ff;' +
  '  font-size:1.5rem;font-weight:700;text-align:center;letter-spacing:.1em}' +
  '.jg-conteo[hidden],.jg-jefe[hidden]{display:none}' +
  '.jg-jefe{position:absolute;left:50%;top:12px;transform:translateX(-50%);display:flex;align-items:center;gap:10px;' +
  '  padding:7px 16px;border-radius:999px;background:rgba(255,77,77,.08);box-shadow:0 0 0 1px rgba(255,77,77,.5);' +
  '  font-size:.76rem;letter-spacing:.12em;color:#ffb3b3;white-space:nowrap}' +
  '.jg-jefe .jg-barra{width:min(40vw,260px);height:9px}.jg-jefe .jg-barra u{background:#ff4d4d}' +
  '.jg-rango{width:min(70vw,260px);margin:10px 0 4px;accent-color:' + VERDE + ';cursor:pointer}' +
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
  '  .jg-jefe{top:auto;bottom:92px;max-width:92vw}.jg-jefe .jg-barra{width:min(46vw,200px)}' +
  '  .jg-conteo{top:auto;bottom:138px}' +
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
  /* Cadena de salida: todo pasa por un volumen maestro (el slider de opciones) y un compresor/limitador,
     asi muchas explosiones o truenos a la vez no suman volumen. Ademas hay un PRESUPUESTO DE VOCES: si
     ya suenan demasiadas, las nuevas se atenuan o se descartan. */
  var MASTER = null, MASTER2 = null, VOL = 0.6, DUCK = 1;
  try { var vg = localStorage.getItem('juegoZ_vol'); if (vg !== null) VOL = Math.max(0, Math.min(1, +vg)); } catch(e){}
  function salida(a, sinDuck){
    if (!MASTER){
      var comp = a.createDynamicsCompressor();
      comp.threshold.value = -26; comp.knee.value = 20; comp.ratio.value = 16; comp.attack.value = 0.003; comp.release.value = 0.2;
      MASTER = a.createGain(); MASTER2 = a.createGain();
      MASTER.connect(comp); MASTER2.connect(comp); comp.connect(a.destination);
    }
    var base = VOL * 0.7;
    MASTER.gain.setTargetAtTime(base * DUCK, a.currentTime, 0.08);
    MASTER2.gain.setTargetAtTime(base, a.currentTime, 0.02);     // MASTER2: no se baja con el "duck" (tic-tac)
    return sinDuck ? MASTER2 : MASTER;
  }
  function ajustarVolumen(){ var a = ac(); if (a) salida(a); }
  function duck(v){ if (DUCK !== v){ DUCK = v; ajustarVolumen(); } }     // baja el sonido general (tiempo detenido)
  var voces = [];
  function cupo(max){ var n = performance.now(); voces = voces.filter(function(t){ return t > n; }); return voces.length < max; }
  function ocupar(ms){ voces.push(performance.now() + ms); }
  function lim(k, ms){ var n = performance.now(); if (n - (ultimoSfx[k] || 0) < ms) return false; ultimoSfx[k] = n; return true; }
  function vr(){ return 0.88 + Math.random() * 0.26; }       // ligera variacion en cada sonido
  function nota(n){ return 440 * Math.pow(2, n / 12); }      // semitonos desde La4

  /* Canal de ruido. idx0 -> idx1: indice del periodo (0 agudo .. 15 grave), se interpola por pasos.
     modo 1 = ruido corto "metalico". trem: parpadeo de volumen cada N cuadros (para truenos). */
  function ruidoNES(idx0, idx1, modo, dur, vol, delay, trem){
    if (!SFX_ON) return;
    var a = ac(); if (!a) return;
    if (!cupo(7)) return;                                          // demasiados sonidos de ruido a la vez
    var atenuar = 1 / Math.sqrt(1 + voces.length * 0.55); ocupar(dur * 1000);
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
    s.buffer = buf; g.gain.value = vol * atenuar; s.connect(g); g.connect(salida(a));
    s.start(a.currentTime + (delay || 0));
  }
  /* Canal de pulso (duty .125/.25/.5) o triangulo ('tri'). Frecuencia y volumen por pasos de 1/60 s. */
  function pulsoNES(f0, f1, dur, duty, vol, delay, plano, sinDuck){
    if (!SFX_ON) return;
    var a = ac(); if (!a) return;
    if (!sinDuck){ if (!cupo(12)) return; ocupar(dur * 1000); }
    var t0 = a.currentTime + (delay || 0), o = a.createOscillator(), g = a.createGain(), frames = Math.max(1, Math.round(dur * 60));
    if (duty === 'tri') o.type = 'triangle'; else o.setPeriodicWave(onda(a, duty));
    for (var f = 0; f < frames; f++){
      var tt = t0 + f / 60;
      o.frequency.setValueAtTime(f0 + (f1 - f0) * (f / Math.max(1, frames - 1)), tt);
      g.gain.setValueAtTime(vol * (plano ? (f < frames - 2 ? 1 : 0.4) : Math.round(15 * (1 - f / frames)) / 15), tt);
    }
    g.gain.setValueAtTime(0, t0 + frames / 60);
    o.connect(g); g.connect(salida(a, sinDuck)); o.start(t0); o.stop(t0 + frames / 60 + 0.03);
  }
  var sfx = {
    disparo: function(){ if (lim('d', 55)) pulsoNES(1250, 620, 0.06, 0.25, 0.02); },
    golpe:   function(){ if (lim('g', 45)) ruidoNES(3, 4, 0, 0.04, 0.03); },
    /* muerte de enemigo: la rafaga de ruido de la explosion de un tanque en Battle City: corta, rapida,
       con el tono cayendo; ligera variacion de periodo y duracion cada vez */
    matar:   function(){
      if (!lim('m', 55)) return;
      var v = vr(), i0 = 5 + ((Math.random() * 2) | 0), i1 = 9 + ((Math.random() * 2) | 0);
      ruidoNES(i0, i1, 0, 0.26 * v, 0.07);
    },
    dano:    function(){ ruidoNES(7, 11, 0, 0.3, 0.07); pulsoNES(240, 90, 0.2, 0.5, 0.04); },
    nivel:   function(){ [3, 7, 10, 15].forEach(function(n, i){ pulsoNES(nota(n), nota(n), 0.085, 0.5, 0.05, i * 0.085, true); }); },
    elegir:  function(){ pulsoNES(nota(3), nota(3), 0.05, 0.25, 0.05, 0, true); pulsoNES(nota(10), nota(10), 0.09, 0.25, 0.05, 0.05, true); },
    cura:    function(){ pulsoNES(nota(3), nota(3), 0.06, 0.5, 0.05, 0, true); pulsoNES(nota(10), nota(10), 0.1, 0.5, 0.05, 0.06, true); },
    /* explosion: el mismo ruido pero mas grave y largo, con un golpe de triangulo bajo */
    bomba:   function(){ if (!lim('b', 260)) return; var v = vr(); ruidoNES(9, 14, 0, 0.9 * v, 0.09); ruidoNES(6, 10, 0, 0.3, 0.055, 0.02); pulsoNES(90, 32, 0.6, 'tri', 0.08); },
    barrido: function(){ ruidoNES(13, 3, 0, 0.9, 0.055); pulsoNES(150, 1300, 0.9, 0.125, 0.03, 0, true); },
    eshot:   function(){ if (lim('e', 120)) pulsoNES(420 * vr(), 160, 0.09, 0.125, 0.035); },
    carga:   function(){ pulsoNES(180, 520, 0.35, 0.25, 0.03, 0, true); },
    divide:  function(){ var v = vr(); pulsoNES(520 * v, 980 * v, 0.09, 0.5, 0.04); },
    tiempo:  function(){ pulsoNES(1100, 160, 0.5, 0.125, 0.05); },
    burbuja: function(){ pulsoNES(300, 1100, 0.25, 0.5, 0.05, 0, true); },
    /* trueno: un chasquido de ruido agudo y luego un retumbo larguisimo de ruido en el periodo mas
       grave, con el volumen parpadeando */
    rayoOn:  function(){ if (!lim('ro', 400)) return; ruidoNES(12, 15, 0, 0.7, 0.07, 0, 4); pulsoNES(70, 28, 0.6, 'tri', 0.06); },
    zap:     function(){
      if (!lim('z', 240)) return;                       // un trueno cada cuarto de segundo como maximo
      var v = vr();
      ruidoNES(2, 5, 0, 0.07, 0.07);
      ruidoNES(12, 15, 0, 0.95 * v, 0.075, 0.06, 5);
      pulsoNES(80 * v, 26, 0.6, 'tri', 0.05, 0.06);
    },
    alarma:  function(){ [0, 1, 2].forEach(function(i){ pulsoNES(i % 2 ? nota(-5) : nota(7), i % 2 ? nota(-5) : nota(7), 0.14, 0.5, 0.055, i * 0.16, true); }); },
    oleada:  function(){ pulsoNES(110, 55, 0.5, 'tri', 0.09); ruidoNES(14, 15, 0, 0.5, 0.05); },
    pulso:   function(){ if (lim('pu', 250)) pulsoNES(900, 500, 0.08, 0.125, 0.015); },
    tic:     function(){ pulsoNES(1500, 1500, 0.03, 0.125, 0.08, 0, true, true); },
    tac:     function(){ pulsoNES(1000, 1000, 0.03, 0.125, 0.08, 0, true, true); },
    beep:    function(){ pulsoNES(nota(15), nota(15), 0.12, 0.5, 0.09, 0, true, true); },
    granada: function(){ if (lim('gr', 110)) ruidoNES(8, 11, 0, 0.28, 0.05); },
    jefe:    function(){ ruidoNES(10, 15, 0, 1.1, 0.08, 0, 3); pulsoNES(70, 24, 0.9, 'tri', 0.07); },
    zona:    function(){ if (lim('zo', 90)) ruidoNES(8, 12, 0, 0.18, 0.045); },
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
      '<canvas class="jg-cv"></canvas><div class="jg-rojo"></div><input class="jg-sheet-input" type="file" accept="image/png,image/webp,image/jpeg" hidden>' +
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
            '<div class="jg-stats"><div class="jg-panel">' +
              '<div class="jg-st"><span>WEAPON</span><b data-n="arma">STANDARD</b></div>' +
              '<div class="jg-sep"></div>' +
              '<div class="jg-st"><span>FIRE RATE</span><b data-n="cad">1.8</b></div>' +
              '<div class="jg-st"><span>DAMAGE</span><b data-n="dano">1.0</b></div>' +
              '<div class="jg-st"><span>SHOTS</span><b data-n="balas">1</b></div>' +
              '<div class="jg-st"><span>LINES</span><b data-n="lineas">1</b></div>' +
              '<div class="jg-st"><span>PIERCE</span><b data-n="perf">0</b></div>' +
              '<div class="jg-st"><span>SIZE</span><b data-n="tam">1.0</b></div>' +
              '<div class="jg-st jg-ex" data-n="f_pulso" hidden><span>PULSE</span><b data-n="pulso">-</b></div>' +
              '<div class="jg-st jg-ex" data-n="f_veneno" hidden><span>POISON</span><b data-n="veneno">-</b></div>' +
              '<div class="jg-st jg-ex" data-n="f_fuego" hidden><span>FIRE</span><b data-n="fuego">-</b></div>' +
            '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="jg-aviso"></div>' +
        '<div class="jg-conteo" data-n="conteo" hidden></div>' +
        '<div class="jg-jefe" data-n="jefe" hidden><span data-n="jefenombre">BOSS</span><i class="jg-barra"><u data-n="jefebarra"></u></i></div>' +
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
    var efMax = { tiempo:0, burbuja:0, rayo:0, curaLenta:0 };
    var ebalas, barrido, tickT = 0, tictac = false, ultimoConteo = -1, auras, auraT, contagioT, ultimoBarrido, limpiarMin, arma, lasers, armaOpc, armaT, armaPend, jefe, jefePend, zonas, anillosJ, rayosJ, cuchillas, ultimoJefe;
    var P, enemigos, balas, parts, objetos, rayos, numeros, estrellas, nivel, xp, kills, tiempo, hp, inv, acum, spawnT, pausado, eligiendo,
        fin, raf, ultimo, m, pendientes, ultimaMejora, oleadaT, oleadaAvisada, pulsoT, pulsos, efectos, rayoT, efectosTxt, slotCerco;
    var tactil = window.matchMedia('(pointer: coarse)').matches;
    var tx = 0, ty = 0;                                  // hacia donde apunta el cursor (unidades)

    function reiniciar(){
      duck(1);
      m = { cad:0, dano:0, tam:0, balas:0, lineas:0, perf:0, vel:0, vida:0, reg:0, cura:0, suerte:0, duracion:0, pulso:0, pulsoArea:0, pulsoRapido:0, veneno:0, venenoDur:0, fuego:0, fuegoDur:0 };
      nivel = 1; xp = 0; kills = 0; tiempo = 0; acum = 0; rafaga = 0; rafagaT = 0; spawnT = 0.6; inv = 0; pulsoT = 1.2; pulsos = [];
      pausado = false; eligiendo = false; fin = false; pendientes = 0; ultimaMejora = null;
      oleadaT = OLEADA_PRIMERA; oleadaAvisada = false; rayoT = 0; efectosTxt = ''; slotCerco = 0;
      efectos = { tiempo:0, burbuja:0, rayo:0, curaLenta:0 };
      P = { x: W / 2, y: H / 2, vx:0, vy:0 };
      tx = P.x; ty = P.y;
      enemigos = []; balas = []; parts = []; objetos = []; rayos = []; numeros = []; ebalas = []; barrido = null;
      estrellas = Array.from({ length:Math.max(40, Math.floor(W * H / 700)) }, function(){ return { x:Math.random() * W, y:Math.random() * H, a:0.12 + Math.random() * 0.18, c:Math.random() < 0.14 ? '#6076a8' : '#b8d2dc' }; });
      auras = []; auraT = 1; contagioT = 0; ultimoBarrido = -999;
      arma = 'normal'; lasers = []; armaOpc = null; armaT = null; armaPend = false; jefe = null; jefePend = false;
      zonas = []; anillosJ = []; rayosJ = []; cuchillas = []; ultimoJefe = null; el('jefe').hidden = true;
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
      el('arma').textContent = ARMAS[arma].nombre;
      el('f_pulso').hidden = !s.pulsoOn; el('f_veneno').hidden = !s.venenoOn; el('f_fuego').hidden = !s.fuegoOn;
      if (s.pulsoOn) el('pulso').textContent = s.pulsoDano.toFixed(1) + ' / ' + s.pulsoInt.toFixed(2) + 's';
      if (s.venenoOn) el('veneno').textContent = s.venenoDps.toFixed(1) + '/s';
      if (s.fuegoOn) el('fuego').textContent = s.fuegoDps.toFixed(1) + '/s';
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
      if (e.target.classList && e.target.classList.contains('jg-rango')){
        VOL = e.target.value / 100; ajustarVolumen();
        try { localStorage.setItem('juegoZ_vol', String(VOL)); } catch(x){}
        var vn = caja.querySelector('[data-n="volnum"]'); if (vn) vn.textContent = Math.round(VOL * 100) + '%';
        return;
      }
      if (e.target.classList && e.target.classList.contains('jg-nombre'))
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_\-]/g, '').slice(0, 5);
    });
    raiz.addEventListener('change', function(e){
      if (e.target.classList && e.target.classList.contains('jg-rango')) sfx.click();
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
      else if (a === 'opciones') verOpciones();
      else if (a === 'sprites') abrirSelectorSheet();
      else if (a === 'catalogo') window.open('spritesheet.html', '_blank', 'noopener');
      else if (a === 'volverpausa'){ pausado = false; alternarPausa(); }
      else if (a === 'pausa') alternarPausa();
      else if (a === 'seguir') alternarPausa();
      else if (a === 'reiniciar'){ reiniciar(); ofrecerArmasIniciales(); }
      else if (a === 'salir') cerrar();
      else if (a === 'mejora') elegir(b.getAttribute('data-k'));
      else if (a === 'arma') elegirArma(b.getAttribute('data-k'));
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
        f('Drop rate', Math.round(s.suerte * 100) + '%') + f('Item time', s.dur.toFixed(1) + 's') +
        f('Weapon', ARMAS[arma].nombre) +
        (s.pulsoOn ? f('Pulse', s.pulsoDano.toFixed(1) + ' / ' + s.pulsoInt.toFixed(2) + 's · r' + Math.round(s.pulsoR)) : '') +
        (s.venenoOn ? f('Poison', s.venenoDps.toFixed(1) + '/s · ' + s.venenoDur.toFixed(1) + 's') : '') +
        (s.fuegoOn ? f('Fire', s.fuegoDps.toFixed(1) + '/s · ' + s.fuegoDur.toFixed(1) + 's') : '') + '</div>';
    }
    function alternarPausa(){
      if (fin || eligiendo) return;
      pausado = !pausado;
      if (pausado){
        raiz.classList.add('menu');
        caja.innerHTML = '<div class="jg-h">PAUSED</div><p>LV <b>' + nivel + '</b> · KILLS <b>' + kills + '</b> · <b>' + fmt(tiempo) + '</b></p>' +
          listaStats() +
          '<div class="jg-modal-acciones"><button class="jg-btn" data-a="seguir">RESUME</button>' +
          '<button class="jg-btn" data-a="opciones">OPTIONS</button><button class="jg-btn" data-a="ranking">RANKING</button>' +
          '<button class="jg-btn" data-a="reiniciar">RESTART</button><button class="jg-btn" data-a="salir">EXIT</button></div>';
        modal.hidden = false;
      } else reanudar();
    }

    function verOpciones(){
      caja.innerHTML = '<div class="jg-h">OPTIONS</div><p>Sound volume</p>' +
        '<input class="jg-rango" type="range" min="0" max="100" value="' + Math.round(VOL * 100) + '">' +
        '<p><b data-n="volnum">' + Math.round(VOL * 100) + '%</b></p>' +
        '<p style="font-size:.7rem;color:#8da398">Custom sheet: 16×16-pixel tiles, rendered without smoothing.</p>' +
        '<div class="jg-modal-acciones"><button class="jg-btn" data-a="sprites">LOAD SHEET</button><button class="jg-btn" data-a="catalogo">CATALOG</button><button class="jg-btn" data-a="volverpausa">BACK</button></div>';
      modal.hidden = false;
    }
    var sheetPersonalizado = null;
    function abrirSelectorSheet(){ raiz.querySelector('.jg-sheet-input').click(); }
    raiz.querySelector('.jg-sheet-input').addEventListener('change', function(e){
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var im = new Image();
      im.onload = function(){
        if (im.width % 16 || im.height % 16){ mostrarAviso('<b>SHEET</b> · use 16×16 tiles', true, 2600); return; }
        sheetPersonalizado = im; mostrarAviso('<b>CUSTOM SHEET</b> · loaded', false, 2200); alternarPausa();
      };
      im.src = URL.createObjectURL(f); e.target.value = '';
    });
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
      cancelAnimationFrame(raf); duck(1);
      document.removeEventListener('keydown', tecla, true);
      document.removeEventListener('visibilitychange', oculta);
      window.removeEventListener('resize', medir);
      raiz.remove();
      salir();
    }

    /* ---------- subida de nivel: arbol oculto de mejoras ---------- */
    function disponibles(){
      // las mejoras con "req" solo salen si ya desbloqueaste la base (sino no harian nada)
      return Object.keys(MEJORAS).filter(function(k){ return m[k] < MEJORAS[k].tope && (!MEJORAS[k].req || m[MEJORAS[k].req] > 0); });
    }
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
      siguienteMenu();                                    // arma pendiente / nivel de sobra / jefe
    }
    function subirNivel(){
      xp -= requiere(nivel);
      nivel++;
      if (nivel % 10 === 0) jefePend = true;               // cada 10 niveles llega un jefe
      hud();
      ofrecer();
    }
    /* Al derrotar a un jefe: 10 s para elegir 1 de 3 armas al azar (si se acaba el tiempo, elige una sola). */
    function ofrecerArmas(){
      eligiendo = true; armaPend = false; raiz.classList.add('menu'); sfx.nivel();
      armaOpc = mezclar(Object.keys(ARMAS).filter(function(k){ return k !== arma; })).slice(0, 3);
      armaT = 10;
      var h2 = '<div class="jg-h">BOSS DEFEATED</div><p>Choose a weapon · <b data-n="cuenta">10</b>s <span style="color:#6f8579">(time up = keep current)</span></p><div class="jg-cartas">';
      armaOpc.forEach(function(k, i){
        h2 += '<button class="jg-carta" data-a="arma" data-k="' + k + '"><b>' + ARMAS[k].nombre + '</b><span>' + ARMAS[k].desc + '</span>' +
              '<em>' + ARMAS[k].uso + '</em><i>[' + (i + 1) + ']</i></button>';
      });
      caja.innerHTML = h2 + '</div>';
      modal.hidden = false;
    }
    function elegirArma(k){
      if (!eligiendo || !ARMAS[k]) return;
      arma = k; rafaga = 0; acum = 0; armaT = null; armaOpc = null; eligiendo = false; sfx.elegir();
      reanudar(); hud();
      mostrarAviso('<b>' + ARMAS[k].nombre + '</b> · ' + ARMAS[k].desc, false, 2200);
      anillo(P.x, P.y, 28, 60, 0.45, '#ffd94d');
      siguienteMenu();
    }
    function ofrecerArmasIniciales(){
      eligiendo = true; raiz.classList.add('menu'); sfx.nivel();
      armaOpc = mezclar(Object.keys(ARMAS).slice()).slice(0, 3); armaT = null;
      var h = '<div class="jg-h">CHOOSE YOUR WEAPON</div><p>Start with one of three random weapons</p><div class="jg-cartas">';
      armaOpc.forEach(function(k, i){ h += '<button class="jg-carta" data-a="arma" data-k="' + k + '"><b>' + ARMAS[k].nombre + '</b><span>' + ARMAS[k].desc + '</span><em>' + ARMAS[k].uso + '</em><i>[' + (i + 1) + ']</i></button>'; });
      caja.innerHTML = h + '</div>'; modal.hidden = false;
    }
    function mantenerArma(){
      armaT = null; armaOpc = null; eligiendo = false; sfx.elegir();
      reanudar(); hud();
      mostrarAviso('Time up · kept <b>' + ARMAS[arma].nombre + '</b>', false, 2000);
      siguienteMenu();
    }
    /* Orden de menus tras cerrar uno: arma pendiente, nivel pendiente y por ultimo el jefe. */
    function siguienteMenu(){
      if (armaPend){ ofrecerArmas(); return; }
      if (xp >= requiere(nivel)){ subirNivel(); return; }
      if (jefePend && !jefe){ jefePend = false; spawnJefe(); }
    }

    /* ---------- enemigos ---------- */
    /* Especies raras: solo aparecen desde cierto nivel. Cada una con su forma y su forma de atacar. */
    var ESPECIES = [
      { id:'embestida', desde:6,  p:0.09 },     // se detiene, carga y embiste en linea recta
      { id:'divisor',   desde:8,  p:0.07 },     // al morir se parte en 3 mini bloques
      { id:'espinoso',  desde:10, p:0.06 },     // rombo giratorio con picos, zigzaguea
      { id:'fantasma',  desde:11, p:0.07 },     // se vuelve intangible a ratos (las balas lo atraviesan)
      { id:'torreta',   desde:12, p:0.06 },     // mantiene la distancia y dispara
      { id:'masa',      desde:15, p:0.035 },    // enorme, redondo, lleno de picos, muy resistente
      { id:'saltarin',  desde:7,  p:0.05 },     // se agacha y salta hacia ti en brincos
      { id:'bombardero',desde:9,  p:0.04 },     // se acerca, enciende la mecha y explota
      { id:'escudero',  desde:10, p:0.04 },     // escudo al frente: las balas de frente casi no le hacen nada
      { id:'sembrador', desde:13, p:0.025 }     // grande y lento, suelta mini bloques cada pocos segundos
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
        case 'saltarin':  tam = 8;  vida = d.vida * 0.9; vel = d.vel; col = '#ffb34d'; extra = { est:'espera', et:0.4 + Math.random() * 0.5, dx:0, dy:0 }; break;
        case 'bombardero':tam = 9;  vida = d.vida * 0.8; vel = d.vel * 1.1; golpe = d.golpe * 1.3; col = '#ff6a3d'; extra = { enc:false, mecha:0 }; break;
        case 'escudero':  tam = 12; vida = d.vida * 2.2; vel = d.vel * 0.55; golpe = d.golpe * 1.1; col = '#9fd0ff'; break;
        case 'sembrador': tam = 14; vida = d.vida * 4; vel = d.vel * 0.3; col = '#c8ff6a'; extra = { ft:2 }; break;
        case 'orbital':   tam = 5;  vida = d.vida * 0.35; vel = d.vel * 1.1; col = '#ff8ae0'; extra = { rad:38 + Math.random() * 14 }; break;
        case 'muro':      tam = 9;  vida = d.vida * 0.8; vel = 0; col = '#ff7a7a'; break;
        default:
          sp = null;
          if (r < d.pesado){ tam = 17; vida = d.vida * 4; vel *= 0.6; tipo = 1; }
          else if (r < d.pesado + d.rapido){ tam = 6; vida = d.vida * 0.6; vel *= 1.6; tipo = 2; }
      }
      // JUGGERNAUT: desde el nivel 10, a veces (4% -> 14%) un enemigo de CUALQUIER tipo sale en su version
      // grande y robusta: 1.8x de tamano, 7x de vida, 40% mas de dano y algo mas lento. Conserva su forma de moverse y atacar.
      var jug = false;
      if (!forzar && nivel >= 10 && sp !== 'masa' && Math.random() < Math.min(0.14, 0.04 + 0.0025 * (nivel - 10))){
        jug = true; tam = Math.round(tam * 1.8); vida *= 7; golpe *= 1.4; vel *= 0.8;
      }
      var c = elegirComportamiento(sp === 'orbital' ? 7 : nivel);
      // todo se "congela" aqui: subir de nivel despues NO cambia a los que ya estan vivos
      var e = { x:x, y:y, s:tam, hp:vida, max:vida, v:vel, golpe:golpe, flash:0, tipo:tipo, ph:Math.random() * 6.28, sp:sp, jug:jug,
                kx:0, ky:0, beh:(sp === 'orbital' ? 'cerco' : c.id), col:col || c.color, slot:(slotCerco++) % 8, rad:30 + Math.random() * 20 };
      for (var k in extra) e[k] = extra[k];
      enemigos.push(e);
      return e;
    }
    function crearMini(e, an){
      enemigos.push({ x:e.x, y:e.y, s:6, hp:e.max * 0.28, max:e.max * 0.28, v:Math.max(e.v * 2.4, 42), golpe:e.golpe * 0.6, flash:0, tipo:3, ph:Math.random() * 6.28,
                      sp:'mini', kx:Math.cos(an) * 70, ky:Math.sin(an) * 70, beh:'directo', col:e.col, slot:0, rad:30 });
    }
    function contar(sp){ var n = 0; enemigos.forEach(function(e){ if (e.sp === sp) n++; }); return n; }
    function explotarBombardero(e){
      var i = enemigos.indexOf(e); if (i >= 0) enemigos.splice(i, 1);
      anillo(e.x, e.y, 28, 50, 0.35, '#ff8a3d'); anillo(e.x, e.y, 16, 28, 0.3, '#fff3c4'); sfx.zona();
      if (Math.hypot(e.x - P.x, e.y - P.y) < 26) herir(e.golpe * 1.2);
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
      var cupo = Math.max(0, dificultad(nivel).maxVivos - enemigos.length);
      if (!cupo){ mostrarAviso('<b>WAVE</b> · field is full', true, 1800); return; }
      var tipos = ['anillo'];
      if (nivel >= 7) tipos.push('enjambre');
      if (nivel >= 10) tipos.push('muro');
      var tipo = tipos[(Math.random() * tipos.length) | 0], per = 2 * (W + H);
      if (tipo === 'anillo'){
        var n = Math.min(cupo, 70, 10 + nivel * 3);
        for (var i = 0; i < n; i++){
          var pt = puntoBorde((i + Math.random() * 0.6) / n * per, 10);
          crearEnemigo(pt[0], pt[1]);
        }
        sfx.oleada(); mostrarAviso('<b>WAVE</b> · ' + n + ' enemies from every side', true, 2400);
      } else if (tipo === 'enjambre'){
        // grupos repartidos por LOS CUATRO lados (arriba, derecha, abajo, izquierda), mas algunos extra al azar
        var grupos = 4 + ((nivel / 8) | 0), lados = [[0, W], [W, H], [W + H, W], [2 * W + H, H]];
        var creados = 0;
        for (var g = 0; g < grupos && creados < cupo; g++){
          var seg = lados[g % 4], base = puntoBorde(seg[0] + 2 + Math.random() * Math.max(1, seg[1] - 4), 12);
          for (var j = 0; j < 9 && creados < cupo; j++, creados++) crearEnemigo(base[0] + (Math.random() - 0.5) * 14, base[1] + (Math.random() - 0.5) * 14, 'orbital');
        }
        sfx.oleada(); mostrarAviso('<b>SWARM</b> · they circle and close in', true, 2400);
      } else {
        // dos muros a la vez, desde lados OPUESTOS, cada uno con su propio hueco
        var lado0 = (Math.random() * 4) | 0;
        var fHueco = Math.random();                       // misma posicion de hueco en ambos muros
        var antesMuros = enemigos.length;
        muroDe(lado0, fHueco, cupo); muroDe((lado0 + 2) % 4, fHueco, Math.max(0, cupo - (enemigos.length - antesMuros)));
        sfx.oleada(); mostrarAviso('<b>WALLS</b> · find the gaps', true, 2400);
      }
    }
    /* Un muro de bloques que cruza la pantalla en linea recta, con un hueco de 4 para escapar.
       lado: 0 arriba, 1 derecha, 2 abajo, 3 izquierda. */
    function muroDe(lado, fHueco, cupo){
      var horiz = lado % 2 === 0, largo = horiz ? W : H, v = 38;
      var cuantos = Math.floor(largo / 12), hueco = Math.floor((fHueco === undefined ? Math.random() : fHueco) * (cuantos - 5));
      for (var m2 = 0, creados = 0; m2 < cuantos && creados < cupo; m2++){
        if (m2 >= hueco && m2 < hueco + 5) continue;
        var pos = (m2 + 0.5) * largo / cuantos, wx, wy, vx = 0, vy = 0;
        if (lado === 0){ wx = pos; wy = -10; vy = v; }
        else if (lado === 2){ wx = pos; wy = H + 10; vy = -v; }
        else if (lado === 1){ wx = W + 10; wy = pos; vx = -v; }
        else { wx = -10; wy = pos; vx = v; }
        crearEnemigo(wx, wy, 'muro').lin = { vx:vx, vy:vy }; creados++;
      }
    }
    function disparoEnemigo(e, ux, uy){
      ebalas.push({ x:e.x, y:e.y, vx:ux * 55, vy:uy * 55, d:e.golpe * 0.6, t:6 });
      sfx.eshot();
    }
    /* ---------- JEFES ---------- */
    function limpiarPeligros(){ ebalas = []; zonas = []; anillosJ = []; rayosJ = []; cuchillas = []; }
    function jBala(x, y, ang, v, e, r, c){ ebalas.push({ x:x, y:y, vx:Math.cos(ang) * v, vy:Math.sin(ang) * v, d:e.golpe * 0.7, t:7, r:r || 1.6, c:c || '#ff9a9a' }); }
    function jAnillo(x, y, v, gapA, gapL, e){ anillosJ.push({ x:x, y:y, r:6, v:v, gapA:gapA, gapL:gapL, d:e.golpe * 0.8, hit:false }); sfx.zona(); }
    /* Anillo con salida garantizada: el hueco se centra hacia el jugador (+/- hasta 0.8 rad al azar), asi
       siempre hay un camino a pocos pasos. gapL = ancho del hueco en radianes (minimo ~1 rad). */
    function jAnilloJusto(x, y, v, e, gapL){
      var haciaP = Math.atan2(P.y - y, P.x - x);
      jAnillo(x, y, v, haciaP + (Math.random() - 0.5) * 1.6, Math.max(1.0, gapL), e);
    }
    function jZona(x, y, r, t0, e){ zonas.push({ x:x, y:y, r:r, t0:t0, t:0, d:e.golpe * 1.1, hecho:false }); }
    function jRayo(x, y, ang, vang, t0, tAct, e){ rayosJ.push({ x:x, y:y, ang:ang, vang:vang, t0:t0, t:tAct, w:3, d:e.golpe * 0.9, largo:520, aviso:false }); }
    function jAviso(x, y, ang, t0){ rayosJ.push({ x:x, y:y, ang:ang, vang:0, t0:t0, t:0.01, w:0, d:0, largo:260, aviso:true }); }
    function minionsJefe(e, tipo, n){                       // pocos minions: tope de 6 vivos
      var vivos = enemigos.filter(function(q){ return q.sp !== 'jefe' && q.minionJefe; }).length;
      for (var i = 0; i < n && vivos + i < 6; i++){
        var m3 = crearEnemigo(e.x + (Math.random() - 0.5) * 40, e.y + (Math.random() - 0.5) * 40, tipo);
        m3.minionJefe = true;
      }
    }
    function elegirAtaque(e, lista){
      var ops = lista.filter(function(a){ return a !== e.ultAt; });
      var a = ops[(Math.random() * ops.length) | 0];
      e.ultAt = a; e.est = a; e.aux = 0; e.n = 0; e.et = 0;
    }
    /* Embestidas con aviso (usadas por varios jefes): avisa con una linea, carga y embiste n veces. */
    function jCarga(e, dt, ux, uy, cant, post){
      e.et -= dt;
      if (e.aux === 0){ e.dx = ux; e.dy = uy; jAviso(e.x, e.y, Math.atan2(uy, ux), 0.7); sfx.carga(); e.aux = 1; e.et = 0.7; }
      else if (e.aux === 1){ if (e.et <= 0){ e.aux = 2; e.et = 0.5; } }
      else if (e.aux === 2){
        e.x += e.dx * 280 * dt; e.y += e.dy * 280 * dt;
        e.x = Math.max(10, Math.min(W - 10, e.x)); e.y = Math.max(10, Math.min(H - 10, e.y));
        if (e.et <= 0){ e.n++; if (e.n >= cant){ e.est = post; e.et = 1.4; e.aux = 0; } else { e.aux = 0; e.et = 0; } }
      }
    }
    function moverJefe(e, dt, dist){
      // A mayor nivel, las ventanas entre ataques se consumen antes y el jefe se mueve mas rapido.
      dt *= Math.min(2.2, 1 + Math.max(0, nivel - 10) * 0.035);
      var dx = P.x - e.x, dy = P.y - e.y, ux = dx / dist, uy = dy / dist;
      var fase = e.hp < e.max * 0.33 ? 2 : (e.hp < e.max * 0.66 ? 1 : 0), i, a;
      if (fase !== e.fase){                                   // cambio de fase: grito, anillo y pocos minions
        e.fase = fase; anillo(e.x, e.y, 40, 70, 0.5, e.col); sfx.jefe();
        mostrarAviso('<b>' + e.nombre + '</b> · phase ' + (fase + 1), true, 1800);
        if (e.jf === 'triturador') minionsJefe(e, 'mini', 2);
        if (e.jf === 'centinela') minionsJefe(e, 'torreta', 2);
        if (e.jf === 'rey') minionsJefe(e, 'escudero', 2);
        if (e.jf === 'vacio') minionsJefe(e, 'fantasma', 2);
      }
      var vf = 1 + 0.25 * fase;
      if (e.est === 'entra'){                                 // entra desde arriba
        var meta = e.jf === 'vacio' ? H * 0.5 : H * (e.jf === 'colmena' ? 0.22 : (e.jf === 'rey' ? 0.2 : 0.28));
        e.y += (meta - e.y) * Math.min(1, dt * 1.4); e.et -= dt;
        if (e.et <= 0){ e.est = 'base'; e.et = 1.6; }
        return;
      }
      switch (e.jf){
        /* ---- TRITURADOR: pesado y cuerpo a cuerpo ---- */
        case 'triturador':
          if (e.est === 'base'){
            e.x += ux * e.v * vf * dt; e.y += uy * e.v * vf * dt; e.et -= dt;
            if (e.et <= 0) elegirAtaque(e, ['salto', 'carga', 'temblor']);
          } else if (e.est === 'salto'){                      // marca el lugar, se eleva y cae con una onda expansiva
            if (e.aux === 0){ e.tx = P.x; e.ty = P.y; jZona(e.tx, e.ty, 30, 1.0, e); e.et = 1.0; e.aux = 1; sfx.carga(); }
            e.et -= dt;
            if (e.et <= 0){
              e.x = e.tx; e.y = e.ty; sfx.bomba();
              jAnilloJusto(e.x, e.y, 78, e, 1.3); if (fase >= 1) jAnilloJusto(e.x, e.y, 56, e, 1.1);   // la onda del salto ahora tiene brechas
              anillo(e.x, e.y, 36, 60, 0.4, '#ff9a3d'); e.est = 'base'; e.et = 1.8; e.aux = 0;
            }
          } else if (e.est === 'carga'){ jCarga(e, dt, ux, uy, 2 + fase, 'base'); }
          else if (e.est === 'temblor'){                      // meteoros avisados cerca de ti
            if (e.aux === 0){
              var nz = 7 + 2 * fase;
              for (i = 0; i < nz; i++){ a = Math.random() * 6.2832; jZona(P.x + Math.cos(a) * Math.random() * 80, P.y + Math.sin(a) * Math.random() * 80, 15, 0.9 + i * 0.12, e); }
              e.aux = 1; e.et = 2.6;
            }
            e.et -= dt; if (e.et <= 0){ e.est = 'base'; e.et = 1.6; e.aux = 0; }
          }
          return;
        /* ---- CENTINELA: a distancia ---- */
        case 'centinela':
          if (e.est === 'base'){
            var dir = dist < 62 ? -1 : (dist > 95 ? 1 : 0);
            e.x += ux * e.v * dir * dt + -uy * e.v * 0.6 * dt; e.y += uy * e.v * dir * dt + ux * e.v * 0.6 * dt;
            e.x = Math.max(14, Math.min(W - 14, e.x)); e.y = Math.max(14, Math.min(H - 14, e.y));
            e.et -= dt; if (e.et <= 0) elegirAtaque(e, ['haces', 'espiral', 'parpadeo']);
          } else if (e.est === 'haces'){                      // 3 rayos giratorios con aviso previo
            if (e.aux === 0){
              var base0 = Math.atan2(uy, ux), sg = Math.random() < 0.5 ? 1 : -1, nr = 3 + (fase >= 2 ? 1 : 0);
              for (i = 0; i < nr; i++) jRayo(e.x, e.y, base0 + i * 6.2832 / nr, sg * (0.7 + 0.15 * fase), 1.0, 2.4, e);
              sfx.carga(); e.aux = 1; e.et = 3.6;
            }
            e.et -= dt; if (e.et <= 0){ e.est = 'base'; e.et = 1.4; e.aux = 0; }
          } else if (e.est === 'espiral'){                    // brazos de balas girando
            if (e.aux === 0){ e.aux = 1; e.et = 3.2; e.n = 0; e.tt = 0; }
            e.et -= dt; e.tt -= dt;
            if (e.tt <= 0){
              e.tt = 0.08 - 0.01 * fase; e.n++;
              var brazos = 2 + fase;
              for (i = 0; i < brazos; i++) jBala(e.x, e.y, e.n * 0.5 + i * 6.2832 / brazos, 48, e, 1.5);
              sfx.eshot();
            }
            if (e.et <= 0){ e.est = 'base'; e.et = 1.4; e.aux = 0; }
          } else if (e.est === 'parpadeo'){                   // desaparece, reaparece en otro lugar y dispara un anillo
            if (e.aux === 0){ e.aux = 1; e.et = 0.5; e.fade = true; }
            else if (e.aux === 1 && (e.et -= dt) <= 0){
              e.x = 30 + Math.random() * (W - 60); e.y = 30 + Math.random() * (H * 0.5); e.fade = false;
              var nb = 14 + 4 * fase;
              for (i = 0; i < nb; i++) jBala(e.x, e.y, i * 6.2832 / nb, 52, e, 1.6, '#ffb3f0');
              sfx.zona(); e.aux = 2; e.et = 1.0;
            } else if (e.aux === 2 && (e.et -= dt) <= 0){ e.est = 'base'; e.et = 1.2; e.aux = 0; }
          }
          return;
        /* ---- COLMENA: invocadora ---- */
        case 'colmena':
          if (e.est === 'base'){
            e.x += (Math.sin(tiempo * 0.5) * 70 + W / 2 - e.x) * Math.min(1, dt * 0.8);
            e.et -= dt; if (e.et <= 0) elegirAtaque(e, ['crias', 'esporas', 'gas']);
          } else if (e.est === 'crias'){
            if (contar('orbital') < 8){ for (i = 0; i < 4; i++){ var cr = crearEnemigo(e.x + Math.cos(i * 1.57) * 20, e.y + Math.sin(i * 1.57) * 20, 'orbital'); cr.minionJefe = true; } sfx.divide(); }
            e.est = 'base'; e.et = 2.6;
          } else if (e.est === 'esporas'){                    // lluvia de balas desde arriba, con un carril libre junto a ti
            if (e.aux === 0){ e.aux = 1; e.et = 3.2; e.tt = 0; }
            e.et -= dt; e.tt -= dt;
            if (e.tt <= 0){
              e.tt = 0.11 - 0.015 * fase;
              var rx = 8 + Math.random() * (W - 16);
              if (Math.abs(rx - P.x) > 13) jBala(rx, -3, 1.5708, 44, e, 1.7, '#c8ff6a');
            }
            if (e.et <= 0){ e.est = 'base'; e.et = 1.8; e.aux = 0; }
          } else if (e.est === 'gas'){                        // anillos de gas con un hueco para pasar
            if (e.aux === 0){ e.aux = 1; e.et = 0.9; jAnilloJusto(e.x, e.y, 62, e, 1.2 - 0.08 * fase); }
            else if (e.aux === 1 && (e.et -= dt) <= 0){ jAnilloJusto(e.x, e.y, 62, e, 1.2 - 0.08 * fase); e.aux = 2; e.et = 1.6; }
            else if (e.aux === 2 && (e.et -= dt) <= 0){ e.est = 'base'; e.et = 1.6; e.aux = 0; }
          }
          return;
        /* ---- REY: muros de balas y coronas ---- */
        case 'rey':
          if (e.est === 'base'){
            e.x += (P.x - e.x) * Math.min(1, dt * 0.9); e.y += (H * 0.2 - e.y) * Math.min(1, dt * 1.2);
            e.et -= dt; if (e.et <= 0) elegirAtaque(e, ['muros', 'corona', 'carga']);
          } else if (e.est === 'muros'){                      // hileras de balas que cruzan con un hueco
            if (e.aux === 0){ e.aux = 1; e.et = 0; e.n = 0; }
            e.et -= dt;
            if (e.et <= 0 && e.n < 2 + fase){
              e.n++; e.et = 1.1;
              var lado = (Math.random() * 3) | 0, cuantos = lado === 0 ? Math.floor(W / 8) : Math.floor(H / 8), hueco = (Math.random() * (cuantos - 6)) | 0;
              for (i = 0; i < cuantos; i++){
                if (i >= hueco && i < hueco + 6) continue;
                if (lado === 0) jBala((i + 0.5) * W / cuantos, -3, 1.5708, 42, e, 2.2, '#ffd94d');
                else if (lado === 1) jBala(-3, (i + 0.5) * H / cuantos, 0, 42, e, 2.2, '#ffd94d');
                else jBala(W + 3, (i + 0.5) * H / cuantos, 3.1416, 42, e, 2.2, '#ffd94d');
              }
              sfx.zona();
            }
            if (e.n >= 2 + fase && e.et <= -1.4){ e.est = 'base'; e.et = 1.4; e.aux = 0; }
          } else if (e.est === 'corona'){                     // anillos de balas, el segundo girado
            if (e.aux === 0){ e.aux = 1; e.et = 0; e.n = 0; }
            e.et -= dt;
            if (e.et <= 0 && e.n < 2 + fase){
              var nn = 14 - e.n * 2, off = e.n * 0.22;
              for (i = 0; i < nn; i++) jBala(e.x, e.y, off + i * 6.2832 / nn, 46, e, 1.7, '#ffe98a');
              e.n++; e.et = 0.55; sfx.zona();
            }
            if (e.n >= 2 + fase && e.et <= -0.8){ e.est = 'base'; e.et = 1.4; e.aux = 0; }
          } else if (e.est === 'carga'){ jCarga(e, dt, ux, uy, 2 + fase, 'base'); }
          return;
        /* ---- VACIO: cuchillas, meteoros y ondas ---- */
        case 'vacio':
          if (e.est === 'base'){
            e.x += (W / 2 + Math.cos(tiempo * 0.4) * 60 - e.x) * Math.min(1, dt); e.y += (H * 0.45 + Math.sin(tiempo * 0.5) * 30 - e.y) * Math.min(1, dt);
            e.et -= dt; if (e.et <= 0) elegirAtaque(e, ['cuchillas', 'meteoros', 'ondas']);
          } else if (e.est === 'cuchillas'){
            if (e.aux === 0){
              var nc = 4 + 2 * (fase >= 1 ? 1 : 0);
              for (i = 0; i < nc; i++) cuchillas.push({ e:e, ang:i * 6.2832 / nc, t:0 });
              e.aux = 1; e.et = 4.2; sfx.carga();
            }
            e.et -= dt; if (e.et <= 0){ cuchillas = []; e.est = 'base'; e.et = 1.4; e.aux = 0; }
          } else if (e.est === 'meteoros'){
            if (e.aux === 0){
              var nm = 8 + 3 * fase;
              for (i = 0; i < nm; i++){ a = Math.random() * 6.2832; jZona(P.x + Math.cos(a) * Math.random() * 95, P.y + Math.sin(a) * Math.random() * 95, 14, 1.0 + i * 0.14, e); }
              e.aux = 1; e.et = 2.8;
            }
            e.et -= dt; if (e.et <= 0){ e.est = 'base'; e.et = 1.5; e.aux = 0; }
          } else if (e.est === 'ondas'){
            if (e.aux === 0){ e.aux = 1; e.et = 0; e.n = 0; }
            e.et -= dt;
            if (e.et <= 0 && e.n < 3){ jAnilloJusto(e.x, e.y, 66, e, 1.15 - 0.07 * fase); e.n++; e.et = 0.75; }
            if (e.n >= 3 && e.et <= -1.4){ e.est = 'base'; e.et = 1.4; e.aux = 0; }
          }
          return;
      }
    }

    /* ---------- crear / matar jefe ---------- */
    function spawnJefe(){
      var ids = Object.keys(JEFES), id;
      do { id = ids[(Math.random() * ids.length) | 0]; } while (id === ultimoJefe && ids.length > 1);
      ultimoJefe = id;
      var def = JEFES[id], d = dificultad(nivel), vidaJ = d.vida * 150;                       // los jefes escalan con la misma curva, y mas
      jefe = { x:W / 2, y:-30, s:def.s, hp:vidaJ, max:vidaJ, v:d.vel * 0.8, golpe:d.golpe * 1.4, flash:0, tipo:3, ph:0, sp:'jefe', jf:id,
               kx:0, ky:0, beh:'directo', col:def.col, slot:0, rad:30, nombre:def.nombre, est:'entra', et:2.0, fase:0, aux:0, n:0 };
      enemigos.push(jefe);
      limpiarPeligros(); sfx.jefe();
      mostrarAviso('<b>BOSS</b> · ' + def.nombre, true, 3000);
      el('jefenombre').textContent = def.nombre; el('jefe').hidden = false;
    }

    /* Movimiento propio de cada especie. */
    function moverEnemigo(e, dt, dist){
      if (e.sp === 'jefe'){ moverJefe(e, dt, dist); return; }
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
        case 'saltarin':                                          // espera agachado y salta en linea recta
          e.et -= dt;
          if (e.est === 'espera'){ if (e.et <= 0){ e.est = 'salto'; e.et = 0.26; e.dx = ux; e.dy = uy; } }
          else { e.x += e.dx * 175 * dt; e.y += e.dy * 175 * dt; if (e.et <= 0){ e.est = 'espera'; e.et = 0.45 + Math.random() * 0.5; } }
          return;
        case 'bombardero':                                        // se acerca, enciende la mecha cerca y explota
          if (!e.enc){
            e.x += ux * e.v * dt; e.y += uy * e.v * dt;
            if (dist < 38){ e.enc = true; e.mecha = 0.9; sfx.carga(); }
          } else { e.mecha -= dt; if (e.mecha <= 0) e.explota = true; }
          return;
        case 'sembrador':                                         // persigue lento y va soltando minis (maximo 10)
          e.ft -= dt;
          if (e.ft <= 0){ e.ft = 3.5; if (contar('mini') < 10){ crearMini(e, Math.random() * 6.28); crearMini(e, Math.random() * 6.28); sfx.divide(); } }
          break;
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
            if (a.lin || enemigos[j].lin || a.sp === 'jefe' || enemigos[j].sp === 'jefe') continue;
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
    /* Un enemigo solo cuenta (para apuntarle y para recibir dano) si esta DENTRO de la pantalla: asi no
       mueres de golpe a lo que ni ves, y quedarte quieto ya no te hace matar todo lo que viene de afuera. */
    function enPantalla(e){ return e.x > 0 && e.x < W && e.y > 0 && e.y < H; }
    function masCercano(){
      var cerca = null, dm = 1e9;
      for (var j = 0; j < enemigos.length; j++){
        var q = enemigos[j];
        if (!enPantalla(q)) continue;
        var dd = (q.x - P.x) * (q.x - P.x) + (q.y - P.y) * (q.y - P.y);
        if (dd < dm){ dm = dd; cerca = q; }
      }
      return cerca;
    }
    function balaBase(x, y, an, s, extra){
      var vm = (extra && extra.vm) || 1, v = s.vel * vm;
      var b = { x:x, y:y, vx:Math.cos(an) * v, vy:Math.sin(an) * v, d:s.dano, r:s.tam / 2 + 1.2, t:Math.max(1, Math.round(s.tam)),
                p:s.perf, golpes:[], vida:2.2 };
      for (var k in extra) b[k] = extra[k];
      balas.push(b);
      return b;
    }
    /* Arma estandar / dirigida: una bala por llamada y por linea (varias lineas = chorros paralelos). */
    function dispararA(obj, s, hom){
      sfx.disparo();
      var an = Math.atan2(obj.y - P.y, obj.x - P.x) + (Math.random() - 0.5) * (hom ? 1.4 : 0.03);   // las dirigidas salen cada una hacia un lado
      var nx = -Math.sin(an), ny = Math.cos(an);
      for (var li = 0; li < s.lineas; li++){
        var off = (li - (s.lineas - 1) / 2) * 3.4;
        balaBase(P.x + nx * off, P.y + ny * off, an, s, { hom:!!hom });
      }
    }
    /* Explosion de granada: dano en area a todos los cercanos (con veneno / fuego si los tienes). */
    function explosion(x, y, R, dmg, s){
      anillo(x, y, 30, R / 0.35, 0.35, '#ffa23d'); anillo(x, y, 16, R / 0.5, 0.4, '#fff3c4'); sfx.granada();
      enemigos.slice().forEach(function(e){
        if ((e.sp === 'fantasma' && e.fase) || !enPantalla(e)) return;
        if (Math.hypot(e.x - x, e.y - y) <= R + e.s / 2) golpear(e, dmg, s);
      });
    }
    /* Laser: golpea al instante a los enemigos sobre la linea (hasta 3 + 2 × perforacion por rayo). */
    function dispararLaser(s){
      sfx.disparo();
      var objs = enemigos.slice().filter(function(e){ return !(e.sp === 'fantasma' && e.fase) && enPantalla(e); });
      if (!objs.length) return;
      objs.sort(function(a, b){ return Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(b.x - P.x, b.y - P.y); });
      var nb = Math.min(6, s.balas);
      for (var bi = 0; bi < nb; bi++){
        var t = objs[bi % objs.length], an = Math.atan2(t.y - P.y, t.x - P.x), ux = Math.cos(an), uy = Math.sin(an);
        for (var li = 0; li < s.lineas; li++){
          var off = (li - (s.lineas - 1) / 2) * 3.4, sx = P.x - uy * off, sy = P.y + ux * off, ancho = s.tam * 0.5 + 0.8, tocados = [];
          enemigos.forEach(function(e){
            if ((e.sp === 'fantasma' && e.fase) || !enPantalla(e)) return;
            var rx = e.x - sx, ry = e.y - sy, proy = rx * ux + ry * uy;
            if (proy < 0 || proy > 420) return;
            if (Math.abs(rx * uy - ry * ux) <= ancho + e.s / 2) tocados.push({ e:e, p:proy });
          });
          tocados.sort(function(a, b){ return a.p - b.p; });
          var cupo2 = 3 + s.perf * 2, fin2 = 420;
          tocados.slice(0, cupo2).forEach(function(tt){ golpear(tt.e, s.dano * 1.4, s); });
          if (tocados.length > cupo2) fin2 = tocados[cupo2 - 1].p;
          lasers.push({ x1:sx, y1:sy, x2:sx + ux * fin2, y2:sy + uy * fin2, t:0.1 });
        }
      }
    }
    /* Armas de un solo disparo (no usan la rafaga). */
    function dispararArma(s){
      var obj = masCercano(); if (!obj) return;
      var base = Math.atan2(obj.y - P.y, obj.x - P.x), i, n;
      switch (arma){
        case 's':                                           // abanico (la "S" de Contra)
          n = 3 + 2 * s.balas * s.lineas; sfx.disparo();
          for (i = 0; i < n; i++) balaBase(P.x, P.y, base + (i - (n - 1) / 2) * (1.0 / (n - 1)), s, { d:s.dano * 0.85, vida:1.6 });
          break;
        case 'escopeta':                                    // cono de perdigones de corto alcance
          n = 6 + 3 * s.balas * s.lineas; sfx.disparo();
          for (i = 0; i < n; i++) balaBase(P.x, P.y, base + (Math.random() - 0.5) * 0.95, s, { d:s.dano * 0.7, vm:0.75 + Math.random() * 0.5, vida:0.4 + Math.random() * 0.2 });
          break;
        case 'laser': dispararLaser(s); break;
        case 'sniper':                                      // un solo disparo con el dano de muchas balas
          sfx.disparo();
          balaBase(P.x, P.y, base, s, { d:s.dano * 5 * s.balas * s.lineas, vm:1.7, r:s.tam / 2 + 2.4, t:Math.max(2, Math.round(s.tam) + 2), p:s.perf + 3, vida:3, grande:true });
          break;
        case 'bumeran':                                     // va y vuelve; golpea en la ida y en la vuelta
          n = Math.min(8, s.balas * s.lineas); sfx.disparo();
          for (i = 0; i < n; i++) balaBase(P.x, P.y, base + (i - (n - 1) / 2) * 0.35, s, { bum:true, alc:60 + s.vel * 0.12 + i * 6, d:s.dano * 1.2, vm:0.85, vida:8, p:s.perf + 4 });
          break;
        case 'granadas':                                    // explotan al impactar: area, 3x dano
          n = Math.min(8, s.balas * s.lineas); sfx.disparo();
          for (i = 0; i < n; i++) balaBase(P.x, P.y, base + (Math.random() - 0.5) * 0.3 + (i - (n - 1) / 2) * 0.12, s, { gran:true, rad:16 + s.tam * 3, vm:0.65, vida:1.3, d:0, p:0, t:Math.max(2, Math.round(s.tam)) });
          break;
      }
    }

        function anillo(x, y, n, v, t, c){
      for (var i = 0; i < n; i++){
        var an = i / n * 6.2832;
        parts.push({ x:x, y:y, vx:Math.cos(an) * v, vy:Math.sin(an) * v, t:t, c:c });
      }
    }

    /* Dano a un enemigo + efectos de veneno / fuego (los aplican las balas y el pulso). */
    function envenenar(e, s){ if (s.venenoOn) e.pz = { t:s.venenoDur, d:s.venenoDps * (e.sp === 'jefe' ? 0.5 : 1), k:0 }; }
    function quemar(e, s){ if (s.fuegoOn) e.fg = { t:s.fuegoDur, d:s.fuegoDps * (e.sp === 'jefe' ? 0.5 : 1), k:0 }; }
    function golpear(e, dmg, s){
      e.hp -= dmg; e.flash = 0.07;
      numeroDano(e.x, e.y - e.s / 2 - 2, dmg, '#ffffff');
      envenenar(e, s); quemar(e, s);
      if (e.hp <= 0) matar(e);
    }
    function numeroDano(x, y, dmg, color){ numeros.push({ x:x + (Math.random() - .5) * 4, y:y, v:-10 - Math.random() * 5, t:.65, max:.65, n:Math.max(1, Math.round(dmg)), c:color }); }
    /* Ticks de veneno (cada 0.5 s) y fuego (cada 0.4 s). Devuelve true si el enemigo murio. */
    function estadosTick(e, dt){
      if (e.pz){
        e.pz.t -= dt; e.pz.k += dt;
        if (e.pz.k >= 0.5){ e.pz.k -= 0.5; var dp = e.pz.d * 0.5; e.hp -= dp; numeroDano(e.x, e.y - e.s / 2 - 2, dp, '#bc79ff'); if (e.hp <= 0){ matar(e); return true; } }
        if (e.pz.t <= 0) e.pz = null;
      }
      if (e.fg){
        e.fg.t -= dt; e.fg.k += dt;
        if (e.fg.k >= 0.4){ e.fg.k -= 0.4; var df = e.fg.d * 0.4; e.hp -= df; numeroDano(e.x, e.y - e.s / 2 - 2, df, '#ff9a3d'); if (e.hp <= 0){ matar(e); return true; } }
        if (e.fg.t <= 0) e.fg = null;
      }
      return false;
    }
    /* El fuego salta a los enemigos que se tocan (el veneno no). */
    function contagiar(){
      var ardiendo = enemigos.filter(function(e){ return e.fg; });
      if (!ardiendo.length) return;
      ardiendo.forEach(function(a){
        enemigos.forEach(function(b){
          if (b === a || b.fg) return;
          if (Math.hypot(a.x - b.x, a.y - b.y) <= (a.s + b.s) / 2 + 2){
            b.fg = { t:Math.max(1.2, a.fg.t * 0.9), d:a.fg.d, k:0 };
            parts.push({ x:b.x, y:b.y - b.s / 2, vx:0, vy:-18, t:0.3, c:'#ffb347' });
          }
        });
      });
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
      if (e.sp === 'jefe'){                                // jefe derrotado: peligros fuera, xp extra y eleccion de arma
        jefe = null; limpiarPeligros(); el('jefe').hidden = true;
        xp += 4; kills += 2;
        anillo(e.x, e.y, 60, 90, 0.7, e.col); anillo(e.x, e.y, 40, 55, 0.8, '#fff3c4'); sfx.jefe();
        limpiarMin = true;                                                                      // sus minions caen con el (se quitan al inicio del siguiente cuadro)
        armaPend = true; hud();
        if (!eligiendo) ofrecerArmas();
        return;
      }
      // los enemigos muertos junto al jugador NO sueltan objetos (solo los que mueren a distancia)
      var lejos = Math.hypot(e.x - P.x, e.y - P.y) > 28;
      if (lejos && Math.random() < stats(m).suerte){
        var activo = { tiempo:efectos.tiempo > 0, burbuja:efectos.burbuja > 0, rayo:efectos.rayo > 0, curaLenta:efectos.curaLenta > 0 };
        var posibles = OBJETOS.filter(function(o){
          var enSuelo = objetos.filter(function(q){ return q.tipo === o.id; }).length;
          if (enSuelo >= (o.id === 'barrido' ? 1 : 2)) return false;                      // tope de 2 iguales a la vez en el suelo
          if (activo[o.id]) return false;                                                 // ya tienes ese efecto activo: no cae otro igual
          if (o.id === 'barrido' && tiempo - ultimoBarrido <= 150) return false;          // el barrido: 1 cada 2.5 min como maximo
          return true;
        });
        if (!posibles.length) posibles = [];
        if (posibles.length){
          var tot = posibles.reduce(function(a, o){ return a + o.peso; }, 0), r = Math.random() * tot, tipo = posibles[0].id;
          for (var q3 = 0; q3 < posibles.length; q3++){ r -= posibles[q3].peso; if (r <= 0){ tipo = posibles[q3].id; break; } }
          // Los items no nacen fuera ni pegados al borde, y quedan mas tiempo para poder volver por ellos.
          objetos.push({ x:Math.max(12, Math.min(W - 12, e.x)), y:Math.max(12, Math.min(H - 12, e.y)), t:18, tipo:tipo });
        }
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
        case 'curaLenta': efectos.curaLenta += 7; mostrarAviso('<b>REGEN</b> · healing over time'); anillo(P.x, P.y, 14, 30, .35, '#ff91c9'); break;
        case 'nucleo': {
          var ganada = Math.max(1, Math.ceil(requiere(nivel) * .5)); xp += ganada;
          mostrarAviso('<b>XP CORE</b> · +' + ganada + ' XP'); anillo(P.x, P.y, 28, 55, .45, '#c783ff');
          if (!eligiendo && xp >= requiere(nivel)) subirNivel(); break;
        }
        case 'bomba': {                                    // dano grande en una gran area
          var R = 105, dmg = s.dano * 7;                // mas daño (7x) y mas rango que antes (5x, 78)
          sfx.bomba(); anillo(o.x, o.y, 60, R / 0.45, 0.45, '#ffa23d');
          anillo(o.x, o.y, 36, R / 0.7, 0.5, '#fff3c4');
          enemigos.slice().forEach(function(e){
            if (enPantalla(e) && Math.hypot(e.x - o.x, e.y - o.y) <= R){ e.hp -= dmg; e.flash = 0.1; if (e.hp <= 0) matar(e); }
          });
          mostrarAviso('<b>BOMB</b>');
          break;
        }
        // Recoger otro igual SUMA su duracion a la que ya tenias (no la reinicia)
        case 'tiempo':  sfx.tiempo(); ebalas = []; efectos.tiempo += s.dur * 0.8; mostrarAviso('<b>TIME STOP</b> · +' + (s.dur * 0.8).toFixed(1) + 's'); break;
        case 'burbuja': sfx.burbuja(); efectos.burbuja += s.dur; mostrarAviso('<b>SHIELD</b> · +' + s.dur.toFixed(1) + 's'); break;
        case 'rayo':    sfx.rayoOn(); efectos.rayo += s.dur; rayoT = 0; mostrarAviso('<b>STORM</b> · +' + s.dur.toFixed(1) + 's'); break;
        case 'barrido': ultimoBarrido = tiempo; sfx.barrido();
                        enemigos.forEach(function(q2){ if (!enPantalla(q2)) q2.bar = true; });   // lo que esta fuera de pantalla no se barre
                        barrido = { eje:(Math.random() < 0.5 ? 'x' : 'y'), pos:-4, vel:0 };
                        barrido.vel = (barrido.eje === 'x' ? W : H) / 0.9; mostrarAviso('<b>SWEEP</b> · clears the screen'); break;
      }
    }

    /* ---------- actualizar ---------- */
    function actualizar(dt){
      var s = stats(m), d = dificultad(nivel);
      if (limpiarMin){ limpiarMin = false; for (var lm = enemigos.length - 1; lm >= 0; lm--) if (enemigos[lm].minionJefe) enemigos.splice(lm, 1); }
      tiempo += dt;
      if (inv > 0) inv -= dt;
      if (s.reg > 0 && hp < s.vida){ hp = Math.min(s.vida, hp + s.reg * dt); }
      ['tiempo', 'burbuja', 'rayo', 'curaLenta'].forEach(function(k){ if (efectos[k] > 0) efectos[k] -= dt; });
      if (efectos.curaLenta > 0 && hp < s.vida) hp = Math.min(s.vida, hp + 8 * dt);
      // tiempo detenido: sonido general bajo + tic-tac + conteo en pantalla hasta que se acabe
      var cn = el('conteo');
      if (efectos.tiempo > 0){
        duck(0.28);
        tickT -= dt;
        if (tickT <= 0){ tickT = 0.5; tictac = !tictac; if (tictac) sfx.tic(); else sfx.tac(); }
        var seg = Math.ceil(efectos.tiempo);
        if (seg !== ultimoConteo){ ultimoConteo = seg; if (seg <= 3) sfx.beep(); }
        cn.hidden = false; cn.textContent = seg;
      } else { duck(1); cn.hidden = true; ultimoConteo = -1; }

      // el jugador esta SIEMPRE donde esta el cursor (sin suavizado ni limite de velocidad)
      var ox = P.x, oy = P.y;
      P.x = Math.max(4, Math.min(W - 4, tx)); P.y = Math.max(4, Math.min(H - 4, ty));
      var ks = 1 - Math.exp(-dt * 8);
      P.vx += ((P.x - ox) / dt - P.vx) * ks; P.vy += ((P.y - oy) / dt - P.vy) * ks;   // velocidad suavizada

      // aparicion normal: depende solo del nivel (y se detiene con el tiempo congelado)
      spawnT -= dt;
      if (spawnT <= 0 && efectos.tiempo <= 0){
        spawnT = d.intervalo * (0.7 + Math.random() * 0.6) * (jefe ? 4 : 1);
        if (enemigos.length < (jefe ? 6 : d.maxVivos)){
          var n = 1 + (nivel > 8 && Math.random() < 0.5 ? 1 : 0) + (nivel > 16 && Math.random() < 0.5 ? 1 : 0);
          var huecos = (jefe ? 6 : d.maxVivos) - enemigos.length;
          for (var i = 0; i < n && i < huecos; i++) aparecerBorde();
        }
      }

      // aura de pulso (mejora): daña en area, y aplica veneno / fuego si los tienes
      if (s.pulsoOn){
        auraT -= dt;
        if (auraT <= 0){
          auraT = s.pulsoInt; auras.push({ t:0, r:s.pulsoR }); sfx.pulso();
          enemigos.slice().forEach(function(en3){
            if ((en3.sp === 'fantasma' && en3.fase) || !enPantalla(en3)) return;
            if (Math.hypot(en3.x - P.x, en3.y - P.y) <= s.pulsoR + en3.s / 2) golpear(en3, s.pulsoDano, s);
          });
        }
      }
      for (var ai = auras.length - 1; ai >= 0; ai--){ auras[ai].t += dt / 0.35; if (auras[ai].t >= 1) auras.splice(ai, 1); }

      // pulso semitransparente cada tanto: ayuda a no perder de vista a la Z
      pulsoT -= dt;
      if (pulsoT <= 0){ pulsoT = 2.8; pulsos.push({ t:0 }); }
      for (var pi2 = pulsos.length - 1; pi2 >= 0; pi2--){ pulsos[pi2].t += dt; if (pulsos[pi2].t > 1) pulsos.splice(pi2, 1); }

      // oleadas periodicas
      if (!jefe) oleadaT -= dt;                        // sin oleadas mientras hay un jefe
      if (oleadaT <= 2.5 && !oleadaAvisada){ oleadaAvisada = true; sfx.alarma(); mostrarAviso('<b>WAVE</b> incoming!', true, 2400); }
      if (oleadaT <= 0){ oleada(); oleadaT = OLEADA_CADA; oleadaAvisada = false; }

      // enemigos: cada uno persigue a su manera; congelados no se mueven ni hacen dano
      var congelado = efectos.tiempo > 0;
      for (var i2 = enemigos.length - 1; i2 >= 0; i2--){
        var e = enemigos[i2];
        var dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
        if (e.flash > 0) e.flash -= dt;
        if ((e.pz || e.fg) && estadosTick(e, dt)) continue;      // veneno / fuego (siguen aunque este congelado)
        if (congelado) continue;
        if (e.lin){                                            // muro: avanza recto y sale por el otro lado
          e.x += e.lin.vx * dt; e.y += e.lin.vy * dt;
          if (e.x < -30 || e.y < -30 || e.x > W + 30 || e.y > H + 30){ enemigos.splice(i2, 1); continue; }
        } else {
          moverEnemigo(e, dt, dist);
          if (e.explota){ explotarBombardero(e); continue; }
          e.x += e.kx * dt; e.y += e.ky * dt;
          var amort = Math.exp(-dt * 6); e.kx *= amort; e.ky *= amort;
        }
        if (dist < e.s / 2 + 3) herir(e.golpe);
        if (fin) return;
      }
      // disparos enemigos (torretas y jefes)
      for (var eb = ebalas.length - 1; eb >= 0; eb--){
        var q2 = ebalas[eb];
        if (!congelado){ q2.x += q2.vx * dt; q2.y += q2.vy * dt; q2.t -= dt; }
        if (q2.t <= 0 || q2.x < -8 || q2.y < -8 || q2.x > W + 8 || q2.y > H + 8){ ebalas.splice(eb, 1); continue; }
        if (Math.hypot(q2.x - P.x, q2.y - P.y) < (q2.r || 1.5) + 2.5){ ebalas.splice(eb, 1); herir(q2.d); if (fin) return; }
      }
      if (!congelado){
        // zonas de meteoro: avisan con un circulo y explotan despues
        for (var zi = zonas.length - 1; zi >= 0; zi--){
          var zo = zonas[zi];
          if (!zo.hecho){
            zo.t0 -= dt;
            if (zo.t0 <= 0){
              zo.hecho = true; zo.t = 0.28; sfx.zona();
              anillo(zo.x, zo.y, 18, zo.r / 0.3, 0.3, '#ff9a3d');
              if (Math.hypot(zo.x - P.x, zo.y - P.y) < zo.r) herir(zo.d);
              if (fin) return;
            }
          } else { zo.t -= dt; if (zo.t <= 0) zonas.splice(zi, 1); }
        }
        // anillos expansivos con hueco: solo duelen en el borde del anillo (y no en el hueco)
        for (var ni = anillosJ.length - 1; ni >= 0; ni--){
          var an2 = anillosJ[ni]; an2.r += an2.v * dt;
          if (an2.r > Math.max(W, H) * 1.1){ anillosJ.splice(ni, 1); continue; }
          if (!an2.hit){
            var pdx = P.x - an2.x, pdy = P.y - an2.y, pd = Math.hypot(pdx, pdy);
            if (Math.abs(pd - an2.r) < 2.6){
              var dif = Math.abs((Math.atan2(pdy, pdx) - an2.gapA + Math.PI * 3) % (Math.PI * 2) - Math.PI);
              if (!(an2.gapL > 0 && dif <= an2.gapL / 2)){ an2.hit = true; herir(an2.d); if (fin) return; }
            }
          }
        }
        // rayos: avisan, luego queman la linea (giran)
        for (var yi = rayosJ.length - 1; yi >= 0; yi--){
          var ry = rayosJ[yi];
          if (ry.t0 > 0){ ry.t0 -= dt; ry.ang += ry.vang * dt * 0.0; }
          else {
            ry.t -= dt; ry.ang += ry.vang * dt;
            if (ry.t <= 0){ rayosJ.splice(yi, 1); continue; }
            if (!ry.aviso){
              var qx2 = P.x - ry.x, qy2 = P.y - ry.y, proy = qx2 * Math.cos(ry.ang) + qy2 * Math.sin(ry.ang);
              if (proy > 0 && proy < ry.largo && Math.abs(-qx2 * Math.sin(ry.ang) + qy2 * Math.cos(ry.ang)) < ry.w / 2 + 2.2){ herir(ry.d); if (fin) return; }
            }
          }
        }
        // cuchillas orbitales del Vacio
        for (var ci = cuchillas.length - 1; ci >= 0; ci--){
          var cu2 = cuchillas[ci]; cu2.t += dt; cu2.ang += 2.3 * dt;
          if (!cu2.e || enemigos.indexOf(cu2.e) < 0){ cuchillas.splice(ci, 1); continue; }
          cu2.r = 20 + 46 * Math.abs(Math.sin(cu2.t * 0.7));
          cu2.x = cu2.e.x + Math.cos(cu2.ang) * cu2.r; cu2.y = cu2.e.y + Math.sin(cu2.ang) * cu2.r;
          if (Math.hypot(cu2.x - P.x, cu2.y - P.y) < 5){ herir(cu2.e.golpe * 0.8); if (fin) return; }
        }
      }
      // barrido: una linea que cruza toda la pantalla y elimina lo que toca
      if (barrido){
        barrido.pos += barrido.vel * dt;
        enemigos.slice().forEach(function(en2){
          var cc = barrido.eje === 'x' ? en2.x : en2.y;
          if (!en2.bar && cc <= barrido.pos){
            en2.bar = true;
            if (en2.sp === 'jefe') en2.hp -= en2.max * 0.12; else if (en2.sp === 'masa') en2.hp -= en2.max * 0.6; else en2.hp = 0;
            en2.flash = 0.1;
            if (en2.hp <= 0) matar(en2);
          }
        });
        ebalas = ebalas.filter(function(b2){ return (barrido.eje === 'x' ? b2.x : b2.y) > barrido.pos; });
        if (barrido.pos > (barrido.eje === 'x' ? W : H) + 12) barrido = null;
      }
      contagioT -= dt;
      if (contagioT <= 0){ contagioT = 0.3; contagiar(); }
      if (!congelado) separar();

      // disparo automatico segun el arma. Estandar y dirigidas: rafagas bala por bala; el resto: un disparo por ciclo.
      acum += dt * s.cad * ARMAS[arma].fc;
      if (arma === 'normal' || arma === 'dirigidas'){
        if (acum >= 1 && rafaga === 0 && masCercano()){
          acum = Math.min(acum - 1, 1);
          rafaga = s.balas;
          rafagaT = 0;
        } else if (acum >= 1 && rafaga === 0) acum = 1;       // sin objetivo, queda lista
        if (rafaga > 0){
          // la rafaga entera dura como maximo el 60% del periodo: subir la cadencia SIEMPRE acelera el disparo
          var esp = Math.min(0.09, 0.6 / (s.cad * s.balas));
          rafagaT -= dt;
          while (rafaga > 0 && rafagaT <= 0){
            var obj = masCercano();
            if (obj){ dispararA(obj, s, arma === 'dirigidas'); rafaga--; rafagaT += esp; } else rafaga = 0;
          }
        }
      } else if (acum >= 1){
        if (masCercano()){ acum = Math.min(acum - 1, 1); dispararArma(s); } else acum = 1;
      }
      for (var li2 = lasers.length - 1; li2 >= 0; li2--){ lasers[li2].t -= dt; if (lasers[li2].t <= 0) lasers.splice(li2, 1); }

      // rayos de la tormenta: caen en enemigos al azar mientras dura
      if (efectos.rayo > 0){
        rayoT -= dt;
        var visibles = enemigos.filter(enPantalla);
        if (rayoT <= 0 && visibles.length){
          rayoT = 0.32;
          var v = visibles[(Math.random() * visibles.length) | 0];
          v.hp -= s.dano * 2.4 + nivel * 0.6; v.flash = 0.1;           // antes 3x dano + nivel: quitaba demasiado
          rayos.push({ x:v.x, y:v.y, t:0.16 }); sfx.zap();
          if (v.hp <= 0) matar(v);
        }
      }
      for (var ri = rayos.length - 1; ri >= 0; ri--){ rayos[ri].t -= dt; if (rayos[ri].t <= 0) rayos.splice(ri, 1); }

      // balas del jugador
      for (var b = balas.length - 1; b >= 0; b--){
        var bl = balas[b];
        if (bl.hom){                                           // dirigida: gira hacia el enemigo mas cercano a ELLA
          var best = null, bd = 150 * 150;
          for (var hq = 0; hq < enemigos.length; hq++){
            var he = enemigos[hq];
            if (bl.golpes.indexOf(he) >= 0 || (he.sp === 'fantasma' && he.fase) || !enPantalla(he)) continue;
            var dd2 = (he.x - bl.x) * (he.x - bl.x) + (he.y - bl.y) * (he.y - bl.y);
            if (dd2 < bd){ bd = dd2; best = he; }
          }
          if (best){
            var sp0 = Math.hypot(bl.vx, bl.vy), a0 = Math.atan2(bl.vy, bl.vx), want = Math.atan2(best.y - bl.y, best.x - bl.x);
            var df = ((want - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            a0 += Math.max(-8 * dt, Math.min(8 * dt, df));
            bl.vx = Math.cos(a0) * sp0; bl.vy = Math.sin(a0) * sp0;
          }
        }
        if (bl.bum){                                           // bumeran: va, da la vuelta y regresa a ti
          var spb = Math.hypot(bl.vx, bl.vy);
          if (!bl.ret){ bl.rec = (bl.rec || 0) + spb * dt; if (bl.rec > bl.alc){ bl.ret = true; bl.golpes = []; } }
          else {
            var bx = P.x - bl.x, by = P.y - bl.y, bd2 = Math.hypot(bx, by) || 1;
            bl.vx = bx / bd2 * spb * 1.05; bl.vy = by / bd2 * spb * 1.05;
          }
        }
        bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.vida -= dt;
        var fuera = bl.x < -8 || bl.y < -8 || bl.x > W + 8 || bl.y > H + 8 || bl.vida <= 0 || (bl.bum && bl.ret && Math.hypot(P.x - bl.x, P.y - bl.y) < 4);
        if (!fuera){
          for (var q = enemigos.length - 1; q >= 0; q--){
            var en = enemigos[q];
            if (bl.golpes.indexOf(en) >= 0 || (en.sp === 'fantasma' && en.fase) || !enPantalla(en)) continue;
            if (Math.abs(bl.x - en.x) < en.s / 2 + bl.r && Math.abs(bl.y - en.y) < en.s / 2 + bl.r){
              if (bl.gran){ explosion(bl.x, bl.y, bl.rad, s.dano * 3, s); fuera = true; break; }
              var dmg = bl.d;
              if (en.sp === 'escudero'){                       // escudo al frente: casi no le hace dano de ese lado
                var fx = P.x - en.x, fy = P.y - en.y, fl = Math.hypot(fx, fy) || 1, qx = bl.x - en.x, qy = bl.y - en.y, ql = Math.hypot(qx, qy) || 1;
                if ((fx * qx + fy * qy) / (fl * ql) > 0.35) dmg *= 0.2;
              }
              golpear(en, dmg, s); bl.golpes.push(en); sfx.golpe();
              parts.push({ x:bl.x, y:bl.y, vx:(Math.random() - 0.5) * 40, vy:(Math.random() - 0.5) * 40, t:0.15, c:'#fff' });
              if (en.hp <= 0) matar(en);
              if (bl.golpes.length > bl.p){ fuera = true; break; }       // se acabo la perforacion
            }
          }
        } else if (bl.gran && bl.vida <= 0) explosion(bl.x, bl.y, bl.rad, s.dano * 3, s);   // la granada tambien explota al final de su trayecto
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
      for (var nd = numeros.length - 1; nd >= 0; nd--){ var no = numeros[nd]; no.y += no.v * dt; no.t -= dt; if (no.t <= 0) numeros.splice(nd, 1); }

      // hud vivo
      el('tiempo').textContent = fmt(tiempo);
      el('amenaza').style.width = Math.min(100, (enemigos.length / d.maxVivos) * 100) + '%';
      el('hp').textContent = Math.ceil(hp);
      el('hpbarra').style.width = Math.max(0, hp / s.vida * 100) + '%';
      if (jefe) el('jefebarra').style.width = Math.max(0, jefe.hp / jefe.max * 100) + '%';
      // lista de estados activos: nombre, barra y segundos restantes; desaparece cuando se acaba
      var DEFE = [['tiempo', 'TIME STOP', '#7fd6ff'], ['burbuja', 'SHIELD', '#8fa8ff'], ['rayo', 'STORM', '#ffe14d'], ['curaLenta', 'REGEN', '#ff91c9']];
      var tx2 = '';
      DEFE.forEach(function(d3){
        var k3 = d3[0];
        if (efectos[k3] <= 0){ efMax[k3] = 0; return; }
        if (efectos[k3] > efMax[k3]) efMax[k3] = efectos[k3];
        var pct = Math.round(efectos[k3] / efMax[k3] * 10) * 10;                     // pasos de 10% para no reescribir cada cuadro
        tx2 += '<div class="jg-ef"><i style="background:' + d3[2] + '"></i><span>' + d3[1] + '</span>' +
               '<b>' + Math.ceil(efectos[k3]) + 's</b><em><u style="width:' + pct + '%;background:' + d3[2] + '"></u></em></div>';
      });
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
    /* Hoja opcional: cada celda mide 16×16 px. El lienzo mantiene imageSmoothing=false,
       por lo que los sprites importados conservan sus pixeles exactos. */
    var TILE = { jugador:0, normal:1, embestida:2, divisor:3, espinoso:4, fantasma:5, torreta:6, masa:7,
      saltarin:8, bombardero:9, escudero:10, sembrador:11, orbital:12, muro:13, mini:14,
      triturador:16, centinela:17, colmena:18, rey:19, vacio:20,
      cura:24, curaLenta:25, bomba:26, tiempo:27, burbuja:28, rayo:29, nucleo:30, barrido:31,
      normalArma:32, dirigidas:33, s:34, escopeta:35, laser:36, sniper:37, bumeran:38, granadas:39, bala:40 };
    function spriteSheet(id, x, y, tam){
      if (!sheetPersonalizado || TILE[id] === undefined) return false;
      var n = TILE[id], cols = Math.max(1, (sheetPersonalizado.width / 16) | 0), sx = (n % cols) * 16, sy = ((n / cols) | 0) * 16;
      ctx.drawImage(sheetPersonalizado, sx, sy, 16, 16, Math.round(x - tam / 2), Math.round(y - tam / 2), Math.max(1, Math.round(tam)), Math.max(1, Math.round(tam)));
      return true;
    }

    function lineaPx(x0, y0, x1, y1, c){
      var dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1);
      for (var k = 0; k <= n; k++) px(x0 + dx * k / n, y0 + dy * k / n, 1, 1, c);
    }
    function dibujarJefe(e, congelado){
      var s = Math.round(e.s), cx = Math.round(e.x), cy = Math.round(e.y), x0 = Math.round(e.x - s / 2), y0 = Math.round(e.y - s / 2), i, a;
      var col = e.flash > 0 ? '#ffffff' : (congelado ? '#8fd8ff' : e.col);
      if (e.fade) ctx.globalAlpha = 0.25;
      switch (e.jf){
        case 'triturador':                                  // bloque enorme con dientes y ojos
          for (i = 0; i < 2; i++){ px(x0 - i, y0 - i, s + 2 * i, 1, col); px(x0 - i, y0 + s + i, s + 2 * i, 1, col); px(x0 - i, y0 - i, 1, s + 2 * i + 1, col); px(x0 + s + i, y0 - i, 1, s + 2 * i + 1, col); }
          for (i = 0; i < 6; i++){ var bx = x0 + i * s / 6; lineaPx(bx, y0 - 2, bx + s / 12, y0 - 7, col); lineaPx(bx + s / 6, y0 - 2, bx + s / 12, y0 - 7, col); }
          for (i = 0; i < 4; i++){ lineaPx(x0 - 2, y0 + 6 + i * 7, x0 - 7, y0 + 9 + i * 7, col); lineaPx(x0 + s + 2, y0 + 6 + i * 7, x0 + s + 7, y0 + 9 + i * 7, col); }
          px(x0 + 7, y0 + 9, 4, 3, col); px(x0 + s - 11, y0 + 9, 4, 3, col);                       // ojos
          for (i = 0; i < s - 8; i += 3) px(x0 + 4 + i, y0 + s - 8 + ((i / 3) % 2) * 3, 2, 2, col);   // boca de dientes
          break;
        case 'centinela': {                                 // un ojo con picos y pupila que te sigue
          var r1 = s / 2, n1 = Math.ceil(r1 * 6.2832);
          for (i = 0; i < n1; i++){ a = i / n1 * 6.2832; px(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 1, 1, col); }
          for (i = 0; i < 10; i++){ a = i / 10 * 6.2832 + tiempo * 0.5; lineaPx(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * (r1 + 5), cy + Math.sin(a) * (r1 + 5), col); }
          var pa = Math.atan2(P.y - e.y, P.x - e.x);
          var n2 = Math.ceil(5 * 6.2832); for (i = 0; i < n2; i++){ a = i / n2 * 6.2832; px(cx + Math.cos(pa) * 5 + Math.cos(a) * 5, cy + Math.sin(pa) * 5 + Math.sin(a) * 5, 1, 1, '#fff'); }
          px(cx + Math.cos(pa) * 5, cy + Math.sin(pa) * 5, 2, 2, col);
          break;
        }
        case 'colmena': {                                   // hexagono con celdas y ampollas
          var r3 = s / 2 + 2, vs = [];
          for (i = 0; i < 6; i++){ a = i / 6 * 6.2832 + 0.5236; vs.push([cx + Math.cos(a) * r3, cy + Math.sin(a) * r3]); }
          for (i = 0; i < 6; i++){ var p1 = vs[i], p2 = vs[(i + 1) % 6]; lineaPx(p1[0], p1[1], p2[0], p2[1], col); lineaPx(p1[0], p1[1], p1[0] + (p1[0] - cx) * 0.25, p1[1] + (p1[1] - cy) * 0.25, col); }
          for (i = 0; i < 6; i++){ a = i / 6 * 6.2832 + tiempo * 0.3; px(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, 2, 2, col); }
          px(cx - 1, cy - 1, 3, 3, col);
          break;
        }
        case 'rey':                                         // bloque con corona de picos y cruz
          for (i = 0; i < 2; i++){ px(x0 - i, y0 - i, s + 2 * i, 1, col); px(x0 - i, y0 + s + i, s + 2 * i, 1, col); px(x0 - i, y0 - i, 1, s + 2 * i + 1, col); px(x0 + s + i, y0 - i, 1, s + 2 * i + 1, col); }
          for (i = 0; i < 5; i++){ var cxk = x0 + 3 + i * (s - 6) / 4, alt = i % 2 === 0 ? 10 : 6; lineaPx(cxk - 3, y0 - 2, cxk, y0 - alt, col); lineaPx(cxk + 3, y0 - 2, cxk, y0 - alt, col); px(cxk - 1, y0 - alt - 1, 2, 2, '#fff'); }
          px(cx, y0 + 4, 1, s - 8, col); px(x0 + 5, cy, s - 10, 1, col);
          break;
        case 'vacio': {                                     // vacio: circulo con espiral interna y puntos orbitando
          var r4 = s / 2, n4 = Math.ceil(r4 * 6.2832);
          for (i = 0; i < n4; i += 2){ a = i / n4 * 6.2832 + tiempo * 0.8; px(cx + Math.cos(a) * r4, cy + Math.sin(a) * r4, 1, 1, col); }
          for (i = 0; i < 30; i++){ a = i * 0.45 + tiempo * 2; var rr2 = 1 + i * 0.45; px(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2, 1, 1, col); }
          for (i = 0; i < 4; i++){ a = i * 1.57 - tiempo * 1.3; px(cx + Math.cos(a) * (r4 + 5), cy + Math.sin(a) * (r4 + 5), 2, 2, '#d9c2ff'); }
          break;
        }
      }
      ctx.globalAlpha = 1;
    }
    /* Blindaje de juggernaut: aro punteado exterior, hombreras con picos y remaches, mas una barrita de vida
       encima, para reconocerlo de un vistazo sea del tipo que sea. */
    function dibujarBlindaje(e, congelado){
      var cx = Math.round(e.x), cy = Math.round(e.y), r = e.s / 2 + 3, i;
      var col = e.flash > 0 ? '#ffffff' : (congelado ? '#8fd8ff' : e.col);
      if (e.sp === 'fantasma' && e.fase) ctx.globalAlpha = 0.3;
      var n = Math.ceil(r * 6.2832 / 2);
      for (i = 0; i < n; i += 2){ var a = i / n * 6.2832; px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1, col); }
      for (i = 0; i < 4; i++){
        var ah = i * 1.5708 + 0.7854;
        lineaPx(cx + Math.cos(ah) * r, cy + Math.sin(ah) * r, cx + Math.cos(ah) * (r + 4), cy + Math.sin(ah) * (r + 4), col);
        px(cx + Math.cos(ah) * (r - 4), cy + Math.sin(ah) * (r - 4), 2, 2, col);
      }
      px(cx - 1, cy - 1, 3, 3, col);
      ctx.globalAlpha = 1;
      var w = Math.round(e.s), f = Math.max(0, e.hp / e.max);
      px(cx - w / 2, cy - e.s / 2 - 9, w, 1, 'rgba(255,255,255,.25)'); px(cx - w / 2, cy - e.s / 2 - 9, Math.max(1, w * f), 1, '#ffffff');
    }
    function dibujarEnemigo(e, congelado){
      if (spriteSheet(e.sp === 'jefe' ? e.jf : (e.sp || 'normal'), e.x, e.y, e.s + 5)) return;
      if (e.sp === 'jefe'){ dibujarJefe(e, congelado); return; }
      dibujarBase(e, congelado);
      if (e.jug) dibujarBlindaje(e, congelado);
    }
    function dibujarBase(e, congelado){
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
      if (e.sp === 'saltarin'){                                                         // patas; se agacha antes de saltar
        px(x0 + 1, y0 + s, 1, e.est === 'espera' ? 1 : 3, col); px(x0 + s - 2, y0 + s, 1, e.est === 'espera' ? 1 : 3, col);
        px(x0 + 2, y0 + 2, 1, 1, col); px(x0 + s - 3, y0 + 2, 1, 1, col);
      }
      if (e.sp === 'bombardero'){                                                       // mecha con chispa
        lineaPx(cx, y0 - 1, cx + 2, y0 - 4, '#bbb');
        px(cx + 2, y0 - 5, 1, 1, Math.floor(tiempo * 20) % 2 ? '#ffd94d' : '#ff6a3d');
        if (e.enc && Math.floor(tiempo * 18) % 2) px(x0 + 1, y0 + 1, s - 2, s - 2, 'rgba(255,255,255,.6)');
      }
      if (e.sp === 'escudero'){                                                         // escudo curvo hacia el jugador
        var fa = Math.atan2(P.y - e.y, P.x - e.x);
        for (var sa = -0.9; sa <= 0.9; sa += 0.12){
          px(cx + Math.cos(fa + sa) * (s / 2 + 3), cy + Math.sin(fa + sa) * (s / 2 + 3), 1, 1, '#d5ecff');
          px(cx + Math.cos(fa + sa) * (s / 2 + 4), cy + Math.sin(fa + sa) * (s / 2 + 4), 1, 1, col);
        }
      }
      if (e.sp === 'sembrador'){ px(x0 + 3, y0 + 3, 2, 2, col); px(x0 + s - 5, y0 + 3, 2, 2, col); px(x0 + 3, y0 + s - 5, 2, 2, col); px(x0 + s - 5, y0 + s - 5, 2, 2, col); }
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

    function dibujarEstados(e){
      if (e.pz){                                                             // veneno: gotas verdes
        var f1 = Math.floor(tiempo * 8 + e.ph) % 3;
        px(e.x - 2 + f1, e.y - e.s / 2 - 3, 1, 1, '#7dff7d'); px(e.x + 1 - f1, e.y + e.s / 2 + 1, 1, 2, '#3ddc84');
      }
      if (e.fg){                                                             // fuego: llamas naranjas
        var c1 = Math.floor(tiempo * 12 + e.ph) % 2 ? '#ffd94d' : '#ff8a3d';
        px(e.x - 1 + (Math.floor(tiempo * 10 + e.ph) % 3), e.y - e.s / 2 - 6, 1, 3, c1);
        px(e.x - 2, e.y - e.s / 2 - 4, 1, 2, '#ff8a3d'); px(e.x + 2, e.y - e.s / 2 - 5, 1, 2, '#ffd94d');
      }
    }
    function dibujarAuras(){
      auras.forEach(function(a){
        var r = 3 + a.t * a.r, al = (0.5 * (1 - a.t)).toFixed(3), n = Math.ceil(r * 6.2832 / 1.2);
        ctx.fillStyle = 'rgba(127,255,212,' + al + ')';
        for (var i = 0; i < n; i++){ var an = i / n * 6.2832; ctx.fillRect(Math.round(P.x + Math.cos(an) * r), Math.round(P.y + Math.sin(an) * r), 1, 1); }
      });
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
      if (spriteSheet('jugador', P.x, P.y, 7)) return;
      for (var y = 0; y < 7; y++) for (var x = 0; x < 7; x++)
        if (Z_PIX[y][x] === 'X') px(x0 + x, y0 + y, 1, 1, VERDE);
      ctx.fillStyle = 'rgba(61,220,132,.12)'; ctx.fillRect(x0 - 2, y0 - 2, 11, 11);    // resplandor tenue
    }

    function dibujar(){
      ctx.fillStyle = '#050811'; ctx.fillRect(0, 0, W, H);
      // Espacio muy tenue: conserva contraste para enemigos, items y proyectiles.
      estrellas.forEach(function(st){ ctx.fillStyle = st.c; ctx.globalAlpha = st.a; ctx.fillRect(Math.round(st.x), Math.round(st.y), 1, 1); }); ctx.globalAlpha = 1;

      objetos.forEach(function(o){
        if (o.t < 2.5 && Math.floor(o.t * 6) % 2) return;                // parpadea al acabarse
        var info = OBJETOS.filter(function(q){ return q.id === o.tipo; })[0];
        if (!spriteSheet(o.tipo, o.x, o.y + Math.round(Math.sin(tiempo * 4 + o.x)), 7)) sprite(SPR[o.tipo], o.x, o.y + Math.round(Math.sin(tiempo * 4 + o.x)), info.color);
      });
      var cong = efectos.tiempo > 0;
      enemigos.forEach(function(e){ dibujarEnemigo(e, cong); dibujarEstados(e); });
      zonas.forEach(function(z){                                         // meteoros: circulo de aviso y destello
        if (!z.hecho){
          var pr = 1 - Math.max(0, z.t0) / 1.4, nz = Math.ceil(z.r * 6.2832 / 2.2);
          for (var zi2 = 0; zi2 < nz; zi2++){ var za = zi2 / nz * 6.2832; px(z.x + Math.cos(za) * z.r, z.y + Math.sin(za) * z.r, 1, 1, 'rgba(255,90,90,' + (0.35 + 0.5 * Math.min(1, pr)).toFixed(2) + ')'); }
          if (z.t0 < 0.3 && Math.floor(z.t0 * 24) % 2) px(z.x - 1, z.y - 1, 3, 3, 'rgba(255,200,120,.8)');
        } else {
          var nz2 = Math.ceil(z.r * 6.2832 / 1.2);
          for (var zj = 0; zj < nz2; zj++){ var zb = zj / nz2 * 6.2832; px(z.x + Math.cos(zb) * z.r * (1 - z.t), z.y + Math.sin(zb) * z.r * (1 - z.t), 1, 1, 'rgba(255,230,160,' + (z.t / 0.28).toFixed(2) + ')'); }
        }
      });
      anillosJ.forEach(function(a){                                      // anillos expansivos con hueco
        var na = Math.ceil(a.r * 6.2832 / 1.1);
        for (var ai2 = 0; ai2 < na; ai2++){
          var aa = ai2 / na * 6.2832, dif2 = Math.abs((aa - a.gapA + Math.PI * 3) % (Math.PI * 2) - Math.PI);
          if (a.gapL > 0 && dif2 <= a.gapL / 2) continue;
          px(a.x + Math.cos(aa) * a.r, a.y + Math.sin(aa) * a.r, 1, 1, '#ffb15a');
          px(a.x + Math.cos(aa) * (a.r - 1), a.y + Math.sin(aa) * (a.r - 1), 1, 1, 'rgba(255,120,60,.5)');
        }
      });
      rayosJ.forEach(function(r){                                        // rayos: linea punteada de aviso, luego haz grueso
        var ex = r.x + Math.cos(r.ang) * r.largo, ey = r.y + Math.sin(r.ang) * r.largo;
        if (r.t0 > 0){
          var nn = Math.floor(r.largo / 4);
          for (var ki = 0; ki < nn; ki += 2) px(r.x + (ex - r.x) * ki / nn, r.y + (ey - r.y) * ki / nn, 1, 1, 'rgba(255,120,120,.6)');
        } else if (!r.aviso){
          lineaPx(r.x, r.y, ex, ey, '#ffffff'); lineaPx(r.x + 1, r.y, ex + 1, ey, '#ff4dd2'); lineaPx(r.x, r.y + 1, ex, ey + 1, '#ff4dd2');
        }
      });
      cuchillas.forEach(function(c){                                     // cuchillas orbitales
        if (c.x === undefined) return;
        px(c.x - 1, c.y, 3, 1, '#d9c2ff'); px(c.x, c.y - 1, 1, 3, '#d9c2ff'); px(c.x, c.y, 1, 1, '#fff');
      });
      ebalas.forEach(function(b){                                        // orbe enemigo: anillo distinto + nucleo rojo
        var rr = Math.max(2, Math.round((b.r || 1.5) * 1.6)), bx = Math.round(b.x), by = Math.round(b.y);
        px(bx - rr / 2 - b.vx * 0.025, by - rr / 2 - b.vy * 0.025, rr, rr, 'rgba(255,65,80,.22)');
        px(bx - 1, by - rr / 2, 2, 1, '#ffe5e8'); px(bx - 1, by + rr / 2 - 1, 2, 1, '#ffe5e8');
        px(bx - rr / 2, by - 1, 1, 2, '#ffe5e8'); px(bx + rr / 2 - 1, by - 1, 1, 2, '#ffe5e8');
        px(bx - 1, by - 1, 2, 2, '#ff2638');
      });
      if (barrido){                                                      // linea blanca con estela
        for (var bk = 0; bk < 12; bk++){
          var al = (0.85 * (1 - bk / 12)).toFixed(2);
          if (barrido.eje === 'x') px(barrido.pos - bk, 0, 1, H, 'rgba(255,255,255,' + al + ')');
          else px(0, barrido.pos - bk, W, 1, 'rgba(255,255,255,' + al + ')');
        }
      }
      lasers.forEach(function(l){
        var al = Math.max(0.2, l.t / 0.1).toFixed(2);
        lineaPx(l.x1, l.y1, l.x2, l.y2, 'rgba(191,255,224,' + al + ')');
        lineaPx(l.x1 + 1, l.y1, l.x2 + 1, l.y2, 'rgba(61,220,132,' + (al * 0.6).toFixed(2) + ')');
      });
      balas.forEach(function(b){
        if (b.gran){ px(b.x - b.t / 2, b.y - b.t / 2, b.t, b.t, '#ffa23d'); return; }
        px(b.x - b.t / 2 - b.vx * 0.014, b.y - b.t / 2 - b.vy * 0.014, b.t, b.t, 'rgba(61,220,132,.45)');   // estela corta
        if (!spriteSheet('bala', b.x, b.y, Math.max(3, b.t + 2))) px(b.x - b.t / 2, b.y - b.t / 2, b.t, b.t, '#c9ffe0');
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
      numeros.forEach(function(no){ ctx.globalAlpha = Math.max(0, no.t / no.max); ctx.fillStyle = no.c; ctx.font = '5px monospace'; ctx.fillText(String(no.n), Math.round(no.x), Math.round(no.y)); }); ctx.globalAlpha = 1;
      if (!fin){ dibujarAuras(); dibujarPulsos(); dibujarZ(); }
    }

    /* ---------- bucle ---------- */
    function frame(now){
      var dt = Math.min(0.05, (now - ultimo) / 1000); ultimo = now;
      if (!pausado && !eligiendo && !fin){
        try { actualizar(dt); } catch(err){ if (window.console) console.error('juego:', err); }   // un error ya no congela el juego
      }
      if (eligiendo && armaT !== null){                    // cuenta de 10 s para elegir arma
        var antes = Math.ceil(armaT);
        armaT -= dt;
        var cn2 = el('cuenta'); if (cn2) cn2.textContent = Math.max(0, Math.ceil(armaT));
        if (Math.ceil(armaT) !== antes && armaT > 0) sfx.tic();
        if (armaT <= 0 && armaOpc) mantenerArma();         // se acabo el tiempo: conservas tu arma actual
      }
      try { dibujar(); } catch(err2){ if (window.console) console.error('juego (dibujo):', err2); }
      raf = requestAnimationFrame(frame);
    }
    reiniciar();
    ofrecerArmasIniciales();
    raf = requestAnimationFrame(frame);
    mostrarAviso(tactil ? 'Drag to move · <b>auto-fire</b>' : 'Move the mouse · <b>auto-fire</b>');
  }

  window.Juego = { abrir: abrir };
})();
