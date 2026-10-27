/* ---------------------------------------------------------
   Fondo vivo en pixel art: pocas curvas matematicas dibujadas pixel a pixel
   (sin suavizado, con escalones limpios) cuyo color cambia suave a lo largo
   de la linea y con el tiempo, mas cumulos de color borrosos y particulas.
   El lienzo es de muy baja resolucion y se amplia sin suavizar.
   --------------------------------------------------------- */
(function(){
  // una pagina puede tener varios lienzos (p.ej. el panel de detalle): todos dibujan lo mismo
  var cvs = Array.prototype.slice.call(document.querySelectorAll('canvas.fondo'));
  if (!cvs.length) return;
  var ctx = cvs[0].getContext('2d');
  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, dpr = 0.26;      // cada pixel del lienzo mide ~5.5 px de pantalla

  function resize(){
    W = window.innerWidth; H = window.innerHeight;
    cvs.forEach(function(c){
      c.width = Math.max(8, Math.round(W * dpr)); c.height = Math.max(8, Math.round(H * dpr));
      c.style.width = W + 'px'; c.style.height = H + 'px';
      c.__ctx = c.__ctx || c.getContext('2d');
      c.__ctx.setTransform(c.width / W, 0, 0, c.height / H, 0, 0);
    });
  }
  resize();
  window.addEventListener('resize', resize);

  /* ---------- Cumulos de color (suaves; al ampliarse se ven en bloques) ---------- */
  var COL = ['61,220,132', '88,101,242', '19,175,240', '190,80,255', '255,110,150', '61,220,132'];
  var blobs = COL.map(function(c){
    return {
      c: c, r: (0.22 + Math.random() * 0.2),
      fx: 0.012 + Math.random() * 0.02, fy: 0.010 + Math.random() * 0.02,
      px: Math.random() * 6.28, py: Math.random() * 6.28,
      gx: 0.005 + Math.random() * 0.01, gy: 0.005 + Math.random() * 0.01,
      a: 0.10 + Math.random() * 0.07
    };
  });
  function drawBlobs(t){
    ctx.globalCompositeOperation = 'lighter';
    var m = Math.max(W, H);
    blobs.forEach(function(b){
      var x = W * (0.5 + 0.42 * Math.sin(t * b.fx + b.px) + 0.12 * Math.sin(t * b.gx * 3 + b.py));
      var y = H * (0.5 + 0.42 * Math.sin(t * b.fy + b.py) + 0.12 * Math.cos(t * b.gy * 3 + b.px));
      var r = m * b.r * (1 + 0.15 * Math.sin(t * 0.04 + b.px));
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0,   'rgba(' + b.c + ',' + b.a + ')');
      g.addColorStop(0.5, 'rgba(' + b.c + ',' + (b.a * 0.35) + ')');
      g.addColorStop(1,   'rgba(' + b.c + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------- Lineas pixel art ----------
     Todo en coordenadas del lienzo (1 unidad = 1 pixel grande). Cada curva se
     recorre muestreada y los puntos consecutivos se unen con un DDA, asi no
     quedan huecos y los escalones son limpios. El color es un degradado que
     recorre la linea y rota con el tiempo (verde -> celeste -> violeta -> rosa). */
  function tono(t, u, i){                      // 150..330 grados, oscilando suave
    return 240 + 90 * Math.sin(t * 0.09 + u * 2.4 + i * 1.7);
  }
  function pix(x, y, fill){
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  function unir(x0, y0, x1, y1, fill){
    var dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (var k = 0; k <= n; k++) pix(x0 + dx * k / n, y0 + dy * k / n, fill);
  }
  /* curva(f, pasos, hue, a): f(u) -> [x, y] en pixeles del lienzo; hue(u) -> grados */
  function curva(f, pasos, hue, a){
    var prev = null;
    for (var s = 0; s <= pasos; s++){
      var u = s / pasos, p = f(u);
      var fill = 'hsla(' + hue(u).toFixed(0) + ',85%,64%,' + a + ')';
      var x = Math.round(p[0]), y = Math.round(p[1]);
      if (prev) unir(prev[0], prev[1], x, y, fill); else pix(x, y, fill);
      prev = [x, y];
    }
  }

  function lineas(t){
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var CW = ctx.canvas.width, CH = ctx.canvas.height;
    var e = CW / W;                          // css px -> pixeles del lienzo

    /* 3 ondas apiladas: y = base + A1 sin(k1 x + w1 t) + A2 sin(k2 x - w2 t) */
    var PROF = [0.05, 0.028, 0.04];      // opacidad por linea: unas mas lejanas que otras
    [0, 1, 2].forEach(function(i){
      var base = CH * (0.22 + i * 0.28), A1 = (34 + i * 10) * e, A2 = (18 + i * 6) * e;
      var k1 = 0.0042 + i * 0.0007, k2 = 0.0091 - i * 0.0008;
      curva(function(u){
        var x = u * CW, xc = x / e;
        return [x, base + A1 * Math.sin(k1 * xc + t * 0.21 + i) + A2 * Math.sin(k2 * xc - t * 0.34 + i * 2)];
      }, CW * 2, function(u){ return tono(t, u, i); }, PROF[i]);
    });

    /* 1 lissajous grande y lenta: x = A sin(a t + d), y = B sin(b t) */
    curva(function(u){
      var a = u * Math.PI * 2;
      return [CW * 0.5 + CW * 0.46 * Math.sin(3 * a + t * 0.05), CH * 0.5 + CH * 0.4 * Math.sin(2 * a)];
    }, 700, function(u){ return tono(t, u, 5); }, 0.022);

    /* 1 bezier cubica con puntos de control orbitando */
    var o = t * 0.1, y0 = CH * 0.5;
    var P0 = [-2, y0 + 40 * e * Math.sin(o)],
        P1 = [CW * 0.25 + 160 * e * Math.cos(o * 1.3), y0 - 220 * e * Math.sin(o)],
        P2 = [CW * 0.70 + 190 * e * Math.sin(o * 0.9), y0 + 240 * e * Math.cos(o * 1.1)],
        P3 = [CW + 2, y0 + 60 * e * Math.cos(o * 0.7)];
    curva(function(u){
      var v = 1 - u;
      return [
        v * v * v * P0[0] + 3 * v * v * u * P1[0] + 3 * v * u * u * P2[0] + u * u * u * P3[0],
        v * v * v * P0[1] + 3 * v * v * u * P1[1] + 3 * v * u * u * P2[1] + u * u * u * P3[1]
      ];
    }, 500, function(u){ return tono(t, u, 8); }, 0.035);

    ctx.restore();
  }

  /* ---------- Particulas ---------- */
  var PCOL = ['61,220,132', '88,101,242', '19,175,240', '190,80,255', '255,110,150', '255,190,90', '230,240,255'];
  var parts = [];
  for (var pi = 0; pi < 20; pi++){
    var blurK = Math.random();
    parts.push({
      c: PCOL[(Math.random() * PCOL.length) | 0],
      x0: Math.random(), y0: Math.random(),
      vx: (Math.random() - 0.5) * 0.010, vy: -0.004 - Math.random() * 0.012,
      ax: 8 + Math.random() * 26, ay: 8 + Math.random() * 26,
      fx: 0.1 + Math.random() * 0.25, fy: 0.1 + Math.random() * 0.25, ph: Math.random() * 6.28,
      r: 1 + Math.random() * 1.8 + blurK * 4.5,
      soft: 0.15 + blurK * 0.85,
      a: 0.12 + Math.random() * 0.22,
      tw: 0.2 + Math.random() * 0.5
    });
  }
  function particulas(t){
    parts.forEach(function(p){
      var R = p.r * 3.2;
      var x = (((p.x0 + p.vx * t) % 1) + 1) % 1 * W + p.ax * Math.sin(t * p.fx + p.ph);
      var y = (((p.y0 + p.vy * t) % 1) + 1) % 1 * H + p.ay * Math.cos(t * p.fy + p.ph);
      var a = p.a * (0.7 + 0.3 * Math.sin(t * p.tw + p.ph));
      var g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, 'rgba(' + p.c + ',' + a + ')');
      g.addColorStop(Math.max(0.05, 1 - p.soft), 'rgba(' + p.c + ',' + (a * 0.85) + ')');
      g.addColorStop(1, 'rgba(' + p.c + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.fill();
    });
  }

  /* ---------- Estrellas fugaces ----------
     Un pixel brillante con una estela pegada, que cruza el fondo y se apaga. Salen
     al azar, con colores distintos: unas rapidas y largas, otras lentas y cortas.
     El estado se avanza una sola vez por cuadro aunque haya varios lienzos. */
  var estrellas = [], ultimoMs = -1, ultimoSpawn = 0;
  var TONOS = [140, 170, 200, 260, 300, 330, 45];
  function nuevaEstrella(CW, CH){
    var rapida = Math.random() < 0.45;
    var vel = rapida ? 150 + Math.random() * 110 : 45 + Math.random() * 40;       // pixeles de lienzo por segundo
    // nace fuera de la pantalla, por un borde al azar, y apunta hacia un punto cualquiera
    // del interior: la direccion puede ser cualquiera (arriba, abajo, izquierda, derecha...)
    var lado = (Math.random() * 4) | 0, x, y;
    if (lado === 0){ x = Math.random() * CW; y = -4; }
    else if (lado === 1){ x = CW + 4; y = Math.random() * CH; }
    else if (lado === 2){ x = Math.random() * CW; y = CH + 4; }
    else { x = -4; y = Math.random() * CH; }
    var tx = CW * (0.1 + Math.random() * 0.8), ty = CH * (0.1 + Math.random() * 0.8);
    var ang = Math.atan2(ty - y, tx - x) + (Math.random() - 0.5) * 0.5;
    return {
      x: x, y: y,
      vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel,
      largo: rapida ? 10 + Math.floor(Math.random() * 12) : 4 + Math.floor(Math.random() * 6),
      h: TONOS[(Math.random() * TONOS.length) | 0],
      a: 0.55 + Math.random() * 0.4
    };
  }
  function avanzarEstrellas(ms, CW, CH){
    if (ms === ultimoMs) return;
    var dt = ultimoMs < 0 ? 0.05 : Math.min(0.1, (ms - ultimoMs) / 1000);
    ultimoMs = ms;
    if (ms - ultimoSpawn > 700 && estrellas.length < 5 && Math.random() < 0.18){
      estrellas.push(nuevaEstrella(CW, CH)); ultimoSpawn = ms;
    }
    estrellas.forEach(function(s){ s.x += s.vx * dt; s.y += s.vy * dt; });
    estrellas = estrellas.filter(function(s){ return s.x > -50 && s.x < CW + 50 && s.y > -50 && s.y < CH + 50; });
  }
  function dibujarEstrellas(){
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    estrellas.forEach(function(s){
      var vel = Math.sqrt(s.vx * s.vx + s.vy * s.vy), dx = s.vx / vel, dy = s.vy / vel;
      for (var k = s.largo; k >= 1; k--){                         // estela: se apaga hacia atras
        var f = 1 - k / (s.largo + 1);
        pix(s.x - dx * k, s.y - dy * k, 'hsla(' + s.h + ',90%,70%,' + (s.a * f * 0.7).toFixed(3) + ')');
      }
      pix(s.x, s.y, 'hsla(' + s.h + ',100%,88%,' + s.a.toFixed(3) + ')');   // la cabeza
    });
    ctx.restore();
  }

  function dibujar(ms){
    var t = ms / 1000;
    ctx.clearRect(0, 0, W, H);
    drawBlobs(t);
    particulas(t);
    lineas(t);
    avanzarEstrellas(ms, ctx.canvas.width, ctx.canvas.height);
    dibujarEstrellas();
  }

  function todos(ms){
    cvs.forEach(function(c){
      if (!c.getClientRects().length) return;      // oculto: no se dibuja
      ctx = c.__ctx;
      dibujar(ms);
    });
  }

  if (quieto){ todos(8000); return; }

  var ultimo = 0;
  function frame(ms){
    if (!document.hidden && ms - ultimo >= 50){ ultimo = ms; todos(ms); }   // ~20 fps
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
