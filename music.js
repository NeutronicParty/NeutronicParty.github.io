(function(){
  'use strict';

  var TRACKS=[
    '/audio/bombom.mp3',
    '/audio/hearmeniw.m4a',
    '/audio/life-could-be-a-dream.mp3'
  ];

  var audio=new Audio();
  audio.preload='auto';
  audio.volume=0.5;
  audio.src=TRACKS[Math.floor(Math.random()*TRACKS.length)];

  var started=false;

  function cleanup(){
    document.removeEventListener('pointerdown',start,true);
    document.removeEventListener('keydown',start,true);
    document.removeEventListener('touchstart',start,true);
  }

  function start(){
    if(started) return;
    var p=audio.play();
    if(p&&typeof p.then==='function'){
      p.then(function(){ started=true; cleanup(); }).catch(function(){});
    }else{
      started=true;
      cleanup();
    }
  }

  document.addEventListener('pointerdown',start,true);
  document.addEventListener('keydown',start,true);
  document.addEventListener('touchstart',start,true);

  start();
})();
