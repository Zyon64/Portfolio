/* ---------------------------------------------------------
   Refraccion con relieve: a cada pieza de vidrio se le genera un mapa de
   desplazamiento segun SU forma (rectangulo redondeado / pastilla). Se
   modela como una losa con borde biselado: el campo de distancia al
   borde da la altura, y la luz de fondo se desvia segun la pendiente.
   --------------------------------------------------------- */
(function(){
  var CFG   = window.VIDRIO || {};
  var SEL   = CFG.sel   || '';
  var PANEL = CFG.panel || '';
  if (PANEL) SEL += (SEL ? ',' : '') + PANEL;
  if (!SEL) return;
  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;pointer-events:none';
  document.body.appendChild(svg);

  var cache = {}, n = 0;

  /* Mapa: R/G = direccion hacia adentro * intensidad del bisel */
  function mapa(w, h, r, bw){
    var sc = Math.min(1, 160 / Math.max(w, h));
    var cw = Math.max(2, Math.round(w * sc)), ch = Math.max(2, Math.round(h * sc));
    var rr = r * sc, b = Math.max(1, bw * sc);
    var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var c = cv.getContext('2d'), im = c.createImageData(cw, ch), d = im.data;
    var hx = cw / 2, hy = ch / 2;
    for (var y = 0; y < ch; y++){
      for (var x = 0; x < cw; x++){
        var px = x + 0.5 - hx, py = y + 0.5 - hy;
        var qx = Math.abs(px) - (hx - rr), qy = Math.abs(py) - (hy - rr);
        var ox = Math.max(qx, 0), oy = Math.max(qy, 0), len = Math.sqrt(ox * ox + oy * oy);
        var sd = len + Math.min(Math.max(qx, qy), 0) - rr;        // <0 dentro
        var nx, ny;                                              // normal hacia afuera
        if (len > 0){ nx = ox / len * (px < 0 ? -1 : 1); ny = oy / len * (py < 0 ? -1 : 1); }
        else if (qx > qy){ nx = px < 0 ? -1 : 1; ny = 0; }
        else { nx = 0; ny = py < 0 ? -1 : 1; }
        var t = Math.min(1, Math.max(0, -sd) / b);               // 0 borde .. 1 centro
        var f = sd > 0 ? 0 : Math.pow(1 - t, 1.7);               // pendiente del bisel
        var i = (y * cw + x) * 4;
        d[i]     = 128 - 127 * nx * f;    // hacia adentro = opuesto a la normal
        d[i + 1] = 128 - 127 * ny * f;
        d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    c.putImageData(im, 0, 0);
    return cv.toDataURL();
  }

  function filtro(w, h, r){
    var key = w + 'x' + h + 'r' + r;
    if (cache[key]) return cache[key];
    var bw = Math.max(4, Math.min(16, Math.min(w, h) / 2.2));
    var id = 'lgf' + (n++);
    var f = document.createElementNS(NS, 'filter');
    f.setAttribute('id', id);
    f.setAttribute('x', '0'); f.setAttribute('y', '0');
    f.setAttribute('width', '100%'); f.setAttribute('height', '100%');
    f.setAttribute('color-interpolation-filters', 'sRGB');
    var im = document.createElementNS(NS, 'feImage');
    im.setAttribute('x', '0'); im.setAttribute('y', '0');
    im.setAttribute('width', '100%'); im.setAttribute('height', '100%');
    im.setAttribute('preserveAspectRatio', 'none');
    im.setAttribute('result', 'm');
    im.setAttribute('href', mapa(w, h, r, bw));
    var dm = document.createElementNS(NS, 'feDisplacementMap');
    dm.setAttribute('in', 'SourceGraphic'); dm.setAttribute('in2', 'm');
    dm.setAttribute('scale', String(Math.max(12, Math.min(44, bw * 2.6))));
    dm.setAttribute('xChannelSelector', 'R'); dm.setAttribute('yChannelSelector', 'G');
    f.appendChild(im); f.appendChild(dm); svg.appendChild(f);
    return (cache[key] = id);
  }

  function aplicar(el){
    if (el.__fuera) return;
    var w = el.offsetWidth, h = el.offsetHeight;
    if (w < 4 || h < 4) return;
    var q = function(v){ return Math.round(v / 4) * 4; };
    var r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    r = Math.min(r, Math.min(w, h) / 2);
    var id = filtro(q(w), q(h), q(r));
    var blur = 1;   // mismo valor en todo el vidrio
    var v = 'url(#' + id + ') blur(' + blur + 'px) saturate(1.5) brightness(1.06)';
    if (PANEL && el.matches(PANEL)) el.style.setProperty('--lgf', 'url(#' + id + ')');
    else { el.style.backdropFilter = v; el.style.webkitBackdropFilter = v; }
  }

  window.vidrioAplicar = aplicar;   // para piezas creadas desde fuera (p.ej. el cursor)

  var ro = ('ResizeObserver' in window) ? new ResizeObserver(function(es){
    es.forEach(function(e){ aplicar(e.target); });
  }) : null;
  var visto = new WeakSet();

  /* Lo que esta fuera de pantalla no necesita filtro: se apaga y se prende al volver */
  var vio = ('IntersectionObserver' in window) ? new IntersectionObserver(function(es){
    es.forEach(function(e){
      var el = e.target;
      if (e.isIntersecting){ if (el.__fuera){ el.__fuera = false; aplicar(el); } }
      else if (!el.__fuera){
        el.__fuera = true;
        if (PANEL && el.matches(PANEL)) el.style.setProperty('--lgf', 'none');
        else { el.style.backdropFilter = 'none'; el.style.webkitBackdropFilter = 'none'; }
      }
    });
  }, { rootMargin:'200px' }) : null;

  function enganchar(el){
    if (visto.has(el)) return;
    visto.add(el);
    aplicar(el);
    if (ro) ro.observe(el);
    if (vio) vio.observe(el);
  }
  function barrer(raiz){
    if (raiz.nodeType !== 1) return;
    if (raiz.matches(SEL)) enganchar(raiz);
    Array.prototype.forEach.call(raiz.querySelectorAll(SEL), enganchar);
  }

  barrer(document.body);
  new MutationObserver(function(ms){
    ms.forEach(function(m){ Array.prototype.forEach.call(m.addedNodes, barrer); });
  }).observe(document.body, { childList:true, subtree:true });
})();
