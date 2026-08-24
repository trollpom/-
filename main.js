/*** TIC TAC THREE - Main + Timer + Super Curling Game ***/
import { audio } from './audio.js';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Early listeners for timer.js events - attach immediately to not miss
document.addEventListener('timer-expired', ()=>{
  console.log('[MAIN] timer-expired event received (early)');
  try{ onTimerExpire(); }catch(e){ console.error('onTimerExpire failed', e); }
});
document.addEventListener('timer-tick', ()=>{
  try{ audio.tick(); }catch{}
});

const WIN_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

const TIMER_DURATION = 5 * 60; // 5 минут по умолчанию
const getTimerDuration = () => {
  const v = parseInt(localStorage.getItem('ttt-timer')||'');
  if(isNaN(v)) return TIMER_DURATION;
  if(v===0) return 0; // ∞
  if(v>=10 && v<=3600) return v;
  return TIMER_DURATION;
};
function setTimerDuration(sec){
  console.log('[TIMER] set duration', sec);
  localStorage.setItem('ttt-timer', String(sec));
  const btns = document.querySelectorAll('#timerGroup button');
  btns.forEach(b=>{
    b.classList.toggle('active', parseInt(b.dataset.value)===sec);
  });
  resetTimer();
  if(sec!==0){
    startTimer();
    toast(`Таймер: ${sec===0?'∞':formatTime(sec)}`);
  } else {
    stopTimer();
    if(timerDisplay) timerDisplay.textContent='∞';
    gameTimerEl?.classList.remove('warn');
    toast('Таймер выключен — игра бесконечная');
  }
}

const state = {
  board: Array(9).fill(null),
  current: 'X',
  winner: null,
  winCombo: null,
  moves: 0,
  scores: { X:0, O:0, D:0 },
  streak: { X:0, O:0 },
  rounds: 0,
  mode: 'bot',
  difficulty: 'medium',
  playerSide: 'X', // X or O when playing vs bot
  figureSet: 'classic',
  threeFigures: false,
  queues: { X: [], O: [] },
  gameOver: false,
  peer: null,
  conn: null,
  roomCode: null,
  isHost: false,
  onlineReady: false,
  // timer
  timerRemaining: getTimerDuration(),
  timerInterval: null,
  timerRunning: false,
};

const figureDefs = {
  classic: {
    label: ['×','○'],
    render: (player) => {
      const isX = player==='X';
      if(isX) return `<div class="cell-content x"><span class="icon"><span class="icon-x"></span></span></div>`;
      return `<div class="cell-content o"><span class="icon"><span class="icon-o"></span></span></div>`;
    },
    tiny: (player) => player==='X' ? `<span class="icon-x"></span>` : `<span class="icon-o"></span>`
  },
  cosmic: {
    label: ['✦','☾'],
    render: (player) => {
      if(player==='X') return `<div class="cell-content x"><span class="icon"><span class="icon-star"></span></span></div>`;
      return `<div class="cell-content o"><span class="icon"><span class="icon-moon"></span></span></div>`;
    },
    tiny: (player)=> player==='X'? `<span class="icon-star"></span>`:`<span class="icon-moon"></span>`
  },
  neo: {
    label: ['⚡','◍'],
    render: (player) => {
      if(player==='X') return `<div class="cell-content x"><span class="icon"><span class="icon-bolt"></span></span></div>`;
      return `<div class="cell-content o"><span class="icon"><span class="icon-drop"></span></span></div>`;
    },
    tiny: (player)=> player==='X'? `<span class="icon-bolt"></span>`:`<span class="icon-drop"></span>`
  }
};

// DOM refs
const boardEl = $('#board');
const boardShell = $('#boardShell');
const turnXFig = $('#turnXFig');
const turnOFig = $('#turnOFig');
const turnCards = $$('.turn-card');
const resultOverlay = $('#resultOverlay');
const resultFig = $('#resultFig');
const resultTitle = $('#resultTitle');
const resultSub = $('#resultSub');
const queueX = $('#queueX');
const queueO = $('#queueO');
const winLine = $('#winLine');
const toastStack = $('#toastStack');
const timerDisplay = $('#timerDisplay');
const gameTimerEl = $('#gameTimer');
const superFiguresEl = $('#superFigures');
const trajectoryCanvas = $('#trajectoryCanvas');
const launchLane = $('#launchLane');
const laneTrack = $('#laneTrack');
const shooterEl = $('#shooter');
const shooterFigEl = $('#shooterFig');
const laneFigEl = $('#laneFig');
const lanePlayerName = $('#lanePlayerName');
const laneAttemptsEl = $('#laneAttempts');
const powerFill = $('#powerFill');
const laneAimLine = $('#laneAimLine');
const superDiceOverlay = $('#superDiceOverlay');
const superResultOverlay = $('#superResultOverlay');
const diceXEl = $('#diceX');
const diceOEl = $('#diceO');
const btnRollDice = $('#btnRollDice');
const btnSuperStart = $('#btnSuperStart');
const btnSuperDraw = $('#btnSuperDraw');
const superResultTitle = $('#superResultTitle');
const superResultSub = $('#superResultSub');
const superResultFig = $('#superResultFig');
const superCountEl = $('#superCount');

// Super Game State
const superState = {
  active: false,
  figures: [], // {id, player, x,y,vx,vy,out, el}
  attempts: { X:3, O:3 },
  currentPlayer: 'X',
  firstPlayer: null,
  shooterX: 0.5,
  power: 0,
  aimX: 0,
  isAiming: false,
  isSimulating: false,
  dice: { X:0, O:0 },
  raf: null,
  nextId: 1,
};

function buildBoard(){
  boardEl.innerHTML='';
  for(let i=0;i<9;i++){
    const cell = document.createElement('div');
    cell.className='cell';
    cell.dataset.index=i;
    cell.addEventListener('click',()=>onCellClick(i));
    cell.addEventListener('mouseenter',()=>{ showWillRemoveHint(i); });
    cell.addEventListener('mouseleave',()=>clearHints());
    boardEl.appendChild(cell);
  }
}

function onCellClick(idx){
  if(superState.active) return;
  if(state.gameOver) return;
  if(state.mode==='online' && !state.onlineReady) { toast('Жди соперника'); return; }
  if(state.mode==='online'){
    const myMark = state.isHost ? 'X' : 'O';
    if(state.current !== myMark){ toast('Сейчас не твой ход'); return; }
  }
  if(state.board[idx]) return;
  if(state.mode==='bot' && state.current==='O'){ return; }

  makeMove(idx, state.current);
  if(state.mode==='online' && state.conn?.open){
    state.conn.send({ type:'move', idx, player: state.current==='X'?'O':'X', board: state.board, queues: state.queues, current: state.current, moves: state.moves });
  }
  if(!state.gameOver && state.mode==='bot' && state.current==='O'){
    setTimeout(botMove, 420 + Math.random()*280);
  }
}

