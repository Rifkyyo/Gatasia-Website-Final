(function(){
 const KEY='gatasiaTheme';
 function apply(dark){document.documentElement.classList.toggle('dark-mode',dark);const b=document.getElementById('darkModeToggle');if(b){b.setAttribute('aria-pressed',String(dark));b.setAttribute('aria-label',dark?'Aktifkan mode terang':'Aktifkan mode gelap');const i=b.querySelector('.theme-icon'),t=b.querySelector('.theme-label');if(i)i.textContent=dark?'💡':'🌙';if(t)t.textContent=dark?'Nyalakan':'Matikan';}}
 let dark=false;try{dark=localStorage.getItem(KEY)==='dark'}catch(e){} apply(dark);
 function init(){const actions=document.querySelector('.top-actions');if(!actions||document.getElementById('darkModeToggle'))return;
 const b=document.createElement('button');b.id='darkModeToggle';b.type='button';b.innerHTML='<span class="theme-icon">🌙</span><span class="theme-label">Matikan</span>';b.title='Ganti tema';b.setAttribute('aria-pressed',String(dark));
 actions.appendChild(b);
 const overlay=document.createElement('div');overlay.id='lampTransition';overlay.innerHTML='<div class="lamp-scene"><div class="lamp">💡</div><div class="lamp-glow"></div><div class="lamp-caption">Shhh... lampunya dimatikan!</div></div>';document.body.appendChild(overlay);
 b.addEventListener('click',function(){const next=!document.documentElement.classList.contains('dark-mode');overlay.classList.add('active');overlay.querySelector('.lamp').textContent=next?'💡':'🌙';overlay.querySelector('.lamp-caption').textContent=next?'Shhh... lampunya dimatikan!':'Yeay, lampunya dinyalakan!';setTimeout(()=>{apply(next);try{localStorage.setItem(KEY,next?'dark':'light')}catch(e){}},next?430:180);setTimeout(()=>overlay.classList.remove('active'),next?850:500);});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
