/* Learning interactions are display-only; source bars and detectors are untouched. */
(() => {
  const labels={body:'Body',upper:'Upper wick',lower:'Lower wick',range:'Whole range'};
  const explanations={body:'The distance between open and close, regardless of candle color.',upper:'High minus the higher of open and close.',lower:'The lower of open and close minus low.',range:'High minus low: the full candle height, including both wicks.'};
  let pinned='',hovered='',pinnedTrigger=null,hoveredTrigger=null;
  let teachingStyle='quiet';try{teachingStyle=localStorage.getItem('pattern-teaching-style')||'quiet';}catch{}if(!['quiet','guided','controls'].includes(teachingStyle))teachingStyle='quiet';document.body.dataset.teachingStyle=teachingStyle;
  function paint(){
    const part=hovered||pinned;
    document.querySelectorAll('[data-anatomy-part]').forEach(el=>el.classList.toggle('anatomy-lit',el.dataset.anatomyPart===part));
    document.querySelectorAll('[data-anatomy-term]').forEach(el=>{const active=el===(hoveredTrigger||pinnedTrigger);el.classList.toggle('anatomy-selected',active);el.setAttribute('aria-pressed',String(el===pinnedTrigger));});
    const status=document.getElementById('anatomy-status');
    if(status)status.textContent=part?labels[part]+': '+explanations[part]+' Highlighting this part on all formation candles.':'Hover or focus a term to highlight it. Tap to keep it highlighted; tap again or press Escape to clear.';
  }
  function term(text,part){const b=document.createElement('button');b.type='button';b.className='anatomy-term';b.dataset.anatomyTerm=part;b.textContent=text;b.setAttribute('aria-pressed','false');return b;}
  function annotate(root){
    const seen=new Set(),walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];
    while(walk.nextNode())if(!walk.currentNode.parentElement.closest('button,a'))nodes.push(walk.currentNode);
    const re=/\b(upper (?:wick|shadow)s?|lower (?:wick|shadow)s?|real bod(?:y|ies)|bod(?:y|ies)|(?:whole |full )?range)\b/gi;
    for(const node of nodes){const text=node.textContent;let last=0,matched=false;const fragment=document.createDocumentFragment();for(const m of text.matchAll(re)){matched=true;fragment.append(text.slice(last,m.index));const lower=m[0].toLowerCase(),part=lower.startsWith('upper')?'upper':lower.startsWith('lower')?'lower':lower.includes('bod')?'body':'range';const trigger=term(m[0],part);trigger.dataset.anatomyInline=part;if(!seen.has(part)){trigger.classList.add('anatomy-first');seen.add(part);}fragment.append(trigger);last=m.index+m[0].length;}if(matched){fragment.append(text.slice(last));node.replaceWith(fragment);}}
  }
  function syntheticOverlay(p){
    if(!p?.teaching?.candles?.length)return;
    const bars=p.teaching.candles,single=bars.length===1,left=single?350:70,right=single?710:1090,step=(right-left)/bars.length;
    const low=Math.min(...bars.map(b=>b.low)),high=Math.max(...bars.map(b=>b.high)),pad=Math.max((high-low)*.12,Math.abs(high)*.0001,.000001),y=v=>410-(v-low+pad)/(high-low+2*pad)*310,width=Math.min(single?95:60,step*.52);
    for(const overlay of document.querySelectorAll('#illustration-panel .chart-overlay,#dialog-chart .chart-overlay')){
      if(overlay.querySelector('[data-anatomy-part]'))continue;
      bars.forEach((b,i)=>{const x=left+(i+.5)*step,top=y(Math.max(b.open,b.close)),bottom=y(Math.min(b.open,b.close));
        const green=b.close>=b.open,base=green?'#58b86c':'#df6267',active=green?'#ffe38a':'#ffac66',stroke=single?6:5;
        const element=(tag,attrs)=>{const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,value);return el;};
        const makeBody=()=>element('rect',{x:x-width/2,y:top,width,height:Math.max(bottom-top,1),fill:active});
        const makeWick=(a,z)=>z>a?element('line',{x1:x,x2:x,y1:a,y2:z,stroke:active,'stroke-width':stroke}):null;
        const upper=()=>makeWick(y(b.high),top),lower=()=>makeWick(bottom,y(b.low));
        const range=element('g',{});for(const el of [upper(),lower(),makeBody()])if(el)range.append(el);
        for(const [part,el]of [['upper',upper()],['lower',lower()],['body',makeBody()],['range',range]])if(el){el.dataset.anatomyPart=part;el.style.setProperty('--anatomy-color',base);el.style.setProperty('--anatomy-active',active);el.classList.add('anatomy-overlay');overlay.append(el);}

      });
    }
  }
  function labMarkup(){return `<details class="candle-lab"><summary>Try it: build a candle and test its proportions</summary><p>Invented geometry, independent of the selected pattern. Keep the range at 100 units and move its open and close. This tests shape only; trend and other context rules still matter.</p><div class="lab-layout"><svg id="lab-chart" viewBox="0 0 200 250" role="img" aria-label="Interactive invented candle"></svg><div><label>Open <output id="lab-open-value">49</output><input id="lab-open" type="range" min="0" max="100" value="49"></label><label>Close <output id="lab-close-value">51</output><input id="lab-close" type="range" min="0" max="100" value="51"></label><p id="lab-measures" aria-live="polite"></p><p id="lab-match" aria-live="polite"></p><div class="lab-presets"><button type="button" data-lab-preset="49,51">Centered doji</button><button type="button" data-lab-preset="96,98">Dragonfly shape</button><button type="button" data-lab-preset="2,4">Gravestone shape</button><button type="button" data-lab-preset="20,80">Large body</button></div></div></div></details>`;}
  function updateLab(){const o=Number(document.getElementById('lab-open').value),c=Number(document.getElementById('lab-close').value),body=Math.abs(c-o),upper=100-Math.max(o,c),lower=Math.min(o,c),y=v=>225-v*2;
    document.getElementById('lab-open-value').value=o;document.getElementById('lab-close-value').value=c;
    document.getElementById('lab-chart').innerHTML=`<line x1="90" x2="90" y1="25" y2="225" stroke="${c>=o?'#58b86c':'#df6267'}" stroke-width="4.5"/><rect x="65" y="${y(Math.max(o,c))}" width="50" height="${Math.max(2,body*2)}" fill="${c>=o?'#58b86c':'#df6267'}"/><text x="125" y="30" fill="#b9cbd5">High 100</text><text x="125" y="230" fill="#b9cbd5">Low 0</text>`;
    document.getElementById('lab-measures').textContent=`Body ${body}% | Upper wick ${upper}% | Lower wick ${lower}%`;
    let matches=[];if(body<=5){matches.push('Doji body');if(upper<=10)matches.push('dragonfly / Takuri geometry');if(lower<=10)matches.push('gravestone geometry');if(upper>=30&&lower>=30){matches.push('long-legged geometry');if(Math.abs((o+c)/2-50)<=15)matches.push('rickshaw geometry');}}
    document.getElementById('lab-match').textContent=matches.length?'Matches: '+matches.join(', ')+'. Context is not tested here.':'Does not meet our doji body limit (at most 5% of range).';
  }
  function enhance(){
    const identify=document.querySelector('.identify-pattern'),p=patterns.find(p=>p.id===current);
    if(!identify||p?.category!=='candlestick')return;
    if(!identify.dataset.interactive){identify.dataset.interactive='true';pinned='';hovered='';pinnedTrigger=null;hoveredTrigger=null;annotate(identify.querySelector('.checklist'));
      const controls=document.createElement('div');controls.className='anatomy-controls';controls.setAttribute('aria-label','Highlight candle anatomy');for(const [key,label]of Object.entries(labels))controls.append(term(label,key));
      const hint=document.createElement('p');hint.id='anatomy-status';hint.className='anatomy-status';hint.setAttribute('aria-live','polite');identify.append(controls,hint);
      const picker=document.createElement('div');picker.className='teaching-style-picker';picker.innerHTML='<label for="learning-style">Learning style</label><select id="learning-style"><option value="quiet">Quiet</option><option value="guided">Guided</option><option value="controls">Controls only</option></select><span class="teaching-style-note">Presentation only; pattern rules unchanged.</span>';identify.append(picker);document.getElementById('learning-style').value=teachingStyle;applyStyle();
    }
    syntheticOverlay(p);paint();syncPractice();
  }
  function syncPractice(){const button=document.getElementById('practice-candle'),toggle=document.getElementById('followthrough');if(button){button.disabled=!toggle||toggle.disabled;button.textContent=toggle?.checked?'Practice: hide later candles':'Reveal what happened next';}}
  function applyStyle(){
    document.body.dataset.teachingStyle=teachingStyle;
    document.querySelectorAll('[data-anatomy-inline]').forEach(el=>{const plain=teachingStyle==='controls',tag=plain?'SPAN':'BUTTON';let target=el;if(el.tagName!==tag){target=document.createElement(tag.toLowerCase());target.textContent=el.textContent;target.dataset.anatomyInline=el.dataset.anatomyInline;if(el.classList.contains('anatomy-first'))target.classList.add('anatomy-first');el.replaceWith(target);}target.classList.toggle('anatomy-prose',plain);target.classList.toggle('anatomy-term',!plain);if(plain){delete target.dataset.anatomyTerm;target.removeAttribute('aria-pressed');}else{target.type='button';target.dataset.anatomyTerm=target.dataset.anatomyInline;target.setAttribute('aria-pressed','false');}});
    pinned='';hovered='';pinnedTrigger=null;hoveredTrigger=null;paint();
  }
  document.addEventListener('pointerover',e=>{const b=e.target.closest('[data-anatomy-term]');if(b){hovered=b.dataset.anatomyTerm;hoveredTrigger=b;paint();}});
  document.addEventListener('pointerout',e=>{if(e.target.closest('[data-anatomy-term]')){hovered='';hoveredTrigger=null;paint();}});
  document.addEventListener('focusin',e=>{const b=e.target.closest('[data-anatomy-term]');if(b){hovered=b.dataset.anatomyTerm;hoveredTrigger=b;paint();}});
  document.addEventListener('focusout',e=>{if(e.target.closest('[data-anatomy-term]')){hovered='';hoveredTrigger=null;paint();}});
  document.addEventListener('click',e=>{const b=e.target.closest('[data-anatomy-term]');if(b){const clear=pinnedTrigger===b;pinned=clear?'':b.dataset.anatomyTerm;pinnedTrigger=clear?null:b;hovered='';hoveredTrigger=null;paint();}const preset=e.target.closest('[data-lab-preset]');if(preset){const [o,c]=preset.dataset.labPreset.split(',');document.getElementById('lab-open').value=o;document.getElementById('lab-close').value=c;updateLab();}if(e.target.closest('#enlarge')){syntheticOverlay(patterns.find(p=>p.id===current));paint();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){pinned='';hovered='';pinnedTrigger=null;hoveredTrigger=null;paint();}});
  document.addEventListener('change',e=>{if(e.target.id==='learning-style'){teachingStyle=e.target.value;try{localStorage.setItem('pattern-teaching-style',teachingStyle);}catch{}applyStyle();}});
  document.addEventListener('input',e=>{if(e.target.matches('#lab-open,#lab-close'))updateLab();});
  // One persistent builder, accessible from every route without taking up chart space.
  const launch=document.createElement('button');launch.type='button';launch.id='open-candle-builder';launch.textContent='Build a candle';launch.setAttribute('aria-haspopup','dialog');launch.setAttribute('aria-controls','candle-builder-dialog');document.querySelector('.topbar').append(launch);
  const builder=document.createElement('dialog');builder.id='candle-builder-dialog';builder.setAttribute('aria-labelledby','candle-builder-title');builder.innerHTML='<div class="dialog-top"><strong id="candle-builder-title">Build a candle</strong><button type="button" id="close-candle-builder" aria-label="Close candle builder">Close ×</button></div>'+labMarkup();document.body.append(builder);builder.querySelector('.candle-lab').open=true;
  launch.onclick=()=>{builder.showModal();document.getElementById('lab-open').focus();};document.getElementById('close-candle-builder').onclick=()=>builder.close();
  builder.addEventListener('click',e=>{if(e.target===builder){const r=builder.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)builder.close();}});
  builder.addEventListener('close',()=>launch.focus({preventScroll:true}));updateLab();
  // Only observe replaced chart/route containers, not text updates from interactions.
  const observer=new MutationObserver(records=>{if(records.some(r=>r.target.id==='detail'||r.target.id==='chart'))enhance();});
  observer.observe(document.getElementById('detail'),{childList:true,subtree:true});
  document.addEventListener('change',e=>{if(e.target.id==='followthrough')syncPractice();});
  enhance();
})();