function makeMove(idx, player){
  if(state.gameOver) return;
  // timer starts after first move per requirement
  if(state.moves===0){
    try{
      document.dispatchEvent(new CustomEvent('ttt-first-move'));
      // also start via global if available
      if(window._startTimer) window._startTimer();
      else startTimer();
      console.log('[MAIN] first move -> timer started');
    }catch(e){ console.warn('timer start failed', e); }
  }
  let removed = false;
  if(state.threeFigures){
    state.queues[player].push(idx);
    if(state.queues[player].length > 3){
      const oldest = state.queues[player].shift();
      state.board[oldest]=null;
      removed = true;
      const oldCell = boardEl.children[oldest];
      if(oldCell){
        const content = oldCell.querySelector('.cell-content');
        if(content){
          content.classList.add('fading');
          setTimeout(()=>{ oldCell.innerHTML=''; }, 300);
        } else oldCell.innerHTML='';
      }
    }
  }
  state.board[idx]=player;
  state.moves++;
  renderCell(idx, player);
  updateQueuesUI();
  if(removed) setTimeout(()=>audio.remove(), 80);
  audio.place(player);

  const win = checkWin();
  if(win){
    state.winner = player;
    state.winCombo = win.combo;
    state.gameOver = true;
    stopTimer();
    handleWin(player, win.combo);
  } else {
    if(!state.threeFigures && state.board.every(Boolean)){
      state.gameOver = true;
      stopTimer();
      handleDraw();
    } else {
      state.current = player==='X'?'O':'X';
      updateTurnUI();
      updateMovesUI();
    }
  }
  updateWillRemoveMarks();
}

function renderCell(idx, player){
  const cell = boardEl.children[idx];
  cell.innerHTML = figureDefs[state.figureSet].render(player);
  cell.classList.add('filled');
}

function checkWin(){
  for(const combo of WIN_COMBOS){
    const [a,b,c]=combo;
    if(state.board[a] && state.board[a]===state.board[b] && state.board[a]===state.board[c]){
      return { player: state.board[a], combo };
    }
  }
  return null;
}

function handleWin(player, combo){
  combo.forEach(i=> boardEl.children[i].classList.add('win'));
  drawWinLine(combo);
  state.scores[player]++;
  state.streak[player]++;
  state.streak[player==='X'?'O':'X']=0;
  state.rounds++;
  saveStats();
  updateScoreUI();
  try{ document.dispatchEvent(new CustomEvent('ttt-stop-timer')); }catch{}
  stopTimer();
  audio.win();
  setTimeout(()=>{
    showResult(`${player} побеждает!`, `Линия ${comboName(combo)} • ${figureDefs[state.figureSet].label[player==='X'?0:1]} три в ряд`, player);
    if(navigator.vibrate) navigator.vibrate([80,40,80]);
    confettiBurst();
  }, 380);
}

function handleDraw(){
  state.scores.D++;
  state.rounds++;
  state.streak.X=0; state.streak.O=0;
  saveStats();
  updateScoreUI();
  try{ document.dispatchEvent(new CustomEvent('ttt-stop-timer')); }catch{}
  stopTimer();
  audio.draw();
  setTimeout(()=>{
    showResult('Ничья!', 'Похоже, сегодня дружба. Сыграем ещё?', null);
  }, 320);
}

function comboName(combo){
  const map = {
    '0,1,2':'сверху', '3,4,5':'в центре', '6,7,8':'снизу',
    '0,3,6':'слева', '1,4,7':'по центру', '2,5,8':'справа',
    '0,4,8':'диагональ \\', '2,4,6':'диагональ /'
  };
  return map[combo.join(',')]||'';
}

function drawWinLine(combo){
  const positions = [
    {x:16.6,y:16.6},{x:50,y:16.6},{x:83.3,y:16.6},
    {x:16.6,y:50},{x:50,y:50},{x:83.3,y:50},
    {x:16.6,y:83.3},{x:50,y:83.3},{x:83.3,y:83.3},
  ];
  const [a,b,c]=combo;
  const line = winLine.querySelector('line');
  line.setAttribute('x1', positions[a].x);
  line.setAttribute('y1', positions[a].y);
  line.setAttribute('x2', positions[c].x);
  line.setAttribute('y2', positions[c].y);
  winLine.classList.add('show');
}

function clearWinLine(){
  winLine.classList.remove('show');
  const line = winLine.querySelector('line');
  line.setAttribute('x1',0); line.setAttribute('y1',0);
  line.setAttribute('x2',0); line.setAttribute('y2',0);
  [...boardEl.children].forEach(c=>c.classList.remove('win','will-remove'));
}

function showResult(title, sub, winner){
  resultTitle.textContent=title;
  resultSub.textContent=sub;
  resultFig.innerHTML = winner ? figureDefs[state.figureSet].render(winner) : `<div style="font-size:32px">🤝</div>`;
  resultOverlay.classList.remove('hidden');
}

function hideResult(){ resultOverlay.classList.add('hidden'); }

function resetBoard(keepScores=false){
  // stop super if active
  if(superState.active) endSuperGameCleanup();
  state.board = Array(9).fill(null);
  // side selection: if player chose O, X starts (bot)
  const playerSide = state.playerSide || 'X';
  state.current = 'X'; // X always starts logically, but if player is O, bot is X
  state.winner=null;
  state.winCombo=null;
  state.moves=0;
  state.gameOver=false;
  state.queues={X:[],O:[]};
  hideResult();
  clearWinLine();
  [...boardEl.children].forEach(c=>{ c.innerHTML=''; c.className='cell'; });
  updateTurnUI();
  updateQueuesUI();
  updateMovesUI();
  updateWillRemoveMarks();
  // dispatch to timer.js module - reset but not start
  try{ document.dispatchEvent(new CustomEvent('ttt-reset-board')); }catch{}
  resetTimer();
  // timer now starts after first move, not here
  // startTimer(); removed per requirement
  if(state.mode==='online' && state.conn?.open){
    state.conn.send({ type:'reset' });
  }
  // if bot is X (player chose O), bot moves first
  if(state.mode==='bot' && playerSide==='O'){
    state.current='X';
    updateTurnUI();
    setTimeout(botMove, 500);
  }
}

function botMove(){
  if(state.gameOver || superState.active) return;
  const idx = getBotMove([...state.board], state.difficulty);
  if(idx!==-1) makeMove(idx,'O');
}

function getBotMove(board, difficulty){
  const empty = board.map((v,i)=>v===null?i:null).filter(v=>v!==null);
  if(empty.length===0) return -1;
  if(difficulty==='easy'){
    return empty[Math.floor(Math.random()*empty.length)];
  }
  if(state.threeFigures){
    for(const i of empty){
      board[i]='O';
      if(checkWinBoard(board)){ board[i]=null; return i; }
      board[i]=null;
    }
    for(const i of empty){
      board[i]='X';
      if(checkWinBoard(board)){ board[i]=null; return i; }
      board[i]=null;
    }
    const pref = [4,0,2,6,8,1,3,5,7].filter(x=>empty.includes(x));
    return pref[0] ?? empty[0];
  }
  if(difficulty==='medium' && Math.random()<0.45){
    return empty[Math.floor(Math.random()*empty.length)];
  }
  return minimax(board,'O').index;
}

function checkWinBoard(b){
  for(const [a,b2,c] of WIN_COMBOS){
    if(b[a] && b[a]===b[b2] && b[a]===b[c]) return b[a];
  }
  return null;
}

function minimax(board, player){
  const empty = board.map((v,i)=>v===null?i:null).filter(v=>v!==null);
  const winner = checkWinBoard(board);
  if(winner==='X') return {score:-10};
  if(winner==='O') return {score:10};
  if(empty.length===0) return {score:0};
  const moves=[];
  for(const idx of empty){
    const move={}; move.index=idx;
    board[idx]=player;
    const result = minimax(board, player==='O'?'X':'O');
    move.score=result.score;
    board[idx]=null;
    moves.push(move);
  }
  let best;
  if(player==='O'){
    let bestScore=-Infinity;
    for(const m of moves){ if(m.score>bestScore){ bestScore=m.score; best=m; } }
  } else {
    let bestScore=Infinity;
    for(const m of moves){ if(m.score<bestScore){ bestScore=m.score; best=m; } }
  }
  return best || {index: empty[0], score:0};
}

