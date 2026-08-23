// SPECK controller test: fake Gamepad through the real loop.
import fs from 'node:fs'; import { JSDOM } from 'jsdom';
const html = fs.readFileSync('./speck.html','utf8');
const dom = new JSDOM('<body>'+html+'</body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://localhost/'});
const w = dom.window;
function makeCtx(){const g={addColorStop(){}};const s={};const i={createImageData:(a,b)=>({data:new Uint8ClampedArray(a*b*4)}),putImageData(){},fillRect(){},clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},save(){},restore(){},translate(){},rotate(){},scale(){},setTransform(){},drawImage(){},measureText:()=>({width:9}),createRadialGradient:()=>g,createLinearGradient:()=>g,ellipse(){},rect(){},clip(){},closePath(){},fillText(){},quadraticCurveTo(){},setLineDash(){}};return new Proxy({},{get:(t,p)=>p in i?i[p]:(p in s?s[p]:()=>{}),set:(t,p,v)=>{s[p]=v;return true}});}
w.HTMLCanvasElement.prototype.getContext=function(){return makeCtx();};
let q=[];w.requestAnimationFrame=cb=>{q.push(cb);return 1};w.cancelAnimationFrame=()=>{};
let n=0;w.performance.now=()=>n;w.AudioContext=undefined;
Object.defineProperty(w,'innerWidth',{value:1280});Object.defineProperty(w,'innerHeight',{value:800});

// fake gamepad
const fakePad = { connected:true, axes:[0,0,0,0],
  buttons: Array.from({length:17},()=>({pressed:false})) };
let padPlugged = false;
Object.defineProperty(w.navigator,'getGamepads',{configurable:true,value:()=>padPlugged?[fakePad]:[]});

function pump(k){for(let i=0;i<k;i++){n+=16.7;const b=q;q=[];for(const cb of b)cb(n)}}
function press(i){fakePad.buttons[i].pressed=true;pump(2);fakePad.buttons[i].pressed=false;pump(2);}

w.eval(/<script>([\s\S]*)<\/script>/.exec(html)[1]);
const S=w.SPECK;let G=null;
const ru=S.modules.sim.update;S.modules.sim.update=function(g,dt){G=g;return ru.call(this,g,dt)};
let fails=0;
const check=(name,cond,det)=>{ if(cond)console.log('  ✓ '+name); else {fails++;console.log('  ✗ '+name+(det?' — '+det:''))} };

pump(3);
[...w.document.querySelectorAll('button')].find(b=>/begin/i.test(b.textContent)).click();
w.document.getElementById('game').dispatchEvent(new w.MouseEvent('pointermove',{clientX:640,clientY:400,bubbles:true}));
pump(10);
check('game running (mouse era)', G && G.screen==='play');

// --- plug in the pad, push left stick right ---
padPlugged = true;
fakePad.axes[0]=1; fakePad.axes[1]=0;
const x0=G.player.x;
pump(60);
check('pad takes authority + swims right', G.player.x > x0+5, x0.toFixed(1)+' -> '+G.player.x.toFixed(1));
check('thrust from stick magnitude', G.input.thrust===1, 'thrust='+G.input.thrust);

// --- twin-stick: right stick DOWN fires downward while moving right ---
G.dna += 200;
G.hooks.uiBuy('vac');G.hooks.uiBuy('cil');G.hooks.uiBuy('chl');G.hooks.uiBuy('sen');G.hooks.uiBuy('tox');
const g1=G.player.genome.slice(); g1[2]='tox';
G.player.biomass = 500; pump(3); G.hooks.uiDivide(g1);
pump(5);
G.shots.length=0;
fakePad.axes[2]=0; fakePad.axes[3]=1;   // right stick down
pump(80);
check('right stick fires', G.input.fire===true && G.shots.length>0, 'shots='+G.shots.length);
if(G.shots.length){
  const sh=G.shots[G.shots.length-1];
  check('fire aim decoupled from move aim (shoots down)', sh.vy > Math.abs(sh.vx)*0.5, 'v=('+sh.vx.toFixed(0)+','+sh.vy.toFixed(0)+')');
}
check('still steering right while firing down', G.input.aimX > G.player.x, 'aimX-x='+(G.input.aimX-G.player.x).toFixed(0));
fakePad.axes[3]=0; fakePad.axes[0]=0; pump(5);

// --- Start pauses ---
press(9); check('Start pauses', G.paused===true);
press(9); check('Start unpauses', G.paused===false);

// --- Y opens divide editor when ready; focus nav; B backs out ---
// jsdom has no layout: synthesize rects (only elements on visible screens count
// in real browsers; here everything gets a rect, which is fine for these asserts)
const seen=new Map();let rc=0;
w.HTMLElement.prototype.getBoundingClientRect=function(){
  if(!seen.has(this))seen.set(this,seen.size);
  const i=seen.get(this);
  return {left:20,top:30+i*40,width:120,height:28,right:140,bottom:58+i*40,x:20,y:30+i*40};
};
G.player.biomass=500; pump(3);
check('divideReady again', G.divideReady===true);
press(3);
check('Y opens mutate screen', G.screen==='mutate', 'screen='+G.screen);
pump(3);
let f1=w.document.querySelector('.pad-focus');
check('auto-focus set in menu', !!f1, 'none');
press(13);  // dpad down
let f2=w.document.querySelector('.pad-focus');
check('dpad moves focus', f2 && f2!==f1, f2&&f2.textContent.slice(0,20));
press(1);   // B
check('B backs out to play', G.screen==='play', 'screen='+G.screen);

// --- X opens tree; A clicks focused; B closes ---
press(2);
check('X opens tree', G.screen==='tree');
pump(3);
press(0);   // A on whatever is focused (a buy node or CLOSE)
press(1);
check('B closes tree', G.screen==='play');

// --- mouse takeover after pad idle ---
n+=3000;
w.document.getElementById('game').dispatchEvent(new w.MouseEvent('pointermove',{clientX:200,clientY:400,bubbles:true}));
pump(10);
check('mouse regains authority when moved later', G.input.aimX < G.player.x, 'aim dx='+(G.input.aimX-G.player.x).toFixed(0));

// --- unplug: no crash, mouse still fine ---
padPlugged=false; pump(30);
check('unplug is clean', G.screen==='play' && Number.isFinite(G.player.x));

console.log('\n'+(fails? fails+' FAILURES':'ALL PASS'));
process.exit(fails?1:0);
