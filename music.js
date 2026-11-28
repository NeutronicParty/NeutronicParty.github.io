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

  var unmuted=false;

  function removeUnmute(){
    ['pointerdown','keydown','touchstart','wheel','scroll'].forEach(function(t){
      document.removeEventListener(t,unmute,true);
    });
  }

  function unmute(){
    if(unmuted) return;
    unmuted=true;
    audio.muted=false;
    audio.volume=0.5;
    if(audio.paused){
      var p=audio.play();
      if(p&&typeof p.catch==='function') p.catch(function(){});
    }
    removeUnmute();
  }

  function armUnmute(){
    ['pointerdown','keydown','touchstart','wheel','scroll'].forEach(function(t){
      document.addEventListener(t,unmute,true);
    });
  }

  function attempt(){
    var p=audio.play();
    if(p&&typeof p.then==='function'){
      p.then(function(){ unmuted=true; removeUnmute(); }).catch(function(){
        audio.muted=true;
        var q=audio.play();
        if(q&&typeof q.catch==='function') q.catch(function(){});
        armUnmute();
      });
    }else{
      unmuted=true;
    }
  }

  attempt();
})();