// UI updates
function updateTurnUI(){
  turnCards.forEach(card=>{
    card.classList.toggle('active', card.dataset.player===state.current);
    const info = card.querySelector('.turn-info span');
    if(info) info.textContent = card.dataset.player===state.current ? 'Ваш ход' : 'Ожидает';
  });
  updateTurnFigs();
}
function updateTurnFigs(){
  turnXFig.innerHTML = figureDefs[state.figureSet].tiny('X');
  turnOFig.innerHTML = figureDefs[state.figureSet].tiny('O');
  turnCards.forEach(c=>{ c.style.color = c.dataset.player==='X' ? 'var(--x)' : 'var(--o)'; });
}
function updateScoreUI(){
  $('#scoreX').textContent=state.scores.X;
  $('#scoreO').textContent=state.scores.O;
  $('#scoreD').textContent=state.scores.D;
  $('#roundsCount').textContent=state.rounds;
  $('#streakX').textContent=state.streak.X;
  $('#streakO').textContent=state.streak.O;
}
function updateMovesUI(){ $('#movesCount').textContent=state.moves; }
function updateQueuesUI(){
  if(!state.threeFigures){ queueX.innerHTML=''; queueO.innerHTML=''; return; }
  queueX.innerHTML = Array(3).fill(0).map((_,i)=>{
    const filled = i < state.queues.X.length;
    const next = i===0 && state.queues.X.length===3;
    return `<i class="${filled?'filled':''} ${next?'next':''}"></i>`;
  }).join('');
  queueO.innerHTML = Array(3).fill(0).map((_,i)=>{
    const filled = i < state.queues.O.length;
    const next = i===0 && state.queues.O.length===3;
    return `<i class="${filled?'filled':''} ${next?'next':''}" style="${next?'box-shadow:0 0 0 3px color-mix(in srgb, var(--o) 22%, transparent)':''}"></i>`;
  }).join('');
}
function updateWillRemoveMarks(){
  [...boardEl.children].forEach(c=>c.classList.remove('will-remove'));
  if(!state.threeFigures) return;
  const curQueue = state.queues[state.current];
  if(curQueue.length===3){
    const idx = curQueue[0];
    boardEl.children[idx]?.classList.add('will-remove');
  }
}
function showWillRemoveHint(hoverIdx){
  if(!state.threeFigures) return;
  if(state.board[hoverIdx]) return;
  const curQueue = state.queues[state.current];
  if(curQueue.length===3){
    boardEl.children[curQueue[0]]?.classList.add('will-remove');
  }
}
function clearHints(){ if(state.threeFigures) updateWillRemoveMarks(); }

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ttt-theme', theme);
  $$('.design-btn').forEach(b=>b.classList.toggle('active', b.dataset.theme===theme));
}
function applyFigures(set){
  state.figureSet=set;
  localStorage.setItem('ttt-figures', set);
  $$('.figure-btn').forEach(b=>b.classList.toggle('active', b.dataset.figures===set));
  state.board.forEach((p,i)=>{ if(p) renderCell(i,p); });
  updateTurnFigs();
  updateQueuesUI();
  if(superState.active) renderSuperFigures();
}

