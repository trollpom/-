/*** TIC TAC THREE - Main Game Logic ***/
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const WIN_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

const state = {
  board: Array(9).fill(null),
  current: 'X',
  winner: null,
  winCombo: null,
  moves: 0,
  scores: { X:0, O:0, D:0 },
  streak: { X:0, O:0 },
  rounds: 0,
  mode: 'bot', // bot, friend, online
  difficulty: 'medium',
  figureSet: 'classic', // classic, cosmic, neo
  threeFigures: false,
  queues: { X: [], O: [] }, // for three-figures mode
  gameOver: false,
  // online
  peer: null,
  conn: null,
  roomCode: null,
  isHost: false,
  onlineReady: false,
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

// Init board cells
function buildBoard(){
  boardEl.innerHTML='';
  for(let i=0;i<9;i++){
    const cell = document.createElement('div');
    cell.className='cell';
    cell.dataset.index=i;
    cell.addEventListener('click',()=>onCellClick(i));
    // hover hint for three-figures
    cell.addEventListener('mouseenter',()=>showWillRemoveHint(i));
    cell.addEventListener('mouseleave',()=>clearHints());
    boardEl.appendChild(cell);
  }
}

function onCellClick(idx){
  if(state.gameOver) return;
  if(state.mode==='online' && !state.onlineReady) { toast('Жди соперника'); return; }
  if(state.mode==='online'){
    const myMark = state.isHost ? 'X' : 'O';
    if(state.current !== myMark){ toast('Сейчас не твой ход'); return; }
  }
  if(state.board[idx]) return;
  if(state.mode==='bot' && state.current==='O'){ return; } // bot turn blocked

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
  // three figures logic
  if(state.threeFigures){
    state.queues[player].push(idx);
    if(state.queues[player].length > 3){
      const oldest = state.queues[player].shift();
      state.board[oldest]=null;
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

  const win = checkWin();
  if(win){
    state.winner = player;
    state.winCombo = win.combo;
    state.gameOver = true;
    handleWin(player, win.combo);
  } else {
    if(!state.threeFigures && state.board.every(Boolean)){
      state.gameOver = true;
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
  // highlight win cells
  combo.forEach(i=> boardEl.children[i].classList.add('win'));
  drawWinLine(combo);
  // scores
  state.scores[player]++;
  state.streak[player]++;
  state.streak[player==='X'?'O':'X']=0;
  state.rounds++;
  saveStats();
  updateScoreUI();

  // result overlay
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
  // compute line coords in 0-100 viewBox based on cell centers
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
  state.board = Array(9).fill(null);
  state.current='X';
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
  if(!keepScores){
    // nothing
  }
  if(state.mode==='online' && state.conn?.open){
    state.conn.send({ type:'reset' });
  }
  if(state.mode==='bot' && state.current==='O') setTimeout(botMove, 500);
}

function botMove(){
  if(state.gameOver) return;
  const idx = getBotMove([...state.board], state.difficulty, state.threeFigures ? state.queues : null);
  if(idx!==-1) makeMove(idx,'O');
}

function getBotMove(board, difficulty, queues){
  const empty = board.map((v,i)=>v===null?i:null).filter(v=>v!==null);
  if(empty.length===0) return -1;

  if(difficulty==='easy'){
    return empty[Math.floor(Math.random()*empty.length)];
  }

  // For three-figures mode, use heuristic (center, then corners, then win/block)
  if(state.threeFigures){
    // try win
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

  // Medium: 50% optimal, 50% random
  if(difficulty==='medium' && Math.random()<0.45){
    return empty[Math.floor(Math.random()*empty.length)];
  }

  // Hard: minimax
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
    const move={};
    move.index=idx;
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
  turnCards.forEach(c=>{
    c.style.color = c.dataset.player==='X' ? 'var(--x)' : 'var(--o)';
  });
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
function clearHints(){
  if(state.threeFigures) updateWillRemoveMarks();
}

// Theme & figures
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ttt-theme', theme);
  $$('.design-btn').forEach(b=>b.classList.toggle('active', b.dataset.theme===theme));
}
function applyFigures(set){
  state.figureSet=set;
  localStorage.setItem('ttt-figures', set);
  $$('.figure-btn').forEach(b=>b.classList.toggle('active', b.dataset.figures===set));
  // re-render board cells
  state.board.forEach((p,i)=>{
    if(p) renderCell(i,p);
  });
  updateTurnFigs();
  updateQueuesUI();
}

// Mode
function setMode(mode){
  state.mode=mode;
  $$('.mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===mode));
  $('#botPanel').classList.toggle('hidden', mode!=='bot');
  $('#onlinePanel').classList.toggle('hidden', mode!=='online');
  localStorage.setItem('ttt-mode', mode);
  resetBoard(true);
  if(mode==='online'){
    // don't auto reset deeper
  }
  updateTurnUI();
}

// Difficulty
function setDifficulty(d){
  state.difficulty=d;
  $$('[data-group="difficulty"] button').forEach(b=>b.classList.toggle('active', b.dataset.value===d));
  localStorage.setItem('ttt-diff', d);
}

// Stats persistence
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
    const three = localStorage.getItem('ttt-three'); if(three) state.threeFigures = three==='1';
  }catch(e){}
  $$('.design-btn').forEach(b=>b.classList.toggle('active', b.dataset.theme===document.documentElement.getAttribute('data-theme')));
  $$('.figure-btn').forEach(b=>b.classList.toggle('active', b.dataset.figures===state.figureSet));
  $$('.mode-btn').forEach(b=>b.classList.toggle('active', b.dataset.mode===state.mode));
  $$('[data-group="difficulty"] button').forEach(b=>b.classList.toggle('active', b.dataset.value===state.difficulty));
  $('#threeFiguresToggle').checked = state.threeFigures;
  updateRuleDesc();
}

// Toast
function toast(msg, ms=2600){
  const el=document.createElement('div');
  el.className='toast'; el.textContent=msg;
  toastStack.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(10px)'; setTimeout(()=>el.remove(),280); }, ms);
}

// Confetti minimal
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

// ---------- ONLINE (PeerJS) ----------
function genCode(){ return Math.random().toString(36).substring(2,8).toUpperCase(); }

function createRoom(){
  const code = genCode();
  const peerId = `ttt-${code.toLowerCase()}-${Date.now().toString(36)}`.slice(0,30);
  // Actually use predictable prefix for join: we'll use ttt-${code} as id, but to avoid collisions, try simple
  const simpleId = `ttt-${code.toLowerCase()}`;
  state.roomCode = code;
  state.isHost = true;
  $('#roomCodeDisplay').textContent=code;
  $('#lobbyStatus').textContent='Создаю комнату...';
  $('#onlineInitial').classList.add('hidden');
  $('#onlineLobby').classList.remove('hidden');
  // create peer
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
      // id taken, generate alternative but still show code? inform
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
      // send initial sync
      conn.send({ type:'sync', board: state.board, current: state.current, queues: state.queues, scores: state.scores, figureSet: state.figureSet, threeFigures: state.threeFigures, rounds: state.rounds });
      resetBoard(true);
    }
    // update mode UI
    if(state.mode!=='online') setMode('online');
  });
  conn.on('data', data=>{
    handleOnlineData(data);
  });
  conn.on('close', ()=>{
    state.onlineReady=false;
    $('#lobbyStatus').textContent='Соперник отключился';
    $('#oppAvatar').classList.add('dimmed');
    toast('Соперник отключился');
  });
  conn.on('error', e=>{
    console.error(e);
    toast('Ошибка соединения');
  });
}

function handleOnlineData(data){
  if(!data || !data.type) return;
  switch(data.type){
    case 'move':
      // apply move from opponent (data.idx already placed? we have board copy)
      // For simplicity, overwrite local board with remote board and current
      state.board = data.board;
      state.queues = data.queues;
      state.current = data.current;
      state.moves = data.moves;
      // re-render all
      state.board.forEach((p,i)=>{
        const cell=boardEl.children[i];
        if(p) cell.innerHTML = figureDefs[state.figureSet].render(p);
        else cell.innerHTML='';
      });
      updateQueuesUI();
      updateWillRemoveMarks();
      const win = checkWin();
      if(win){
        state.gameOver=true;
        handleWin(win.player, win.combo);
      } else {
        if(!state.threeFigures && state.board.every(Boolean)){
          state.gameOver=true;
          handleDraw();
        } else updateTurnUI();
      }
      break;
    case 'reset':
      resetBoard(true);
      break;
    case 'sync':
      if(!state.isHost){
        state.board = data.board;
        state.current = data.current;
        state.queues = data.queues;
        state.scores = data.scores||state.scores;
        state.figureSet = data.figureSet||state.figureSet;
        state.threeFigures = !!data.threeFigures;
        state.rounds = data.rounds||0;
        // re-render
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

// Events
$$('.mode-btn').forEach(btn=>{
  btn.addEventListener('click',()=> setMode(btn.dataset.mode));
});
$$('[data-group="difficulty"] button').forEach(b=>{
  b.addEventListener('click',()=> setDifficulty(b.dataset.value));
});
$$('.design-btn').forEach(b=>{
  b.addEventListener('click',()=> applyTheme(b.dataset.theme));
});
$$('.figure-btn').forEach(b=>{
  b.addEventListener('click',()=> applyFigures(b.dataset.figures));
});
$('#btnReset').addEventListener('click',()=>{
  state.scores={X:0,O:0,D:0}; state.streak={X:0,O:0}; state.rounds=0;
  saveStats(); updateScoreUI(); resetBoard(false); toast('Статистика и поле сброшены');
});
$('#btnNextRound').addEventListener('click',()=>{ resetBoard(true); });
$('#btnShareWin').addEventListener('click',()=>{
  const txt=`Я выиграл в TIC TAC THREE! Счет ${state.scores.X}:${state.scores.O} 🎯`;
  if(navigator.share){ navigator.share({title:'TIC TAC THREE', text:txt}).catch(()=>{}); }
  else { navigator.clipboard.writeText(txt).then(()=>toast('Скопировано в буфер')); }
});
$('#threeFiguresToggle').addEventListener('change', e=>{
  state.threeFigures=e.target.checked;
  localStorage.setItem('ttt-three', state.threeFigures?'1':'0');
  updateRuleDesc();
  resetBoard(true);
  toast(state.threeFigures ? 'Режим Три фигуры включён' : 'Классический режим');
});
$('#btnCreateRoom').addEventListener('click', createRoom);
$('#btnJoinRoom').addEventListener('click', joinRoom);
$('#btnLeaveRoom').addEventListener('click', leaveRoom);
$('#btnCopyCode').addEventListener('click', ()=>{
  if(state.roomCode){ navigator.clipboard.writeText(state.roomCode).then(()=>toast('Код скопирован')); }
});
$('#joinCodeInput').addEventListener('keydown', e=>{ if(e.key==='Enter') joinRoom(); });

resultOverlay.addEventListener('click', e=>{
  if(e.target===resultOverlay) hideResult();
});

// Keyboard shortcuts: R reset, N next
window.addEventListener('keydown', e=>{
  if(e.key.toLowerCase()==='r') resetBoard(true);
  if(e.key.toLowerCase()==='n' && !resultOverlay.classList.contains('hidden')) resetBoard(true);
});

// Initial mode UI
setMode(state.mode);
setDifficulty(state.difficulty);
applyTheme(document.documentElement.getAttribute('data-theme'));

// Expose for debug
window.TTT = state;
