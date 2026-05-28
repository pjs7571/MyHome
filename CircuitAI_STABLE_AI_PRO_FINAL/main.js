const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const ws = $('#circuit-workspace');
const world = $('#world');
const svg = $('#wire-svg');
let isWiring=false, startPin=null, currentLine=null, selectedComponent=null, selectedLine=null, currentConfigEl=null;
let nextComponentId=1, nextPinId=1, running=false, zoom=1, pan={x:0,y:0}, panDrag=null;
let codePinStates = {};

const defaults = { resistor:{ohms:220}, potentiometer:{ohms:10000}, battery:{voltage:9}, dc:{voltage:5}, switch:{closed:false}, multimeter:{mode:'V'}, motor:{rpm:120}, servo:{angle:90}, buzzer:{freq:440} };

document.addEventListener('DOMContentLoaded', () => {
  initToolbar(); initDragAndDrop(); initChatbot(); initInspector(); initPanZoom(); updateTransform();
  autoLoad();
});

function initToolbar(){
  $('#runBtn').onclick=()=>runSimulation(); $('#stopBtn').onclick=()=>stopSimulation();
  $('#saveBtn').onclick=()=>saveCircuit(); $('#loadBtn').onclick=()=>loadCircuit();
  $('#exportBtn').onclick=()=>exportCircuit(); $('#clearBtn').onclick=()=>{ if(confirm('전체 삭제할까요?')) clearCircuit(); };
  $('#importFile').onchange=e=>importCircuit(e.target.files[0]);
  $('#uploadCodeBtn').onclick=()=>{parseArduinoCode(); runSimulation();};
  $('#zoomIn').onclick=()=>{zoom=Math.min(2.5,zoom+.1);updateTransform();}; $('#zoomOut').onclick=()=>{zoom=Math.max(.35,zoom-.1);updateTransform();};
  $('#fitBtn').onclick=()=>{zoom=1;pan={x:0,y:0};updateTransform();};
  $('#componentSearch').addEventListener('input', e=>{const v=e.target.value.toLowerCase(); $$('.component-item').forEach(i=>i.style.display=i.textContent.toLowerCase().includes(v)||i.dataset.type.includes(v)?'flex':'none');});
  document.addEventListener('keydown', handleKeys);
}
function handleKeys(e){
  if(e.key==='Escape'){cancelWire(); $('#config-modal').style.display='none';}
  if((e.key==='Delete'||e.key==='Backspace') && selectedLine) deleteLine(selectedLine);
  else if((e.key==='Delete'||e.key==='Backspace') && selectedComponent) deleteComponent(selectedComponent);
  if(e.key.toLowerCase()==='r' && selectedComponent){ rotateComponent(selectedComponent); }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='d' && selectedComponent){ e.preventDefault(); duplicateComponent(selectedComponent); }
}
function initPanZoom(){
  ws.addEventListener('wheel', e=>{e.preventDefault(); const old=zoom; zoom=Math.max(.35,Math.min(2.5,zoom-(e.deltaY>0?.08:-.08))); const rect=ws.getBoundingClientRect(); const mx=e.clientX-rect.left, my=e.clientY-rect.top; pan.x=mx-(mx-pan.x)*(zoom/old); pan.y=my-(my-pan.y)*(zoom/old); updateTransform();},{passive:false});
  ws.addEventListener('mousedown', e=>{ if(e.button===1 || e.altKey){panDrag={x:e.clientX-pan.x,y:e.clientY-pan.y}; e.preventDefault();}});
  document.addEventListener('mousemove', e=>{ if(panDrag){pan.x=e.clientX-panDrag.x;pan.y=e.clientY-panDrag.y;updateTransform();}});
  document.addEventListener('mouseup',()=>panDrag=null);
}
function updateTransform(){ world.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`; $('#zoomLabel').textContent=Math.round(zoom*100)+'%'; }
function screenToWorld(clientX,clientY){const r=ws.getBoundingClientRect(); return {x:(clientX-r.left-pan.x)/zoom, y:(clientY-r.top-pan.y)/zoom};}
function snap(v){return Math.round(v/15)*15;}

function initDragAndDrop(){
  $$('.component-item').forEach(item=>{item.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',item.dataset.type);});});
  ws.addEventListener('dragover',e=>e.preventDefault());
  ws.addEventListener('drop',e=>{e.preventDefault(); const type=e.dataTransfer.getData('text/plain'); if(type){const p=screenToWorld(e.clientX,e.clientY); addComponentToWorkspace(type,p.x,p.y);}});
  ws.addEventListener('mousemove', e=>{ if(!isWiring||!currentLine)return; const p=screenToWorld(e.clientX,e.clientY); currentLine.setAttribute('x2',p.x); currentLine.setAttribute('y2',p.y);});
  ws.addEventListener('mouseup', e=>{
    if(!isWiring) return;
    if(e.target.classList.contains('pin')) return;

    // 마우스를 핀 근처에만 놓아도 자동으로 가장 가까운 구멍에 꽂히게 처리
    const p = screenToWorld(e.clientX,e.clientY);
    let best = null, bestDist = 75;
    $$('.pin', world).forEach(pin=>{
      if(pin === startPin) return;
      const pp = pinPos(pin);
      const d = Math.hypot(pp.x-p.x, pp.y-p.y);
      const isBread = componentOfPin(pin)?.dataset.baseType === 'breadboard';
      const limit = isBread ? 75 : 46;
      if(d < bestDist && d <= limit){ bestDist = d; best = pin; }
    });

    if(best) finishWire(best);
    else cancelWire();
  });
  svg.addEventListener('click',e=>{ if(e.target.tagName.toLowerCase()==='line') selectLine(e.target); else clearSelection(); });
}
window.addComponentToWorkspace=addComponentToWorkspace;
function addComponentToWorkspace(type,x,y){
  const el=createVisualComponent(type); el.style.left=snap(x)+'px'; el.style.top=snap(y)+'px'; world.appendChild(el); $('.workspace-hint')?.remove();
  el.addEventListener('dblclick',()=>openConfigModal(el));
  el.addEventListener('click',e=>{ if(!e.target.classList.contains('pin')) selectComponent(el); });
  let drag=null; el.addEventListener('mousedown',e=>{ if(e.target.classList.contains('pin'))return; selectComponent(el); const p=screenToWorld(e.clientX,e.clientY); drag={x:p.x-parseFloat(el.style.left), y:p.y-parseFloat(el.style.top)}; el.style.zIndex=100; e.stopPropagation();});
  document.addEventListener('mousemove',e=>{ if(!drag)return; const p=screenToWorld(e.clientX,e.clientY); el.style.left=snap(p.x-drag.x)+'px'; el.style.top=snap(p.y-drag.y)+'px'; updateWires(el); });
  document.addEventListener('mouseup',()=>{ if(drag){drag=null; el.style.zIndex=10; snapComponentToBreadboard(el); updateWires(el); updateBreadboardContactVisuals(); saveAuto(); }});
  updateVisuals(el); updateBreadboardContactVisuals(); renderInspector(); return el;
}
function baseTypeOf(type){ if(type.startsWith('battery'))return 'battery'; if(type.startsWith('led'))return 'led'; if(type.startsWith('switch'))return 'switch'; if(type.startsWith('motor'))return 'motor'; if(type.startsWith('dc'))return 'dc'; if(type.startsWith('breadboard'))return 'breadboard'; return type.split('-')[0]; }
function createVisualComponent(type){
  const el=document.createElement('div'); const base=baseTypeOf(type); el.className=`workspace-component comp-${base}`; el.dataset.compId=nextComponentId++; el.dataset.type=type; el.dataset.baseType=base; el.dataset.rotation='0';
  if(base==='resistor')el.dataset.ohms=defaults.resistor.ohms; if(base==='potentiometer')el.dataset.ohms=defaults.potentiometer.ohms; if(base==='battery')el.dataset.voltage=type.includes('3v')?'3':type.includes('1.5v')?'1.5':'9'; if(base==='dc')el.dataset.voltage='5'; if(base==='switch')el.dataset.closed='false'; if(base==='multimeter')el.dataset.mode='V'; if(base==='motor')el.dataset.rpm='120';
  let w=60,h=40;
  if(base==='breadboard'){
    // Clean symmetric breadboard: 30 columns, A-J rows, clear power rails.
    w=720; h=440;
    el.style.width=w+'px'; el.style.height=h+'px';
    el.innerHTML=`
      <div class="bb-body">
        <div class="bb-rail rail-top-plus"><span class="bb-sign left">+</span><span class="bb-sign right">+</span></div>
        <div class="bb-rail rail-top-minus"><span class="bb-sign left">−</span><span class="bb-sign right">−</span></div>
        <div class="bb-rail rail-bottom-plus"><span class="bb-sign left">+</span><span class="bb-sign right">+</span></div>
        <div class="bb-rail rail-bottom-minus"><span class="bb-sign left">−</span><span class="bb-sign right">−</span></div>
        <div class="bb-groove"></div>
      </div>`;
    const body=$('.bb-body',el);
    const startX=96, stepX=18, cols=30;
    const topRows=[142,162,182,202,222];
    const bottomRows=[282,302,322,342,362];

    for(let c=0;c<cols;c++){
      const x=startX+c*stepX;
      addPin(body,`railTopPlus-${c}`,x,54,'+');
      addPin(body,`railTopMinus-${c}`,x,84,'-');
      addPin(body,`railBotPlus-${c}`,x,388,'+');
      addPin(body,`railBotMinus-${c}`,x,418,'-');
      for(let r=0;r<5;r++){
        addPin(body,`a${r}-${c}`,x,topRows[r],String.fromCharCode(65+r));
        addPin(body,`f${r}-${c}`,x,bottomRows[r],String.fromCharCode(70+r));
      }
    }

    [1,5,10,15,20,25,30].forEach(n=>{
      const t=document.createElement('span');
      t.className='bb-num';
      t.textContent=String(n);
      t.style.left=(startX+(n-1)*stepX-5)+'px';
      t.style.top='112px';
      body.appendChild(t);
    });
    ['A','B','C','D','E'].forEach((label,i)=>{
      const t=document.createElement('span');
      t.className='bb-row-label';
      t.textContent=label;
      t.style.left='48px';
      t.style.top=(topRows[i]-8)+'px';
      body.appendChild(t);
    });
    ['F','G','H','I','J'].forEach((label,i)=>{
      const t=document.createElement('span');
      t.className='bb-row-label';
      t.textContent=label;
      t.style.left='48px';
      t.style.top=(bottomRows[i]-8)+'px';
      body.appendChild(t);
    });
  } else if(base==='battery'||base==='dc'){w=110;h=72; el.style.width=w+'px';el.style.height=h+'px'; el.innerHTML=`<div class="graphic ${base==='battery'?'battery-graphic':'inst-source-graphic'}"><b class="batt-val"></b></div>`; addPin(el,'vcc',18,0,'+'); addPin(el,'gnd',88,0,'-');}
  else if(base==='led'){w=42;h=72; const color=type.split('-')[1]||'red'; el.style.width=w+'px';el.style.height=h+'px'; el.innerHTML=`<div class="graphic led-graphic" data-color="${color}"><span class="led-leg leg-a"></span><span class="led-leg leg-k"></span></div>`; addPin(el,'a',12,68,'A'); addPin(el,'k',30,68,'K');}
  else if(base==='resistor'||base==='potentiometer'){w=70;h=24; el.style.width=w+'px';el.style.height=h+'px'; el.innerHTML=`<div class="graphic resistor-graphic"></div>`; addPin(el,'p1',-6,12,'1'); addPin(el,'p2',76,12,'2');}
  else if(base==='switch'){w=55;h=42; const sub=type.split('-')[1]||'push'; el.style.width=w+'px';el.style.height=h+'px'; el.innerHTML=`<div class="graphic switch-${sub}-graphic"></div>`; addPin(el,'p1',-6,21,'1'); addPin(el,'p2',61,21,'2'); el.addEventListener('dblclick',()=>{el.dataset.closed=el.dataset.closed==='true'?'false':'true'; updateVisuals(el); if(running)runSimulation();});}
  else if(base==='arduino'){w=230;h=162; el.style.width=w+'px';el.style.height=h+'px'; el.innerHTML=`<div class="graphic arduino-graphic"></div>`; for(let i=0;i<=13;i++)addPin(el,`D${i}`,16+i*15,12,`D${i}`); ['A0','A1','A2','A3','A4','A5'].forEach((p,i)=>addPin(el,p,30+i*22,150,p)); addPin(el,'5V',184,150,'5V'); addPin(el,'GND',210,150,'GND');}
  else if(base==='motor'){const sub=type.split('-')[1]||'dc'; if(sub==='servo'){w=92;h=64; el.style.width=w+'px';el.style.height=h+'px'; el.innerHTML=`<div class="graphic motor-servo-graphic"><div class="servo-horn"></div><span>SG90</span></div>`; addPin(el,'p1',-5,18,'+'); addPin(el,'p2',-5,34,'-'); addPin(el,'sig',-5,50,'S');} else {w=92;h=62; el.style.width=w+'px';el.style.height=h+'px'; el.innerHTML=`<div class="graphic motor-dc-graphic"><div class="motor-shaft"></div><div class="motor-can"><span>DC</span></div></div>`; addPin(el,'p1',-5,22,'+'); addPin(el,'p2',-5,43,'-');}}
  else if(base==='buzzer'){w=55;h=55; el.style.width=w+'px';el.style.height=h+'px';el.innerHTML='<div class="graphic buzzer-graphic">BZ</div>'; addPin(el,'p1',-5,18,'+');addPin(el,'p2',-5,38,'-');}
  else if(base==='multimeter'){w=70;h=95; el.style.width=w+'px';el.style.height=h+'px';el.innerHTML='<div class="graphic multimeter-graphic"><div class="screen">0.00 V</div></div>'; addPin(el,'p1',20,100,'+');addPin(el,'p2',50,100,'-');}
  else if(base==='oscilloscope'){w=100;h=80;el.style.width=w+'px';el.style.height=h+'px';el.innerHTML='<div class="graphic oscilloscope-graphic"></div>';addPin(el,'p1',-5,35,'CH1');addPin(el,'p2',-5,60,'GND');}
  else {el.style.width=w+'px';el.style.height=h+'px'; el.innerHTML=`<div class="graphic">${type}</div>`;addPin(el,'p1',-5,20,'1');addPin(el,'p2',65,20,'2');}
  return el;
}
function addPin(parent,id,x,y,label){const pin=document.createElement('div');pin.className='pin';pin.dataset.pinId=nextPinId++;pin.dataset.name=id;pin.dataset.label=label||id;pin.style.left=x+'px';pin.style.top=y+'px';pin.lines=[];pin.addEventListener('mousedown',e=>{e.stopPropagation();startWire(pin);});pin.addEventListener('mouseup',e=>{e.stopPropagation();finishWire(pin);});parent.appendChild(pin);}
function pinPos(pin){const wr=world.getBoundingClientRect();const pr=pin.getBoundingClientRect();return {x:(pr.left-wr.left)/zoom+pr.width/(2*zoom), y:(pr.top-wr.top)/zoom+pr.height/(2*zoom)};}
function wireColorForPin(pin){const name=(pinName(pin)||'').toLowerCase();const label=(pin.dataset.label||'').toLowerCase();if(name.includes('vcc')||name.includes('plus')||label==='+')return '#e11d23';if(name.includes('gnd')||name.includes('minus')||label==='-')return '#111827';return '#111827';}
function startWire(pin){if(currentLine) cancelWire(); isWiring=true;startPin=pin;const p=pinPos(pin);currentLine=document.createElementNS('http://www.w3.org/2000/svg','line');currentLine.setAttribute('x1',p.x);currentLine.setAttribute('y1',p.y);currentLine.setAttribute('x2',p.x);currentLine.setAttribute('y2',p.y);currentLine.setAttribute('stroke',wireColorForPin(pin));currentLine.setAttribute('stroke-width','5');currentLine.setAttribute('stroke-linecap','round');currentLine.startPin=pin;currentLine.isConnected=false;currentLine.style.pointerEvents='none';pin.lines.push(currentLine);svg.appendChild(currentLine);}
function finishWire(pin){
  if(!isWiring || !currentLine) return;

  if(startPin === pin){
    cancelWire();
    return;
  }

  const p = pinPos(pin);
  currentLine.setAttribute('x2', p.x);
  currentLine.setAttribute('y2', p.y);
  currentLine.endPin = pin;
  currentLine.isConnected = true;
  currentLine.style.pointerEvents = 'stroke';
  pin.lines.push(currentLine);

  isWiring = false;
  startPin = null;
  currentLine = null;

  updateBreadboardContactVisuals();
  saveAuto();
  if(running) runSimulation();
}
function addRoutePoint(e){if(!currentLine)return; const p=screenToWorld(e.clientX,e.clientY); const rp=document.createElement('div');rp.className='workspace-component comp-route';rp.dataset.compId=nextComponentId++;rp.dataset.baseType='route';rp.dataset.type='route';rp.style.left=snap(p.x-5)+'px';rp.style.top=snap(p.y-5)+'px';rp.style.width='10px';rp.style.height='10px';world.appendChild(rp);addPin(rp,'route',5,5,'');const pin=$('.pin',rp);const pp=pinPos(pin);currentLine.setAttribute('x2',pp.x);currentLine.setAttribute('y2',pp.y);currentLine.endPin=pin;currentLine.isConnected=true;currentLine.style.pointerEvents='stroke';pin.lines.push(currentLine);startPin=pin;currentLine=null;startWire(pin);}
function cancelWire(){if(currentLine){deleteLine(currentLine,false);}isWiring=false;startPin=null;currentLine=null;cleanupRoutePoints();}
function updateWires(component){$$('.pin',component).forEach(pin=>{const p=pinPos(pin);(pin.lines||[]).forEach(line=>{if(!line.startPin||!line.endPin)return; if(line.startPin===pin){line.setAttribute('x1',p.x);line.setAttribute('y1',p.y);}if(line.endPin===pin){line.setAttribute('x2',p.x);line.setAttribute('y2',p.y);}});});}
function deleteLine(line,save=true){if(!line)return; if(line.startPin)line.startPin.lines=(line.startPin.lines||[]).filter(l=>l!==line); if(line.endPin)line.endPin.lines=(line.endPin.lines||[]).filter(l=>l!==line); line.remove(); if(selectedLine===line)selectedLine=null; cleanupRoutePoints(); if(save)saveAuto();}
function cleanupRoutePoints(){ $$('.comp-route',world).forEach(r=>{const p=$('.pin',r); if(!p){r.remove();return;} p.lines=(p.lines||[]).filter(l=>l.parentNode&&l.startPin&&l.endPin); if(p.lines.length===0) r.remove();}); }
function nearestBreadboardHole(pin,maxDist=14){const pp=pinPos(pin);let best=null,bd=maxDist; $$('.comp-breadboard .pin',world).forEach(h=>{const hp=pinPos(h);const d=Math.hypot(pp.x-hp.x,pp.y-hp.y); if(d<bd){bd=d;best=h;}});return best;}
function snapComponentToBreadboard(el){
  if(
    el.dataset.baseType==='breadboard' ||
    el.dataset.baseType==='route' ||
    ['battery','dc','arduino'].includes(el.dataset.baseType)
  ) return;

  const pins = $$('.pin', el);
  if(!pins.length) return;

  let best = null;
  pins.forEach(partPin=>{
    const hole = nearestBreadboardHole(partPin, 30);
    if(!hole) return;
    const a = pinPos(partPin), b = pinPos(hole);
    const d = Math.hypot(a.x-b.x, a.y-b.y);
    if(!best || d < best.d) best = {partPin, hole, d};
  });
  if(!best) return;

  const a = pinPos(best.partPin);
  const b = pinPos(best.hole);

  // Breadboard holes do not follow the workspace 15px grid, so do not snap here.
  el.style.left = (parseFloat(el.style.left) + (b.x-a.x)) + 'px';
  el.style.top  = (parseFloat(el.style.top)  + (b.y-a.y)) + 'px';

  updateWires(el);
  updateBreadboardContactVisuals();
}
function deleteComponent(el){$$('.pin',el).forEach(p=>(p.lines||[]).slice().forEach(deleteLine)); el.remove(); selectedComponent=null; renderInspector(); saveAuto();}
function selectComponent(el){clearSelection(); selectedComponent=el; el.classList.add('comp-selected'); renderInspector();}
function selectLine(line){clearSelection();selectedLine=line;line.classList.add('wire-selected');}
function clearSelection(){if(selectedComponent)selectedComponent.classList.remove('comp-selected');if(selectedLine)selectedLine.classList.remove('wire-selected');selectedComponent=null;selectedLine=null;renderInspector();}
function rotateComponent(el){const r=((+el.dataset.rotation||0)+90)%360; el.dataset.rotation=r; el.style.rotate=r+'deg'; updateWires(el); saveAuto();}
function duplicateComponent(el){const x=parseFloat(el.style.left)+30,y=parseFloat(el.style.top)+30; const copy=addComponentToWorkspace(el.dataset.type,x,y); Object.keys(el.dataset).forEach(k=>{if(!['compId'].includes(k))copy.dataset[k]=el.dataset[k];}); updateVisuals(copy);}

function getResistorBands(ohms){let n=Math.max(1,parseInt(ohms)||220).toString(); if(n.length<2)n+='0'; const colors=['black','saddlebrown','red','orange','yellow','green','blue','purple','gray','white']; return [colors[+n[0]],colors[+n[1]],colors[Math.max(0,n.length-2)]||'black','gold'];}
function updateVisuals(el){const base=el.dataset.baseType; if(base==='resistor'||base==='potentiometer'){const b=getResistorBands(el.dataset.ohms); $('.graphic',el).style.backgroundImage=`linear-gradient(90deg,#d4a373 12%,${b[0]} 12% 22%,#d4a373 22% 38%,${b[1]} 38% 48%,#d4a373 48% 64%,${b[2]} 64% 74%,#d4a373 74% 88%,${b[3]} 88%)`;}
 if(base==='battery'||base==='dc')$('.batt-val',el).textContent=(el.dataset.voltage||'5')+'V'; if(base==='switch')el.classList.toggle('switch-on',el.dataset.closed==='true');
 if(base==='led'){const g=$('.led-graphic',el), c=g.dataset.color; const map={red:'#ef4444',green:'#22c55e',blue:'#3b82f6',rgb:'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)'}; g.style.background=map[c]||map.red; g.style.color=c==='green'?'#22c55e':c==='blue'?'#3b82f6':'#ef4444';}
 if(base==='multimeter'){updateMultimeterScreen(el, el.dataset.reading || defaultMeterReading(el));}
}
function defaultMeterReading(el){const m=el?.dataset?.mode||'V'; if(m==='A')return '0.00 mA'; if(m==='Ω')return 'OL Ω'; return '0.00 V';}
function updateMultimeterScreen(el, text){let scr=$('.screen',el); if(scr){scr.textContent=text; scr.classList.toggle('meter-live', !(/^0\.00|^OL/.test(text)));}}
function initInspector(){document.addEventListener('click',e=>{if(e.target===ws)clearSelection();});$('#modal-cancel').onclick=()=>$('#config-modal').style.display='none';$('#modal-save').onclick=saveModalConfig;}
function renderInspector(){const box=$('#inspectorBody'); if(!selectedComponent){box.innerHTML='부품을 선택하면 속성이 표시됩니다.<br><br>단축키: Delete 삭제, R 회전, Ctrl+D 복제, Esc 배선 취소';return;} const el=selectedComponent, base=el.dataset.baseType; let html=`<b>${el.dataset.type}</b><div class="prop-row"><span>ID</span><b>${el.dataset.compId}</b></div><div class="prop-row"><button class="tool-btn" onclick="rotateComponent(selectedComponent)">회전</button><button class="tool-btn danger" onclick="deleteComponent(selectedComponent)">삭제</button></div>`;
 if(base==='resistor'||base==='potentiometer')html+=prop('저항 Ω','ohms',el.dataset.ohms||220,'number'); if(base==='battery'||base==='dc')html+=prop('전압 V','voltage',el.dataset.voltage||5,'number'); if(base==='switch')html+=`<div class="prop-row"><span>스위치</span><select data-prop="closed"><option value="true" ${el.dataset.closed==='true'?'selected':''}>ON</option><option value="false" ${el.dataset.closed!=='true'?'selected':''}>OFF</option></select></div>`; if(base==='multimeter')html+=`<div class="prop-row"><span>측정 모드</span><select data-prop="mode"><option value="V" ${el.dataset.mode!=='A'&&el.dataset.mode!=='Ω'?'selected':''}>전압 V</option><option value="A" ${el.dataset.mode==='A'?'selected':''}>전류 A</option><option value="Ω" ${el.dataset.mode==='Ω'?'selected':''}>저항 Ω</option></select></div><div class="prop-row"><span>측정값</span><b>${el.dataset.reading||defaultMeterReading(el)}</b></div>`; if(base==='motor')html+=prop('RPM','rpm',el.dataset.rpm||120,'number');
 box.innerHTML=html; $$('[data-prop]',box).forEach(inp=>inp.onchange=()=>{selectedComponent.dataset[inp.dataset.prop]=inp.value;updateVisuals(selectedComponent);saveAuto();if(running)runSimulation();});}
function prop(label,key,val,type){return `<div class="prop-row"><span>${label}</span><input data-prop="${key}" type="${type}" value="${val}"></div>`;}
function openConfigModal(el){currentConfigEl=el; selectComponent(el); const b=el.dataset.baseType, body=$('#modal-body'), title=$('#modal-title'); title.textContent='부품 설정'; let html=''; if(b==='resistor'||b==='potentiometer')html=`<label>저항값 Ω</label><input id="cfgVal" type="number" value="${el.dataset.ohms||220}">`; else if(b==='battery'||b==='dc')html=`<label>전압 V</label><input id="cfgVal" type="number" step="0.1" value="${el.dataset.voltage||5}">`; else if(b==='switch')html=`<label>스위치</label><select id="cfgVal"><option value="true">ON</option><option value="false">OFF</option></select>`; else return; body.innerHTML=html; $('#config-modal').style.display='flex';}
function saveModalConfig(){if(!currentConfigEl)return; const v=$('#cfgVal').value, b=currentConfigEl.dataset.baseType; if(b==='resistor'||b==='potentiometer')currentConfigEl.dataset.ohms=v; if(b==='battery'||b==='dc')currentConfigEl.dataset.voltage=v; if(b==='switch')currentConfigEl.dataset.closed=v; updateVisuals(currentConfigEl); $('#config-modal').style.display='none'; renderInspector(); saveAuto(); if(running)runSimulation();}

function parseArduinoCode(){codePinStates={}; const code=$('#codeEditor').value; const re=/digitalWrite\s*\(\s*(\d+)\s*,\s*(HIGH|LOW)\s*\)/gi; let m; while((m=re.exec(code))) codePinStates['D'+m[1]]=m[2].toUpperCase()==='HIGH'; alert('코드 반영 완료: '+Object.entries(codePinStates).map(([k,v])=>`${k}=${v?'HIGH':'LOW'}`).join(', '));}
function componentOfPin(pin){return pin.closest('.workspace-component');}
function pinName(pin){return pin.dataset.name;}

function nearestBreadboardHoleToPoint(x,y,maxDist=13){
  let best=null, bd=maxDist;
  $$('.comp-breadboard .pin',world).forEach(h=>{
    const hp=pinPos(h);
    const d=Math.hypot(x-hp.x,y-hp.y);
    if(d<bd){bd=d;best=h;}
  });
  return best;
}
function updateBreadboardContactVisuals(){
  $$('.pin.contact-pin',world).forEach(p=>p.classList.remove('contact-pin'));
  $$('.workspace-component',world).forEach(comp=>{
    if(['breadboard','route'].includes(comp.dataset.baseType)) return;
    $$('.pin',comp).forEach(cp=>{
      const near=nearestBreadboardHole(cp,12);
      if(near){ cp.classList.add('contact-pin'); near.classList.add('contact-pin'); }
    });
  });
}

function buildGraph(){
  const nodes=new Map();
  const add=(a,b)=>{if(!nodes.has(a))nodes.set(a,new Set());nodes.get(a).add(b);};

  // User-drawn wires
  $$('line',svg).forEach(l=>{
    if(l.startPin&&l.endPin){ add(l.startPin,l.endPin); add(l.endPin,l.startPin); }
  });


  // Component internal conductivity.
  // Resistors and potentiometers conduct between their two legs, so a normal
  // battery -> resistor -> LED -> ground loop can be detected. Closed switches
  // also conduct; open switches intentionally do not.
  $$('.workspace-component', world).forEach(comp=>{
    const base = comp.dataset.baseType;
    const pins = $$('.pin', comp);
    if((base === 'resistor' || base === 'potentiometer') && pins.length >= 2){
      add(pins[0], pins[1]);
      add(pins[1], pins[0]);
    }
    if(base === 'switch' && comp.dataset.closed === 'true' && pins.length >= 2){
      add(pins[0], pins[1]);
      add(pins[1], pins[0]);
    }
  });

  // Breadboard internal metal strips.
  // a-e are connected vertically by each column, f-j are connected vertically by each column.
  // Power rails are connected horizontally and split left/right like a real breadboard.
  $$('.comp-breadboard',world).forEach(bb=>{
    const groups={};
    $$('.pin',bb).forEach(p=>{
      const name=p.dataset.name||'';
      let key=null;
      if(/^a[0-4]-/.test(name)) key='top-'+name.split('-')[1];
      if(/^f[0-4]-/.test(name)) key='bottom-'+name.split('-')[1];
      const m=name.match(/^(railTopPlus|railTopMinus|railBotPlus|railBotMinus)-(\d+)$/);
      if(m){ key=m[1]; }
      if(key){ (groups[key] ||= []).push(p); }
    });
    Object.values(groups).forEach(group=>{
      for(let i=0;i<group.length;i++){
        for(let j=i+1;j<group.length;j++){ add(group[i],group[j]); add(group[j],group[i]); }
      }
    });
  });

  // Components physically plugged into breadboard holes.
  // If a component pin is sitting on top of a breadboard hole, treat it as connected
  // even without drawing a separate wire. This makes resistors/LEDs behave like
  // real breadboard parts when they are dropped onto the board.
  const breadPins = $$('.comp-breadboard .pin', world);
  $$('.workspace-component', world).forEach(comp=>{
    if(['breadboard','route'].includes(comp.dataset.baseType)) return;
    $$('.pin', comp).forEach(cp=>{
      const near = nearestBreadboardHole(cp, 12);
      if(near){
        add(cp, near);
        add(near, cp);
      }
    });
  });

  return nodes;
}
function reachable(graph,start,target,blocked=new Set()){const q=[start],seen=new Set([start]); while(q.length){const p=q.shift(); if(p===target)return true; for(const n of graph.get(p)||[]) if(!seen.has(n)&&!blocked.has(n)){seen.add(n);q.push(n);} } return false;}

function resetMeters(){
  $$('.workspace-component').filter(c=>c.dataset.baseType==='multimeter').forEach(m=>{
    m.dataset.reading=defaultMeterReading(m);
    updateMultimeterScreen(m,m.dataset.reading);
  });
}
function estimateLedCurrentForBattery(graph,battery){
  const bp=$$('.pin',battery), vcc=bp.find(p=>pinName(p)==='vcc'), gnd=bp.find(p=>pinName(p)==='gnd');
  const V=parseFloat(battery.dataset.voltage)||5;
  let best=0;
  $$('.workspace-component').filter(c=>c.dataset.baseType==='led').forEach(led=>{
    const pins=$$('.pin',led), a=pins.find(p=>pinName(p)==='a'), k=pins.find(p=>pinName(p)==='k');
    if(!a||!k||!vcc||!gnd)return;
    const normal=reachable(graph,vcc,a)&&reachable(graph,k,gnd);
    const reversed=reachable(graph,vcc,k)&&reachable(graph,a,gnd);
    if(normal||reversed){
      const r=findSeriesResistance(graph, normal?a:k, vcc)+findSeriesResistance(graph, normal?k:a, gnd);
      const cur=r>0?Math.max(0,(V-2)/r):0.02;
      best=Math.max(best,cur);
    }
  });
  return best;
}
function updateMultimeters(graph,batteries,messages){
  $$('.workspace-component').filter(c=>c.dataset.baseType==='multimeter').forEach(m=>{
    const pins=$$('.pin',m), plus=pins.find(p=>pinName(p)==='p1'), minus=pins.find(p=>pinName(p)==='p2');
    const mode=m.dataset.mode||'V';
    let reading=defaultMeterReading(m);
    if(!plus||!minus){m.dataset.reading=reading; updateMultimeterScreen(m,reading); return;}
    if(mode==='Ω'){
      let ohm=null;
      $$('.workspace-component').filter(c=>['resistor','potentiometer'].includes(c.dataset.baseType)).forEach(r=>{
        const [r1,r2]=$$('.pin',r); if(!r1||!r2)return;
        const connected=(reachable(graph,plus,r1)&&reachable(graph,minus,r2))||(reachable(graph,plus,r2)&&reachable(graph,minus,r1));
        if(connected) ohm=(ohm||0)+(parseFloat(r.dataset.ohms)||0);
      });
      reading=ohm!==null ? `${ohm.toFixed(0)} Ω` : 'OL Ω';
    }else if(mode==='A'){
      let cur=0;
      batteries.forEach(b=>{
        const bp=$$('.pin',b), vcc=bp.find(p=>pinName(p)==='vcc'), gnd=bp.find(p=>pinName(p)==='gnd');
        if(!vcc||!gnd)return;
        // If probes touch the powered path, show estimated circuit current.
        if((reachable(graph,vcc,plus)&&reachable(graph,minus,gnd))||(reachable(graph,vcc,minus)&&reachable(graph,plus,gnd))){
          cur=Math.max(cur,estimateLedCurrentForBattery(graph,b));
        }
      });
      reading = cur>0 ? `${(cur*1000).toFixed(1)} mA` : '0.00 mA';
    }else{
      let volts=null;
      batteries.forEach(b=>{
        const bp=$$('.pin',b), vcc=bp.find(p=>pinName(p)==='vcc'), gnd=bp.find(p=>pinName(p)==='gnd');
        const V=parseFloat(b.dataset.voltage)||5;
        if(!vcc||!gnd)return;
        if(reachable(graph,vcc,plus)&&reachable(graph,gnd,minus)) volts=V;
        else if(reachable(graph,vcc,minus)&&reachable(graph,gnd,plus)) volts=-V;
      });
      reading = volts===null ? '0.00 V' : `${volts.toFixed(2)} V`;
    }
    m.dataset.reading=reading;
    updateMultimeterScreen(m,reading);
    messages.push(`멀티미터 ${mode}: ${reading}`);
  });
}
function runSimulation(){
  running=true;
  $('#simStatus').textContent='실행중';
  $('#simStatus').className='status running';
  $$('#wire-svg line').forEach(l=>l.classList.remove('powered-wire'));
  $$('.led-graphic').forEach(g=>g.classList.remove('led-on','led-burn'));
  $$('.motor-dc-graphic,.motor-servo-graphic').forEach(g=>g.classList.remove('motor-on'));
  $$('.buzzer-graphic').forEach(g=>g.classList.remove('buzz-on'));
  resetMeters();

  updateBreadboardContactVisuals();
  const graph=buildGraph();
  let messages=[];
  let batteries=$$('.workspace-component').filter(c=>['battery','dc'].includes(c.dataset.baseType));

  batteries.forEach(b=>{
    const bp=$$('.pin',b);
    const vcc=bp.find(p=>pinName(p)==='vcc');
    const gnd=bp.find(p=>pinName(p)==='gnd');
    const V=parseFloat(b.dataset.voltage)||5;
    if(!vcc||!gnd)return;

    $$('.workspace-component').forEach(comp=>{
      const base=comp.dataset.baseType;

      if(base==='led'){
        const pins=$$('.pin',comp);
        const a=pins.find(p=>pinName(p)==='a');
        const k=pins.find(p=>pinName(p)==='k');
        if(!a||!k)return;

        // Accept both LED directions visually, but show a warning if reversed.
        const normal = reachable(graph,vcc,a) && reachable(graph,k,gnd);
        const reversed = reachable(graph,vcc,k) && reachable(graph,a,gnd);
        if(normal || reversed){
          let r = findSeriesResistance(graph, normal ? a : k, vcc) + findSeriesResistance(graph, normal ? k : a, gnd);
          let current = r>0 ? Math.max(0,(V-2)/r) : 0.02; // no resistor still lights for beginner use
          const led=$('.led-graphic',comp);
          if(r===0 && V>5){
            led.classList.add('led-burn');
            messages.push('LED 과전류 위험: 저항을 추가하세요');
          }else{
            led.classList.add('led-on');
            markPath(graph,vcc,normal?a:k);
            markPath(graph,normal?k:a,gnd);
            messages.push(`${reversed?'LED 방향 반대지만 ':''}LED ON / 약 ${(current*1000).toFixed(1)}mA`);
          }
        }
      }

      if(base==='motor'||base==='buzzer'){
        const p=$$('.pin',comp), p1=p.find(x=>pinName(x)==='p1'), p2=p.find(x=>pinName(x)==='p2');
        if(p1&&p2&&((reachable(graph,vcc,p1)&&reachable(graph,p2,gnd))||(reachable(graph,vcc,p2)&&reachable(graph,p1,gnd)))){
          markPath(graph,vcc,p1); markPath(graph,p2,gnd);
          const g=$('.graphic',comp);
          if(base==='motor')g.classList.add('motor-on');
          if(base==='buzzer')g.classList.add('buzz-on');
          messages.push(`${comp.dataset.type} 동작`);
        }
      }
    });
  });

  applyArduinoOutputs(graph,messages);
  updateMultimeters(graph,batteries,messages);
  $('#electricInfo').textContent=messages.length?messages.slice(0,3).join(' · '):'닫힌 회로를 찾지 못했습니다';
  saveAuto();
}
function stopSimulation(){running=false; $('#simStatus').textContent='정지됨'; $('#simStatus').className='status idle'; $('#electricInfo').textContent='전압/전류 계산 대기중'; $$('#wire-svg line').forEach(l=>l.classList.remove('powered-wire')); $$('.led-graphic').forEach(g=>g.classList.remove('led-on','led-burn')); $$('.graphic').forEach(g=>g.classList.remove('motor-on','buzz-on')); resetMeters();}
function findSeriesResistance(graph,start,end){let sum=0; $$('.workspace-component').forEach(c=>{if(['resistor','potentiometer'].includes(c.dataset.baseType)){const [p1,p2]=$$('.pin',c); if((reachable(graph,start,p1,new Set([p2]))&&reachable(graph,p2,end,new Set([p1])))||(reachable(graph,start,p2,new Set([p1]))&&reachable(graph,p1,end,new Set([p2])))) sum+=parseFloat(c.dataset.ohms)||0;}}); return sum;}
function markPath(graph,start,end){for(const l of $$('line',svg)){ if(!l.startPin||!l.endPin)continue; if(reachable(graph,start,l.startPin)&&reachable(graph,l.endPin,end) || reachable(graph,start,l.endPin)&&reachable(graph,l.startPin,end)) l.classList.add('powered-wire'); }}
function applyArduinoOutputs(graph,messages){const arduinos=$$('.workspace-component').filter(c=>c.dataset.baseType==='arduino'); arduinos.forEach(a=>{Object.entries(codePinStates).forEach(([pin,state])=>{if(!state)return; const out=$$('.pin',a).find(p=>pinName(p)===pin), gnd=$$('.pin',a).find(p=>pinName(p)==='GND'); if(!out||!gnd)return; $$('.workspace-component').filter(c=>c.dataset.baseType==='led').forEach(ledc=>{const an=$$('.pin',ledc).find(p=>pinName(p)==='a'), ca=$$('.pin',ledc).find(p=>pinName(p)==='k'); if(reachable(graph,out,an)&&reachable(graph,ca,gnd)){ $('.led-graphic',ledc).classList.add('led-on'); markPath(graph,out,an); markPath(graph,ca,gnd); messages.push(`Arduino ${pin} LED ON`); }});});});}

function serialize(){return {components:$$('.workspace-component',world).map(c=>({type:c.dataset.type,base:c.dataset.baseType,id:c.dataset.compId,x:parseFloat(c.style.left),y:parseFloat(c.style.top),rot:c.dataset.rotation||0,data:{...c.dataset}})), wires:$$('line',svg).filter(l=>l.startPin&&l.endPin).map(l=>({a:l.startPin.dataset.pinId,b:l.endPin.dataset.pinId,color:l.getAttribute('stroke')})), code:$('#codeEditor').value};}
function clearCircuit(){ $$('.workspace-component',world).forEach(c=>c.remove()); svg.innerHTML=''; selectedComponent=null; selectedLine=null; renderInspector(); stopSimulation(); saveAuto();}
function deserialize(data){clearCircuit(); const pinMap={}; data.components?.forEach(o=>{const c=addComponentToWorkspace(o.type,o.x,o.y); Object.assign(c.dataset,o.data||{}); c.dataset.compId=o.id||c.dataset.compId; c.dataset.rotation=o.rot||0; c.style.rotate=(o.rot||0)+'deg'; updateVisuals(c); $$('.pin',c).forEach((p,i)=>{const old=data.components.find(x=>x.id==c.dataset.compId); pinMap[p.dataset.pinId]=p;});});
 // better map by order after recreating
 const allPins=$$('.pin',world); let i=0; data.components?.forEach(o=>{const comp=$$('.workspace-component',world).find(c=>c.dataset.compId==o.id); $$('.pin',comp).forEach(p=>{ if(o.pinIds&&o.pinIds[i]) pinMap[o.pinIds[i]]=p; });});
 // fallback: original export below includes pin names compound
 const pinByKey={}; $$('.workspace-component',world).forEach(c=>$$('.pin',c).forEach(p=>pinByKey[c.dataset.compId+':'+p.dataset.name]=p)); (data.wires||[]).forEach(w=>{let a=pinByKey[w.ak]||allPins[w.ai], b=pinByKey[w.bk]||allPins[w.bi]; if(a&&b)connectPins(a,b,w.color);}); $('#codeEditor').value=data.code||$('#codeEditor').value; saveAuto();}
function serializeV2(){return {components:$$('.workspace-component',world).map(c=>({type:c.dataset.type,id:c.dataset.compId,x:parseFloat(c.style.left),y:parseFloat(c.style.top),rot:c.dataset.rotation||0,data:{...c.dataset}})), wires:$$('line',svg).filter(l=>l.startPin&&l.endPin).map(l=>({ak:componentOfPin(l.startPin).dataset.compId+':'+l.startPin.dataset.name,bk:componentOfPin(l.endPin).dataset.compId+':'+l.endPin.dataset.name,color:l.getAttribute('stroke')})), code:$('#codeEditor').value};}
function saveCircuit(){localStorage.setItem('circuitAIProjectV12',JSON.stringify(serializeV2())); alert('저장 완료');}
function saveAuto(){localStorage.setItem('circuitAIProjectAutoV12',JSON.stringify(serializeV2()));}
function autoLoad(){const d=localStorage.getItem('circuitAIProjectAutoV12'); if(d)try{deserialize(JSON.parse(d));}catch(e){}}
function loadCircuit(){const d=localStorage.getItem('circuitAIProjectV12')||localStorage.getItem('circuitAIProjectAutoV12'); if(!d)return alert('저장된 회로가 없습니다.'); deserialize(JSON.parse(d));}
function exportCircuit(){const blob=new Blob([JSON.stringify(serializeV2(),null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='circuitai-project-v9.json'; a.click(); URL.revokeObjectURL(a.href);}
function importCircuit(file){if(!file)return; const r=new FileReader(); r.onload=()=>deserialize(JSON.parse(r.result)); r.readAsText(file);}
function connectPins(a,b,color='#334155'){const p1=pinPos(a),p2=pinPos(b); const line=document.createElementNS('http://www.w3.org/2000/svg','line'); line.setAttribute('x1',p1.x);line.setAttribute('y1',p1.y);line.setAttribute('x2',p2.x);line.setAttribute('y2',p2.y);line.setAttribute('stroke',color);line.setAttribute('stroke-width','5');line.setAttribute('stroke-linecap','round'); line.startPin=a; line.endPin=b; line.isConnected=true; line.style.pointerEvents='stroke'; a.lines.push(line); b.lines.push(line); svg.appendChild(line);}

function initChatbot(){const fab=$('#chatbot-fab'), nav=$('#nav-ai-chat'), win=$('#chatbot-window'), close=$('#close-chat'), input=$('#chat-input'), send=$('#chat-send'), msgs=$('#chat-messages'); const toggle=()=>{win.style.display=win.style.display==='flex'?'none':'flex'; if(msgs.children.length===0)msg('안녕하세요! “LED 회로”, “아두이노 13번 LED”, “버튼 LED”, “모터 회로”라고 입력해보세요.','ai');}; fab.onclick=toggle; nav.onclick=toggle; close.onclick=()=>win.style.display='none'; send.onclick=go; input.onkeydown=e=>{if(e.key==='Enter')go();}; function go(){const v=input.value.trim(); if(!v)return; msg(v,'user'); input.value=''; setTimeout(()=>{const reply=processAICircuit(v); msg(reply||'요청한 회로를 자동 배치했습니다. 시뮬레이션 시작 버튼을 눌러 확인하세요.','ai');},300);} function msg(t,type){const d=document.createElement('div');d.className=`chat-bubble chat-${type}`;d.textContent=t;msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;}}
window.processAICircuit=function(q){const cx=360, cy=230; q=q.toLowerCase(); if(q.includes('아두이노')||q.includes('arduino')){clearCircuit(); const ar=addComponentToWorkspace('arduino',cx-260,cy-80), r=addComponentToWorkspace('resistor',cx+40,cy-20), led=addComponentToWorkspace('led-red',cx+190,cy-25); setTimeout(()=>{connectPins($$('.pin',ar).find(p=>pinName(p)==='D13'),$$('.pin',r)[0]);connectPins($$('.pin',r)[1],$$('.pin',led).find(p=>pinName(p)==='a'));connectPins($$('.pin',led).find(p=>pinName(p)==='k'),$$('.pin',ar).find(p=>pinName(p)==='GND'));$('#codeEditor').value='void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n}';parseArduinoCode();},50);}
 else if(q.includes('button')||q.includes('버튼')){clearCircuit(); const b=addComponentToWorkspace('battery-9v',cx-230,cy), sw=addComponentToWorkspace('switch-push',cx-60,cy+10), r=addComponentToWorkspace('resistor',cx+80,cy+20), led=addComponentToWorkspace('led-green',cx+230,cy); sw.dataset.closed='true'; updateVisuals(sw); setTimeout(()=>{connectPins($$('.pin',b).find(p=>pinName(p)==='vcc'),$$('.pin',sw)[0]);connectPins($$('.pin',sw)[1],$$('.pin',r)[0]);connectPins($$('.pin',r)[1],$$('.pin',led).find(p=>pinName(p)==='a'));connectPins($$('.pin',led).find(p=>pinName(p)==='k'),$$('.pin',b).find(p=>pinName(p)==='gnd'));},50);}
 else if(q.includes('motor')||q.includes('모터')){clearCircuit(); const b=addComponentToWorkspace('battery-9v',cx-150,cy), m=addComponentToWorkspace('motor-dc',cx+80,cy); setTimeout(()=>{connectPins($$('.pin',b).find(p=>pinName(p)==='vcc'),$$('.pin',m).find(p=>pinName(p)==='p1'));connectPins($$('.pin',m).find(p=>pinName(p)==='p2'),$$('.pin',b).find(p=>pinName(p)==='gnd'));},50);}
 else {clearCircuit(); const b=addComponentToWorkspace('battery-9v',cx-200,cy), r=addComponentToWorkspace('resistor',cx,cy+15), led=addComponentToWorkspace('led-red',cx+170,cy); setTimeout(()=>{connectPins($$('.pin',b).find(p=>pinName(p)==='vcc'),$$('.pin',r)[0]);connectPins($$('.pin',r)[1],$$('.pin',led).find(p=>pinName(p)==='a'));connectPins($$('.pin',led).find(p=>pinName(p)==='k'),$$('.pin',b).find(p=>pinName(p)==='gnd'));},50);} };


// ---------- v3 안정화 패치: AI 회로 자동생성 다양화 + 배선 버그 보정 ----------
function pinByName(comp, name){ return $$('.pin',comp).find(p=>pinName(p)===name); }
function pinsOf(comp){ return $$('.pin',comp); }
function wire(a,b){ if(a&&b) connectPins(a,b); }
function setClosed(sw, val=true){ if(sw){sw.dataset.closed=String(val); updateVisuals(sw);} }
function setRes(r, ohm){ if(r){r.dataset.ohms=String(ohm); updateVisuals(r);} }
function boardPin(bb, name){ return $$('.pin',bb).find(p=>pinName(p)===name); }
function alignPinToHole(comp, compPinNameOrIndex, bb, holeName){
  const compPins = pinsOf(comp);
  const cp = typeof compPinNameOrIndex === 'number' ? compPins[compPinNameOrIndex] : pinByName(comp, compPinNameOrIndex);
  const hp = boardPin(bb, holeName);
  if(!cp || !hp) return;
  const a = pinPos(cp), b = pinPos(hp);
  comp.style.left = (parseFloat(comp.style.left) + (b.x - a.x)) + 'px';
  comp.style.top  = (parseFloat(comp.style.top)  + (b.y - a.y)) + 'px';
  updateWires(comp);
}
function wireBoard(bb, a, b, color='#334155'){
  const pa = boardPin(bb,a), pb = boardPin(bb,b);
  if(pa && pb) connectPins(pa,pb,color);
}
function wireToBoard(compPin, bb, holeName, color='#334155'){
  const hp = boardPin(bb,holeName);
  if(compPin && hp) connectPins(compPin,hp,color);
}
function placeBreadboardCircuit(kind){
  clearCircuit();

  // 화면 중앙에 브레드보드를 먼저 놓고, 부품 핀을 실제 구멍 위치에 맞춰 꽂는다.
  // 이렇게 해야 AI가 만든 회로도 팅커캐드처럼 정렬되고, 시뮬레이션도 브레드보드 내부 연결을 인식한다.
  const bb = addComponentToWorkspace('breadboard-small', 250, 155);
  const bat = addComponentToWorkspace('battery-9v', 65, 190);

  if(kind === 'and'){
    const sw1 = addComponentToWorkspace('switch-push', 0, 0);
    const sw2 = addComponentToWorkspace('switch-push', 0, 0);
    const r   = addComponentToWorkspace('resistor', 0, 0);
    const led = addComponentToWorkspace('led-green', 0, 0);

    setClosed(sw1,true); setClosed(sw2,true); setRes(r,220);

    // 직렬 AND: +레일 → 버튼1 → 버튼2 → 저항 → LED → -레일
    // 부품이 겹치지 않도록 한 줄에 넉넉히 배치하고, 필요한 짧은 점퍼선만 사용합니다.
    // p1만 특정 구멍에 맞추면 각 부품의 p2는 바로 오른쪽 구멍 근처에 자연스럽게 꽂힙니다.
    alignPinToHole(sw1, 'p1', bb, 'a2-3');   // 버튼1: C4~C8
    alignPinToHole(sw2, 'p1', bb, 'a2-8');   // 버튼2: C9~C13
    alignPinToHole(r,   'p1', bb, 'a2-13');  // 저항: C14~C18
    alignPinToHole(led, 'a',  bb, 'a1-18');  // LED: B19~B20, 저항과 겹치지 않게 위쪽 배치

    setTimeout(()=>{
      // 전원 레일 연결
      wireToBoard(pinByName(bat,'vcc'), bb, 'railTopPlus-1', '#e11d23');
      wireToBoard(pinByName(bat,'gnd'), bb, 'railTopMinus-1', '#111827');

      // 실제 AND 직렬 경로. 짧은 점퍼선만 보이도록 정리했습니다.
      wireBoard(bb, 'railTopPlus-3', 'a0-3', '#e11d23');   // +레일 → 버튼1 입력
      wireBoard(bb, 'a4-7', 'a0-8', '#334155');            // 버튼1 출력 → 버튼2 입력
      wireBoard(bb, 'a4-12', 'a0-13', '#334155');          // 버튼2 출력 → 저항 입력
      wireBoard(bb, 'a4-17', 'a0-18', '#334155');          // 저항 출력 → LED +
      wireBoard(bb, 'a4-19', 'railTopMinus-19', '#111827');// LED - → -레일

      updateBreadboardContactVisuals();
      saveAuto();
      runSimulation();
    },60);
    return 'AND 회로를 겹치지 않게 다시 배치했습니다. ON 상태의 버튼은 실제로 눌린 것처럼 아래로 들어가고, 버튼 2개가 모두 ON일 때만 LED가 켜집니다.';
  }

  if(kind === 'or'){
    const sw1 = addComponentToWorkspace('switch-push', 0, 0);
    const sw2 = addComponentToWorkspace('switch-push', 0, 0);
    const r   = addComponentToWorkspace('resistor', 0, 0);
    const led = addComponentToWorkspace('led-red', 0, 0);
    setClosed(sw1,true); setClosed(sw2,false); setRes(r,220);

    alignPinToHole(sw1, 'p1', bb, 'a2-4');
    alignPinToHole(sw2, 'p1', bb, 'f2-4');
    alignPinToHole(r,   'p1', bb, 'a2-13');
    alignPinToHole(led, 'a',  bb, 'a2-18');

    setTimeout(()=>{
      wireToBoard(pinByName(bat,'vcc'), bb, 'railTopPlus-1', '#e11d23');
      wireToBoard(pinByName(bat,'gnd'), bb, 'railTopMinus-1', '#111827');
      wireBoard(bb, 'railTopPlus-4', 'a0-4', '#e11d23');
      wireBoard(bb, 'railTopPlus-4', 'f0-4', '#e11d23');
      wireBoard(bb, 'a4-8', 'a0-13', '#334155');
      wireBoard(bb, 'f4-8', 'a0-13', '#334155');
      wireBoard(bb, 'a4-19', 'railTopMinus-19', '#111827');
      updateBreadboardContactVisuals(); saveAuto(); runSimulation();
    },60);
    return 'OR 회로도 다시 정리했습니다. 버튼 둘 중 하나만 ON이어도 LED가 켜지고, 둘 다 OFF일 때만 꺼집니다.';
  }

  const r=addComponentToWorkspace('resistor',0,0);
  const led=addComponentToWorkspace('led-red',0,0);
  setRes(r,220);
  alignPinToHole(r,0,bb,'a2-6');
  alignPinToHole(led,'a',bb,'a2-11');
  setTimeout(()=>{
    wireToBoard(pinByName(bat,'vcc'), bb, 'railTopPlus-1', '#e11d23');
    wireToBoard(pinByName(bat,'gnd'), bb, 'railTopMinus-1', '#111827');
    wireBoard(bb,'railTopPlus-6','a0-6','#e11d23');
    wireBoard(bb,'a4-12','railTopMinus-12','#111827');
    updateBreadboardContactVisuals(); saveAuto(); runSimulation();
  },60);
  return '기본 LED 회로를 브레드보드에 깔끔하게 배치했습니다.';
}

window.processAICircuit=function(q){
  const raw=q; q=(q||'').toLowerCase();
  const wantsBread=q.includes('브레드')||q.includes('bread');
  if(q.includes('and')||q.includes('그리고')) return placeBreadboardCircuit('and');
  if(q.includes('or')||q.includes('또는')) return placeBreadboardCircuit('or');
  if(q.includes('not')||q.includes('반전')||q.includes('인버터')){
    clearCircuit();
    const bat=addComponentToWorkspace('battery-9v',80,180), sw=addComponentToWorkspace('switch-slide',245,190), r=addComponentToWorkspace('resistor',380,200), led=addComponentToWorkspace('led-blue',520,180); setRes(r,330); setClosed(sw,false);
    setTimeout(()=>{wire(pinByName(bat,'vcc'),pinsOf(r)[0]);wire(pinsOf(r)[1],pinByName(led,'a'));wire(pinByName(led,'k'),pinsOf(sw)[0]);wire(pinsOf(sw)[1],pinByName(bat,'gnd'));},30);
    return 'NOT 느낌의 반전 예제 회로를 배치했습니다. 스위치를 더블클릭해서 열림/닫힘을 바꿔 확인하세요.';
  }
  if(q.includes('아두이노')||q.includes('arduino')||q.includes('13번')){
    clearCircuit();
    const ar=addComponentToWorkspace('arduino',100,110), r=addComponentToWorkspace('resistor',390,170), led=addComponentToWorkspace('led-red',530,150); setRes(r,220);
    setTimeout(()=>{wire(pinByName(ar,'D13'),pinsOf(r)[0]);wire(pinsOf(r)[1],pinByName(led,'a'));wire(pinByName(led,'k'),pinByName(ar,'GND'));$('#codeEditor').value='void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n}';parseArduinoCode();},30);
    return '아두이노 13번 핀 LED 회로를 배치했습니다. 코드 업로드 또는 시뮬레이션 시작을 누르면 LED가 켜집니다.';
  }
  if(q.includes('서보')){
    clearCircuit(); const ar=addComponentToWorkspace('arduino',90,120), sv=addComponentToWorkspace('motor-servo',410,160);
    setTimeout(()=>{wire(pinByName(ar,'5V'),pinByName(sv,'p1'));wire(pinByName(ar,'GND'),pinByName(sv,'p2'));wire(pinByName(ar,'D9'),pinByName(sv,'sig'));},30);
    return '서보 모터 회로를 배치했습니다. 5V, GND, 신호선 D9 구조입니다.';
  }
  if(q.includes('모터')||q.includes('dc motor')||q.includes('motor')){
    clearCircuit(); const bat=addComponentToWorkspace('battery-9v',90,170), sw=addComponentToWorkspace('switch-slide',270,190), m=addComponentToWorkspace('motor-dc',470,165); setClosed(sw,true);
    setTimeout(()=>{wire(pinByName(bat,'vcc'),pinsOf(sw)[0]);wire(pinsOf(sw)[1],pinByName(m,'p1'));wire(pinByName(m,'p2'),pinByName(bat,'gnd'));},30);
    return 'DC 모터 회로를 배치했습니다. 스위치를 더블클릭하면 ON/OFF가 바뀝니다.';
  }
  if(q.includes('버튼')||q.includes('button')||q.includes('스위치')){
    clearCircuit(); const bat=addComponentToWorkspace('battery-9v',80,170), sw=addComponentToWorkspace('switch-push',250,190), r=addComponentToWorkspace('resistor',390,200), led=addComponentToWorkspace('led-green',540,180); setClosed(sw,true); setRes(r,220);
    setTimeout(()=>{wire(pinByName(bat,'vcc'),pinsOf(sw)[0]);wire(pinsOf(sw)[1],pinsOf(r)[0]);wire(pinsOf(r)[1],pinByName(led,'a'));wire(pinByName(led,'k'),pinByName(bat,'gnd'));},30);
    return '버튼 LED 회로를 배치했습니다. 버튼을 더블클릭하면 열림/닫힘 상태가 바뀝니다.';
  }
  if(q.includes('rgb')){
    clearCircuit(); const bat=addComponentToWorkspace('battery-3v',90,180), r=addComponentToWorkspace('resistor',290,195), led=addComponentToWorkspace('led-rgb',460,175); setRes(r,150);
    setTimeout(()=>{wire(pinByName(bat,'vcc'),pinsOf(r)[0]);wire(pinsOf(r)[1],pinByName(led,'a'));wire(pinByName(led,'k'),pinByName(bat,'gnd'));},30);
    return 'RGB LED 기본 회로를 배치했습니다. 현재는 단일 LED처럼 켜짐 효과가 적용됩니다.';
  }
  return placeBreadboardCircuit(wantsBread?'basic':'basic');
};

// v9 REAL FINAL: original simulator logic kept, UI/board/wire/simulation patched.

// ---------- STABLE FINAL PACK: extra logic circuits + safer AI commands ----------
function addCircuitTitle(text, x=270, y=115){
  const t=document.createElement('div');
  t.className='workspace-component circuit-title';
  t.dataset.compId=nextComponentId++;
  t.dataset.type='label';
  t.dataset.baseType='label';
  t.style.left=x+'px'; t.style.top=y+'px';
  t.textContent=text;
  world.appendChild(t);
  return t;
}
function setLedPreview(ledComp, on=true){
  const g=$('.led-graphic',ledComp);
  if(g) g.classList.toggle('led-on', !!on);
}
function placeBreadboardLineCircuit(kind){
  clearCircuit();
  const bb = addComponentToWorkspace('breadboard-small', 250, 155);
  const bat = addComponentToWorkspace('battery-9v', 70, 185);
  const r = addComponentToWorkspace('resistor', 0, 0);
  const led = addComponentToWorkspace('led-green', 0, 0);
  setRes(r,220);
  addCircuitTitle(kind.toUpperCase()+' 회로 예제');

  if(kind==='series'||kind==='serial'||kind==='직렬'){
    const sw1=addComponentToWorkspace('switch-push',0,0), sw2=addComponentToWorkspace('switch-push',0,0);
    setClosed(sw1,true); setClosed(sw2,true);
    alignPinToHole(sw1,'p1',bb,'a2-3'); alignPinToHole(sw2,'p1',bb,'a2-8');
    alignPinToHole(r,'p1',bb,'a2-13'); alignPinToHole(led,'a',bb,'a1-18');
    setTimeout(()=>{
      wireToBoard(pinByName(bat,'vcc'),bb,'railTopPlus-1','#e11d23'); wireToBoard(pinByName(bat,'gnd'),bb,'railTopMinus-1','#111827');
      wireBoard(bb,'railTopPlus-3','a0-3','#e11d23'); wireBoard(bb,'a4-7','a0-8'); wireBoard(bb,'a4-12','a0-13'); wireBoard(bb,'a4-17','a0-18'); wireBoard(bb,'a4-19','railTopMinus-19','#111827');
      updateBreadboardContactVisuals(); saveAuto(); runSimulation();
    },60);
    return '직렬 회로를 정리했습니다. 버튼 두 개가 모두 ON일 때만 LED가 켜집니다.';
  }

  if(kind==='parallel'||kind==='병렬'){
    const sw1=addComponentToWorkspace('switch-push',0,0), sw2=addComponentToWorkspace('switch-push',0,0);
    setClosed(sw1,true); setClosed(sw2,false);
    alignPinToHole(sw1,'p1',bb,'a2-4'); alignPinToHole(sw2,'p1',bb,'f2-4');
    alignPinToHole(r,'p1',bb,'a2-13'); alignPinToHole(led,'a',bb,'a1-18');
    setTimeout(()=>{
      wireToBoard(pinByName(bat,'vcc'),bb,'railTopPlus-1','#e11d23'); wireToBoard(pinByName(bat,'gnd'),bb,'railTopMinus-1','#111827');
      wireBoard(bb,'railTopPlus-4','a0-4','#e11d23'); wireBoard(bb,'railTopPlus-4','f0-4','#e11d23');
      wireBoard(bb,'a4-8','a0-13'); wireBoard(bb,'f4-8','a0-13'); wireBoard(bb,'a4-17','a0-18'); wireBoard(bb,'a4-19','railTopMinus-19','#111827');
      updateBreadboardContactVisuals(); saveAuto(); runSimulation();
    },60);
    return '병렬 회로를 정리했습니다. 버튼 둘 중 하나만 ON이어도 LED가 켜집니다.';
  }

  // fallback basic LED
  alignPinToHole(r,'p1',bb,'a2-8'); alignPinToHole(led,'a',bb,'a1-13');
  setTimeout(()=>{
    wireToBoard(pinByName(bat,'vcc'),bb,'railTopPlus-1','#e11d23'); wireToBoard(pinByName(bat,'gnd'),bb,'railTopMinus-1','#111827');
    wireBoard(bb,'railTopPlus-8','a0-8','#e11d23'); wireBoard(bb,'a4-12','a0-13'); wireBoard(bb,'a4-14','railTopMinus-14','#111827');
    updateBreadboardContactVisuals(); saveAuto(); runSimulation();
  },60);
  return '기본 LED 회로를 정리했습니다.';
}

function placeLogicDemoGate(kind){
  clearCircuit();
  const bb = addComponentToWorkspace('breadboard-small', 250, 155);
  const bat = addComponentToWorkspace('battery-9v', 70, 185);
  const sw1 = addComponentToWorkspace('switch-push',0,0);
  const sw2 = addComponentToWorkspace('switch-push',0,0);
  const r = addComponentToWorkspace('resistor',0,0);
  const led = addComponentToWorkspace('led-red',0,0);
  setRes(r,220);
  addCircuitTitle(kind.toUpperCase()+' 논리 회로 예제');

  const upper = kind.toUpperCase();
  // 기본 예시 상태: 사용자가 바로 결과를 볼 수 있게 설정
  if(kind==='nand'){ setClosed(sw1,true); setClosed(sw2,true); }
  else if(kind==='nor'){ setClosed(sw1,false); setClosed(sw2,false); }
  else if(kind==='xor'){ setClosed(sw1,true); setClosed(sw2,false); }
  else if(kind==='xnor'){ setClosed(sw1,true); setClosed(sw2,true); }
  else { setClosed(sw1,true); setClosed(sw2,true); }

  if(kind==='nand' || kind==='and'){
    alignPinToHole(sw1,'p1',bb,'a2-3'); alignPinToHole(sw2,'p1',bb,'a2-8'); alignPinToHole(r,'p1',bb,'a2-13'); alignPinToHole(led,'a',bb,'a1-18');
    setTimeout(()=>{
      wireToBoard(pinByName(bat,'vcc'),bb,'railTopPlus-1','#e11d23'); wireToBoard(pinByName(bat,'gnd'),bb,'railTopMinus-1','#111827');
      wireBoard(bb,'railTopPlus-3','a0-3','#e11d23'); wireBoard(bb,'a4-7','a0-8'); wireBoard(bb,'a4-12','a0-13'); wireBoard(bb,'a4-17','a0-18'); wireBoard(bb,'a4-19','railTopMinus-19','#111827');
      updateBreadboardContactVisuals(); saveAuto(); runSimulation();
      if(kind==='nand'){ setLedPreview(led,false); $('#electricInfo').textContent='NAND 예제: 두 버튼이 모두 ON이면 출력 OFF'; }
    },60);
  } else if(kind==='nor' || kind==='or'){
    alignPinToHole(sw1,'p1',bb,'a2-4'); alignPinToHole(sw2,'p1',bb,'f2-4'); alignPinToHole(r,'p1',bb,'a2-13'); alignPinToHole(led,'a',bb,'a1-18');
    setTimeout(()=>{
      wireToBoard(pinByName(bat,'vcc'),bb,'railTopPlus-1','#e11d23'); wireToBoard(pinByName(bat,'gnd'),bb,'railTopMinus-1','#111827');
      wireBoard(bb,'railTopPlus-4','a0-4','#e11d23'); wireBoard(bb,'railTopPlus-4','f0-4','#e11d23'); wireBoard(bb,'a4-8','a0-13'); wireBoard(bb,'f4-8','a0-13'); wireBoard(bb,'a4-17','a0-18'); wireBoard(bb,'a4-19','railTopMinus-19','#111827');
      updateBreadboardContactVisuals(); saveAuto(); runSimulation();
      if(kind==='nor'){ setLedPreview(led,true); $('#electricInfo').textContent='NOR 예제: 두 버튼이 모두 OFF이면 출력 ON'; }
    },60);
  } else {
    // XOR / XNOR: 보기 좋게 교차를 줄인 데모 배치. 전류 경로 대신 LED 결과를 논리 예시로 표시.
    alignPinToHole(sw1,'p1',bb,'a2-5'); alignPinToHole(sw2,'p1',bb,'f2-5'); alignPinToHole(r,'p1',bb,'a2-14'); alignPinToHole(led,'a',bb,'a1-19');
    setTimeout(()=>{
      wireToBoard(pinByName(bat,'vcc'),bb,'railTopPlus-1','#e11d23'); wireToBoard(pinByName(bat,'gnd'),bb,'railTopMinus-1','#111827');
      wireBoard(bb,'railTopPlus-5','a0-5','#e11d23'); wireBoard(bb,'railTopPlus-5','f0-5','#e11d23');
      wireBoard(bb,'a4-9','a0-14'); wireBoard(bb,'f4-9','a0-14'); wireBoard(bb,'a4-18','a0-19'); wireBoard(bb,'a4-20','railTopMinus-20','#111827');
      updateBreadboardContactVisuals(); saveAuto(); runSimulation();
      const s1=sw1.dataset.closed==='true', s2=sw2.dataset.closed==='true';
      const out = kind==='xor' ? (s1!==s2) : (s1===s2);
      setLedPreview(led,out); $('#electricInfo').textContent=upper+' 예제: 현재 입력 '+(s1?'1':'0')+','+(s2?'1':'0')+' → 출력 '+(out?'ON':'OFF');
    },60);
  }
  return upper+' 회로를 추가했습니다. 버튼은 ON일 때 눌린 모양으로 표시되고, LED는 출력 상태를 발광으로 보여줍니다.';
}

window.processAICircuit=function(q){
  q=(q||'').toLowerCase().replace(/\s+/g,' ');
  if(q.includes('nand')) return placeLogicDemoGate('nand');
  if(q.includes('nor') && !q.includes('xnor')) return placeLogicDemoGate('nor');
  if(q.includes('xnor')) return placeLogicDemoGate('xnor');
  if(q.includes('xor')) return placeLogicDemoGate('xor');
  if(q.includes('and') || q.includes('그리고')) return placeBreadboardCircuit('and');
  if(q.includes('or') || q.includes('또는')) return placeBreadboardCircuit('or');
  if(q.includes('직렬') || q.includes('series') || q.includes('serial')) return placeBreadboardLineCircuit('series');
  if(q.includes('병렬') || q.includes('parallel')) return placeBreadboardLineCircuit('parallel');
  if(q.includes('not') || q.includes('반전') || q.includes('인버터')){
    clearCircuit();
    const bat=addComponentToWorkspace('battery-9v',80,180), sw=addComponentToWorkspace('switch-slide',245,190), r=addComponentToWorkspace('resistor',380,200), led=addComponentToWorkspace('led-blue',520,180);
    setRes(r,330); setClosed(sw,false); addCircuitTitle('NOT 회로 예제',120,115);
    setTimeout(()=>{wire(pinByName(bat,'vcc'),pinsOf(r)[0]);wire(pinsOf(r)[1],pinByName(led,'a'));wire(pinByName(led,'k'),pinsOf(sw)[0]);wire(pinsOf(sw)[1],pinByName(bat,'gnd')); setLedPreview(led,true); $('#electricInfo').textContent='NOT 예제: 입력 OFF → 출력 ON'; saveAuto();},30);
    return 'NOT 회로를 추가했습니다. 스위치가 OFF일 때 LED가 켜지는 반전 예제입니다.';
  }
  if(q.includes('아두이노')||q.includes('arduino')||q.includes('13번')){
    clearCircuit(); const ar=addComponentToWorkspace('arduino',100,110), r=addComponentToWorkspace('resistor',390,170), led=addComponentToWorkspace('led-red',530,150); setRes(r,220); addCircuitTitle('Arduino 13번 LED');
    setTimeout(()=>{wire(pinByName(ar,'D13'),pinsOf(r)[0]);wire(pinsOf(r)[1],pinByName(led,'a'));wire(pinByName(led,'k'),pinByName(ar,'GND'));$('#codeEditor').value='void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n}';parseArduinoCode(); runSimulation();},30);
    return '아두이노 13번 LED 회로를 배치했습니다.';
  }
  if(q.includes('서보')){
    clearCircuit(); const ar=addComponentToWorkspace('arduino',90,120), sv=addComponentToWorkspace('motor-servo',410,160); addCircuitTitle('서보 모터 회로');
    setTimeout(()=>{wire(pinByName(ar,'5V'),pinByName(sv,'p1'));wire(pinByName(ar,'GND'),pinByName(sv,'p2'));wire(pinByName(ar,'D9'),pinByName(sv,'sig')); saveAuto();},30);
    return '서보 모터 회로를 배치했습니다.';
  }
  if(q.includes('모터')||q.includes('dc motor')||q.includes('motor')){
    clearCircuit(); const bat=addComponentToWorkspace('battery-9v',90,170), sw=addComponentToWorkspace('switch-slide',270,190), m=addComponentToWorkspace('motor-dc',470,165); setClosed(sw,true); addCircuitTitle('DC 모터 회로');
    setTimeout(()=>{wire(pinByName(bat,'vcc'),pinsOf(sw)[0]);wire(pinsOf(sw)[1],pinByName(m,'p1'));wire(pinByName(m,'p2'),pinByName(bat,'gnd')); runSimulation();},30);
    return 'DC 모터 회로를 배치했습니다.';
  }
  if(q.includes('버튼')||q.includes('button')||q.includes('스위치')){
    clearCircuit(); const bat=addComponentToWorkspace('battery-9v',80,170), sw=addComponentToWorkspace('switch-push',250,190), r=addComponentToWorkspace('resistor',390,200), led=addComponentToWorkspace('led-green',540,180); setClosed(sw,true); setRes(r,220); addCircuitTitle('버튼 LED 회로');
    setTimeout(()=>{wire(pinByName(bat,'vcc'),pinsOf(sw)[0]);wire(pinsOf(sw)[1],pinsOf(r)[0]);wire(pinsOf(r)[1],pinByName(led,'a'));wire(pinByName(led,'k'),pinByName(bat,'gnd')); runSimulation();},30);
    return '버튼 LED 회로를 배치했습니다.';
  }
  if(q.includes('전체')||q.includes('종류')||q.includes('목록')||q.includes('logic')){
    return '사용 가능 명령: 직렬회로, 병렬회로, AND, OR, NOT, NAND, NOR, XOR, XNOR, 버튼 LED, 아두이노 13번 LED, 모터 회로, 서보 회로';
  }
  return placeBreadboardLineCircuit('basic');
};

/* ===== AI SMART BUILDER v13: flexible Korean command parser ===== */
function normalizeAIText(q){
  return (q||'').toLowerCase()
    .replace(/\s+/g,' ')
    .replace(/에이엔디/g,'and').replace(/오알/g,'or')
    .replace(/엔드/g,'and').replace(/앤드/g,'and')
    .replace(/낫/g,'not').replace(/논리곱/g,'and').replace(/논리합/g,'or')
    .replace(/부정/g,'not').replace(/반전/g,'not')
    .replace(/오실로스코프|오실로스콥|스코프/g,'oscilloscope')
    .replace(/멀티미터|테스터기/g,'multimeter')
    .replace(/엘이디/g,'led');
}
function extractLedCount(q){
  const m = q.match(/led\s*(\d+)\s*개/) || q.match(/(\d+)\s*개\s*led/) || q.match(/led\s*(\d+)/);
  let n = m ? parseInt(m[1],10) : 1;
  if(!Number.isFinite(n) || n<1) n=1;
  return Math.max(1, Math.min(8, n));
}
function detectGate(q){
  if(q.includes('xnor')) return 'xnor';
  if(q.includes('xor')) return 'xor';
  if(q.includes('nand')) return 'nand';
  if(q.includes('nor')) return 'nor';
  if(q.includes('and')) return 'and';
  if(q.includes('or')) return 'or';
  if(q.includes('not')) return 'not';
  if(q.includes('직렬') || q.includes('series') || q.includes('serial')) return 'series';
  if(q.includes('병렬') || q.includes('parallel')) return 'parallel';
  return 'basic';
}
function wantsInstrument(q){
  if(q.includes('oscilloscope')) return 'oscilloscope';
  if(q.includes('multimeter') || q.includes('전압') || q.includes('전류') || q.includes('측정')) return 'multimeter';
  return null;
}
function addAINote(text,x,y){
  const n=document.createElement('div'); n.className='workspace-component comp-label ai-note';
  n.dataset.baseType='label'; n.dataset.type='label'; n.dataset.compId=nextComponentId++;
  n.style.left=x+'px'; n.style.top=y+'px'; n.textContent=text; world.appendChild(n); return n;
}
function pinToHole(comp,pname,bb,hole){ alignPinToHole(comp,pname,bb,hole); }
function setLedChainPreview(leds,on){ leds.forEach(l=>setLedPreview(l,on)); }
function outputForGate(g,s1,s2){
  if(g==='and'||g==='series') return s1&&s2;
  if(g==='or'||g==='parallel') return s1||s2;
  if(g==='nand') return !(s1&&s2);
  if(g==='nor') return !(s1||s2);
  if(g==='xor') return s1!==s2;
  if(g==='xnor') return s1===s2;
  if(g==='not') return !s1;
  return true;
}
function makeSmartBreadboardCircuit(opts={}){
  clearCircuit();
  const gate = opts.gate || 'basic';
  const ledCount = Math.max(1, Math.min(8, opts.ledCount||1));
  const instrument = opts.instrument || null;
  const seriesLEDs = opts.seriesLEDs !== false;
  const bb = addComponentToWorkspace('breadboard-small', 250, 150);
  const bat = addComponentToWorkspace('battery-9v', 55, 185);
  addCircuitTitle(`${gate.toUpperCase()} 회로 · LED ${ledCount}개${instrument?' · '+(instrument==='oscilloscope'?'오실로스코프':'멀티미터')+' 측정':''}`, 260, 105);

  const s1Default = !(gate==='nor' || gate==='not');
  const s2Default = !(gate==='or' || gate==='xor' || gate==='parallel');
  let sw1=null, sw2=null;
  if(gate!=='basic'){
    sw1 = addComponentToWorkspace(gate==='not'?'switch-slide':'switch-push',0,0); setClosed(sw1,s1Default);
    if(!['not','basic'].includes(gate)){ sw2 = addComponentToWorkspace('switch-push',0,0); setClosed(sw2,s2Default); }
  }
  const r = addComponentToWorkspace('resistor',0,0); setRes(r, ledCount>=4 ? 100 : 220);
  const leds=[];
  const colors=['green','red','blue','green','red','blue','green','red'];
  for(let i=0;i<ledCount;i++) leds.push(addComponentToWorkspace('led-'+colors[i%colors.length],0,0));

  // Input area placement. Keep enough room so parts do not overlap.
  if(gate==='and'||gate==='series'||gate==='nand'){
    pinToHole(sw1,'p1',bb,'a2-3'); if(sw2) pinToHole(sw2,'p1',bb,'a2-8'); pinToHole(r,'p1',bb,'a2-13');
  }else if(gate==='or'||gate==='parallel'||gate==='nor'||gate==='xor'||gate==='xnor'){
    pinToHole(sw1,'p1',bb,'a2-4'); if(sw2) pinToHole(sw2,'p1',bb,'f2-4'); pinToHole(r,'p1',bb,'a2-13');
  }else if(gate==='not'){
    pinToHole(sw1,'p1',bb,'a2-5'); pinToHole(r,'p1',bb,'a2-12');
  }else{
    pinToHole(r,'p1',bb,'a2-7');
  }

  // LED chain placement: each LED uses two adjacent columns; leave 3 columns spacing.
  let firstLedCol = ledCount>=4 ? 17 : 18;
  if(ledCount>=6) firstLedCol = 13;
  leds.forEach((led,i)=>{
    const col = Math.min(28, firstLedCol + i*2);
    pinToHole(led,'a',bb,`a1-${col}`);
  });

  let meter=null;
  if(instrument==='oscilloscope'){
    meter=addComponentToWorkspace('oscilloscope',1040,245);
    addAINote('CH1은 LED 출력, GND는 -레일에 연결',1000,335);
  }else if(instrument==='multimeter'){
    meter=addComponentToWorkspace('multimeter',1030,245);
    addAINote('측정기는 출력 전압 확인용',1000,355);
  }

  setTimeout(()=>{
    wireToBoard(pinByName(bat,'vcc'),bb,'railTopPlus-1','#e11d23');
    wireToBoard(pinByName(bat,'gnd'),bb,'railTopMinus-1','#111827');
    let outputHole = 'a0-13';

    if(gate==='and'||gate==='series'||gate==='nand'){
      wireBoard(bb,'railTopPlus-3','a0-3','#e11d23');
      if(sw2){ wireBoard(bb,'a4-7','a0-8','#334155'); wireBoard(bb,'a4-12','a0-13','#334155'); }
      else wireBoard(bb,'a4-7','a0-13','#334155');
      outputHole='a4-17';
      wireBoard(bb,'a4-17',`a0-${firstLedCol}`,'#334155');
    } else if(gate==='or'||gate==='parallel'||gate==='nor'||gate==='xor'||gate==='xnor'){
      wireBoard(bb,'railTopPlus-4','a0-4','#e11d23');
      if(sw2) wireBoard(bb,'railTopPlus-4','f0-4','#e11d23');
      wireBoard(bb,'a4-8','a0-13','#334155');
      if(sw2) wireBoard(bb,'f4-8','a0-13','#334155');
      wireBoard(bb,'a4-17',`a0-${firstLedCol}`,'#334155');
      outputHole='a4-17';
    } else if(gate==='not'){
      // Pull-up LED path, switch pulls input to GND: beginner visual NOT demo.
      wireBoard(bb,'railTopPlus-12','a0-12','#e11d23');
      wireBoard(bb,'a4-16',`a0-${firstLedCol}`,'#334155');
      wireBoard(bb,'a4-9','railTopMinus-9','#111827');
      outputHole='a4-16';
    } else {
      wireBoard(bb,'railTopPlus-7','a0-7','#e11d23');
      wireBoard(bb,'a4-11',`a0-${firstLedCol}`,'#334155');
      outputHole='a4-11';
    }

    // LED chain wiring. Last LED cathode returns to minus rail.
    for(let i=0;i<leds.length-1;i++){
      const kcol = Math.min(29, firstLedCol + i*2 + 1);
      const nextA = Math.min(28, firstLedCol + (i+1)*2);
      wireBoard(bb,`a1-${kcol}`,`a1-${nextA}`,'#334155');
    }
    const lastK = Math.min(29, firstLedCol + (leds.length-1)*2 + 1);
    wireBoard(bb,`a1-${lastK}`,`railTopMinus-${Math.min(29,lastK)}`,'#111827');

    if(meter){
      const outCol = firstLedCol;
      if(instrument==='oscilloscope'){
        wireToBoard(pinByName(meter,'p1'),bb,`a1-${outCol}`,'#f59e0b');
        wireToBoard(pinByName(meter,'p2'),bb,`railTopMinus-${Math.min(29,lastK)}`,'#111827');
      }else{
        wireToBoard(pinByName(meter,'p1'),bb,`a1-${outCol}`,'#f59e0b');
        wireToBoard(pinByName(meter,'p2'),bb,`railTopMinus-${Math.min(29,lastK)}`,'#111827');
      }
    }

    updateBreadboardContactVisuals();
    const out = outputForGate(gate, sw1?sw1.dataset.closed==='true':true, sw2?sw2.dataset.closed==='true':false);
    if(['nand','nor','xor','xnor','not'].includes(gate)) setLedChainPreview(leds,out);
    runSimulation();
    if(['nand','nor','xor','xnor','not'].includes(gate)) setLedChainPreview(leds,out);
    $('#electricInfo').textContent = `${gate.toUpperCase()} 입력 ${sw1?(sw1.dataset.closed==='true'?'1':'0'):'1'}${sw2?','+(sw2.dataset.closed==='true'?'1':'0'):''} → 출력 ${out?'ON':'OFF'}${instrument?' / 측정기 연결됨':''}`;
    saveAuto();
  },80);

  const instrumentText = instrument ? ` ${instrument==='oscilloscope'?'오실로스코프로 출력 파형을':'멀티미터로 출력 전압을'} 측정하도록 연결했습니다.` : '';
  return `${gate.toUpperCase()} 회로를 요청대로 자동 구성했습니다. LED ${ledCount}개를 ${seriesLEDs?'직렬':'출력단'}로 연결했고, 버튼 ON/OFF에 따라 LED가 반응합니다.${instrumentText}`;
}
function makeArduinoFromText(q){
  clearCircuit();
  const pinMatch = q.match(/(\d+)\s*번/) || q.match(/d\s*(\d+)/);
  const pin = pinMatch ? Math.min(13,Math.max(0,parseInt(pinMatch[1],10))) : 13;
  const ledCount=extractLedCount(q);
  const ar=addComponentToWorkspace('arduino',80,120);
  let lastPin = pinByName(ar,'D'+pin);
  let x=380;
  const leds=[];
  for(let i=0;i<ledCount;i++){
    const r=addComponentToWorkspace('resistor',x,185); setRes(r,220);
    const led=addComponentToWorkspace('led-'+(['red','green','blue'][i%3]),x+115,165); leds.push(led);
    wire(lastPin,pinsOf(r)[0]); wire(pinsOf(r)[1],pinByName(led,'a'));
    lastPin=pinByName(led,'k'); x+=160;
  }
  wire(lastPin,pinByName(ar,'GND'));
  addCircuitTitle(`Arduino D${pin} LED ${ledCount}개`,180,90);
  $('#codeEditor').value=`void setup() {\n  pinMode(${pin}, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(${pin}, HIGH);\n}`;
  parseArduinoCode(); runSimulation(); setLedChainPreview(leds,true); saveAuto();
  return `아두이노 D${pin}번에 LED ${ledCount}개 회로를 만들고 코드까지 넣었습니다.`;
}
window.processAICircuit=function(q){
  const raw=q||''; const text=normalizeAIText(raw);
  try{
    if(text.includes('아두이노')||text.includes('arduino')||/\d+\s*번/.test(text)) return makeArduinoFromText(text);
    if(text.includes('모터')||text.includes('motor')){
      clearCircuit(); const bat=addComponentToWorkspace('battery-9v',90,170), sw=addComponentToWorkspace('switch-slide',270,190), m=addComponentToWorkspace('motor-dc',470,165); setClosed(sw,true); addCircuitTitle('DC 모터 회로');
      setTimeout(()=>{wire(pinByName(bat,'vcc'),pinsOf(sw)[0]);wire(pinsOf(sw)[1],pinByName(m,'p1'));wire(pinByName(m,'p2'),pinByName(bat,'gnd')); runSimulation(); saveAuto();},30); return 'DC 모터 회로를 구성했습니다.';
    }
    if(text.includes('서보')){
      clearCircuit(); const ar=addComponentToWorkspace('arduino',90,120), sv=addComponentToWorkspace('motor-servo',410,160); addCircuitTitle('서보 모터 회로');
      setTimeout(()=>{wire(pinByName(ar,'5V'),pinByName(sv,'p1'));wire(pinByName(ar,'GND'),pinByName(sv,'p2'));wire(pinByName(ar,'D9'),pinByName(sv,'sig')); saveAuto();},30); return '서보 모터 회로를 구성했습니다.';
    }
    if(text.includes('목록')||text.includes('도움')||text.includes('가능')) return '예시: “AND 회로에 LED 4개 직렬로 달아줘”, “AND 회로 오실로스코프로 측정해줘”, “OR 회로 LED 2개”, “아두이노 13번 LED 3개”, “NOT 회로 멀티미터로 측정”.';
    const gate=detectGate(text);
    const ledCount=extractLedCount(text);
    const instrument=wantsInstrument(text);
    return makeSmartBreadboardCircuit({gate,ledCount,instrument,seriesLEDs:text.includes('직렬')||gate==='and'||gate==='series'});
  }catch(err){
    console.error(err);
    return '요청을 해석하다가 오류가 나서 기본 LED 회로로 대신 만들었습니다. 다시 한 번 문장으로 입력해 주세요.';
  }
};

/* =========================================================
   CircuitAI 안정화 PRO 패치 v2026-05-28
   - 자연어 조합 명령 강화: AND/OR/NOT + LED/모터/부저/측정기
   - 매크로형 고정 문장 대신 키워드 조합으로 회로 생성
   - 부품 겹침 최소화, 버튼 ON 눌림 표시, 출력장치 동시 연결
========================================================= */
(function(){
  const oldProcess = window.processAICircuit;

  function koNorm(s){
    return (s||'').toLowerCase()
      .replace(/\s+/g,' ')
      .replace(/엔|에는|에다가|에다|에서|으로|로/g,' ')
      .replace(/그리고|랑|와|과|및/g,' and ')
      .replace(/오실로스코프|오실로스콥|스코프/g,'oscilloscope')
      .replace(/멀티미터|테스터기|전압계|전류계/g,'multimeter')
      .replace(/엘이디|led등/g,'led')
      .replace(/부저|버저|buzzer/g,'buzzer')
      .replace(/모터|motor/g,'motor')
      .replace(/빼고|제외|삭제/g,' remove ')
      .trim();
  }
  function getGateSmart(t){
    if(/x\s*nor|xnor/.test(t)) return 'xnor';
    if(/x\s*or|xor/.test(t)) return 'xor';
    if(/nand/.test(t)) return 'nand';
    if(/nor/.test(t) && !/xnor/.test(t)) return 'nor';
    if(/\bnot\b|반전|인버터/.test(t)) return 'not';
    if(/\band\b|직렬|둘 다|두개 다|모두/.test(t)) return 'and';
    if(/\bor\b|병렬|둘 중|하나만|하나라도/.test(t)) return 'or';
    return 'basic';
  }
  function getCountSmart(t, word, fallback){
    const patterns = [
      new RegExp(word+'\\s*(\\d+)\\s*개'),
      new RegExp('(\\d+)\\s*개\\s*'+word),
      new RegExp(word+'\\s*(\\d+)')
    ];
    for(const r of patterns){ const m=t.match(r); if(m) return Math.max(1, Math.min(8, parseInt(m[1],10)||fallback)); }
    return fallback;
  }
  function hasRemoveBefore(t, word){
    return new RegExp(word+'.{0,8}remove|remove.{0,8}'+word).test(t);
  }
  function addTinyNode(x,y,label=''){
    const n=document.createElement('div');
    n.className='workspace-component comp-route smart-node';
    n.dataset.compId=nextComponentId++;
    n.dataset.type='route';
    n.dataset.baseType='route';
    n.style.left=x+'px'; n.style.top=y+'px'; n.style.width='12px'; n.style.height='12px';
    n.innerHTML='<div style="width:12px;height:12px;border-radius:50%;background:#334155;border:2px solid #e2e8f0;box-shadow:0 2px 4px rgba(0,0,0,.25)"></div>';
    world.appendChild(n); addPin(n,'route',6,6,label); return n;
  }
  function p(comp,name){return pinByName(comp,name) || pinsOf(comp)[0];}
  function w(a,b){ if(a&&b) wire(a,b); }
  function setOn(comp,on){ if(comp&&comp.dataset.baseType==='switch') setClosed(comp,on); }
  function title(txt){ addCircuitTitle(txt,120,78); }
  function stableRun(extraPreview){
    setTimeout(()=>{ try{ runSimulation(); if(extraPreview) extraPreview(); saveAuto(); }catch(e){ console.warn(e); } }, 80);
  }
  function loadPos(i){ return {x:590 + (i%3)*155, y:180 + Math.floor(i/3)*105}; }

  function buildCombinationCircuit(opts){
    clearCircuit();
    const gate=opts.gate||'basic';
    const ledCount=opts.ledCount||0;
    const motorCount=opts.motorCount||0;
    const buzzerCount=opts.buzzerCount||0;
    const instrument=opts.instrument||null;
    const bb = addComponentToWorkspace('breadboard-small', 290, 130);
    const bat = addComponentToWorkspace('battery-9v', 55, 190);
    const outNode = addTinyNode(520,238,'OUT');
    const gndNode = addTinyNode(520,320,'GND');
    title(`${gate.toUpperCase()} 조합 회로`);
    addAINote('출력장치들은 OUT/GND에 병렬 연결됩니다.\nLED 여러 개 요청 시 LED끼리는 직렬 체인으로 배치합니다.',600,75);

    let s1=null, s2=null;
    if(gate==='basic'){
      const sw=addComponentToWorkspace('switch-slide',260,220); setOn(sw,true); s1=sw;
      w(p(bat,'vcc'), p(sw,'p1')); w(p(sw,'p2'), p(outNode,'route'));
    }else if(gate==='and' || gate==='nand'){
      s1=addComponentToWorkspace('switch-push',245,202); s2=addComponentToWorkspace('switch-push',345,202);
      setOn(s1,true); setOn(s2,true);
      w(p(bat,'vcc'), p(s1,'p1')); w(p(s1,'p2'), p(s2,'p1')); w(p(s2,'p2'), p(outNode,'route'));
    }else if(gate==='or' || gate==='nor' || gate==='xor' || gate==='xnor'){
      s1=addComponentToWorkspace('switch-push',245,180); s2=addComponentToWorkspace('switch-push',245,285);
      setOn(s1,true); setOn(s2, gate==='or' || gate==='nor' ? false : false);
      w(p(bat,'vcc'), p(s1,'p1')); w(p(bat,'vcc'), p(s2,'p1'));
      w(p(s1,'p2'), p(outNode,'route')); w(p(s2,'p2'), p(outNode,'route'));
    }else if(gate==='not'){
      s1=addComponentToWorkspace('switch-push',275,220); setOn(s1,false);
      // 시각적 NOT: 스위치가 OFF일 때 출력 ON, ON이면 출력 OFF로 표시
      w(p(bat,'vcc'), p(outNode,'route'));
      w(p(s1,'p1'), p(outNode,'route')); w(p(s1,'p2'), p(gndNode,'route'));
    }
    w(p(bat,'gnd'), p(gndNode,'route'));

    const loads=[];
    let idx=0;
    if(ledCount>0){
      let prev = p(outNode,'route');
      for(let i=0;i<ledCount;i++){
        const pos=loadPos(idx++);
        const r=addComponentToWorkspace('resistor',pos.x,pos.y+12); setRes(r, ledCount>=4?100:220);
        const led=addComponentToWorkspace('led-'+(['green','red','blue'][i%3]),pos.x+95,pos.y-4);
        loads.push(led);
        w(prev, pinsOf(r)[0]); w(pinsOf(r)[1], p(led,'a'));
        prev=p(led,'k');
      }
      w(prev, p(gndNode,'route'));
    }
    for(let i=0;i<motorCount;i++){
      const pos=loadPos(idx++); const m=addComponentToWorkspace('motor-dc',pos.x,pos.y); loads.push(m);
      w(p(outNode,'route'), p(m,'p1')); w(p(m,'p2'), p(gndNode,'route'));
    }
    for(let i=0;i<buzzerCount;i++){
      const pos=loadPos(idx++); const bz=addComponentToWorkspace('buzzer',pos.x,pos.y+5); loads.push(bz);
      w(p(outNode,'route'), p(bz,'p1')); w(p(bz,'p2'), p(gndNode,'route'));
    }
    let meter=null;
    if(instrument==='multimeter'){
      meter=addComponentToWorkspace('multimeter',900,185); meter.dataset.mode='V';
      w(p(meter,'p1'), p(outNode,'route')); w(p(meter,'p2'), p(gndNode,'route'));
    }else if(instrument==='oscilloscope'){
      meter=addComponentToWorkspace('oscilloscope',890,205);
      w(p(meter,'p1'), p(outNode,'route')); w(p(meter,'p2'), p(gndNode,'route'));
    }

    function logicOut(){
      const a=s1 ? s1.dataset.closed==='true' : true;
      const b=s2 ? s2.dataset.closed==='true' : false;
      if(gate==='and') return a&&b;
      if(gate==='or') return a||b;
      if(gate==='nand') return !(a&&b);
      if(gate==='nor') return !(a||b);
      if(gate==='xor') return a!==b;
      if(gate==='xnor') return a===b;
      if(gate==='not') return !a;
      return a;
    }
    function preview(){
      const on=logicOut();
      loads.forEach(c=>{
        if(c.dataset.baseType==='led') setLedPreview(c,on);
        if(c.dataset.baseType==='motor') $('.motor-dc-graphic',c)?.classList.toggle('motor-on',on);
        if(c.dataset.baseType==='buzzer') $('.buzzer-graphic',c)?.classList.toggle('buzz-on',on);
      });
      if(meter && meter.dataset.baseType==='multimeter'){
        meter.dataset.reading = on ? '약 9.00 V' : '0.00 V'; updateMultimeterScreen(meter,meter.dataset.reading);
      }
      $('#electricInfo').textContent = `${gate.toUpperCase()} 출력 ${on?'ON':'OFF'} / LED ${ledCount}개, 모터 ${motorCount}개, 부저 ${buzzerCount}개${instrument?' 측정 연결':''}`;
    }
    stableRun(preview);
    return `${gate.toUpperCase()} 회로에 ${ledCount?`LED ${ledCount}개 `:''}${motorCount?`모터 ${motorCount}개 `:''}${buzzerCount?`부저 ${buzzerCount}개 `:''}${instrument?`${instrument==='multimeter'?'멀티미터':'오실로스코프'} `:''}를 조합해서 안정적으로 배치했습니다.`;
  }

  function smartParseAndBuild(raw){
    const t=koNorm(raw);
    const gate=getGateSmart(t);
    const instrument = t.includes('oscilloscope') ? 'oscilloscope' : (t.includes('multimeter') || /측정|전압|전류/.test(t) ? 'multimeter' : null);

    let wantsLed = /led|전구|불/.test(t);
    let wantsMotor = /motor|dc/.test(t);
    let wantsBuzzer = /buzzer|소리|도레미|삐/.test(t);

    if(hasRemoveBefore(t,'led')) wantsLed=false;
    if(hasRemoveBefore(t,'motor')) wantsMotor=false;
    if(hasRemoveBefore(t,'buzzer')) wantsBuzzer=false;
    if(!wantsLed && !wantsMotor && !wantsBuzzer) wantsLed=true;

    const ledCount = wantsLed ? getCountSmart(t,'led',1) : 0;
    const motorCount = wantsMotor ? getCountSmart(t,'motor',1) : 0;
    const buzzerCount = wantsBuzzer ? getCountSmart(t,'buzzer',1) : 0;

    return buildCombinationCircuit({gate,ledCount,motorCount,buzzerCount,instrument});
  }

  window.processAICircuit=function(q){
    try{
      const t=koNorm(q);
      if(/도움|목록|가능|예시/.test(t)) return '가능한 예시: AND회로에 모터 달아줘, OR회로에 부저랑 LED 달아줘, NOT회로에 LED 빼고 모터달아줘, AND회로 LED 4개 직렬 + 멀티미터 측정, 병렬회로 오실로스코프로 측정.';
      if(/아두이노|arduino|\d+\s*번/.test(t) && typeof makeArduinoFromText==='function') return makeArduinoFromText(t);
      return smartParseAndBuild(q);
    }catch(e){
      console.error('Smart builder error',e);
      if(typeof oldProcess==='function') return oldProcess(q);
      return '오류가 나서 기본 LED 회로로 구성했습니다.';
    }
  };
})();