function setMode(mode){
  state.mode=mode;
  $$('.mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  $('#botPanel').classList.toggle('hidden', mode!=='bot');
  $('#onlinePanel').classList.toggle('hidden', mode!=='online');
  localStorage.setItem('ttt-mode', mode);
  resetBoard(true);
  updateTurnUI();
}
function setDifficulty(d){
  state.difficulty=d;
  $$('[data-group="difficulty"] button').forEach(b=>b.classList.toggle('active', b.dataset.value===d));
  localStorage.setItem('ttt-diff', d);
}
function setPlayerSide(side){
  state.playerSide = side;
  $$('[data-group="side"] button').forEach(b=>b.classList.toggle('active', b.dataset.value===side));
  localStorage.setItem('ttt-side', side);
  console.log('[SIDE] set to', side);
  // if bot mode, reset board so bot can start if needed
  if(state.mode==='bot'){
    resetBoard(true);
    toast(`Играешь за ${side} — ${side==='X' ? 'ходишь первым' : 'бот ходит первым'}`);
  }
}
function saveStats(){
  localStorage.setItem('ttt-stats', JSON.stringify({ scores: state.scores, streak: state.streak, rounds: state.rounds }));
}
function loadStats(){
  try{
    const o = JSON.parse(localStorage.getItem('ttt-stats')||'null');
    if(o){ state.scores=o.scores||state.scores; state.streak=o.streak||state.streak; state.rounds=o.rounds||0; }
    const th = localStorage.getItem('ttt-theme'); if(th) applyTheme(th);
    const fig = localStorage.getItem('ttt-figures'); if(fig) state.figureSet=fig;
    const md = localStorage.getItem('ttt-mode'); if(md) state.mode=md;
    const df = localStorage.getItem('ttt-diff'); if(df) state.difficulty=df;
    const sd = localStorage.getItem('ttt-side'); if(sd) state.playerSide=sd;
    const three = localStorage.getItem('ttt-three'); if(three) state.threeFigures = three==='1';
  }catch(e){}
  $$('.design-btn').forEach(b=>b.classList.toggle('active', b.dataset.theme===document.documentElement.getAttribute('data-theme')));
  $$('.figure-btn').forEach(b=>b.classList.toggle('active', b.dataset.figures===state.figureSet));
  $$('.mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===state.mode));
  $$('[data-group="difficulty"] button').forEach(b=>b.classList.toggle('active', b.dataset.value===state.difficulty));
  $$('[data-group="side"] button').forEach(b=>b.classList.toggle('active', b.dataset.value===state.playerSide));
  const toggle = $('#threeFiguresToggle');
  if(toggle) toggle.checked = state.threeFigures;
  updateRuleDesc();
}
function toast(msg, ms=2600){
  const el=document.createElement('div');
  el.className='toast'; el.textContent=msg;
  toastStack.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(10px)'; setTimeout(()=>el.remove(),280); }, ms);
}
function confettiBurst(){
  const colors=[getComputedStyle(document.documentElement).getPropertyValue('--x'), getComputedStyle(document.documentElement).getPropertyValue('--o'), getComputedStyle(document.documentElement).getPropertyValue('--accent')];
  for(let i=0;i<24;i++){
    const d=document.createElement('div');
    d.style.position='fixed'; d.style.left='50%'; d.style.top='50%';
    d.style.width='8px'; d.style.height='8px'; d.style.borderRadius='50%';
    d.style.background=colors[i%colors.length];
    d.style.pointerEvents='none'; d.style.zIndex=9999;
    d.style.transform=`translate(-50%,-50%)`;
    document.body.appendChild(d);
    const angle = (Math.PI*2*i)/24;
    const vel = 80 + Math.random()*180;
    const x = Math.cos(angle)*vel;
    const y = Math.sin(angle)*vel - Math.random()*60;
    d.animate([
      { transform:`translate(-50%,-50%) translate(0,0) scale(1)`, opacity:1 },
      { transform:`translate(-50%,-50%) translate(${x}px,${y+200}px) scale(0)`, opacity:0 }
    ], { duration: 900+Math.random()*600, easing:'cubic-bezier(.2,.8,.2,1)' }).onfinish=()=>d.remove();
  }
}
function updateRuleDesc(){
  const cl = $('#ruleDesc .classic');
  const th = $('#ruleDesc .three');
  if(state.threeFigures){ cl.classList.remove('on'); th.classList.add('on'); }
  else { th.classList.remove('on'); cl.classList.add('on'); }
  updateQueuesUI();
  updateWillRemoveMarks();
}

// TIMER LOGIC - delegated to timer.js module for robustness
function formatTime(sec){
  try{ if(window._formatTime) return window._formatTime(sec); }catch{}
  if(sec<=0) return '00:00';
  const m = Math.floor(sec/60).toString().padStart(2,'0');
  const s = (sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}
function updateTimerDisplay(){
  try{ if(window._getTimerDuration){ /* let timer.js handle */ } }catch{}
  // fallback local display
  const disp = document.getElementById('timerDisplay');
  const wrap = document.getElementById('gameTimer');
  if(!disp || !wrap) return;
  try{
    const dur = window._getTimerDuration ? window._getTimerDuration() : getTimerDuration();
    if(dur===0){ disp.textContent='∞'; wrap.classList.remove('warn'); return; }
    // if timer.js has remaining, use it, else use state
    const rem = window._timerRemaining !== undefined ? window._timerRemaining : state.timerRemaining;
    disp.textContent = formatTime(rem);
  }catch{
    if(timerDisplay) timerDisplay.textContent = formatTime(state.timerRemaining);
  }
}
function startTimer(){
  try{ if(window._startTimer){ window._startTimer(); return; } }catch{}
  // fallback old logic
  stopTimer();
  const dur = getTimerDuration();
  if(dur===0){ state.timerRemaining=0; updateTimerDisplay(); return; }
  state.timerRemaining = dur;
  state.timerRunning = true;
  updateTimerDisplay();
  state.timerInterval = setInterval(()=>{
    if(superState.active) return;
    if(state.gameOver) return;
    state.timerRemaining--;
    updateTimerDisplay();
    if(state.timerRemaining <= 10 && state.timerRemaining>0){ try{ audio.tick(); }catch{} }
    if(state.timerRemaining <= 0){ stopTimer(); onTimerExpire(); }
  }, 1000);
}
function stopTimer(){
  try{ if(window._stopTimer){ window._stopTimer(); } }catch{}
  if(state.timerInterval){ clearInterval(state.timerInterval); state.timerInterval=null; }
  state.timerRunning=false;
}
function resetTimer(){
  try{ if(window._resetTimer){ window._resetTimer(); return; } }catch{}
  stopTimer();
  const dur = getTimerDuration();
  state.timerRemaining = dur;
  updateTimerDisplay();
  gameTimerEl?.classList.remove('warn');
}

// When timer expires
function onTimerExpire(){
  if(state.gameOver || superState.active) return;
  // if board has winner already? check
  const win = checkWin();
  if(win) return;
  audio.draw();
  showSuperDice();
}

function showSuperDice(){
  console.log('[SUPER] showSuperDice called');
  try{
    const overlay = document.getElementById('superDiceOverlay') || superDiceOverlay;
    if(!overlay){ console.error('superDiceOverlay not found'); return; }
    overlay.classList.remove('hidden');
    const dX = document.getElementById('diceX') || diceXEl;
    const dO = document.getElementById('diceO') || diceOEl;
    if(dX) dX.innerHTML='<span>?</span>';
    if(dO) dO.innerHTML='<span>?</span>';
    dX?.classList.remove('winner','rolling');
    dO?.classList.remove('winner','rolling');
    const bRoll = document.getElementById('btnRollDice') || btnRollDice;
    const bStart = document.getElementById('btnSuperStart') || btnSuperStart;
    if(bRoll) bRoll.style.display='inline-flex';
    if(bStart) bStart.style.display='none';
    const sub = document.getElementById('superDiceSub');
    if(sub) sub.textContent = `Время ${formatTime(getTimerDuration())} истекло без победителя. Сыграем в супер-игру!`;
    superState.dice = {X:0,O:0};
    superState.firstPlayer = null;
    try{ document.dispatchEvent(new CustomEvent('ttt-stop-timer')); }catch{}
    stopTimer();
    toast('Время вышло — супер-игра!');
    console.log('[SUPER] overlay shown');
  }catch(e){
    console.error('[SUPER] showSuperDice error', e);
  }
}

function rollDiceAnim(){
  audio.diceRoll();
  diceXEl.classList.add('rolling'); diceOEl.classList.add('rolling');
  let rolls=0;
  const interval = setInterval(()=>{
    diceXEl.innerHTML = `<span>${1+Math.floor(Math.random()*6)}</span>`;
    diceOEl.innerHTML = `<span>${1+Math.floor(Math.random()*6)}</span>`;
    rolls++;
    if(rolls>12){
      clearInterval(interval);
      diceXEl.classList.remove('rolling'); diceOEl.classList.remove('rolling');
      const dx = 1+Math.floor(Math.random()*6);
      const doo = 1+Math.floor(Math.random()*6);
      if(dx===doo){ // reroll on tie
        toast('Ничья на кубиках — переброс!');
        setTimeout(rollDiceAnim, 600);
        return;
      }
      superState.dice.X = dx; superState.dice.O = doo;
      diceXEl.innerHTML = `<span>${dx}</span>`;
      diceOEl.innerHTML = `<span>${doo}</span>`;
      const first = dx>doo ? 'X' : 'O';
      superState.firstPlayer = first;
      if(first==='X') diceXEl.classList.add('winner'); else diceOEl.classList.add('winner');
      audio.diceWin();
      $('#superDiceSub').textContent = `Выпало X:${dx} vs O:${doo} — первым ходит ${first}!`;
      btnRollDice.style.display='none';
      btnSuperStart.style.display='inline-flex';
    }
  }, 80);
}

function startSuperGame(){
  superDiceOverlay.classList.add('hidden');
  superState.active = true;
  superState.attempts = {X:3, O:3};
  superState.currentPlayer = superState.firstPlayer || 'X';
  superState.shooterX = 0.5;
  superState.figures = [];
  superState.nextId = 1;

  // Convert current board to free figures
  const cellCenters = [
    {x:0.166,y:0.166},{x:0.5,y:0.166},{x:0.833,y:0.166},
    {x:0.166,y:0.5},{x:0.5,y:0.5},{x:0.833,y:0.5},
    {x:0.166,y:0.833},{x:0.5,y:0.833},{x:0.833,y:0.833},
  ];
  state.board.forEach((p,i)=>{
    if(p){
      superState.figures.push({
        id: superState.nextId++,
        player: p,
        x: cellCenters[i].x + (Math.random()-0.5)*0.04,
        y: cellCenters[i].y + (Math.random()-0.5)*0.04,
        vx:0, vy:0, out:false, el:null
      });
    }
  });

  // hide normal board cells (keep grid background)
  [...boardEl.children].forEach(c=> c.style.opacity='0.15');
  winLine.classList.remove('show');

  // show super figures container and launch lane
  superFiguresEl.innerHTML='';
  renderSuperFigures();
  launchLane.classList.remove('hidden');
  trajectoryCanvas.classList.remove('hidden');
  boardShell.classList.add('super-mode');

  startSuperTurn();
  toast(`Супер-игра! Первым ходит ${superState.currentPlayer}`);
}

function renderSuperFigures(){
  superFiguresEl.innerHTML='';
  superState.figures.forEach(fig=>{
    if(fig.el && document.body.contains(fig.el)){
      // update position only
    } else {
      const el = document.createElement('div');
      el.className = `super-fig ${fig.player.toLowerCase()} ${fig.out?'out':''}`;
      el.innerHTML = figureDefs[state.figureSet].render(fig.player);
      superFiguresEl.appendChild(el);
      fig.el = el;
    }
    if(fig.el){
      fig.el.style.left = (fig.x*100)+'%';
      fig.el.style.top = (fig.y*100)+'%';
      fig.el.classList.toggle('out', !!fig.out);
    }
  });
}

function startSuperTurn(){
  if(superState.attempts.X<=0 && superState.attempts.O<=0){
    evaluateSuperFinal();
    return;
  }
  // if current player has no attempts left, switch
  if(superState.attempts[superState.currentPlayer]<=0){
    superState.currentPlayer = superState.currentPlayer==='X'?'O':'X';
  }
  if(superState.attempts[superState.currentPlayer]<=0){
    evaluateSuperFinal();
    return;
  }
  // update lane UI
  lanePlayerName.textContent = `Игрок ${superState.currentPlayer}`;
  laneAttemptsEl.textContent = `Попыток: ${superState.attempts[superState.currentPlayer]} | X:${countInside('X')} O:${countInside('O')}`;
  laneFigEl.innerHTML = figureDefs[state.figureSet].tiny(superState.currentPlayer);
  shooterFigEl.innerHTML = figureDefs[state.figureSet].render(superState.currentPlayer);
  shooterEl.style.left = (superState.shooterX*100)+'%';
  shooterEl.dataset.player = superState.currentPlayer;
  shooterEl.className = `shooter ${superState.currentPlayer.toLowerCase()}`;
  powerFill.style.width='0%';
  laneAimLine.style.height='0px';
  superState.power=0; superState.aimX=0;
  superState.isSimulating=false;

  // if bot mode and current is O and bot, auto shoot
  if(state.mode==='bot' && superState.currentPlayer==='O'){
    setTimeout(botSuperShoot, 800);
  }
}

function countInside(player=null){
  return superState.figures.filter(f=>!f.out && (player?f.player===player:true)).length;
}

function botSuperShoot(){
  if(!superState.active || superState.isSimulating) return;
  const opponents = superState.figures.filter(f=>!f.out && f.player!==superState.currentPlayer);
  let targetX = 0.5;
  if(opponents.length>0){
    targetX = opponents.reduce((s,f)=>s+f.x,0)/opponents.length;
    targetX += (Math.random()-0.5)*0.18;
  } else {
    targetX = 0.5 + (Math.random()-0.5)*0.25;
  }
  targetX = Math.max(0.12, Math.min(0.88, targetX));
  superState.shooterX = targetX;
  shooterEl.style.left = (targetX*100)+'%';
  const power = 0.32 + Math.random()*0.38; // weaker: was 0.6-0.95, now 0.32-0.70
  const aimX = (Math.random()-0.5)*0.22;
  launchShooter(power, aimX);
}

function launchShooter(power, aimX){
  if(superState.isSimulating) return;
  // allow weaker throws now
  if(power<0.08) { toast('Слабый бросок — тяни чуть сильнее вниз!'); return; }
  superState.isSimulating = true;
  audio.shoot(power);
  // reduced power factors + more friction for controllable shots
  const shooterFigure = {
    id: superState.nextId++,
    player: superState.currentPlayer,
    x: superState.shooterX,
    y: 1.18,
    vx: aimX * power * 0.035, // was 0.06
    vy: -power * 0.045 - 0.004, // was 0.09
    out:false,
    el:null,
    isShooter:true
  };
  superState.figures.push(shooterFigure);
  renderSuperFigures();
  shooterEl.style.opacity='0';
  physicsLoop();
}

function physicsLoop(){
  const friction = 0.96; // more friction (was 0.985) - stops faster, easier to stay
  const radius = 0.09; // bigger because figures bigger now (was 0.07)
  let moving = true;
  let lastCollisions = 0;

  const step = () => {
    moving = false;
    // update positions
    for(const fig of superState.figures){
      if(fig.out) continue;
      if(Math.abs(fig.vx)<0.0004 && Math.abs(fig.vy)<0.0004){ // was 0.0001 - stop faster
        fig.vx=0; fig.vy=0;
        continue;
      }
      moving = true;
      fig.x += fig.vx;
      fig.y += fig.vy;
      fig.vx *= friction;
      fig.vy *= friction;
      // check out of bounds (>50% outside => center outside)
      if(fig.x < 0 || fig.x > 1 || fig.y < 0 || fig.y > 1){
        if(!fig.out){
          // if shooter just launched, allow to enter first, don't mark out immediately if y>1 and vy<0 (going in)
          if(fig.y>1 && fig.vy<0){
            // still entering, not out
          } else {
            fig.out = true;
            audio.out();
            if(fig.el) fig.el.classList.add('out');
          }
        }
      }
    }
    // collisions
    for(let i=0;i<superState.figures.length;i++){
      for(let j=i+1;j<superState.figures.length;j++){
        const a = superState.figures[i], b = superState.figures[j];
        if(a.out || b.out) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx,dy);
        if(dist < radius*2 && dist>0.0001){
          // collision
          const nx = dx/dist, ny = dy/dist;
          const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
          const dot = dvx*nx + dvy*ny;
          if(dot < 0){
            const impulse = -dot;
            a.vx -= impulse*nx*0.8; a.vy -= impulse*ny*0.8;
            b.vx += impulse*nx*0.8; b.vy += impulse*ny*0.8;
            const vel = Math.hypot(dvx,dvy);
            if(vel>0.005 && lastCollisions%3===0) audio.collide(vel);
            lastCollisions++;
          }
          // separate
          const overlap = radius*2 - dist;
          a.x -= nx*overlap*0.5; a.y -= ny*overlap*0.5;
          b.x += nx*overlap*0.5; b.y += ny*overlap*0.5;
          moving = true;
        }
      }
    }

    renderSuperFigures();
    drawTrajectory();

    if(moving){
      superState.raf = requestAnimationFrame(step);
    } else {
      // round finished
      superState.isSimulating = false;
      shooterEl.style.opacity='1';
      // remove out figures from count? keep but out flag true
      // decrement attempts
      superState.attempts[superState.currentPlayer]--;
      // switch player
      superState.currentPlayer = superState.currentPlayer==='X'?'O':'X';
      // check if need extra attempts on draw after all used?
      if(superState.attempts.X<=0 && superState.attempts.O<=0){
        const cx = countInside('X'), co = countInside('O');
        if(cx===co){
          // draw - give extra attempt each
          toast('Ничья в супер-игре! +1 попытка каждому');
          superState.attempts.X++; superState.attempts.O++;
          audio.diceRoll();
        }
      }
      setTimeout(startSuperTurn, 600);
    }
  };
  step();
}

function drawTrajectory(){
  const canvas = trajectoryCanvas;
  if(!canvas || canvas.classList.contains('hidden')) return;
  const ctx = canvas.getContext('2d');
  const rect = boardShell.getBoundingClientRect();
  canvas.width = rect.width; canvas.height = rect.height;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!superState.isAiming || superState.power<=0) return;
  const startX = superState.shooterX * canvas.width;
  const startY = canvas.height * 1.08;
  const vx = superState.aimX * superState.power * 0.035 * canvas.width * 60;
  const vy = -superState.power * 0.045 * canvas.height * 60;
  ctx.beginPath();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  ctx.lineWidth = 2; ctx.setLineDash([6,6]);
  ctx.moveTo(startX, startY);
  let x = startX, y = startY, pvx=vx/60, pvy=vy/60;
  for(let i=0;i<70;i++){
    x+=pvx; y+=pvy; pvx*=0.96; pvy*=0.96; // match physics friction 0.96
    if(i%2===0) ctx.lineTo(x,y);
    if(y<0 || x<0 || x>canvas.width) break;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // power dot
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.arc(startX, startY, 3+superState.power*5, 0, Math.PI*2);
  ctx.fill();
}

function evaluateSuperFinal(){
  const cx = countInside('X'), co = countInside('O');
  let winner = null;
  if(cx>co) winner='X'; else if(co>cx) winner='O';
  // show result
  superResultOverlay.classList.remove('hidden');
  superCountEl.innerHTML = `<span>X: <b>${cx}</b></span><span>O: <b>${co}</b></span>`;
  if(winner){
    superResultTitle.textContent = `${winner} побеждает в супер-игре!`;
    superResultSub.textContent = `Счет по фигурам ${cx}:${co} — выбивание завершено`;
    superResultFig.innerHTML = figureDefs[state.figureSet].render(winner);
    state.scores[winner]++; state.streak[winner]++; state.streak[winner==='X'?'O':'X']=0;
    audio.win();
    confettiBurst();
  } else {
    superResultTitle.textContent = 'Супер-ничья!';
    superResultSub.textContent = `Счет ${cx}:${co} — даем еще по попытке`;
    superResultFig.innerHTML = `<div style="font-size:32px">🤝</div>`;
    // auto continue
    setTimeout(()=>{
      superResultOverlay.classList.add('hidden');
      superState.attempts.X++; superState.attempts.O++;
      startSuperTurn();
    }, 1500);
    return;
  }
  state.rounds++; saveStats(); updateScoreUI();
}

function endSuperGameCleanup(){
  if(superState.raf) cancelAnimationFrame(superState.raf);
  superState.active=false;
  superState.isSimulating=false;
  superState.figures=[];
  superFiguresEl.innerHTML='';
  launchLane.classList.add('hidden');
  trajectoryCanvas.classList.add('hidden');
  boardShell.classList.remove('super-mode');
  [...boardEl.children].forEach(c=> c.style.opacity='');
  superDiceOverlay.classList.add('hidden');
  superResultOverlay.classList.add('hidden');
}

// ONLINE
function genCode(){ return Math.random().toString(36).substring(2,8).toUpperCase(); }
function createRoom(){
  const code = genCode();
  const simpleId = `ttt-${code.toLowerCase()}`;
  state.roomCode = code;
  state.isHost = true;
  $('#roomCodeDisplay').textContent=code;
  $('#lobbyStatus').textContent='Создаю комнату...';
  $('#onlineInitial').classList.add('hidden');
  $('#onlineLobby').classList.remove('hidden');
  if(state.peer){ try{ state.peer.destroy(); }catch{} }
  const Peer = window.Peer;
  if(!Peer){ toast('PeerJS не загружен'); return; }
  const peer = new Peer(simpleId);
  state.peer=peer;
  peer.on('open', id=>{
    $('#lobbyStatus').textContent=`Комната ${code} — ждём соперника`;
    toast(`Комната ${code} создана`);
    state.onlineReady=false;
  });
  peer.on('connection', conn=>{
    state.conn=conn;
    setupConn(true);
  });
  peer.on('error', err=>{
    console.error(err);
    if(err.type==='unavailable-id'){
      toast('Код занят, пробую другой');
      setTimeout(createRoom, 400);
    } else {
      $('#lobbyStatus').textContent='Ошибка: '+err.type;
    }
  });
}
function joinRoom(){
  const input = $('#joinCodeInput');
  const code = input.value.trim().toUpperCase();
  if(!code || code.length<4){ toast('Введите код комнаты'); return; }
  const hostId = `ttt-${code.toLowerCase()}`;
  state.roomCode=code;
  state.isHost=false;
  $('#roomCodeDisplay').textContent=code;
  $('#onlineInitial').classList.add('hidden');
  $('#onlineLobby').classList.remove('hidden');
  $('#lobbyStatus').textContent=`Подключаюсь к ${code}...`;
  const Peer = window.Peer;
  if(!Peer){ toast('PeerJS не загружен'); return; }
  if(state.peer){ try{ state.peer.destroy(); }catch{} }
  const peer = new Peer();
  state.peer=peer;
  peer.on('open', ()=>{
    const conn = peer.connect(hostId, { reliable:true });
    state.conn=conn;
    setupConn(false);
  });
  peer.on('error', e=>{
    console.error(e);
    $('#lobbyStatus').textContent='Не удалось подключиться';
    toast('Комната не найдена');
  });
}
function setupConn(isHostSide){
  const conn = state.conn;
  if(!conn) return;
  conn.on('open', ()=>{
    state.onlineReady=true;
    $('#lobbyStatus').textContent='Соперник подключён! Играем';
    $('#oppAvatar').classList.remove('dimmed');
    $('#oppLabel').textContent = isHostSide ? 'Гость (O)' : 'Хост (X)';
    toast('Соперник подключился');
    $('#turnIndicator').style.opacity='1';
    if(state.isHost){
      conn.send({ type:'sync', board: state.board, current: state.current, queues: state.queues, scores: state.scores, figureSet: state.figureSet, threeFigures: state.threeFigures, rounds: state.rounds });
      resetBoard(true);
    }
    if(state.mode!=='online') setMode('online');
  });
  conn.on('data', data=>{ handleOnlineData(data); });
  conn.on('close', ()=>{
    state.onlineReady=false;
    $('#lobbyStatus').textContent='Соперник отключился';
    $('#oppAvatar').classList.add('dimmed');
    toast('Соперник отключился');
  });
  conn.on('error', e=>{ console.error(e); toast('Ошибка соединения'); });
}
function handleOnlineData(data){
  if(!data || !data.type) return;
  switch(data.type){
    case 'move':
      state.board = data.board;
      state.queues = data.queues;
      state.current = data.current;
      state.moves = data.moves;
      state.board.forEach((p,i)=>{
        const cell=boardEl.children[i];
        if(p) cell.innerHTML = figureDefs[state.figureSet].render(p);
        else cell.innerHTML='';
      });
      updateQueuesUI();
      updateWillRemoveMarks();
      const win = checkWin();
      if(win){ state.gameOver=true; handleWin(win.player, win.combo); }
      else {
        if(!state.threeFigures && state.board.every(Boolean)){ state.gameOver=true; handleDraw(); }
        else updateTurnUI();
      }
      break;
    case 'reset': resetBoard(true); break;
    case 'sync':
      if(!state.isHost){
        state.board = data.board;
        state.current = data.current;
        state.queues = data.queues;
        state.scores = data.scores||state.scores;
        state.figureSet = data.figureSet||state.figureSet;
        state.threeFigures = !!data.threeFigures;
        state.rounds = data.rounds||0;
        state.board.forEach((p,i)=>{
          const cell=boardEl.children[i];
          cell.innerHTML = p ? figureDefs[state.figureSet].render(p) : '';
        });
        applyFigures(state.figureSet);
        $('#threeFiguresToggle').checked = state.threeFigures;
        updateRuleDesc();
        updateTurnUI();
        updateScoreUI();
        updateQueuesUI();
      }
      break;
  }
}
function leaveRoom(){
  try{ state.conn?.close(); }catch{}
  try{ state.peer?.destroy(); }catch{}
  state.conn=null; state.peer=null; state.roomCode=null; state.isHost=false; state.onlineReady=false;
  $('#onlineInitial').classList.remove('hidden');
  $('#onlineLobby').classList.add('hidden');
  $('#oppAvatar').classList.add('dimmed');
  $('#oppLabel').textContent='Ожидание...';
  toast('Вы покинули комнату');
  resetBoard(true);
}

// Init
buildBoard();
loadStats();
applyFigures(state.figureSet);
updateScoreUI();
updateTurnUI();
updateQueuesUI();
updateMovesUI();
updateWillRemoveMarks();
// expose for timer.js
window._audioTick = ()=>{ try{ audio.tick(); }catch{} };
window._toast = toast;
window._timerRemaining = state.timerRemaining;
resetTimer();
startTimer();

// Listen to timer.js events
document.addEventListener('timer-expired', ()=>{
  console.log('[MAIN] timer-expired event received');
  onTimerExpire();
});
document.addEventListener('timer-tick', ()=>{
  try{ audio.tick(); }catch{}
});

// Events with sound
function withClick(fn){ return (...a)=>{ audio.click(); fn(...a); }; }

$$('.mode-btn').forEach(btn=>{
  btn.addEventListener('click', withClick(()=> setMode(btn.dataset.mode)));
  btn.addEventListener('mouseenter', ()=> audio.hover());
});
$$('[data-group="difficulty"] button').forEach(b=>{
  b.addEventListener('click', withClick(()=> setDifficulty(b.dataset.value)));
});
$$('[data-group="side"] button').forEach(b=>{
  b.addEventListener('click', withClick(()=> setPlayerSide(b.dataset.value)));
  b.addEventListener('mouseenter', ()=> { try{ audio.hover(); }catch{} });
});
$$('.design-btn').forEach(b=>{
  b.addEventListener('click', withClick(()=> applyTheme(b.dataset.theme)));
  b.addEventListener('mouseenter', ()=> audio.hover());
});
$$('.figure-btn').forEach(b=>{
  b.addEventListener('click', withClick(()=> applyFigures(b.dataset.figures)));
  b.addEventListener('mouseenter', ()=> audio.hover());
});
$('#btnReset').addEventListener('click', withClick(()=>{
  state.scores={X:0,O:0,D:0}; state.streak={X:0,O:0}; state.rounds=0;
  saveStats(); updateScoreUI(); resetBoard(false); toast('Статистика и поле сброшены');
}));
$('#btnNextRound').addEventListener('click', withClick(()=>{ resetBoard(true); }));
$('#btnShareWin').addEventListener('click', withClick(()=>{
  const txt=`Я выиграл в TIC TAC THREE! Счет ${state.scores.X}:${state.scores.O} 🎯`;
  if(navigator.share){ navigator.share({title:'TIC TAC THREE', text:txt}).catch(()=>{}); }
  else { navigator.clipboard.writeText(txt).then(()=>toast('Скопировано в буфер')); }
}));
$('#threeFiguresToggle').addEventListener('change', e=>{
  audio.click();
  state.threeFigures=e.target.checked;
  localStorage.setItem('ttt-three', state.threeFigures?'1':'0');
  updateRuleDesc();
  resetBoard(true);
  toast(state.threeFigures ? 'Режим Три фигуры включён' : 'Классический режим');
});
$('#btnCreateRoom').addEventListener('click', withClick(createRoom));
$('#btnJoinRoom').addEventListener('click', withClick(joinRoom));
$('#btnLeaveRoom').addEventListener('click', withClick(leaveRoom));
$('#btnCopyCode').addEventListener('click', withClick(()=>{
  if(state.roomCode){ navigator.clipboard.writeText(state.roomCode).then(()=>toast('Код скопирован')); }
}));
$('#joinCodeInput').addEventListener('keydown', e=>{ if(e.key==='Enter'){ audio.click(); joinRoom(); } });

const btnSound = $('#btnSound');
function updateSoundBtn(){
  if(!btnSound) return;
  btnSound.textContent = audio.isEnabled() ? '🔊' : '🔇';
  btnSound.classList.toggle('muted', !audio.isEnabled());
}
btnSound?.addEventListener('click', ()=>{
  const on = audio.toggle();
  updateSoundBtn();
  toast(on ? 'Звук включен' : 'Звук выключен');
  if(on){ audio.start(); }
});
updateSoundBtn();

resultOverlay.addEventListener('click', e=>{
  if(e.target===resultOverlay){ audio.click(); hideResult(); }
});
window.addEventListener('keydown', e=>{
  if(e.key.toLowerCase()==='r'){ audio.click(); resetBoard(true); }
  if(e.key.toLowerCase()==='n' && !resultOverlay.classList.contains('hidden')){ audio.click(); resetBoard(true); }
  if(e.key==='m' || e.key==='M'){ btnSound?.click(); }
});

let lastHover = 0;
[...boardEl.children].forEach(cell=>{
  cell.addEventListener('mouseenter', ()=>{
    if(Date.now()-lastHover>140 && !cell.innerHTML && !state.gameOver && !superState.active){
      lastHover=Date.now();
      audio.hover();
    }
  });
});

setMode(state.mode);
setDifficulty(state.difficulty);
applyTheme(document.documentElement.getAttribute('data-theme'));

// TIMER SETTINGS UI - fixed to be always active
function initTimerUI(){
  const dur = getTimerDuration();
  const btns = document.querySelectorAll('[data-group="timer"] button');
  btns.forEach(b=>{
    const v = parseInt(b.dataset.value);
    b.classList.toggle('active', v===dur);
  });
  // also update display
  updateTimerDisplay();
  console.log('[TIMER UI] init with', dur);
}
initTimerUI();

function bindTimerUI(){
  const groups = document.querySelectorAll('[data-group="timer"]');
  groups.forEach(group=>{
    const btns = group.querySelectorAll('button');
    btns.forEach(b=>{
      b.addEventListener('click', (e)=>{
        e.preventDefault();
        e.stopPropagation();
        try{ audio.click(); }catch{}
        const v = parseInt(b.dataset.value);
        console.log('[TIMER] click', v);
        localStorage.setItem('ttt-timer', String(v));
        // update active across all groups
        document.querySelectorAll('[data-group="timer"] button').forEach(x=>x.classList.toggle('active', parseInt(x.dataset.value)===v));
        resetTimer();
        // не стартуем до первого хода
        toast(v===0 ? 'Таймер выключен — ∞' : `Таймер ${v/60} мин, стартует после первого хода`);
      });
    });
  });
  const btnResetList = document.querySelectorAll('#btnTimerReset, #settingsBtnTimerReset');
  btnResetList.forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      try{ audio.click(); }catch{}
      console.log('[TIMER] reset click');
      resetTimer(); 
      const d = getTimerDuration();
      toast('Таймер сброшен: '+ (d===0?'∞':formatTime(d))+' — стартует после хода');
    });
  });
  const btnTestList = document.querySelectorAll('#btnTimerTest, #settingsBtnTimerTest');
  btnTestList.forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.preventDefault();
      try{ audio.click(); }catch{}
      console.log('[TIMER] test super');
      toast('Тест супер-игры');
      showSuperDice();
    });
  });
}
bindTimerUI();

