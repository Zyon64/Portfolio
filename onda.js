/* ---------------------------------------------------------
   Onda de click: al presionar algo interactuable cae una "gota": un anillo
   que se expande desde el punto del click y REFRACTA lo que hay detras
   (cresta y valle, como el agua), seguido de un segundo anillo mas debil.
   Se usa un mapa de desplazamiento radial dentro de backdrop-filter.
   --------------------------------------------------------- */
(function(){
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(pointer: fine)').matches) return;

  var S = 128;
  function mapa(){
    var c = document.createElement('canvas'); c.width = c.height = S;
    var x = c.getContext('2d'), im = x.createImageData(S, S), d = im.data;
    for (var j = 0; j < S; j++) for (var i = 0; i < S; i++){
      var dx = (i + 0.5 - S/2) / (S/2), dy = (j + 0.5 - S/2) / (S/2);
      var r = Math.sqrt(dx*dx + dy*dy), f = 0;
      // UN solo aro suave (como un perfil de onda): cresta y valle en una banda continua
      var t = (r - 0.50) / 0.42;
      if (t > 0 && t < 1) f = Math.sin(t * Math.PI * 2) * Math.pow(Math.sin(t * Math.PI), 0.6);
      var ux = r ? dx / r : 0, uy = r ? dy / r : 0;
      var k = (j * S + i) * 4;
      d[k]   = 128 + 127 * ux * f;
      d[k+1] = 128 + 127 * uy * f;
      d[k+2] = 128; d[k+3] = 255;
    }
    x.putImageData(im, 0, 0);
    return c.toDataURL();
  }

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;pointer-events:none';
  svg.innerHTML =
    '<filter id="onda-ref" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
    '<feImage href="' + mapa() + '" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="m"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="m" scale="46" xChannelSelector="R" yChannelSelector="G"/></filter>';
  document.body.appendChild(svg);

  var css = document.createElement('style');
  css.textContent =
    '.onda-gota{position:fixed;left:0;top:0;width:230px;height:230px;margin:-115px 0 0 -115px;' +
    '  z-index:100000;pointer-events:none;border-radius:50%;' +
    '  backdrop-filter:url(#onda-ref) saturate(1.2);-webkit-backdrop-filter:url(#onda-ref) saturate(1.2);' +
    '  will-change:transform,opacity}';
  document.head.appendChild(css);

  var CLICK = 'a[href], button, .card, [role="button"], .cat, .item, .medio, .drop, select, summary, label';

  function gota(x, y){
    var el = document.createElement('div');
    el.className = 'onda-gota';
    el.style.left = x + 'px'; el.style.top = y + 'px';
    document.body.appendChild(el);
    var a = el.animate([
      { transform:'scale(.08)', opacity:1,   offset:0 },
      { transform:'scale(.6)',  opacity:.55, offset:.5 },
      { transform:'scale(1)',   opacity:0,   offset:1 }
    ], { duration:850, easing:'cubic-bezier(.2,.7,.3,1)', fill:'both' });
    var fin = function(){ el.remove(); };
    a.finished.then(fin, fin);
  }

  window.addEventListener('mousedown', function(e){
    if (e.button !== 0) return;
    var t = e.target;
    if (!t.closest || !t.closest(CLICK)) return;
    if (t.closest('.vc-bar, .z-pie')) return;        // nada de onda en los controles de video ni en la Z
    gota(e.clientX, e.clientY);
  }, { passive:true });
})();
