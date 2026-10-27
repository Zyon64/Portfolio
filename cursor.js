/* ---------------------------------------------------------
   Cursor: silueta de flecha hecha solo con lineas verdes. Sin filtros ni
   efectos de fondo, asi sigue al mouse sin retraso. Solo con mouse.
   --------------------------------------------------------- */
(function(){
  if (!window.matchMedia('(pointer: fine)').matches) return;

  var el = document.createElement('div');
  el.className = 'cursor-flecha';
  el.innerHTML =
    '<svg viewBox="0 0 32 32" width="32" height="32"><path d="M3 2L3 23L8.4 18L12.2 26.2L15.8 24.6L12 16.6L19.4 16.6Z" ' +
    'fill="rgba(61,220,132,.12)" stroke="#3ddc84" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(el);

  var css = document.createElement('style');
  css.textContent =
    'html.cv-on,html.cv-on *{cursor:none!important}' +
    'html.cv-on input,html.cv-on textarea,html.cv-on select{cursor:text!important}' +
    '.cursor-flecha{position:fixed;left:0;top:0;width:32px;height:32px;margin:-3px 0 0 -2px;' +
    '  z-index:100001;pointer-events:none;opacity:0;will-change:transform;' +
    '  filter:drop-shadow(0 0 4px rgba(61,220,132,.55))}' +
    '.cursor-flecha.on{opacity:1}' +
    '.cursor-flecha.texto{opacity:0!important}' +
    '.cursor-flecha svg{display:block;transform-origin:3px 2px;transition:transform .2s cubic-bezier(.3,1.5,.5,1)}' +
    '.cursor-flecha.link svg{transform:scale(1.3)}' +
    '.cursor-flecha.down svg{transform:scale(.88)}';
  document.head.appendChild(css);

  var CLICK = 'a[href], button, .card, [role="button"], .cat, .item, .medio, .drop, select, summary, label';
  var visible = false;

  window.addEventListener('mousemove', function(e){
    el.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
    if (!visible){ visible = true; el.classList.add('on'); document.documentElement.classList.add('cv-on'); }
    var t = e.target;
    el.classList.toggle('link',  !!(t.closest && t.closest(CLICK)));
    el.classList.toggle('texto', !!(t.closest && t.closest('input[type=text], textarea')));
  }, { passive:true });
  window.addEventListener('mousedown', function(){ el.classList.add('down'); });
  window.addEventListener('mouseup',   function(){ el.classList.remove('down'); });
  document.addEventListener('mouseleave', function(){ visible = false; el.classList.remove('on'); });
})();
