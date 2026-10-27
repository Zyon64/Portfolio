/* ---------------------------------------------------------
   Rastro del cursor en pixel art: al mover el mouse se dibuja una linea de pixeles
   (mismo estilo que las lineas del fondo). Pasado ~1 s cada pixel empieza a
   desvanecerse por su cuenta, en orden aleatorio, y mientras se apaga se estira un
   poco. Asi se puede dibujar rapido antes de que desaparezca.
   El lienzo es de baja resolucion (1 pixel = 1 celda) y se amplia sin suavizar.
   --------------------------------------------------------- */
(function(){
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var CELDA = 6;            // tamaño de cada pixel en pantalla
  var RETENER = 1000;       // ms que la linea se mantiene entera
  var DESVANECER = 450;     // ms que tarda cada pixel en apagarse
  var DISPERSION = 450;     // el momento en que empieza a apagarse varia hasta este tanto

  var cv = document.createElement('canvas');
  cv.id = 'rastro';
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99990;pointer-events:none;' +
                     'image-rendering:crisp-edges;image-rendering:pixelated';
  document.body.appendChild(cv);
  var ctx = cv.getContext('2d');
  var W = 0, H = 0;
  function medir(){
    W = Math.ceil(window.innerWidth / CELDA); H = Math.ceil(window.innerHeight / CELDA);
    cv.width = W; cv.height = H;
    cv.style.width = (W * CELDA) + 'px'; cv.style.height = (H * CELDA) + 'px';
  }
  medir();
  window.addEventListener('resize', medir);

  var celdas = new Map(), ultimo = null, corre = false;

  function poner(x, y, tono, ahora){
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    celdas.set(y * W + x, { x:x, y:y, b:ahora, h:tono, j:Math.random() });
  }
  function unir(x0, y0, x1, y1, tono, ahora){
    var dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (var k = 0; k <= n; k++) poner(Math.round(x0 + dx * k / n), Math.round(y0 + dy * k / n), tono, ahora);
  }

  window.addEventListener('mousemove', function(e){
    var ahora = performance.now();
    var cx = Math.floor(e.clientX / CELDA), cy = Math.floor(e.clientY / CELDA);
    var tono = 240 + 90 * Math.sin(ahora / 520);          // el degradado de color recorre el trazo
    if (ultimo) unir(ultimo[0], ultimo[1], cx, cy, tono, ahora); else poner(cx, cy, tono, ahora);
    ultimo = [cx, cy];
    if (!corre){ corre = true; requestAnimationFrame(frame); }
  }, { passive:true });
  document.addEventListener('mouseleave', function(){ ultimo = null; });

  function frame(ahora){
    ctx.clearRect(0, 0, W, H);
    celdas.forEach(function(c, key){
      var edad = ahora - c.b, inicio = RETENER + c.j * DISPERSION;
      if (edad > inicio + DESVANECER){ celdas.delete(key); return; }
      var f = edad < inicio ? 0 : (edad - inicio) / DESVANECER;       // 0 entero .. 1 apagado
      var ancho = 1 + Math.floor(f * 2.2), alto = 1 + Math.floor(f * 3.2);   // se estira al apagarse
      ctx.fillStyle = 'hsla(' + c.h.toFixed(0) + ',85%,66%,' + ((1 - f) * 0.9).toFixed(3) + ')';
      ctx.fillRect(c.x - Math.floor((ancho - 1) / 2), c.y - Math.floor((alto - 1) / 2), ancho, alto);
    });
    if (celdas.size) requestAnimationFrame(frame);
    else { corre = false; ctx.clearRect(0, 0, W, H); }
  }
})();
