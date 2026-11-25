(function(){
  function injectModal(){
    if(document.getElementById('newsModal')) return;
    var d=document.createElement('div');
    d.className='newsmodal';
    d.id='newsModal';
    d.hidden=true;
    d.innerHTML='<div class="news-back" data-newsclose></div>'+
      '<div class="news-card" role="dialog" aria-modal="true" aria-labelledby="newsTitle">'+
        '<button class="mail-x" id="newsClose" type="button" aria-label="Close">&times;</button>'+
        '<div class="news-head">'+
          '<img class="news-avatar" src="/team-neutronic.webp" alt="Neutronic profile picture">'+
          '<div><h3 id="newsTitle">Neutronic</h3><span class="news-sub">Developer</span></div>'+
        '</div>'+
        '<div class="news-msg loading" id="newsMsg">Loading the latest news…</div>'+
      '</div>';
    document.body.appendChild(d);
  }

  function wire(){
    var btn=document.getElementById('newsBtn');
    var modal=document.getElementById('newsModal');
    var closeBtn=document.getElementById('newsClose');
    var msg=document.getElementById('newsMsg');
    if(!btn||!modal||!msg||btn.dataset.newsWired) return;
    btn.dataset.newsWired='1';

    var SRC='https://pastebin.com/raw/B4hfW0iV';
    var cached=null;
    var loading=false;
    var lastFocus=null;

    function clean(t){
      t=String(t||'').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();
      return t;
    }

    function looksLikeHtml(t){
      return /^\s*<(?:!doctype|html|head|body)/i.test(t);
    }

    function direct(){
      return fetch(SRC+'?cb='+Date.now(),{cache:'no-store'}).then(function(r){
        if(!r.ok) throw new Error('http '+r.status);
        return r.text();
      });
    }

    function jina(){
      return fetch('https://r.jina.ai/'+SRC+'?cb='+Date.now()).then(function(r){
        if(!r.ok) throw new Error('http '+r.status);
        return r.text();
      }).then(function(t){
        var i=t.indexOf('Markdown Content:');
        return i>=0 ? t.slice(i+'Markdown Content:'.length) : t;
      });
    }

    function allorigins(){
      return fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(SRC)).then(function(r){
        if(!r.ok) throw new Error('http '+r.status);
        return r.text();
      });
    }

    function getNews(){
      if(typeof fetch!=='function') return Promise.reject(new Error('no fetch'));
      var chain=[direct,jina,allorigins];
      function attempt(i){
        if(i>=chain.length) return Promise.reject(new Error('all sources failed'));
        return chain[i]().then(function(t){
          t=clean(t);
          if(!t||looksLikeHtml(t)) throw new Error('bad body');
          return t;
        }).catch(function(){ return attempt(i+1); });
      }
      return attempt(0);
    }

    function show(text){
      msg.className='news-msg';
      msg.textContent=text;
    }

    function showError(){
      msg.className='news-msg error';
      msg.textContent='Could not load the news right now. ';
      var r=document.createElement('button');
      r.type='button';
      r.className='news-retry';
      r.textContent='Try again';
      r.addEventListener('click',load);
      msg.appendChild(document.createElement('br'));
      msg.appendChild(r);
    }

    function load(){
      if(loading) return;
      if(cached){ show(cached); return; }
      loading=true;
      msg.className='news-msg loading';
      msg.textContent='Loading the latest news…';
      getNews().then(function(t){
        cached=t; show(t);
      }).catch(showError).then(function(){ loading=false; });
    }

    function open(){
      lastFocus=document.activeElement;
      modal.hidden=false;
      document.body.style.overflow='hidden';
      load();
      closeBtn.focus();
    }

    function close(){
      modal.hidden=true;
      document.body.style.overflow='';
      if(lastFocus&&lastFocus.focus) lastFocus.focus();
    }

    btn.addEventListener('click',open);
    closeBtn.addEventListener('click',close);
    modal.addEventListener('click',function(e){
      if(e.target&&e.target.hasAttribute('data-newsclose')) close();
    });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&!modal.hidden) close();
    });
  }

  function init(){
    injectModal();
    wire();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  } else {
    init();
  }
})();
