/* ---------------------------------------------------------
   Fondo vivo: curvas matematicas (ondas apiladas, lissajous,
   beziers con puntos de control orbitando) y cumulos de color
   borrosos y semitransparentes que derivan muy lento al azar.
   --------------------------------------------------------- */
(function(){
  // una pagina puede tener varios lienzos (p.ej. el panel de detalle): todos dibujan lo mismo
  var cvs = Array.prototype.slice.call(document.querySelectorAll('canvas.fondo'));
  if (!cvs.length) return;
  var ctx = cvs[0].getContext('2d');
  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, dpr = 1;

  function resize(){
    dpr = 0.18;   // resolucion muy baja a proposito: cada pixel del lienzo mide ~5 px en pantalla (efecto pixel art)
    W = window.innerWidth; H = window.innerHeight;
    cvs.forEach(function(c){
      c.width = W * dpr; c.height = H * dpr;
      c.style.width = W + 'px'; c.style.height = H + 'px';
      c.__ctx = c.__ctx || c.getContext('2d');
      c.__ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }
  resize();
  window.addEventListener('resize', resize);

  /* Cumulos: cada uno con su propia semilla de movimiento (suma de senos
     de periodos largos y distintos = deriva lenta que parece azar). */
  var COL = ['61,220,132','88,101,242','19,175,240','190,80,255','255,110,150','61,220,132'];
  var blobs = COL.map(function(c, i){
    return {
      c:c, r:(0.22 + Math.random() * 0.2),
      fx:0.012 + Math.random() * 0.02, fy:0.010 + Math.random() * 0.02,
      px:Math.random() * 6.28, py:Math.random() * 6.28,
      gx:0.005 + Math.random() * 0.01, gy:0.005 + Math.random() * 0.01,
      a:0.10 + Math.random() * 0.07
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

  function stroke(rgb, a, w){
    ctx.strokeStyle = 'rgba(' + rgb + ',' + a + ')';
    ctx.lineWidth = w * 5;
    ctx.stroke();
  }

  /* Ondas apiladas: y = c + A1 sin(k1 x + w1 t) + A2 sin(k2 x - w2 t) */
  function ondas(t){
    var N = 5;
    for (var i = 0; i < N; i++){
      var base = H * (0.15 + i * 0.17);
      var A1 = 38 + i * 9, A2 = 20 + i * 5;
      var k1 = 0.0042 + i * 0.0006, k2 = 0.0091 - i * 0.0007;
      ctx.beginPath();
      for (var x = -10; x <= W + 10; x += 28){
        var y = base + A1 * Math.sin(k1 * x + t * 0.21 + i) + A2 * Math.sin(k2 * x - t * 0.34 + i * 2);
        if (x === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      stroke(i % 2 ? '61,220,132' : '19,175,240', 0.15, 1);
    }
  }

  /* Lissajous grande y lenta: x = A sin(a t + d), y = B sin(b t) */
  function lissajous(t){
    var cx = W * 0.5, cy = H * 0.5, A = W * 0.46, B = H * 0.4;
    for (var k = 0; k < 2; k++){
      ctx.beginPath();
      var a = 3 + k, b = 2 + k * 3, d = t * 0.05 + k;
      for (var s = 0; s <= 220; s++){
        var u = s / 220 * Math.PI * 2;
        var x = cx + A * Math.sin(a * u + d), y = cy + B * Math.sin(b * u);
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      stroke(k ? '190,80,255' : '88,101,242', 0.10, 1);
    }
  }

  /* Beziers cubicas cuyos puntos de control orbitan en elipses */
  function beziers(t){
    for (var i = 0; i < 3; i++){
      var o = t * (0.09 + i * 0.03) + i * 2.1;
      var y0 = H * (0.25 + i * 0.25);
      ctx.beginPath();
      ctx.moveTo(-20, y0 + 40 * Math.sin(o));
      ctx.bezierCurveTo(
        W * 0.25 + 160 * Math.cos(o * 1.3), y0 - 220 * Math.sin(o),
        W * 0.70 + 190 * Math.sin(o * 0.9), y0 + 240 * Math.cos(o * 1.1),
        W + 20, y0 + 60 * Math.cos(o * 0.7)
      );
      stroke(i === 1 ? '255,110,150' : '61,220,132', 0.12, 1.2);
    }
  }

  /* Particulas de colores con distinto grado de blur: las mas "nitidas" son
     chicas con borde duro; las desenfocadas, grandes con caida suave.
     Posicion analitica (deriva + oscilacion), sin estado entre cuadros. */
  var PCOL = ['61,220,132','88,101,242','19,175,240','190,80,255','255,110,150','255,190,90','230,240,255'];
  var parts = [];
  for (var pi = 0; pi < 20; pi++){
    var blurK = Math.random();                       // 0 nitida .. 1 muy borrosa
    parts.push({
      c:PCOL[(Math.random() * PCOL.length) | 0],
      x0:Math.random(), y0:Math.random(),
      vx:(Math.random() - 0.5) * 0.010, vy:-0.004 - Math.random() * 0.012,
      ax:8 + Math.random() * 26, ay:8 + Math.random() * 26,
      fx:0.1 + Math.random() * 0.25, fy:0.1 + Math.random() * 0.25, ph:Math.random() * 6.28,
      r:1 + Math.random() * 1.8 + blurK * 4.5,
      soft:0.15 + blurK * 0.85,
      a:0.12 + Math.random() * 0.22,
      tw:0.2 + Math.random() * 0.5
    });
  }
  function particulas(t){
    parts.forEach(function(p){
      var R = p.r * 3.2;   // el lienzo es de baja resolucion: se agrandan para que no desaparezcan
      var x = (((p.x0 + p.vx * t) % 1) + 1) % 1 * W + p.ax * Math.sin(t * p.fx + p.ph);
      var y = (((p.y0 + p.vy * t) % 1) + 1) % 1 * H + p.ay * Math.cos(t * p.fy + p.ph);
      var a = p.a * (0.7 + 0.3 * Math.sin(t * p.tw + p.ph));
      var g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0,                    'rgba(' + p.c + ',' + a + ')');
      g.addColorStop(Math.max(0.05, 1 - p.soft), 'rgba(' + p.c + ',' + (a * 0.85) + ')');
      g.addColorStop(1,                    'rgba(' + p.c + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.fill();
    });
  }

  function dibujar(ms){
    var t = ms / 1000;
    ctx.clearRect(0, 0, W, H);
    drawBlobs(t);
    ondas(t);
    lissajous(t);
    beziers(t);
    particulas(t);
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
