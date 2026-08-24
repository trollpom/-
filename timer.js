/*** Timer module - independent, robust ***/
const TIMER_KEY = 'ttt-timer';
const DEFAULT_DURATION = 300; // 5 min

function getTimerDuration(){
  try{
    const v = parseInt(localStorage.getItem(TIMER_KEY)||'');
    if(isNaN(v)) return DEFAULT_DURATION;
    if(v===0) return 0;
    if(v>=10 && v<=3600) return v;
    return DEFAULT_DURATION;
  }catch{ return DEFAULT_DURATION; }
}
function formatTime(sec){
  if(sec<=0) return '00:00';
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

let timerRemaining = getTimerDuration();
let timerInterval = null;
let timerRunning = false;

function updateDisplay(){
  const disp = document.getElementById('timerDisplay');
  const wrap = document.getElementById('gameTimer');
  if(!disp || !wrap) return;
  const dur = getTimerDuration();
  if(dur===0){
    disp.textContent='∞';
    wrap.classList.remove('warn');
    wrap.title='Таймер выключен';
    return;
  }
  disp.textContent = formatTime(timerRemaining);
  wrap.title = `До супер-игры: ${formatTime(timerRemaining)} | Кликни чтобы сбросить`;
  if(timerRemaining<=30 && timerRemaining>0) wrap.classList.add('warn');
  else wrap.classList.remove('warn');
}

function stopTimer(){
  if(timerInterval){ clearInterval(timerInterval); timerInterval=null; }
  timerRunning=false;
  console.log('[TIMER] stopped');
}
function startTimer(){
  stopTimer();
  const dur = getTimerDuration();
  if(dur===0){ timerRemaining=0; updateDisplay(); return; }
  timerRemaining = dur;
  timerRunning = true;
  updateDisplay();
  console.log('[TIMER] started', dur);
  timerInterval = setInterval(()=>{
    // pause if super game active (check global)
    try{
      if(window.SUPER && window.SUPER.active) return;
      if(window.TTT && window.TTT.gameOver) return;
    }catch{}
    timerRemaining--;
    updateDisplay();
    if(timerRemaining<=10 && timerRemaining>0){
      try{ window._audioTick && window._audioTick(); }catch{}
      // also try audio module if available
      try{ document.dispatchEvent(new CustomEvent('timer-tick')); }catch{}
    }
    if(timerRemaining<=0){
      stopTimer();
      console.log('[TIMER] expired -> super game');
      document.dispatchEvent(new CustomEvent('timer-expired'));
    }
  }, 1000);
}
function resetTimer(){
  stopTimer();
  timerRemaining = getTimerDuration();
  updateDisplay();
}

function setDuration(sec){
  localStorage.setItem(TIMER_KEY, String(sec));
  const btns = document.querySelectorAll('[data-group="timer"] button');
  btns.forEach(b=> b.classList.toggle('active', parseInt(b.dataset.value)===sec));
  resetTimer();
  if(sec!==0){
    // не стартуем сразу, ждем первого хода, но обновим дисплей
    updateDisplay();
  } else {
    stopTimer();
    const disp = document.getElementById('timerDisplay');
    if(disp) disp.textContent='∞';
  }
  console.log('[TIMER] setDuration', sec);
}

function bindUI(){
  const groups = document.querySelectorAll('[data-group="timer"]');
  groups.forEach(group=>{
    group.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        const v = parseInt(btn.dataset.value);
        setDuration(v);
        try{ window._toast && window._toast(v===0?'Таймер выключен':`Таймер ${v/60} мин`); }catch{}
      });
    });
  });
  const btnResetList = document.querySelectorAll('#btnTimerReset, #settingsBtnTimerReset');
  btnResetList.forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      resetTimer();
      try{ window._toast && window._toast('Таймер сброшен'); }catch{}
    });
  });
  const btnTestList = document.querySelectorAll('#btnTimerTest, #settingsBtnTimerTest');
  btnTestList.forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      console.log('[TIMER] test super game clicked');
      document.dispatchEvent(new CustomEvent('timer-expired'));
      try{ window._toast && window._toast('Тест супер-игры'); }catch{}
    });
  });
  const timerWrap = document.getElementById('gameTimer');
  if(timerWrap){
    timerWrap.addEventListener('click', ()=>{
      resetTimer();
    });
    timerWrap.style.cursor='pointer';
  }
}

// expose for other modules
window._getTimerDuration = getTimerDuration;
window._formatTime = formatTime;
window._startTimer = startTimer;
window._stopTimer = stopTimer;
window._resetTimer = resetTimer;
window._setTimerDuration = setDuration;

// init after DOM ready
function init(){
  bindUI();
  // set active button
  const dur = getTimerDuration();
  document.querySelectorAll('#timerGroup button').forEach(b=>{
    b.classList.toggle('active', parseInt(b.dataset.value)===dur);
  });
  updateDisplay();
  // НЕ запускаем сразу — ждем первого хода (требование)
  console.log('[TIMER] module init, duration', dur, 'waiting for first move');
  // если таймер был ∞, то и не стартуем
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Also listen for external reset requests
document.addEventListener('ttt-reset-board', ()=>{
  console.log('[TIMER] reset-board event - reset but not start until first move');
  resetTimer();
  // не стартуем автоматически, ждем первого хода
});
document.addEventListener('ttt-first-move', ()=>{
  console.log('[TIMER] first-move event -> start');
  const d = getTimerDuration();
  if(d!==0 && !timerRunning) startTimer();
});
document.addEventListener('ttt-stop-timer', ()=> stopTimer());