// Ensure timer actually running after all init
setTimeout(()=>{
  const dur = getTimerDuration();
  console.log('[TIMER] final check, dur', dur, 'running', state.timerRunning, 'interval', !!state.timerInterval);
  if(dur!==0 && !state.timerInterval){
    console.log('[TIMER] restarting because interval missing');
    startTimer();
  }
  updateTimerDisplay();
}, 500);

// SUPER GAME EVENTS - robust
function safeAdd(id, fn){
  const el = document.getElementById(id);
  if(!el){ console.warn('Element not found', id); return; }
  el.addEventListener('click', withClick(fn));
}
safeAdd('btnRollDice', ()=> rollDiceAnim());
safeAdd('btnSuperStart', ()=> startSuperGame());
safeAdd('btnSuperDraw', ()=>{
  superDiceOverlay?.classList.add('hidden');
  state.scores.D++; state.rounds++; saveStats(); updateScoreUI();
  showResult('Ничья!', 'Время вышло — ничья. Новый раунд?', null);
});
safeAdd('btnSuperNext', ()=>{
  superResultOverlay?.classList.add('hidden');
  endSuperGameCleanup();
  resetBoard(true);
});
safeAdd('btnLaneLeft', ()=>{
  superState.shooterX = Math.max(0.1, superState.shooterX-0.08);
  if(shooterEl) shooterEl.style.left = (superState.shooterX*100)+'%';
});
safeAdd('btnLaneRight', ()=>{
  superState.shooterX = Math.min(0.9, superState.shooterX+0.08);
  if(shooterEl) shooterEl.style.left = (superState.shooterX*100)+'%';
});
safeAdd('btnLaneRandom', ()=> botSuperShoot());

