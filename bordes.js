/* ---------------------------------------------------------
   Brillo de borde: al empujar contra el tope o el final de CUALQUIER zona
   con scroll (la pagina, el panel de detalle, la lista del editor...) sale
   una onda difusa desde el borde, controlada por la rueda, que se deshace
   hacia adentro. Se dibuja debajo de todo (canvas.bordes), asi el vidrio
   la refracta. El bucle de dibujo solo corre mientras hay algo animandose.
   --------------------------------------------------------- */
(function(){
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var cvs = Array.prototype.slice.call(document.querySelectorAll('canvas.bordes'));
  if (!cvs.length) return;

  var W = 0, H = 0, dpr = 1;
  function resize(){
    dpr = 0.75;
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

  var edge  = { top:0, bottom:0 };
  var wave  = { top:[], bottom:[] };
  var bandOf = function(v){ return 210 * (1 - Math.pow(1 - v, 2.2)); };
  var corriendo = false;

  /* Zona con scroll bajo el cursor: el ancestro desplazable mas cercano */
  function zona(el){
    while (el && el !== document.body && el !== document.documentElement){
      var s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
      el = el.parentElement;
    }
    return null;
  }
  function enTope(z){ return z ? z.scrollTop <= 0 : window.scrollY <= 0; }
  function enFondo(z){
    if (z) return z.scrollTop + z.clientHeight >= z.scrollHeight - 1;
    var d = document.documentElement;
    return window.scrollY + window.innerHeight >= d.scrollHeight - 1;
  }

  function empujar(side, cantidad){
    cantidad *= 2;
    edge[side] = Math.min(1, edge[side] + Math.min(cantidad / 700, 0.22));
    var reach = bandOf(edge[side]) * 0.8, amp = Math.min(1, edge[side] + 0.2);
    var ws = wave[side], ult = ws[ws.length - 1];
    if (ult && ult.s < 0.2){ ult.reach = Math.max(ult.reach, reach); ult.amp = Math.max(ult.amp, amp); }
    else if (ws.length < 6) ws.push({ s:0, reach:reach, amp:amp });
    arrancar();
  }

  window.addEventListener('wheel', function(e){
    var z = zona(e.target);
    if (e.deltaY < 0 && enTope(z))  empujar('top',    -e.deltaY);
    if (e.deltaY > 0 && enFondo(z)) empujar('bottom',  e.deltaY);
  }, { passive:true });

  var ty = 0, tz = null;
  window.addEventListener('touchstart', function(e){ ty = e.touches[0].clientY; tz = zona(e.target); }, { passive:true });
  window.addEventListener('touchmove', function(e){
    var y = e.touches[0].clientY, dy = y - ty; ty = y;
    if (dy > 0 && enTope(tz))  empujar('top',    dy * 4);
    if (dy < 0 && enFondo(tz)) empujar('bottom', -dy * 4);
  }, { passive:true });

  function dibujar(ctx, side){
    var top = (side === 'top'), ws = wave[side];
    for (var i = 0; i < ws.length; i++){
      var w = ws[i];
      var k = 1 - Math.pow(1 - w.s, 3);
      var pos = w.reach * k, wid = w.reach * (0.45 + 0.5 * k);
      var a = w.amp * Math.pow(1 - w.s, 1.6);
      var yc = top ? pos : H - pos;
      var g = ctx.createLinearGradient(0, yc - wid, 0, yc + wid);
      g.addColorStop(0,   'rgba(61,220,132,0)');
      g.addColorStop(0.5, 'rgba(61,220,132,' + (0.42 * a) + ')');
      g.addColorStop(1,   'rgba(61,220,132,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, yc - wid, W, wid * 2);
    }
  }

  function frame(){
    var vivo = false;
    ['top', 'bottom'].forEach(function(s){
      wave[s].forEach(function(w){ w.s = Math.min(1, w.s + 0.07); });
      wave[s] = wave[s].filter(function(w){ return w.s < 1; });
      edge[s] *= 0.9;
      if (edge[s] < 0.004) edge[s] = 0;
      if (wave[s].length || edge[s]) vivo = true;
    });
    cvs.forEach(function(c){
      if (!c.getClientRects().length) return;
      c.__ctx.clearRect(0, 0, W, H);
      dibujar(c.__ctx, 'top'); dibujar(c.__ctx, 'bottom');
    });
    if (vivo) requestAnimationFrame(frame);
    else { corriendo = false; cvs.forEach(function(c){ if (c.__ctx) c.__ctx.clearRect(0, 0, W, H); }); }
  }
  function arrancar(){ if (!corriendo){ corriendo = true; requestAnimationFrame(frame); } }
})();
