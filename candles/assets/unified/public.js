function getStudyPattern(id){const study=DATA.study,row=study?.patterns?.[id];if(!row||row.cells)return row;const e=study.encoding;row.cells=e.configurations.map(([endpoint,horizon,pretrend,split,assetType])=>({endpoint,horizon,pretrend,split,assetType,counts:{...Object.fromEntries(e.countKeys.map(k=>[k,0])),excluded:Object.fromEntries(e.exclusionKeys.map(k=>[k,0]))},nonoverlappingWindows:0,symbolsWithEvents:0,occupiedBlocks:0,periodStart:null,periodEnd:null,rates:Object.fromEntries(e.rateKeys.map(k=>[k,{numerator:0,denominator:0,percent:null,interval95:null,intervalStatus:e.emptyRateStatus}]))}));for(const c of row.packedCells){const cell=row.cells[c[0]];cell.counts={...Object.fromEntries(e.countKeys.map((k,i)=>[k,c[1][i]])),excluded:Object.fromEntries(e.exclusionKeys.map((k,i)=>[k,c[2][i]]))};cell.nonoverlappingWindows=c[3];cell.symbolsWithEvents=c[4];cell.occupiedBlocks=c[5];cell.rates=Object.fromEntries(e.rateKeys.map((k,i)=>{const r=c[6][i];return [k,{numerator:r[0],denominator:r[1],percent:r[2],interval95:r[3],intervalStatus:e.statuses[r[4]]}];}));cell.periodStart=c[7];cell.periodEnd=c[8];}return row;}


function unpackCryptoSection(c){
  const e=c&&c.encoding;if(!e||c.unpacked)return c;
  const rate=(n,d)=>({numerator:n,denominator:d,percent:d?100*n/d:null});
  const pairs=c.scope.pairs,targets=[...pairs,'all'];
  const blank=(keys)=>Object.fromEntries(keys.map(k=>[k,0]));
  const excluded=v=>Object.fromEntries(e.excluded.map((k,i)=>[k,v[i]]));
  for(const [family,keys,meta] of [['patterns',e.candle,e.candleSlice],['chartPatterns',e.chart,e.chartSlice]]){
    for(const row of Object.values(c[family])){
      const byTarget=new Map(row.packed.map(p=>[p[0]<0?'all':pairs[p[0]],p]));
      row.cells=targets.map(pair=>{
        const p=byTarget.get(pair),v=p?p.slice(1,1+keys.length):keys.map(()=>0),x=Object.fromEntries(keys.map((k,i)=>[k,v[i]]));
        const ex=excluded(p?p.slice(1+keys.length,1+keys.length+e.excluded.length):e.excluded.map(()=>0)),tail=p?p[1+keys.length+e.excluded.length]:null;
        if(family==='patterns'){
          const pairsWithEvents=pair==='all'?(tail||[]).map(i=>pairs[i]):x.eligible>0?[pair]:[];
          return {...meta,pair,...x,excluded:ex,pairsWithEvents,rates:{reversal:rate(x.reversal,x.trendKnown),continuation:rate(x.continuation,x.trendKnown),unresolved:rate(x.unresolved,x.trendKnown),up:rate(x.up,x.eligible),down:rate(x.down,x.eligible),noExitOrUnchanged:rate(x.noExitOrUnchanged,x.eligible)}};
        }
        return {...meta,pair,...x,excluded:ex,symbolsWithEvents:pair==='all'?(tail||0):x.eligible>0?1:0,upPercent:x.eligible?100*x.up/x.eligible:null};
      });
      delete row.packed;
    }
  }
  if(c.sensitivity&&c.sensitivity.encoded){
    const k=e.sensitivity,sensitivityTargets=c.sensitivity.targets.map(i=>i<0?'all':pairs[i]);
    for(const row of Object.values(c.sensitivity.patterns)){
      const byTarget=new Map(row.packed.map(p=>[p[0]<0?'all':pairs[p[0]],p]));
      row.cells=sensitivityTargets.map(pair=>{const v=byTarget.get(pair)||[0,...k.map(()=>0)],x=Object.fromEntries(k.map((name,i)=>[name,v[i+1]]));
        return {pair,eligible:x.eligible,trendKnown:x.trendKnown,nonoverlappingWindows:x.nonoverlappingWindows,rates:{reversal:rate(x.reversal,x.trendKnown),continuation:rate(x.continuation,x.trendKnown),unresolved:rate(x.unresolved,x.trendKnown),up:rate(x.up,x.eligible),down:rate(x.down,x.eligible),noExitOrUnchanged:rate(x.noExitOrUnchanged,x.eligible)}};});
      delete row.packed;
    }
    delete c.sensitivity.encoded;
  }
  c.unpacked=true;return c;
}

 
if(typeof unpackCryptoSection==='function')unpackCryptoSection(DATA.crypto);
const $=id=>document.getElementById(id),fmt=n=>Number(n??0).toLocaleString('en-US');
const pct=n=>Number.isFinite(n)?n.toFixed(1)+'%':'Not estimable';

