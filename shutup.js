(function(){
  'use strict';

  var SEQ=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowLeft','ArrowLeft','ArrowRight','ArrowRight','ArrowRight'];
  var pos=0;
  var overlay=null;
  var lastFocus=null;

  function isTyping(el){
    if(!el) return false;
    var t=el.tagName;
    return t==='INPUT'||t==='TEXTAREA'||t==='SELECT'||el.isContentEditable;
  }

  function build(){
    if(overlay) return;

    var css=document.createElement('style');
    css.textContent=
      '.shutup-overlay[hidden]{display:none}'+
      '.shutup-overlay{position:fixed;top:0;right:0;bottom:0;left:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}'+
      '.shutup-back{position:absolute;top:0;right:0;bottom:0;left:0;background:rgba(4,6,10,.74);backdrop-filter:blur(8px);animation:shutupfade .2s ease-out}'+
      '.shutup-card{position:relative;width:min(440px,100%);text-align:center;background:linear-gradient(180deg,#11161e,#0d1117);'+
        'border:1px solid #1c2330;border-radius:22px;padding:56px 32px 52px;'+
        'box-shadow:0 40px 90px -30px rgba(0,0,0,.9),0 0 80px -30px rgba(59,130,246,.55);'+
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif}'+
      '.shutup-card h2{margin:0;font-size:clamp(38px,11vw,64px);line-height:1;font-weight:850;letter-spacing:-.05em;color:#eef2f7}'+
      '.shutup-x{position:absolute;top:12px;right:12px;width:32px;height:32px;display:grid;place-items:center;'+
        'border:0;border-radius:50%;background:transparent;color:#8b96a6;font-family:inherit;font-size:22px;line-height:1;cursor:pointer}'+
      '.shutup-x:hover{color:#eef2f7;background:rgba(255,255,255,.06)}'+
      '.shutup-x:focus-visible{outline:2px solid #3b82f6;outline-offset:3px}'+
      '@keyframes shutupfade{from{opacity:0}to{opacity:1}}';
    document.head.appendChild(css);

    overlay=document.createElement('div');
    overlay.className='shutup-overlay';
    overlay.hidden=true;
    overlay.innerHTML=
      '<div class="shutup-back" data-shutup-close></div>'+
      '<div class="shutup-card" role="dialog" aria-modal="true" aria-labelledby="shutupTitle">'+
        '<button class="shutup-x" type="button" aria-label="Close">&times;</button>'+
        '<h2 id="shutupTitle">shutup</h2>'+
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click',function(e){
      if(e.target&&(e.target.hasAttribute('data-shutup-close')||e.target.classList.contains('shutup-x'))) close();
    });
  }

  function open(){
    build();
    lastFocus=document.activeElement;
    overlay.hidden=false;
    document.body.style.overflow='hidden';
    var x=overlay.querySelector('.shutup-x');
    if(x) x.focus();
  }

  function close(){
    if(!overlay) return;
    overlay.hidden=true;
    document.body.style.overflow='';
    if(lastFocus&&lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener('keydown',function(e){
    if(e.repeat) return;
    if(overlay&&!overlay.hidden){
      if(e.key==='Escape') close();
      return;
    }
    if(isTyping(document.activeElement)) return;
    var k=e.key;
    if(k===SEQ[pos]){
      pos++;
      if(pos===SEQ.length){ pos=0; open(); }
    } else {
      pos=(k===SEQ[0])?1:0;
    }
  });
})();
