/*** Animated Background - canvas + orbs + parallax ***/
const canvas = document.getElementById('bgCanvas');
if(canvas){
  const ctx = canvas.getContext('2d', {alpha: true});
  let w=0,h=0,dpr=1;
  let particles=[];
  let mouse={x:0.5,y:0.5, active:false};
  let theme = document.documentElement.getAttribute('data-theme') || 'nebula';
  let raf=0;
  let time=0;

  function resize(){
    dpr = Math.min(window.devicePixelRatio||1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w*dpr;
    canvas.height = h*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    createParticles();
  }

  function getThemeColors(){
    const s = getComputedStyle(document.documentElement);
    const accent = s.getPropertyValue('--accent').trim() || '#8a7bff';
    const accent2 = s.getPropertyValue('--accent-2').trim() || '#ff6ec7';
    const accent3 = s.getPropertyValue('--accent-3').trim() || '#5dfdcb';
    // parse? keep as css string for canvas we need rgb
    return [accent, accent2, accent3];
  }
  function hexToRgb(str){
    // try to parse rgb(a) or hex or any css? simplify: let browser compute via dummy div
    const d=document.createElement('div');
    d.style.color=str; document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    d.remove();
    const m = c.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if(m) return {r:+m[1], g:+m[2], b:+m[3]};
    return {r:138,g:123,b:255};
  }

  function createParticles(){
    const count = theme==='frost' ? 28 : theme==='clay' ? 22 : 36;
    particles = [];
    const colors = getThemeColors().map(hexToRgb);
    for(let i=0;i<count;i++){
      particles.push({
        x: Math.random()*w,
        y: Math.random()*h,
        vx: (Math.random()-0.5)*0.26,
        vy: (Math.random()-0.5)*0.26,
        r: (theme==='frost'? 1.2 : 2.2) + Math.random()*(theme==='frost'?2.5:4.5),
        c: colors[Math.floor(Math.random()*colors.length)],
        phase: Math.random()*Math.PI*2,
        alpha: 0.35 + Math.random()*0.55,
      });
    }
  }

  function draw(){
    time+=0.008;
    ctx.clearRect(0,0,w,h);
    // soft gradient veil
    // draw connections
    const colors = getThemeColors().map(hexToRgb);
    // move
    for(const p of particles){
      p.x += p.vx + (mouse.active ? (mouse.x*w - p.x)*0.0008 : 0);
      p.y += p.vy + (mouse.active ? (mouse.y*h - p.y)*0.0008 : 0);
      p.phase += 0.012;
      // wrap
      if(p.x< -50) p.x = w+50;
      if(p.x> w+50) p.x = -50;
      if(p.y< -50) p.y = h+50;
      if(p.y> h+50) p.y = -50;

      // glow circle
      const pulse = Math.sin(p.phase)*0.25+0.75;
      ctx.beginPath();
      const grad = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*8);
      grad.addColorStop(0, `rgba(${p.c.r},${p.c.g},${p.c.b},${p.alpha*pulse*0.22})`);
      grad.addColorStop(1, `rgba(${p.c.r},${p.c.g},${p.c.b},0)`);
      ctx.fillStyle = grad;
      ctx.arc(p.x,p.y,p.r*8,0,Math.PI*2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = `rgba(${p.c.r},${p.c.g},${p.c.b},${p.alpha})`;
      ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fill();
    }

    // connections for nebula/frost
    if(theme!=='clay' || true){
      ctx.lineWidth = theme==='frost'?0.6:0.8;
      for(let i=0;i<particles.length;i++){
        for(let j=i+1;j<particles.length;j++){
          const a=particles[i], b=particles[j];
          const dx=a.x-b.x, dy=a.y-b.y;
          const dist = Math.hypot(dx,dy);
          if(dist< (theme==='frost'? 150 : 180)){
            const op = (1 - dist/180) * 0.12 * (theme==='nebula'?1.4:0.8);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${a.c.r},${a.c.g},${a.c.b},${op})`;
            ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
          }
        }
      }
    }

    // vignette moving mesh
    if(theme==='nebula'){
      // subtle moving large blobs via globalCompositeOperation?
      ctx.globalCompositeOperation='soft-light';
      const gx = Math.sin(time*0.6)*w*0.15 + w*0.3;
      const gy = Math.cos(time*0.4)*h*0.15 + h*0.3;
      const g = ctx.createRadialGradient(gx,gy,0,gx,gy,Math.max(w,h)*0.8);
      g.addColorStop(0, 'rgba(138,123,255,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
      const gx2 = Math.cos(time*0.5)*w*0.2 + w*0.65;
      const gy2 = Math.sin(time*0.7)*h*0.2 + h*0.6;
      const g2 = ctx.createRadialGradient(gx2,gy2,0,gx2,gy2,Math.max(w,h)*0.6);
      g2.addColorStop(0, 'rgba(255,110,199,0.07)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle=g2; ctx.fillRect(0,0,w,h);
      ctx.globalCompositeOperation='source-over';
    }

    raf = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  canvas.addEventListener('pointermove', e=>{
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left)/rect.width;
    mouse.y = (e.clientY - rect.top)/rect.height;
    mouse.active = true;
  });
  canvas.addEventListener('pointerleave', ()=> mouse.active=false);

  const obs = new MutationObserver(()=>{
    const newTheme = document.documentElement.getAttribute('data-theme');
    if(newTheme!==theme){ theme=newTheme; createParticles(); }
  });
  obs.observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});

  resize();
  draw();

  // Parallax for orbs based on mouse
  const orbs = document.querySelectorAll('.orb');
  window.addEventListener('pointermove', e=>{
    const x = (e.clientX / window.innerWidth - 0.5);
    const y = (e.clientY / window.innerHeight - 0.5);
    orbs.forEach((orb,i)=>{
      const depth = (i+1)*0.6;
      orb.style.transform = `translate3d(${x*depth*30}px, ${y*depth*20}px, 0) scale(${1 + Math.abs(x)*0.03})`;
    });
    const boardShell = document.querySelector('.board-shell');
    if(boardShell){
      boardShell.style.transform = `perspective(800px) rotateX(${y*-2}deg) rotateY(${x*3}deg)`;
    }
  });

  // Add grain texture via CSS? canvas noise already
  // Optimize performance: pause when tab hidden
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden) cancelAnimationFrame(raf);
    else { cancelAnimationFrame(raf); raf=requestAnimationFrame(draw); }
  });
}