// SETTINGS OVERLAY
const settingsOverlay = document.getElementById('settingsOverlay');
const btnSettings = document.getElementById('btnSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
function openSettings(){
  console.log('[SETTINGS] open');
  settingsOverlay?.classList.remove('hidden');
  document.body.classList.add('settings-open');
  // sync all toggles
  try{ initTimerUI(); }catch{}
  const threeMain = document.getElementById('threeFiguresToggle');
  const threeSet = document.getElementById('settingsThreeFiguresToggle');
  if(threeMain && threeSet) threeSet.checked = threeMain.checked;
  const compactMain = document.getElementById('settingsCompactToggle');
  if(compactMain) compactMain.checked = document.body.classList.contains('settings-compact');
  const sBtn = document.getElementById('settingsBtnSound');
  if(sBtn) sBtn.textContent = audio.isEnabled() ? '🔊 Вкл' : '🔇 Выкл';
}
function closeSettings(){
  console.log('[SETTINGS] close');
  settingsOverlay?.classList.add('hidden');
  document.body.classList.remove('settings-open');
}
// compact mode
function setCompactMode(on){
  document.body.classList.toggle('settings-compact', on);
  localStorage.setItem('ttt-compact', on?'1':'0');
  console.log('[SETTINGS] compact', on);
}
btnSettings?.addEventListener('click', withClick(()=> openSettings()));
btnCloseSettings?.addEventListener('click', withClick(()=> closeSettings()));
settingsOverlay?.addEventListener('click', (e)=>{
  if(e.target===settingsOverlay) closeSettings();
});
// sync three figures toggles
const settingsThreeToggle = document.getElementById('settingsThreeFiguresToggle');
settingsThreeToggle?.addEventListener('change', (e)=>{
  const mainToggle = document.getElementById('threeFiguresToggle');
  if(mainToggle) mainToggle.checked = e.target.checked;
  // trigger change event on main
  mainToggle?.dispatchEvent(new Event('change'));
});
const mainThreeToggle = document.getElementById('threeFiguresToggle');
mainThreeToggle?.addEventListener('change', ()=>{
  const setToggle = document.getElementById('settingsThreeFiguresToggle');
  if(setToggle) setToggle.checked = mainThreeToggle.checked;
});
// settings sound & reset
document.getElementById('settingsBtnSound')?.addEventListener('click', withClick(()=>{
  const on = audio.toggle();
  updateSoundBtn();
  const sBtn = document.getElementById('settingsBtnSound');
  if(sBtn) sBtn.textContent = on ? '🔊 Вкл' : '🔇 Выкл';
  toast(on ? 'Звук включен' : 'Звук выключен');
}));
document.getElementById('settingsBtnReset')?.addEventListener('click', withClick(()=>{
  state.scores={X:0,O:0,D:0}; state.streak={X:0,O:0}; state.rounds=0;
  saveStats(); updateScoreUI(); resetBoard(false); toast('Статистика и поле сброшены');
}));
document.getElementById('settingsCompactToggle')?.addEventListener('change', (e)=>{
  setCompactMode(e.target.checked);
  toast(e.target.checked ? 'Компактный режим' : 'Полный режим');
});

// init compact mode from storage (default true for less clutter)
try{
  const comp = localStorage.getItem('ttt-compact');
  if(comp===null) setCompactMode(true);
  else setCompactMode(comp==='1');
}catch{ setCompactMode(true); }

// Shooter drag handling
let lanePointerId = null;
let laneStartX=0, laneStartY=0;
shooterEl?.addEventListener('pointerdown', e=>{
  e.preventDefault();
  lanePointerId = e.pointerId;
  shooterEl.setPointerCapture(e.pointerId);
  laneStartX = e.clientX; laneStartY = e.clientY;
  superState.isAiming = true;
  superState.power = 0;
});
laneTrack?.addEventListener('pointermove', e=>{
  if(!superState.active || superState.isSimulating) return;
  if(superState.isAiming){
    const rect = laneTrack.getBoundingClientRect();
    const dx = e.clientX - laneStartX;
    const dy = e.clientY - laneStartY;
    // horizontal position - clamp
    superState.shooterX = Math.max(0.08, Math.min(0.92, (e.clientX - rect.left)/rect.width));
    shooterEl.style.left = (superState.shooterX*100)+'%';
    // power from vertical drag down - increased denominator for weaker throws, with curve
    const raw = Math.max(0, Math.min(1, dy/220)); // was 140
    superState.power = Math.pow(raw, 1.25); // curve: weak even weaker
    superState.aimX = Math.max(-1, Math.min(1, dx/220)); // was 180
    powerFill.style.width = (superState.power*100)+'%';
    const angle = superState.aimX * 28; // was 35
    laneAimLine.style.height = (superState.power*70+10)+'px';
    laneAimLine.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    laneAimLine.style.left = (superState.shooterX*100)+'%';
    trajectoryCanvas.classList.remove('hidden');
    drawTrajectory();
  }
});
const endAim = (e)=>{
  if(!superState.isAiming) return;
  superState.isAiming = false;
  trajectoryCanvas.classList.add('hidden');
  laneAimLine.style.height='0px';
  if(superState.power>0.12){
    launchShooter(superState.power, superState.aimX);
  }
  superState.power=0; powerFill.style.width='0%';
  try{ shooterEl.releasePointerCapture(e.pointerId); }catch{}
};
shooterEl?.addEventListener('pointerup', endAim);
laneTrack?.addEventListener('pointerup', endAim);
shooterEl?.addEventListener('pointercancel', endAim);

// For testing: press T to trigger super game quickly
window.addEventListener('keydown', e=>{
  if(e.key.toLowerCase()==='t' && e.shiftKey){
    toast('Тест супер-игры');
    showSuperDice();
  }
});

window.TTT = state;
window.SUPER = superState;
