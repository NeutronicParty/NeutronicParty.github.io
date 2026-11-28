(function(){
  'use strict';

  var TRACKS=[
    '/audio/bombom.mp3',
    '/audio/hearmeniw.m4a',
    '/audio/life-could-be-a-dream.mp3'
  ];

  var idx=Math.floor(Math.random()*TRACKS.length);
  var audio=new Audio();
  audio.preload='auto';
  audio.volume=0.5;
  audio.src=TRACKS[idx];

  var unmuted=false;
  var slider=null;

  function removeUnmute(){
    ['pointerdown','keydown','touchstart','wheel','scroll'].forEach(function(t){
      document.removeEventListener(t,unmute,true);
    });
  }

  function currentVolume(){
    return slider?parseFloat(slider.value):0.5;
  }

  function unmute(){
    if(unmuted) return;
    unmuted=true;
    if(currentVolume()>0) audio.muted=false;
    audio.volume=currentVolume();
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

  function playCurrent(){
    audio.muted=false;
    audio.volume=currentVolume();
    if(audio.volume<=0) audio.muted=true;
    var p=audio.play();
    if(p&&typeof p.catch==='function') p.catch(function(){});
    unmuted=true;
    removeUnmute();
  }

  function step(dir){
    idx=(idx+dir+TRACKS.length)%TRACKS.length;
    audio.src=TRACKS[idx];
    playCurrent();
  }

  function buildUI(){
    if(document.getElementById('musicBar')) return;

    var css=document.createElement('style');
    css.textContent=
      '#musicBar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9000;'+
        'display:flex;align-items:center;gap:4px;padding:5px 10px 5px 5px;border-radius:999px;'+
        'background:rgba(8,10,14,.82);border:1px solid rgba(231,238,248,.14);'+
        'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);'+
        'box-shadow:0 14px 34px -16px rgba(0,0,0,.9);'+
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}'+
      '#musicBar button{display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:50%;'+
        'background:transparent;color:#c9d5e3;cursor:pointer;transition:background .15s,color .15s}'+
      '#musicBar button:hover{background:rgba(231,238,248,.1);color:#eef2f7}'+
      '#musicBar button:active{transform:scale(.94)}'+
      '#musicBar button:focus-visible{outline:2px solid #e7eef8;outline-offset:2px}'+
      '#musicBar input[type=range]{-webkit-appearance:none;appearance:none;width:84px;height:34px;'+
        'background:transparent;cursor:pointer;margin:0 2px}'+
      '#musicBar input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:rgba(231,238,248,.22)}'+
      '#musicBar input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:12px;height:12px;'+
        'margin-top:-4px;border-radius:50%;background:#e7eef8;box-shadow:0 0 0 3px rgba(231,238,248,.15)}'+
      '#musicBar input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:rgba(231,238,248,.22)}'+
      '#musicBar input[type=range]::-moz-range-thumb{width:12px;height:12px;border:0;border-radius:50%;background:#e7eef8}';
    document.head.appendChild(css);

    var prevSvg='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zM20 6v12L9 12z"/></svg>';
    var nextSvg='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M16 6h2v12h-2zM4 6l11 6L4 18z"/></svg>';

    var bar=document.createElement('div');
    bar.id='musicBar';
    bar.setAttribute('role','group');
    bar.setAttribute('aria-label','Music player');
    bar.innerHTML=
      '<button type="button" id="musicPrev" aria-label="Previous song" title="Previous song">'+prevSvg+'</button>'+
      '<button type="button" id="musicNext" aria-label="Next song" title="Next song">'+nextSvg+'</button>'+
      '<input id="musicVol" type="range" min="0.15" max="1" step="0.01" value="0.5" aria-label="Volume">';
    document.body.appendChild(bar);

    slider=document.getElementById('musicVol');
    document.getElementById('musicPrev').addEventListener('click',function(){ step(-1); });
    document.getElementById('musicNext').addEventListener('click',function(){ step(1); });
    slider.addEventListener('input',function(){
      var v=parseFloat(slider.value);
      audio.volume=v;
      if(v>0){
        audio.muted=false;
        if(audio.paused){
          var p=audio.play();
          if(p&&typeof p.catch==='function') p.catch(function(){});
        }
      }else{
        audio.muted=true;
      }
    });
  }

  buildUI();
  attempt();
})();
