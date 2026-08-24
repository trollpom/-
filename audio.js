/*** Audio Engine - procedural Web Audio API ***/
class AudioEngine {
  constructor(){
    this.enabled = localStorage.getItem('ttt-sound') !== '0';
    this.ctx = null;
    this.master = null;
    this._initTried = false;
  }
  _ensure(){
    if(this.ctx) return;
    if(!this._initTried){
      this._initTried = true;
      try{
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.22;
        this.master.connect(this.ctx.destination);
      }catch(e){
        console.warn('WebAudio not supported', e);
      }
    }
    if(this.ctx && this.ctx.state === 'suspended'){
      this.ctx.resume();
    }
  }
  toggle(){
    this.enabled = !this.enabled;
    localStorage.setItem('ttt-sound', this.enabled ? '1':'0');
    if(this.enabled) this._ensure();
    return this.enabled;
  }
  isEnabled(){ return this.enabled; }
  _tone({freq=440, freqEnd, type='sine', duration=0.25, gain=0.5, slide=0, delay=0}){
    if(!this.enabled) return;
    this._ensure();
    if(!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if(freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0+duration);
    else if(slide) osc.frequency.linearRampToValueAtTime(freq+slide, t0+duration*0.7);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+duration);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0+duration+0.02);
  }
  _noise({duration=0.2, gain=0.3, filterFreq=2000, delay=0}){
    if(!this.enabled) return;
    this._ensure();
    if(!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/bufferSize, 2);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type='bandpass'; filter.frequency.value=filterFreq; filter.Q.value=1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+duration);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t0);
  }
  click(){ this._tone({freq: 900, type:'sine', duration:0.09, gain:0.35}); }
  hover(){ this._tone({freq: 1200, freqEnd: 1600, type:'sine', duration:0.12, gain:0.08}); }
  place(player){
    if(player==='X'){
      this._tone({freq: 420, freqEnd: 880, type:'sine', duration:0.18, gain:0.5});
      this._tone({freq: 880, type:'triangle', duration:0.22, gain:0.18, delay:0.06});
      this._noise({duration:0.08, gain:0.06, filterFreq: 3000, delay:0.0});
    }else{
      this._tone({freq: 350, freqEnd: 220, type:'sine', duration:0.24, gain:0.45});
      this._tone({freq: 520, freqEnd: 330, type:'sine', duration:0.28, gain:0.22, delay:0.04});
    }
  }
  remove(){
    this._tone({freq: 700, freqEnd: 120, type:'sawtooth', duration:0.28, gain:0.18});
    this._noise({duration:0.18, gain:0.12, filterFreq: 800});
  }
  win(){
    const base = 440;
    const steps = [0,4,7,12,16];
    steps.forEach((s,i)=>{
      this._tone({freq: base * Math.pow(2, s/12), type: i%2?'triangle':'sine', duration:0.5, gain:0.38, delay:i*0.09});
    });
    setTimeout(()=> this._tone({freq: base*2.5, type:'sine', duration:0.8, gain:0.25}), 350);
  }
  lose(){
    [0, -2, -5].forEach((s,i)=>{
      this._tone({freq: 330 * Math.pow(2, s/12), type:'triangle', duration:0.4, gain:0.3, delay:i*0.12});
    });
  }
  draw(){
    this._tone({freq: 500, freqEnd: 400, type:'sine', duration:0.3, gain:0.3});
    this._tone({freq: 400, freqEnd: 300, type:'sine', duration:0.5, gain:0.25, delay:0.14});
  }
  turn(){
    this._tone({freq: 600, type:'sine', duration:0.07, gain:0.12});
  }
  start(){
    this._tone({freq: 220, freqEnd: 440, type:'sine', duration:0.5, gain:0.3});
    this._tone({freq: 440, freqEnd: 880, type:'triangle', duration:0.6, gain:0.18, delay:0.2});
  }
  diceRoll(){
    for(let i=0;i<6;i++){
      this._tone({freq: 300 + Math.random()*800, type:'square', duration:0.08, gain:0.18, delay:i*0.07});
    }
  }
  diceWin(){
    this._tone({freq: 600, freqEnd: 1200, type:'sine', duration:0.35, gain:0.4});
    this._tone({freq: 900, type:'triangle', duration:0.4, gain:0.25, delay:0.15});
  }
  shoot(power=0.8){
    const f = 180 + power*500;
    this._tone({freq: f, freqEnd: f*0.6, type:'sawtooth', duration:0.18, gain:0.35*power});
    this._noise({duration:0.12, gain:0.12*power, filterFreq: 2000+power*3000});
  }
  collide(vel=1){
    const v = Math.min(1, vel*3);
    if(v<0.05) return;
    this._tone({freq: 200 + v*600, type:'sine', duration:0.08, gain:0.12*v});
    this._noise({duration:0.06, gain:0.06*v, filterFreq: 1200});
  }
  out(){
    this._tone({freq: 400, freqEnd: 80, type:'triangle', duration:0.4, gain:0.3});
    this._noise({duration:0.25, gain:0.15, filterFreq: 600});
  }
  tick(){
    this._tone({freq: 1000, type:'sine', duration:0.04, gain:0.12});
  }
}

export const audio = new AudioEngine();

// Unlock audio on first user gesture
['click','touchstart','keydown'].forEach(ev=>{
  window.addEventListener(ev, ()=>{ audio._ensure(); }, {once:true});
});
