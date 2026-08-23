// SPECK DualSense-on-Linux test: non-standard evdev layout
// axes [LX, LY, L2, RX, RY, R2, hatX, hatY] with triggers resting at -1.
import fs from 'node:fs'; import { JSDOM } from 'jsdom';
const html = fs.readFileSync('./speck.html','utf8');
const dom = new JSDOM('<body>'+html+'</body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://localhost/?seed=424242'});
const w = dom.window;
function makeCtx(){const g={addColorStop(){}};const s={};const i={createImageData:(a,b)=>({data:new Uint8ClampedArray(a*b*4)}),putImageData(){},fillRect(){},clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},save(){},restore(){},translate(){},rotate(){},scale(){},setTransform(){},drawImage(){},measureText:()=>({width:9}),createRadialGradient:()=>g,createLinearGradient:()=>g,ellipse(){},rect(){},clip(){},closePath(){},fillText(){},quadraticCurveTo(){},setLineDash(){}};return new Proxy({},{get:(t,p)=>p in i?i[p]:(p in s?s[p]:()=>{}),set:(t,p,v)=>{s[p]=v;return true}});}
w.HTMLCanvasElement.prototype.getContext=function(){return makeCtx();};
let q=[];w.requestAnimationFrame=cb=>{q.push(cb);return 1};w.cancelAnimationFrame=()=>{};
let n=0;w.performance.now=()=>n;w.AudioContext=undefined;
Object.defineProperty(w,'innerWidth',{value:1280});Object.defineProperty(w,'innerHeight',{value:800});

const ds = { connected:true, id:'Sony Interactive Entertainment DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  mapping:'',                                       // <- the Linux problem case
  axes:[0,0,-1,0,0,-1,0,0],                          // LX LY L2 RX RY R2 hatX hatY
  buttons:Array.from({length:13},()=>({pressed:false})) };
let plugged=false;
Object.defineProperty(w.navigator,'getGamepads',{configurable:true,value:()=>plugged?[ds]:[]});
function pump(k){for(let i=0;i<k;i++){n+=16.7;const b=q;q=[];for(const cb of b)cb(n)}}
function press(i){ds.buttons[i].pressed=true;pump(2);ds.buttons[i].pressed=false;pump(2);}

w.eval(/<script>([\s\S]*)<\/script>/.exec(html)[1]);
const S=w.SPECK;let G=null;
const ru=S.modules.sim.update;S.modules.sim.update=function(g,dt){G=g;return ru.call(this,g,dt)};
let fails=0;const check=(nm,c,d)=>{if(c)console.log('  ✓ '+nm);else{fails++;console.log('  ✗ '+nm+(d?' — '+d:''))}};

pump(3);[...w.document.querySelectorAll('button')].find(b=>/begin/i.test(b.textContent)).click();
w.document.getElementById('game').dispatchEvent(new w.MouseEvent('pointermove',{clientX:640,clientY:400,bubbles:true}));
pump(5);

const playerShots=()=>G.shots.filter(s=>!s.hostile).length;
plugged=true;
pump(2);               // first sight at rest -> baseline calibration
ds.axes[0]=0.3; pump(3); ds.axes[0]=0;   // real stick blip wakes the pad
pump(20);
check('THE BUG: no phantom fire with triggers at rest (-1)', G.input.fire===false && playerShots()===0,
      'fire='+G.input.fire+' playerShots='+playerShots());
check('pad idle = no phantom thrust/aim from L2 axis', G.input.thrust===0, 'thrust='+G.input.thrust);

// left stick on axes[0,1]
ds.axes[0]=1; const x0=G.player.x; pump(60); ds.axes[0]=0;
check('left stick swims (axes 0/1)', G.player.x>x0+5, x0.toFixed(1)+' -> '+G.player.x.toFixed(1));

// arm a toxin gland
G.dna+=200;
G.hooks.uiBuy('vac');G.hooks.uiBuy('cil');G.hooks.uiBuy('chl');G.hooks.uiBuy('sen');G.hooks.uiBuy('tox');
const g1=G.player.genome.slice(); g1[2]='tox';
G.player.biomass=500; pump(3); G.hooks.uiDivide(g1); pump(5);

// right stick is axes[3,4] in this layout
G.shots.length=0;
ds.axes[4]=1;           // RY down
pump(80);
check('right stick fires on axes 3/4', playerShots()>0, 'playerShots='+playerShots());
{const mine=G.shots.filter(s=>!s.hostile);const sh=mine[mine.length-1];
  if(sh) check('fires downward', sh.vy>Math.abs(sh.vx)*0.5, 'v=('+sh.vx.toFixed(0)+','+sh.vy.toFixed(0)+')');
  else {check('fires downward', false, 'no player shot');}}
ds.axes[4]=0; pump(5);

// R2 trigger axis: -1 rest -> +0.2 pressed
G.shots.length=0;
ds.axes[5]=0.2; pump(80); ds.axes[5]=-1;
check('R2 trigger axis fires', playerShots()>0, 'playerShots='+playerShots());

// face buttons: triangle=2 in evdev order; contextual divide
G.player.biomass=500; pump(3);
check('divideReady', G.divideReady===true);
press(2);
check('triangle (btn2) opens divide editor', G.screen==='mutate', 'screen='+G.screen);

// hat dpad navigation + cross select + circle back
const seen=new Map();
w.HTMLElement.prototype.getBoundingClientRect=function(){
  if(!seen.has(this))seen.set(this,seen.size);const i=seen.get(this);
  return {left:20,top:30+i*40,width:120,height:28,right:140,bottom:58+i*40,x:20,y:30+i*40};};
pump(3);
const f1=w.document.querySelector('.pad-focus');
ds.axes[7]=1; pump(2); ds.axes[7]=0; pump(2);   // hat down
const f2=w.document.querySelector('.pad-focus');
check('hat d-pad moves focus', f2 && f2!==f1, f2&&f2.textContent.slice(0,18));
press(1);                                        // circle = back
check('circle backs out', G.screen==='play', 'screen='+G.screen);

// contextual face button -> tree when not divide-ready
G.player.biomass=30; G.divideReady=false; pump(3);
press(3);
check('face button opens tree when not divide-ready', G.screen==='tree', 'screen='+G.screen);
press(1);

// THE TOUCHPAD FIX: mouse events mid-stick must not steal authority
ds.axes[0]=1;                                    // stick held right
pump(5);
w.document.getElementById('game').dispatchEvent(new w.MouseEvent('pointermove',{clientX:100,clientY:700,bubbles:true}));
pump(5);                                          // graze = fresh mouse.t
check('touchpad graze does not steal the sticks', G.input.aimX > G.player.x && G.input.thrust===1,
      'aim dx='+(G.input.aimX-G.player.x).toFixed(0)+' thrust='+G.input.thrust);
ds.axes[0]=0; pump(10);
w.document.getElementById('game').dispatchEvent(new w.MouseEvent('pointermove',{clientX:100,clientY:700,bubbles:true}));
pump(5);
check('mouse regains control once stick is idle', G.input.aimX < G.player.x, 'aim dx='+(G.input.aimX-G.player.x).toFixed(0));

// options (btn 9) pauses
press(9); check('options pauses', G.paused===true); press(9);

// share (btn 8) toggles the inspector overlay
press(8);
const dbg=w.document.getElementById('pad-debug');
check('share toggles pad inspector', dbg && dbg.style.display!=='none' && /calibrated remap/.test(dbg.textContent),
      dbg?dbg.textContent.split('\n')[1]:'no el');
press(8);

console.log('\n'+(fails?fails+' FAILURES':'ALL PASS'));
process.exit(fails?1:0);