const SMALL_SAMPLE=100,COUNTS_ONLY=20;
const sampleBadge=d=>d>0&&d<SMALL_SAMPLE?`<span class="small-sample-badge">Small sample (n=${fmt(d)})</span>`:'';
const sampleClass=d=>d>0&&d<SMALL_SAMPLE?(d<COUNTS_ONLY?' small-sample counts-only':' small-sample'):'';
const sampleFigure=(n,d,percent)=>d>0&&d<COUNTS_ONLY?`${fmt(n)} of ${fmt(d)}`:pct(percent);
const sampleInline=(n,d,percent)=>d>0&&d<COUNTS_ONLY?`${fmt(n)} of ${fmt(d)} (too few to show a percentage)`:pct(percent)+(d>0&&d<SMALL_SAMPLE?` (small sample, n=${fmt(d)})`:'');
const EXCLUSION_LABELS={invalid:'Invalid formation',preconfirmationExit:'Broke out before confirmation',rightCensored:'Too recent for a full window',gapCensored:'Data gap inside the window',splitPurged:'Window crosses the evaluation start',corporateAction:'Stock split inside the window'};
const exclusionList=excluded=>Object.entries(excluded||{}).map(([key,n])=>esc(EXCLUSION_LABELS[key]||key)+': '+fmt(n)).join(' · ');
const rulesLabel=()=>DATA.ruleProfile.map(r=>String(r).replace(/^oc-independent-/,'')).join(', ');
const studySlice={...DATA.study.defaults};
const detail=$('detail');
const chartChoices={};
let activeExcerpt=null;
function centerExcerpt(){
  const host=$('excerpt-picture')?.querySelector('.public-realchart');
  if(host&&activeExcerpt&&host.scrollWidth>host.clientWidth)host.scrollLeft=Math.max(0,activeExcerpt.knownPixel/1280*host.scrollWidth-host.clientWidth*.7);
}
window.addEventListener('resize',centerExcerpt);
function excerptMarkup(id){
  const entries=DATA.chartExcerpts?.[id]||[];
  if(!entries.length)return '';
  return `<section class="public-excerpts"><div class="public-chart-controls"><button type="button" id="excerpt-prev" aria-label="Previous chart example">←</button><label>Real chart example<select id="excerpt-choice">${entries.map((e,i)=>`<option value="${i}">${i+1} / ${entries.length} · ${esc(e.label)}</option>`).join('')}</select></label><button type="button" id="excerpt-next" aria-label="Next chart example">→</button><label class="excerpt-later"><input id="excerpt-later" type="checkbox" checked> Show later candles</label></div><div id="excerpt-picture"></div><p id="excerpt-caption" class="sample-note"></p><p class="sample-note">Selected chart examples are separate from the outcome-study sample below. Bright candles mark the formation; muted candles supply context. Later candles show what happened in this example, not what a pattern must do.</p></section>`;
}
function excerptPicture(entry,p){
  const parts=entry.focusPixels.map(([x,high,top,bottom,low,width,up])=>{
    const active=up?'#ffe38a':'#ffac66',style=`--anatomy-active:${active}`,wick=(a,b)=>b>a?`<line x1="${x}" x2="${x}" y1="${a}" y2="${b}" stroke="${active}" stroke-width="4"/>`:'',body=`<rect x="${x-width/2}" y="${top}" width="${width}" height="${Math.max(1.2,bottom-top)}" fill="${active}"/>`;
    return [['upper',wick(high,top)],['lower',wick(bottom,low)],['body',body],['range',wick(high,top)+body+wick(bottom,low)]].map(([part,content])=>`<g class="anatomy-overlay" data-anatomy-part="${part}" style="${style}">${content}</g>`).join('');
  }).join('');
  return `<div class="public-realchart"><img src="${esc(entry.image)}" width="1280" height="480" decoding="async" alt="${esc(p.name)} real chart candidate: ${esc(entry.label)}. Brighter red or green candles mark the formation; ${entry.laterCandles} later candles are available."><svg class="real-anatomy-overlay" viewBox="0 0 1280 480" aria-hidden="true">${parts}<g class="later-mask" style="display:none"><rect x="${entry.knownPixel+1}" y="54" width="${Math.max(0,1189-entry.knownPixel)}" height="426" fill="#171b21"/><text x="${entry.knownPixel+10}" y="80" fill="#9ba8b8" font-size="13">Later candles hidden</text></g></svg></div>`;
}
function wireExcerpts(id,p){
  const entries=DATA.chartExcerpts[id];let index=Math.min(chartChoices[id]||0,entries.length-1);
  const showLater=()=>document.querySelectorAll('.later-mask').forEach(mask=>{mask.style.display=$('excerpt-later').checked?'none':'block';});
  const draw=()=>{
    chartChoices[id]=index;const entry=entries[index];activeExcerpt=entry;$('excerpt-choice').value=String(index);
    $('excerpt-prev').disabled=index===0;$('excerpt-next').disabled=index===entries.length-1;
    $('excerpt-picture').innerHTML=excerptPicture(entry,p);$('excerpt-later').disabled=!entry.laterCandles;
    $('excerpt-caption').textContent=entry.label+' · '+(entry.laterCandles?entry.laterCandles+' available later sessions.':'No later sessions are included in this excerpt.')+' Candidate labels await human review; source adjustment is not independently verified.';
    showLater();
    requestAnimationFrame(centerExcerpt);
  };
  $('excerpt-choice').onchange=e=>{index=Number(e.target.value);draw();};$('excerpt-prev').onclick=()=>{index--;draw();};$('excerpt-next').onclick=()=>{index++;draw();};$('excerpt-later').onchange=showLater;draw();
  return ()=>{const entry=entries[index];$('dialog-title').textContent=p.name+' · '+entry.label;$('dialog-chart').innerHTML=excerptPicture(entry,p);showLater();$('chart-dialog').showModal();};
}
function restoreChartView(p){
  const entries=DATA.chartExcerpts?.[p.id]||[],market=detail.querySelector('.market-workspace');
  if(!entries.length){market.insertAdjacentHTML('beforeend','<p class="sample-note">No real excerpt is available for this definition in the current curated gallery. This is a teaching illustration, not a market observation.</p>');return;}
  const illustration=$('illustration-panel'),tabs=market.querySelector('.evidence-tabs'),enlarge=$('enlarge'),enlargeIllustration=enlarge.onclick;
  const real=document.createElement('div');real.id='real-panel';real.innerHTML=excerptMarkup(p.id);illustration.before(real);illustration.hidden=true;
  tabs.querySelector('span').remove();tabs.insertAdjacentHTML('afterbegin','<div><button type="button" id="real-tab" aria-pressed="true">Real chart</button><button type="button" id="synthetic-tab" aria-pressed="false">Teaching illustration</button></div>');
  const enlargeReal=wireExcerpts(p.id,p),tag=detail.querySelector('.tags .tag:last-child');
  const choose=synthetic=>{real.hidden=synthetic;illustration.hidden=!synthetic;$('real-tab').setAttribute('aria-pressed',String(!synthetic));$('synthetic-tab').setAttribute('aria-pressed',String(synthetic));enlarge.onclick=synthetic?enlargeIllustration:enlargeReal;tag.textContent=synthetic?'Teaching illustration':entries.length+' curated chart excerpts';};
  $('real-tab').onclick=()=>choose(false);$('synthetic-tab').onclick=()=>choose(true);choose(false);
}
function visiblePatterns(){
  const q=$('search').value.trim().toLowerCase(),category=$('category').value,direction=$('direction').value,length=$('length').value,coverage=$('coverage').value;
  return patterns.filter(p=>(category==='all'||p.category===category)&&(direction==='all'||p.direction===direction)&&(length==='all'||(length==='chart'?p.category==='chart':length==='many'?p.category==='candlestick'&&p.size>=4:p.category==='candlestick'&&p.size===Number(length)))&&(coverage==='all'||(coverage==='real'?!!DATA.study.patterns[p.id]:!DATA.study.patterns[p.id]))&&[p.name,p.id,p.copy.overview,...p.copy.aliases].join(' ').toLowerCase().includes(q));
}
function renderIndex(){
  const rows=visiblePatterns(),list=$('pattern-list'),scroll=list.scrollTop;
  const q=$('search').value.trim().toLowerCase();
  const charts=DATA.chartDefinitions.filter(p=>['all','chart'].includes($('category').value)&&$('direction').value==='all'&&['all','chart'].includes($('length').value)&&$('coverage').value!=='missing'&&[p.name,p.overview,...p.identification].join(' ').toLowerCase().includes(q));
  $('result-count').textContent=(rows.length+charts.length)+' / '+(patterns.length+DATA.chartDefinitions.length);
  list.innerHTML=rows.map(p=>`<a class="pattern-item ${p.id===current?'active':''}" href="#pattern/${esc(p.id)}" ${p.id===current?'aria-current="page"':''}><span>${esc(p.name)}<small>${p.category==='chart'?'Chart geometry':p.size+' candle'+(p.size===1?'':'s')} · ${esc(p.direction)}${DATA.study.patterns[p.id]?' · statistics':''}</small></span></a>`).join('')+charts.map(p=>`<a class="pattern-item ${p.patternId===current?'active':''}" href="#research/charts/${esc(p.patternId)}"><span>${esc(p.name)}<small>Chart geometry · statistics</small></span></a>`).join('');
  if(!rows.length&&!charts.length)list.innerHTML='<p class="empty">No matching patterns. Change the search or filters.</p>';
  list.scrollTop=scroll;
}
function contextMarkup(p){
  const trend=p.trendPolicy,required=trend==='up'||trend==='down';
  return `<div class="schematic-context"><strong>${required?(trend==='up'?'↗ After rising context':'↘ After falling context'):'Prior context'}</strong><span>${esc(p.copy.trend)}</span></div>`;
}
function chart(p){
  const bars=p.teaching?.candles,geometry=p.geometry;
  if(!bars&&!geometry)return '';
  let svg='';
  if(bars){
    const single=bars.length===1,left=single?350:70,right=single?710:1090,step=(right-left)/bars.length;
    const low=Math.min(...bars.map(b=>b.low)),high=Math.max(...bars.map(b=>b.high)),pad=Math.max((high-low)*.12,Math.abs(high)*.0001,.000001),y=v=>410-(v-low+pad)/(high-low+2*pad)*310,width=Math.min(single?95:60,step*.52);
    svg=bars.map((b,i)=>{const x=left+(i+.5)*step,top=y(Math.max(b.open,b.close)),bottom=y(Math.min(b.open,b.close)),color=b.close>=b.open?'#58b86c':'#df6267';return `<g data-schematic-candle="${i}"><line x1="${x}" x2="${x}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${color}" stroke-width="${single?6:5}"/><rect x="${x-width/2}" y="${top}" width="${width}" height="${Math.max(1,bottom-top)}" fill="${color}"/><text x="${x}" y="465" text-anchor="middle" fill="#a9b3bf" font-size="22">${bars.length>1?'Candle '+(i+1):'Shape'}</text></g>`;}).join('');
    if(single&&(p.trendPolicy==='up'||p.trendPolicy==='down'))svg+=`<g class="context-cue" fill="none" stroke="#929ba8" stroke-width="5" opacity=".75"><path d="${p.trendPolicy==='down'?'M115 145L180 172L210 160L275 230L263 206M275 230L249 230':'M115 285L180 255L210 267L275 198L248 200M275 198L264 225'}"/></g><text x="80" y="340" fill="#a9b3bf" font-size="20">Prior ${p.trendPolicy==='up'?'rising':'falling'} context</text>`;
  }else{
    const x=i=>70+(i+.5)*1020/geometry.candles.length,y=v=>410-v*3.1,width=Math.max(2,1020/geometry.candles.length*.58);
    svg=geometry.candles.map((b,i)=>{const color=b[3]>=b[0]?'#58b86c':'#df6267',top=y(Math.max(b[0],b[3])),bottom=y(Math.min(b[0],b[3]));return `<g ${i<geometry.start||i>geometry.confirmed?'data-candle-context="true"':''}><line x1="${x(i)}" x2="${x(i)}" y1="${y(b[1])}" y2="${y(b[2])}" stroke="${color}" stroke-width="2.5"/><rect x="${x(i)-width/2}" y="${top}" width="${width}" height="${Math.max(1,bottom-top)}" fill="${color}"/></g>`;}).join('');
    svg+=`<g class="geometry-markings" stroke="#e5bd80" fill="none" stroke-width="2.5">${geometry.lines.map(l=>`<line x1="${x(l[0])}" y1="${y(l[1])}" x2="${x(l[2])}" y2="${y(l[3])}"/>`).join('')}<line x1="${x(geometry.confirmed)}" x2="${x(geometry.confirmed)}" y1="70" y2="430" stroke-dasharray="6 5"/></g><text x="${x(geometry.confirmed)}" y="460" text-anchor="end" fill="#b8c3cd" font-size="18">Definition complete</text>`;
  }
  return `<div class="chart-image public-schematic ${annotations?'':'annotations-off'}"><svg viewBox="0 0 1200 540" role="img" aria-label="${esc(p.name)} original schematic; no market prices or observed outcome">${svg}</svg><svg class="chart-overlay" viewBox="0 0 1200 540" aria-hidden="true"></svg></div>`;
}
function teachingMeasurements(p){
  if(!p.teaching)return '';
  return `<details class="teaching-measurements"><summary>Illustrated proportions</summary><p>Percent of each schematic candle’s full range. These are example proportions; use the identification rules for the allowed thresholds.</p><div class="measurement-scroll"><table><thead><tr><th>Candle</th><th>Body</th><th>Upper wick</th><th>Lower wick</th></tr></thead><tbody>${p.teaching.candles.map(b=>`<tr><th>${b.number}</th><td>${pct(b.bodyRangePct)}</td><td>${pct(b.upperWickPct)}</td><td>${pct(b.lowerWickPct)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function definitionsMarkup(p){
  return `${comparisonPrompt(p)}<div class="learning-grid"><section><h3>Usual interpretation</h3><p>${esc(p.copy.interpretation)}</p><h3>Definition complete</h3><p>${esc(p.copy.confirmation)}</p></section><section><h3>Easy to miss</h3><ul>${p.copy.pitfalls.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section></div><details><summary>Exact rule &amp; conventions</summary><p>${esc(p.definition)}</p><p>${p.category==='candlestick'?`Body = |close − open|; range = high − low. Size comparisons use the preceding ${DATA.numericProfile.averageBodyLength} candles, excluding the current candle. “Long” exceeds their mean body; “small” is at most ${DATA.numericProfile.smallBody*100}% of it. A positive mean and complete history are required. Context uses the pre-pattern close versus its ${DATA.numericProfile.trendWindow}-close average. This is a chosen context proxy, not a universal definition of trend.`:'Default geometry tolerance is 2%. Pivot confirmation requires five bars to the right of a swing. The stated rule may additionally require a closing breakout.'}</p></details><details><summary>References &amp; terminology</summary><ul>${p.copy.sources.filter(s=>/^https?:\/\//i.test(s.url)).map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a></li>`).join('')}</ul><p>Independent explanations and schematics; links document naming conventions, not validation of our outcome rates.</p><a href="#guide">Candlestick basics &amp; glossary</a></details>`;
}
function renderPattern(p){
  current=p.id;lastPattern=p.id;renderIndex();detail.className='content desk-pattern';
  detail.innerHTML=`${publicPatternAnchors(p)}<div class="title-row"><h2>${esc(p.name)}</h2><div class="pager">${pagerMarkup(p)}</div></div><div class="tags"><span class="tag">${esc(p.direction)} label</span><span class="tag">${p.category==='chart'?'Chart geometry':p.size+' candle'+(p.size===1?'':'s')}</span><span class="tag">Original schematic</span></div><p class="summary">${esc(p.copy.overview)}</p><div class="desk-layout"><aside class="desk-side"><section class="identify-pattern"><h3>Identify this pattern</h3><p class="threshold-note">Our numeric profile; other definitions may differ.</p><ol class="checklist">${p.copy.identification.map(t=>`<li>${esc(t)}</li>`).join('')}</ol>${dojiFamily(p)}</section></aside><div class="desk-center"><section class="market-workspace"><div class="evidence-tabs"><span>Schematic · no market prices</span><button id="enlarge">Enlarge ↗</button></div><div id="illustration-panel">${contextMarkup(p)}${chart(p)}${teachingMeasurements(p)}</div></section><section id="pattern-research" class="pattern-research"></section><div class="desk-reference">${definitionsMarkup(p)}</div></div></div>`;
  $('enlarge').onclick=()=>{$('dialog-title').textContent=p.name+' · schematic';$('dialog-chart').innerHTML=contextMarkup(p)+chart(p);$('chart-dialog').showModal();};
  renderStats(p);
  restoreChartView(p);
}
function optionMarkup(key,values){return `<label>${{endpoint:'Outcome measure',horizon:'Sessions after confirmation',pretrend:'Actual prior context',split:'Period',assetType:'Asset class'}[key]}<select data-study-control="${key}">${values.map(([v,t])=>`<option value="${v}" ${studySlice[key]===v?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
function rateMarkup(label,r){const d=r?.denominator??0;return `<div class="rate-card${sampleClass(d)}" data-n="${d}"><span>${esc(label)}</span>${sampleBadge(d)}<strong>${sampleFigure(r?.numerator,d,r?.percent)}</strong><p>${fmt(r?.numerator)} / ${fmt(d)} observations</p><details><summary>Uncertainty</summary><p>${r?.interval95?'Descriptive 95% interval: '+r.interval95.map(pct).join(' to '):esc((r?.intervalStatus||'Not estimated').replaceAll('_',' '))}</p></details></div>`;}
function endpointSummary(){return studySlice.endpoint==='first_close_breakout'?`Watch the ${studySlice.horizon} sessions after detector confirmation. The first daily close above the pattern’s highest high or below its lowest low sets the outcome direction. An exit opposite to the actual prior context is a reversal; no closing exit stays in the denominator as unresolved.`:`Compare the next session’s opening price with the closing price ${studySlice.horizon} sessions after detector confirmation. This measures price movement, not a structural reversal or trading profit.`;}
function statsCellMarkup(c,endpoint){
  const breakout=endpoint==='first_close_breakout';
  return `<div class="rate-grid">${[['reversal',breakout?'Reversal':'Against prior context'],['continuation',breakout?'Continuation':'With prior context'],['unresolved',breakout?'No closing breakout':'Unchanged']].map(([key,label])=>rateMarkup(label,c.rates[key])).join('')}</div><p class="sample-note">${fmt(c.symbolsWithEvents)} contributing symbol${c.symbolsWithEvents===1?'':'s'} · ${fmt(c.nonoverlappingWindows)} nonoverlapping windows · ${fmt(c.occupiedBlocks)} occupied time blocks. Occurrences may overlap; they are not independent trades.</p><details><summary>Direction counts, denominators &amp; exclusions</summary><p>Up: ${fmt(c.counts.up)} · Down: ${fmt(c.counts.down)} · No exit / unchanged: ${fmt(c.counts.noExitOrUnchanged)}. These use ${fmt(c.counts.eligible)} eligible windows. The reversal / continuation denominator excludes flat prior context and includes unresolved windows.</p><p>Candidates: ${fmt(c.counts.candidates)} · Eligible: ${fmt(c.counts.eligible)} · Flat prior context: ${fmt(c.counts.flatTrend)}.</p><dl class="public-exclusions">${Object.entries(c.counts.excluded).map(([key,n])=>`<div><dt>${esc(EXCLUSION_LABELS[key]||key.replace(/([A-Z])/g,' $1'))}</dt><dd>${fmt(n)}</dd></div>`).join('')}</dl></details>`;
}
function renderStats(p){
  const host=$('pattern-research'),row=getStudyPattern(p.id),scope=DATA.study.scope;
  if(!row&&DATA.chartStudy.patterns[p.id]){const record=DATA.chartStudy.patterns[p.id],c=record.cells.find(c=>c.horizon===10&&c.split==='heldout');host.innerHTML=`<h3>Observed in our sample</h3><p class="sample-note">${fmt(DATA.chartStudy.scope.stocks)} stocks · ${fmt(DATA.chartStudy.scope.bars)} daily bars · 10 sessions after confirmation · evaluation from ${esc(DATA.chartStudy.protocol.heldoutStart)}.</p>${chartCellMarkup(c)}<p class="sample-note">Next-open to horizon-close movement, not a reversal rate or trading win rate.</p>`;return;}
  if(!row){host.innerHTML='<h3>Outcome statistics</h3><p>No outcome study is attached to this exact geometry definition. <a href="#research/charts">Explore the separately measured gap, island, triangle and channel rules.</a></p>';return;}
  const cell=row.cells.find(c=>Object.entries(studySlice).every(([k,v])=>c[k]===v));
  const configurations=DATA.study.encoding.configurations;
  const values=(index)=>[...new Set(configurations.map(c=>c[index]))];
  host.innerHTML=`<div class="section-title"><h3>Observed in our sample</h3><a href="#about">Methods ↗</a></div><p class="sample-note">${fmt(scope.stockCount)} stocks · ${fmt(scope.bars)} daily bars · ${esc(scope.observedStart||scope.periodStart)}–${esc(scope.observedEnd||scope.periodEnd)}. Evaluation starts ${esc(scope.heldoutStart)}.</p><details class="study-controls"><summary>Sample: ${studySlice.horizon} sessions · ${esc(studySlice.split)} · ${esc(studySlice.pretrend)} prior contexts</summary><div class="study-filter-grid">${optionMarkup('endpoint',DATA.study.methods.map(m=>[m.id,m.label]))}${optionMarkup('horizon',values(1).map(v=>[v,v]))}${optionMarkup('pretrend',values(2).map(v=>[v,v]))}${optionMarkup('split',values(3).map(v=>[v,v==='heldout'?'Evaluation (held out)':v]))}${optionMarkup('assetType',values(4).map(v=>[v,v]))}</div></details><p class="endpoint-definition">${endpointSummary()}</p>${cell?statsCellMarkup(cell,studySlice.endpoint):'<p>This slice is unavailable; no rate is estimated.</p>'}<p class="sample-note">Experimental descriptive frequencies, not win rates or forecasts. ${studySlice.endpoint==='first_close_breakout'?'The wide stock universe includes thinly traded names, whose prices more often stay inside the pattern range, so "no closing breakout" is more common than in smaller large-company samples. ':''} ${scope.selection?'Current listings only, so delisted securities are absent':'Current-survivor convenience sample'}; source adjustment and individual labels are not independently certified. Detector confirmation means the label is knowable, not confirmation of a trade. No sample-count cutoff establishes reliability.</p>${returnStudyMarkup(p)}${publishedMarkup(p)}`;
  host.querySelector('.section-title').insertAdjacentHTML('beforeend',`<a href="#research/crypto/${p.id}">Crypto results</a>`);
  host.querySelectorAll('[data-study-control]').forEach(el=>el.onchange=()=>{const key=el.dataset.studyControl;studySlice[key]=key==='horizon'?Number(el.value):el.value;renderStats(p);host.querySelector('.study-controls').open=true;host.querySelector(`[data-study-control="${key}"]`).focus({preventScroll:true});});
}
function returnStudyMarkup(p){
  const r=DATA.returnStudy.patterns.find(r=>r.pattern===p.id);if(!r)return '';
  return `<details><summary>Separate five-session matched-return comparison</summary><p>Separate small reference panel (41 stocks, 9 ETFs), held-out period from ${esc(DATA.returnStudy.scope.heldoutStart)}. ${fmt(r.n)} observations${sampleBadge(r.n)}; ${fmt(r.nonoverlap)} nonoverlapping events; ${fmt(r.blocks)} date blocks. This is a separate study, not the breakout percentage above.</p>${r.ci&&r.n>=COUNTS_ONLY?`<p>Signed mean price return: ${pct(r.mean*100)}. Matched baseline: ${pct(r.baseline*100)}. Difference: ${(r.excess*100).toFixed(3)} percentage points. Descriptive 95% interval for that difference: ${r.ci.map(v=>(v*100).toFixed(3)).join(' to ')} percentage points.</p>`:'<p>Insufficient block support for a return estimate in this view.</p>'}<p>Entry proxy: next session’s open; exit: fifth subsequent close. Bearish labels negate the long price return. Baseline matches symbol, calendar year, period and prior SMA50 context. Intervals resample 40-date blocks jointly across symbols with 2,000 fixed-seed draws. No costs, borrow, dividends or executable short-profit model.</p></details>`;
}
function publishedMarkup(p){
  const rows=DATA.comparisonsPublished.filter(r=>r.patternId===p.id);
  return `<details><summary>Published comparisons</summary><p>Different definitions, endpoints, horizons and denominators can produce different percentages. A two-percentage-point difference is an investigation trigger only after those methods are comparable. It is not proof of an error.</p>${rows.length?rows.map(r=>`<h4>${esc(r.label)}</h4><p>${esc(r.publishedMetricLabel)}: ${Number.isFinite(r.publishedRate)?pct(r.publishedRate*100):'Unavailable'}. Published denominator: ${r.publishedDenominator==null?'not established':fmt(r.publishedDenominator)}.</p><p>Our ${r.currentStockCount?fmt(r.currentStockCount):'original 176'}-stock reference, fixed 10-session first-closing-breakout reversal slice, held-out stocks, all actual prior contexts: ${Number.isFinite(r.currentRate)?sampleInline(Math.round(r.currentRate*r.currentDenominator),r.currentDenominator,r.currentRate*100)+sampleBadge(r.currentDenominator):'Not estimable'} (${fmt(r.currentDenominator)} eligible trend-known observations). This does not follow the exploratory selectors above.</p><p>Comparison status: ${esc(r.investigationStatus.replaceAll('_',' '))}. Comparable difference: ${r.deltaPercentagePoints==null?'not computed':r.deltaPercentagePoints.toFixed(2)+' percentage points'}.</p><p>${esc(r.interpretation)}</p><a href="${esc(r.source?.url)}" target="_blank" rel="noopener noreferrer">${esc(r.source?.author)} · ${esc(r.source?.title)} ↗</a>`).join(''):'<p>No verified published rate has been entered for this pattern.</p>'}</details>`;
}
function renderAbout(){
  current='';renderIndex();detail.className='content';const s=DATA.study.scope;
  detail.innerHTML=`<h2 class="page-heading">What the statistics mean</h2><p>${fmt(s.stockCount)} stocks · ${fmt(s.bars)} daily bars · ${esc(s.observedStart||s.periodStart)} through ${esc(s.observedEnd||s.periodEnd)} · daily ${esc(s.calendar)} sessions. Evaluation starts ${esc(s.heldoutStart)}.</p><p>Public edition: aggregate results, rendered real chart excerpts, and optional original educational diagrams. Raw price files, full histories and the research workspace are not distributed here. Real excerpts show observed prices; teaching diagrams are explicitly labeled schematics.</p><p>Provider: ${esc(s.provider)}. Adjustment basis: ${esc(s.adjustment)}. ${s.selection?esc(s.selection):'The current-survivor convenience sample omits a representative historical universe and delisted coverage.'} Automated detection does not mean individual labels have been human validated.</p>${DATA.study.methods.map(m=>`<h3>${esc(m.label)}</h3><p>${esc(m.definition)}</p>${m.preconfirmationPolicy?'<p>'+esc(m.preconfirmationPolicy)+'</p>':''}`).join('')}${Object.entries(DATA.study.definitions).map(([k,v])=>`<details><summary>${esc(k==='uncertainty'?'Uncertainty and dependence':k.replaceAll('_',' '))}</summary>${typeof v==='string'?'<p>'+esc(v)+'</p>':Object.entries(v).map(([key,value])=>`<p><strong>${esc(key)}:</strong> ${esc(value)}</p>`).join('')}</details>`).join('')}<h3>Reading the illustrations</h3><p>Open and close define the body; high and low define the wicks. Our schematic diagrams use relative proportions without a price scale. Their precise proportions are examples, not compulsory exact values. Hammer and Hanging Man share a shape but require opposite prior contexts; the same is true of Inverted Hammer and Shooting Star.</p><h3>Contribute a correction</h3><p><a href="https://github.com/getopencandle/getopencandle.github.io/issues">Report the pattern, selected sample filters and the specific issue.</a> Include a reproducible explanation without posting unpublished research or licensed market histories. Existing <a href="LICENSE.txt">license terms</a> apply.</p><p>Aggregate snapshot: ${esc(DATA.study.studyId)} · rules ${esc(rulesLabel())}. Expanded studies require a separately reviewed, versioned run; results are never tuned to match a reference percentage.</p>`;
}
let chartSlice={horizon:10,split:'heldout'};
let cryptoSourceId='bitstamp';
function renderCrypto(initialId){
  const crypto=cryptoSourceId==='coinbase'?DATA.cryptoReference:DATA.crypto,scope=crypto.scope,protocol=crypto.protocol;
  const choices=[...Object.entries(crypto.patterns).map(([id,p])=>({id,name:p.name,family:'candlestick'})),...Object.entries(crypto.chartPatterns).map(([id,p])=>({id,name:p.name,family:'chart'}))];
  const initial=choices.find(p=>p.id===initialId)||choices.find(p=>p.id===lastPattern)||choices[0];
  detail.innerHTML+=`<h2 class="page-heading">Crypto pattern results</h2><p class="sample-note">${scope.pairs.length} ${esc(scope.providerLabel||'Coinbase')} spot ${esc((scope.quotes||['USD']).join('/'))} pairs · ${fmt(scope.bars)} daily bars · ${esc(protocol.periodStart)}–${esc(protocol.periodEnd)}. Evaluation starts ${esc(protocol.heldoutStart)}. UTC-midnight sessions, seven days a week; kept separate from stocks.</p><div class="public-selects"><label>Source<select id="crypto-source"><option value="bitstamp" ${cryptoSourceId==='bitstamp'?'selected':''}>${esc(DATA.crypto.scope.providerLabel||'Bitstamp')} - ${DATA.crypto.scope.pairs.length} assets</option><option value="coinbase" ${cryptoSourceId==='coinbase'?'selected':''}>${esc(DATA.cryptoReference.scope.providerLabel||'Coinbase')} - original ${DATA.cryptoReference.scope.pairs.length}</option></select></label><label>Pattern<select id="crypto-pattern">${['candlestick','chart'].map(f=>`<optgroup label="${f==='chart'?'Chart patterns':'Candlesticks'}">${choices.filter(p=>p.family===f).map(p=>`<option value="${p.id}" ${p.id===initial.id?'selected':''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}</select></label><label>Pair<select id="crypto-pair"><option value="all">All ${scope.pairs.length} pairs</option>${scope.pairs.map(p=>`<option>${esc(p)}</option>`).join('')}</select></label></div><section id="crypto-results"></section><details><summary>Crypto sample &amp; limitations</summary>${['selection','trendRule','gapPolicy','partition','uncertainty','actions','limitations'].map(k=>'<p>'+esc(protocol[k])+'</p>').join('')}<p>Source: ${esc(scope.providerLabel||'Coinbase')} public daily candles. These are our experimental computed statistics, not exchange estimates or endorsed signals.</p></details>`;
  const draw=()=>{
    const id=$('crypto-pattern').value,pair=$('crypto-pair').value,isChart=!!crypto.chartPatterns[id],row=(isChart?crypto.chartPatterns:crypto.patterns)[id],c=row.cells.find(c=>c.pair===pair);
    if(!c){$('crypto-results').innerHTML='<p>No aggregate cell is available for this selection.</p>';return;}
    const sensitivity=crypto.sensitivity?.patterns?.[id]?.cells.find(x=>x.pair===pair);const sensitivityNote=sensitivity?`<details><summary>No-trade-day sensitivity</summary><p>Excluding zero-volume days and breaking continuity at each removed day: ${fmt(sensitivity.eligible)} eligible windows; ${isChart?'higher close':'reversal'} ${(r=>sampleInline(r.numerator,r.denominator,r.percent))(sensitivity.rates[isChart?'up':'reversal'])}. These observations overlap the main sample and are not an independent validation.</p></details>`:'';
    const scopeNote=`<h3>${esc(row.name)} · ${esc(pair==='all'?`All ${scope.pairs.length} pairs`:pair)}</h3><p>${c.horizon} daily sessions · held-out evaluation. ${isChart?'Next-open to horizon-close movement, not reversal frequency.':'First closing breakout relative to the actual pre-pattern SMA50 context. Unresolved outcomes stay in the denominator.'}</p>`;
    if(isChart){$('crypto-results').innerHTML=scopeNote+chartCellMarkup(c)+sensitivityNote;return;}
    $('crypto-results').innerHTML=scopeNote+`<div class="rate-grid">${[['reversal','Reversal'],['continuation','Continuation'],['unresolved','No closing breakout']].map(([key,label])=>rateMarkup(label,c.rates[key])).join('')}</div><p class="sample-note">${fmt(c.candidates)} candidates · ${fmt(c.eligible)} eligible windows · ${fmt(c.pairsWithEvents.length)} contributing pairs · ${fmt(c.nonoverlappingWindows)} nonoverlapping windows. No uncertainty interval estimated; occurrences overlap and are not independent trades.</p><details><summary>Direction counts &amp; exclusions</summary><p>Up: ${fmt(c.up)} · Down: ${fmt(c.down)} · No exit: ${fmt(c.noExitOrUnchanged)} · Flat prior context: ${fmt(c.flat)}. Direction counts use all eligible windows; reversal and continuation exclude flat context.</p><p>${exclusionList(c.excluded)}</p></details>`;$('crypto-results').insertAdjacentHTML('beforeend',sensitivityNote);
  };$('crypto-source').onchange=e=>{cryptoSourceId=e.target.value;renderResearch('crypto',$('crypto-pattern').value);};$('crypto-pattern').onchange=draw;$('crypto-pair').onchange=draw;draw();
}
function chartCellMarkup(c){
  if(!c)return '<p>No aggregate cell is available.</p>';
  const rate=n=>c.eligible?100*n/c.eligible:null;
  return `<div class="rate-grid">${[['Higher close',c.up],['Lower close',c.down],['Unchanged',c.unchanged]].map(([label,n])=>`<div class="rate-card${sampleClass(c.eligible)}" data-n="${c.eligible}"><span>${label}</span>${sampleBadge(c.eligible)}<strong>${sampleFigure(n,c.eligible,rate(n))}</strong><p>${fmt(n)} / ${fmt(c.eligible)} observations</p></div>`).join('')}</div>${Number.isFinite(c.meanPriceMovementPercent)?`<p>Mean next-open-to-horizon-close price movement: ${pct(c.meanPriceMovementPercent)}. This is not a reversal rate or net trading return.</p>`:''}<p class="sample-note">${fmt(c.candidates)} candidates · ${fmt(c.eligible)} eligible · ${fmt(c.stocks??c.symbolsWithEvents)} contributing symbols · ${fmt(c.nonoverlappingWindows)} nonoverlapping windows. No uncertainty interval estimated; overlapping observations are not independent.</p><details><summary>Exclusions</summary><p>${exclusionList(c.excluded)||'None in this cell.'}</p></details>`;
}
function renderResearch(section,patternId){
  current='';detail.className='content';renderIndex();
  const tabs='<nav class="public-stat-tabs"><a href="#research/charts">Chart patterns</a><a href="#research/named">GME / CHWY / SPY</a><a href="#research/crypto">Crypto</a></nav>';
  if(section==='crypto'){detail.innerHTML=tabs;renderCrypto(patternId);return;}
  if(section==='named'){
    detail.innerHTML=tabs+'<h2 class="page-heading">Named-symbol summaries</h2><p>Separate single-symbol samples. SPY is an ETF. These aggregates are experimental and pending independent review; they are not a representative basket study.</p><div class="public-selects"><label>Symbol<select id="named-symbol">'+Object.keys(DATA.named.assets).map(s=>'<option>'+esc(s)+'</option>').join('')+'</select></label><label>Candlestick<select id="named-pattern">'+patterns.filter(p=>p.category==='candlestick').map(p=>`<option value="${p.id}" ${p.id===lastPattern?'selected':''}>${esc(p.name)}</option>`).join('')+'</select></label></div><section id="named-results"></section>';
    
    const draw=()=>{const asset=DATA.named.assets[$('named-symbol').value],p=asset.patterns[$('named-pattern').value],scope=asset.scope,held=p.heldout.rates,line=r=>sampleInline(r.numerator,r.denominator,r.percent);
      $('named-results').innerHTML=`<p>${esc(asset.symbol)} · ${asset.instrumentType==='etf'?'ETF':'stock'} · ${fmt(asset.bars)} daily bars · ${esc(scope.periodStart)} to ${esc(scope.periodEnd)}. Ten-session first closing breakout; all actual prior contexts.</p><h3 class="named-period">${esc(scope.periodStart.slice(0,4))} to ${esc(scope.periodEnd.slice(0,4))}, all years</h3>${statsCellMarkup(p.cell,p.cell.endpoint)}<p class="sample-note">All years combines the development period and the held-out period from ${esc(scope.heldoutStart)}; windows that cross that date are left out.</p><p class="sample-note named-heldout">Held-out period only (${esc(scope.heldoutStart)} to ${esc(scope.periodEnd)}): reversal ${line(held.reversal)} · continuation ${line(held.continuation)} · no closing breakout ${line(held.unresolved)}.</p>`;};$('named-symbol').onchange=draw;$('named-pattern').onchange=draw;draw();return;
  }
  const p=DATA.chartDefinitions.find(p=>p.patternId===patternId)||DATA.chartDefinitions[0],record=DATA.chartStudy.patterns[p.patternId],protocol=DATA.chartStudy.protocol;
  current=p.patternId;renderIndex();
  const draw=()=>{
    const c=record.cells.find(c=>c.horizon===chartSlice.horizon&&c.split===chartSlice.split);
    detail.innerHTML=tabs+`<h2 class="page-heading">${esc(p.name)}</h2><div class="public-selects"><label>Chart pattern<select id="chart-pattern">${DATA.chartDefinitions.map(d=>`<option value="${d.patternId}" ${d.patternId===p.patternId?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label><label>Sessions<select id="chart-horizon">${protocol.horizons.map(n=>`<option ${n===chartSlice.horizon?'selected':''}>${n}</option>`).join('')}</select></label><label>Period<select id="chart-split">${[...new Set(record.cells.map(c=>c.split))].map(v=>`<option ${v===chartSlice.split?'selected':''}>${esc(v)}</option>`).join('')}</select></label></div><p>${esc(p.overview)}</p><div class="desk-layout"><aside class="desk-side"><section class="identify-pattern"><h3>Identify this pattern</h3><ol>${p.identification.map(s=>'<li>'+esc(s)+'</li>').join('')}</ol><h3>Definition complete</h3><p>${esc(p.confirmation)}</p></section></aside><div class="desk-center"><p class="sample-note">${fmt(DATA.chartStudy.scope.stocks)} stocks · ${fmt(DATA.chartStudy.scope.bars)} daily bars · ${esc(protocol.periodStart)}–${esc(protocol.periodEnd)}. Evaluation from ${esc(protocol.heldoutStart)}.</p>${chartCellMarkup(c)}<p>${esc(protocol.outcome)}</p><details><summary>Method &amp; limitations</summary>${['recognition','eligibility','uncertainty'].map(k=>'<p>'+esc(protocol[k])+'</p>').join('')}<p>${esc(p.interpretation)}</p><ul>${p.notes.map(s=>'<li>'+esc(s)+'</li>').join('')}</ul><p>Rule version: ${esc(p.ruleVersion)}.</p></details><details><summary>References</summary><ul>${p.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)} ↗</a></li>`).join('')}</ul></details></div></div>`;
    $('chart-pattern').onchange=e=>{location.hash='research/charts/'+e.target.value;};$('chart-horizon').onchange=e=>{chartSlice.horizon=Number(e.target.value);draw();};$('chart-split').onchange=e=>{chartSlice.split=e.target.value;draw();};
    if(DATA.chartExcerpts?.[p.patternId]?.length){
      const center=detail.querySelector('.desk-center');center.insertAdjacentHTML('afterbegin',excerptMarkup(p.patternId)+'<button type="button" id="enlarge-chart-excerpt">Enlarge chart</button>');
      $('enlarge-chart-excerpt').onclick=wireExcerpts(p.patternId,p);
    }
  };draw();
}
route();
