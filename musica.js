/* ---------------------------------------------------------
   Musica de fondo. Busca el archivo en audio/musica.(mp3|ogg|wav); si no existe,
   no aparece nada. Los navegadores NO dejan sonar audio hasta que el visitante
   interactua, asi que arranca con el primer click / tecla / toque en la pagina
   (con un fade-in suave) y el boton ♪ de la esquina la silencia o la reanuda.
   El archivo no se descarga hasta ese primer gesto, para no frenar la carga.
   --------------------------------------------------------- */
(function(){
  var FUENTES = [['audio/musica.mp3', 'audio/mpeg'], ['audio/musica.ogg', 'audio/ogg'], ['audio/musica.wav', 'audio/wav']];
  var VOL = 0.32;

  /* HEAD a cada formato: si no hay ningun archivo, no se crea nada (ni el boton) */
  var audio = document.createElement('audio');
  audio.loop = true; audio.preload = 'none'; audio.volume = 0;
  var existe = true, boton = null;
  function falta(){ existe = false; if (boton) boton.remove(); }

  var candidatos = FUENTES.filter(function(f){ return audio.canPlayType(f[1]); });
  (function buscar(i){
    if (i >= candidatos.length) return;
    fetch(candidatos[i][0], { method:'HEAD' }).then(function(r){
      if (r.ok){ audio.src = candidatos[i][0]; iniciar(); } else buscar(i + 1);
    }, function(){ buscar(i + 1); });
  })(0);

  function iniciar(){

  var apagada = false;                                 // el visitante la silencio a proposito
  try { apagada = localStorage.getItem('musica') === 'off'; } catch(e){}

  boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'replay musica' + (apagada ? ' off' : '');
  boton.title = 'Music'; boton.setAttribute('aria-label', 'Music on/off');
  document.body.appendChild(boton);

  var fade = 0;
  function volumen(objetivo, ms, fin){
    cancelAnimationFrame(fade);
    var v0 = audio.volume, t0 = performance.now();
    (function paso(now){
      var k = Math.min(1, (now - t0) / ms);
      audio.volume = v0 + (objetivo - v0) * k;
      if (k < 1) fade = requestAnimationFrame(paso); else if (fin) fin();
    })(t0);
  }

  function sonar(){
    if (!existe) return;
    var p = audio.play();
    if (p && p.then) p.then(function(){ volumen(VOL, 2200); }, function(){});
    boton.classList.remove('off');
    try { localStorage.setItem('musica', 'on'); } catch(e){}
  }
  function callar(){
    boton.classList.add('off');
    try { localStorage.setItem('musica', 'off'); } catch(e){}
    volumen(0, 500, function(){ audio.pause(); });
  }

  boton.addEventListener('click', function(e){
    e.stopPropagation();
    if (audio.paused) sonar(); else callar();
  });

  /* primer gesto del visitante: arranca (si no la habia silenciado antes) */
  var arrancada = false;
  function primerGesto(e){
    if (arrancada) return;
    if (e.target && e.target.closest && e.target.closest('.musica')) return;   // el boton maneja lo suyo
    arrancada = true;
    ['pointerdown', 'keydown', 'touchstart'].forEach(function(t){ window.removeEventListener(t, primerGesto, true); });
    if (!apagada) sonar();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function(t){ window.addEventListener(t, primerGesto, true); });

  /* en otra pestaña no tiene que seguir sonando */
  document.addEventListener('visibilitychange', function(){
    if (document.hidden){ if (!audio.paused) audio.pause(); }
    else if (arrancada && !apagada && boton && !boton.classList.contains('off') && existe) audio.play().catch(function(){});
  });
  }
})();
