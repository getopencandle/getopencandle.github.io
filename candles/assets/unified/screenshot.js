(function () {
  'use strict';

  const q = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const state = { originalVisible:true, originalOpacity:1, overlayOpacity:.55, image: null, sourceCanvas: null, fileName: '', crop: null, cropDraft: null, mode: 'crop', pickMode: null, candles: [], matches: [], selectedCandleIndex: null, selectedMatchIndex: null, warnings: [], extractionWarnings: [], confirmed: false, colorTolerance: 70, minimumBodyWidth: 2 };
  let opener = null, activePointer = null;

  function install() {
    const topbar = q('.topbar');
    if (!topbar || q('#screenshot-open')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.id = 'screenshot-open'; button.className = 'screenshot-open';
    button.textContent = 'Analyze screenshot'; button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'screenshot-dialog');
    const offline = q('.offline', topbar);
    topbar.insertBefore(button, offline || null);
    document.body.insertAdjacentHTML('beforeend', dialogMarkup());
    q('#screenshot-open').addEventListener('click', openDialog);
    q('#screenshot-close').addEventListener('click', () => q('#screenshot-dialog').close());
    q('#screenshot-dialog').addEventListener('close', () => { if (opener?.isConnected) opener.focus(); });
    bindControls();
  }

  function dialogMarkup() {
    return `<dialog id="screenshot-dialog" class="screenshot-dialog" aria-labelledby="screenshot-title">
      <div class="screenshot-dialog-top"><div><p class="screenshot-eyebrow">LOCAL · EXPERIMENTAL</p><h2 id="screenshot-title">Analyze a chart screenshot</h2></div><button type="button" id="screenshot-close" aria-label="Close screenshot analyzer">Close ×</button></div>
      <p class="screenshot-privacy">Choose an image, paste it, or drop it below. Processing stays in this browser; the image is not sent anywhere. Screenshot-derived candles are approximate and contain no reliable prices.</p>
      <div class="screenshot-file-row"><label class="screenshot-file">Choose image<input id="screenshot-file" type="file" accept="image/png,image/jpeg,image/webp"></label><span>PNG, JPEG, or WebP</span><button type="button" id="screenshot-clear" disabled>Clear image</button></div>
      <div id="screenshot-drop" class="screenshot-drop" tabindex="0" aria-label="Drop an image here or paste an image while this dialog is open">Drop image here or paste an image</div>
      <p id="screenshot-status" class="screenshot-status" role="status" aria-live="polite">Select an image to begin.</p>
      <section id="screenshot-workspace" class="screenshot-workspace" hidden>
        <div class="screenshot-canvas-tools" role="group" aria-label="Screenshot crop and color tools">
          <button type="button" data-shot-mode="select" aria-pressed="false">Select candle</button><button type="button" data-shot-mode="crop" aria-pressed="true">Drag to crop chart area</button>
          <button type="button" id="screenshot-full-image">Use full image</button>
          <button type="button" data-shot-mode="up" aria-pressed="false" id="screenshot-pick-up">Pick up candle color</button>
          <button type="button" data-shot-mode="down" aria-pressed="false" id="screenshot-pick-down">Pick down candle color</button>
          <label><span id="screenshot-up-label">Up candle color</span><input id="screenshot-up-color" type="color" value="#00b45a"></label>
          <label><span id="screenshot-down-label">Down candle color</span><input id="screenshot-down-color" type="color" value="#dc3741"></label>
          <label>Color tolerance <input id="screenshot-tolerance" type="number" min="0" step="1" value="70"></label>
          <label>Minimum body width <input id="screenshot-min-width" type="number" min="1" step="1" value="2"></label>
          <label>Candle style<select id="screenshot-direction-mode"><option value="color">Color shows open/close</option><option value="hollow">Hollow up / filled down</option></select></label>
          <label>Price scale<select id="screenshot-scale"><option value="linear">Linear</option><option value="log">Logarithmic</option></select></label>
          <label>Top price (optional)<input id="screenshot-top-price" type="number" min="0" step="any" inputmode="decimal" placeholder="Calibrate chart"></label>
          <label>Bottom price (optional)<input id="screenshot-bottom-price" type="number" min="0" step="any" inputmode="decimal" placeholder="Calibrate chart"></label>
        </div>
        <p class="screenshot-hint">Draw a rectangle around only the price candles; exclude volume bars, indicators, labels and legends. For hollow charts, select “Hollow up / filled down”: body fill indicates direction while color can reflect the previous close. For chart geometry, enter visible positive prices at the crop's top and bottom edges.</p>
        <div class="screenshot-canvas-tools"><button type="button" id="screenshot-original" aria-pressed="true">Show original</button><label>Original opacity<input id="screenshot-original-opacity" type="range" min="0" max="100" value="100"></label><label>Rebuilt opacity<input id="screenshot-overlay-opacity" type="range" min="0" max="100" value="55"></label></div><div id="screenshot-canvas-wrap" class="screenshot-canvas-wrap"><canvas id="screenshot-canvas" aria-label="Loaded chart image. Drag to set crop or select a candle color."></canvas></div>
        <div id="screenshot-crop-label" class="screenshot-crop-label"></div>
        <button id="screenshot-detect" type="button" disabled>Detect candles for review</button>
        <section id="screenshot-candle-review" class="screenshot-candle-review" hidden><h3>Rebuilt candle preview</h3><p>Approximate shapes from the screenshot, not recovered market prices. Click a rebuilt candle to inspect it. Crop out volume and indicator panels before analyzing.</p><canvas id="screenshot-rebuilt" width="1000" height="240" aria-label="Reconstructed candles; click one to select its row"></canvas><div id="screenshot-review-warnings" role="status"></div><h3>Review extracted geometry</h3><p>Click a row to highlight its candle, or use Select candle and click the image. Numbers run left to right. Remove false detections before confirming.</p><div class="screenshot-table-wrap"><table><thead><tr><th>#</th><th>Direction</th><th>Body style</th><th>Body width</th><th>Body top</th><th>Body bottom</th><th>Wick top</th><th>Wick bottom</th><th></th></tr></thead><tbody id="screenshot-candle-rows"></tbody></table></div><label class="screenshot-shape-option"><input id="screenshot-shape-only" type="checkbox" checked> Include shapes with unknown prior trend</label><label class="screenshot-confirm"><input id="screenshot-confirm-geometry" type="checkbox"> I checked the candle outlines and their visible order.</label><button id="screenshot-analyze" type="button" disabled>Analyze patterns</button><p id="screenshot-context-note" class="screenshot-note"></p></section>
        <section id="screenshot-results" class="screenshot-results" hidden><h3>Possible pattern candidates</h3><p class="screenshot-note">Names are detector candidates, not calibrated confidence scores, verified labels, or trading signals. No screenshot-level performance statistics are computed. Select “Highlight” to inspect one match at a time.</p><ul id="screenshot-match-list"></ul><div id="screenshot-warnings"></div></section>
      </section>
      <p class="screenshot-footnote">Screenshot pixels do not reveal exact prices, missing candles, volume, or prior history beyond the crop. Bars are treated as consecutive; the image cannot identify their actual interval. Uncalibrated linear mode uses relative placeholders for candle shapes only. Chart geometry requires price-axis calibration; logarithmic mode requires calibration before any scan.</p>
    </dialog>`;
  }

  function openDialog(event) {
    opener = event.currentTarget;
    const dialog = q('#screenshot-dialog');
    if (!dialog.open) dialog.showModal();
    q('#screenshot-file').focus();
  }

  function bindControls() {
    const dialog = q('#screenshot-dialog'), file = q('#screenshot-file'), canvas = q('#screenshot-canvas');
    file.addEventListener('change', () => { if (file.files?.[0]) loadFile(file.files[0]); });
    q('#screenshot-original').addEventListener('click',()=>{state.originalVisible=!state.originalVisible;q('#screenshot-original').setAttribute('aria-pressed',String(state.originalVisible));drawCanvas();});
    q('#screenshot-original-opacity').addEventListener('input',e=>{state.originalOpacity=Number(e.target.value)/100;drawCanvas();});
    q('#screenshot-overlay-opacity').addEventListener('input',e=>{state.overlayOpacity=Number(e.target.value)/100;drawCanvas();});
    q('#screenshot-clear').addEventListener('click', clearImage);
    q('#screenshot-detect').addEventListener('click', detectCandles);
    q('#screenshot-confirm-geometry').addEventListener('change', event => {
      state.confirmed = event.target.checked;
      updateAnalyzeButton();
    });
    q('#screenshot-shape-only').addEventListener('change', invalidateAnalysis);
    q('#screenshot-analyze').addEventListener('click', analyzePatterns);
    q('#screenshot-rebuilt').addEventListener('click',event=>{const rect=event.currentTarget.getBoundingClientRect();const i=Math.floor((event.clientX-rect.left)/rect.width*state.candles.length);selectCandle(i,true);});
    q('#screenshot-tolerance').addEventListener('input', event => { state.colorTolerance = Math.max(0, Number(event.target.value)); invalidateDetections(); });
    q('#screenshot-min-width').addEventListener('input', event => { state.minimumBodyWidth = Math.max(1, Number(event.target.value)); invalidateDetections(); });
    q('#screenshot-direction-mode').addEventListener('change', () => { updateDirectionLabels(); invalidateDetections(); });
    q('#screenshot-up-color').addEventListener('input', invalidateDetections);
    q('#screenshot-down-color').addEventListener('input', invalidateDetections);
    q('#screenshot-scale').addEventListener('change', () => { invalidateAnalysis(); updateAnalyzeButton(); });
    q('#screenshot-top-price').addEventListener('input', () => { invalidateAnalysis(); updateAnalyzeButton(); });
    q('#screenshot-bottom-price').addEventListener('input', () => { invalidateAnalysis(); updateAnalyzeButton(); });
    dialog.querySelectorAll('[data-shot-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.shotMode)));
    q('#screenshot-full-image').addEventListener('click', () => { if (!state.image) return; state.crop = { x: 0, y: 0, width: state.image.naturalWidth, height: state.image.naturalHeight }; invalidateDetections(); updateCropLabel(); drawCanvas(); showStatus('Using the full image.'); });
    canvas.addEventListener('pointerdown', canvasPointerDown);
    canvas.addEventListener('pointermove', canvasPointerMove);
    canvas.addEventListener('pointerup', canvasPointerUp);
    canvas.addEventListener('pointercancel', canvasPointerUp);
    const drop = q('#screenshot-drop');
    dialog.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
    dialog.addEventListener('dragleave', () => drop.classList.remove('dragging'));
    dialog.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); const image = [...(event.dataTransfer?.files || [])].find(f => supportedTypes.has(f.type)); if (image) loadFile(image); else showStatus('Drop a PNG, JPEG, or WebP image.', true); });
    document.addEventListener('paste', event => {
      if (!dialog.open) return;
      const image = [...(event.clipboardData?.items || [])].find(item => supportedTypes.has(item.type))?.getAsFile();
      if (image) { event.preventDefault(); loadFile(image); }
    });
  }

  function showStatus(message, error = false) { const el = q('#screenshot-status'); el.textContent = message; el.classList.toggle('error', error); }
  function clearImage() {
    state.image = null; state.sourceCanvas = null; state.fileName = ''; state.crop = null; state.cropDraft = null; state.candles = []; state.matches = []; state.selectedCandleIndex = null; state.selectedMatchIndex = null; state.warnings = []; state.extractionWarnings = []; state.confirmed = false;
    q('#screenshot-file').value = ''; q('#screenshot-workspace').hidden = true; q('#screenshot-clear').disabled = true; q('#screenshot-candle-review').hidden = true; q('#screenshot-results').hidden = true; q('#screenshot-candle-rows').replaceChildren();
    showStatus('Select an image to begin.');
  }
  function loadFile(file) {
    if (!supportedTypes.has(file.type)) { showStatus('Unsupported image format. Choose a PNG, JPEG, or WebP image.', true); return; }
    showStatus('Reading image locally…');
    const reader = new FileReader();
    reader.onerror = () => showStatus('The image could not be read by this browser.', true);
    reader.onload = () => loadDataUrl(String(reader.result || ''), file.name || 'Pasted image');
    reader.readAsDataURL(file);
  }
  function loadDataUrl(dataUrl, name) {
    const image = new Image();
    image.onerror = () => showStatus('This image could not be decoded. Try a PNG, JPEG, or WebP file.', true);
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) { showStatus('The image has no readable pixels.', true); return; }
      try {
        state.originalVisible=true;state.originalOpacity=1;state.overlayOpacity=.55;q('#screenshot-original').setAttribute('aria-pressed','true');q('#screenshot-original-opacity').value='100';q('#screenshot-overlay-opacity').value='55';
        state.image = image; state.sourceCanvas = null; state.fileName = name; state.crop = { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight }; state.candles = []; state.matches = []; state.selectedCandleIndex = null; state.selectedMatchIndex = null; state.warnings = []; state.extractionWarnings = []; state.confirmed = false;
        q('#screenshot-scale').value = 'linear'; q('#screenshot-top-price').value = ''; q('#screenshot-bottom-price').value = '';
        const canvas = q('#screenshot-canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        q('#screenshot-workspace').hidden = false; q('#screenshot-clear').disabled = false; q('#screenshot-candle-review').hidden = true; q('#screenshot-results').hidden = true; q('#screenshot-confirm-geometry').checked = false; q('#screenshot-detect').disabled = false;
        updateDirectionLabels(); setMode('crop'); drawCanvas(); updateCropLabel(); showStatus(`${name} · ${image.naturalWidth} × ${image.naturalHeight} pixels. Choose a tighter crop around the price chart if needed.`);
      } catch (error) { state.image = null; q('#screenshot-workspace').hidden = true; showStatus(`This image could not be drawn in browser memory: ${error?.message || error}. Try a smaller image.`, true); }
    };
    image.src = dataUrl;
  }

  function setMode(mode) {
    state.mode = mode; state.pickMode = mode === 'up' || mode === 'down' ? mode : null;
    q('#screenshot-dialog').querySelectorAll('[data-shot-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shotMode === mode)));
    q('#screenshot-canvas').classList.toggle('picking-color', !!state.pickMode);
    showStatus(mode === 'select' ? 'Click a candle to select its matching review row.' : mode === 'crop' ? 'Drag over the price panel to set the crop. Use the full image if no crop is needed.' : `Click a ${directionColorLabel(mode)} candle body to sample its color.`);
  }
  function directionColorLabel(mode) {
    if (q('#screenshot-direction-mode').value !== 'hollow') return mode === 'up' ? 'bullish/up' : 'bearish/down';
    return mode === 'up' ? 'color A' : 'color B';
  }
  function updateDirectionLabels() {
    const hollow = q('#screenshot-direction-mode').value === 'hollow';
    q('#screenshot-up-label').textContent = hollow ? 'Candle color A' : 'Up candle color';
    q('#screenshot-down-label').textContent = hollow ? 'Candle color B' : 'Down candle color';
    q('#screenshot-pick-up').textContent = hollow ? 'Pick candle color A' : 'Pick up candle color';
    q('#screenshot-pick-down').textContent = hollow ? 'Pick candle color B' : 'Pick down candle color';
  }
  function canvasPoint(event) {
    const canvas = q('#screenshot-canvas'), rect = canvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(canvas.width - 1, (event.clientX - rect.left) * canvas.width / rect.width)), y: Math.max(0, Math.min(canvas.height - 1, (event.clientY - rect.top) * canvas.height / rect.height)) };
  }
  function canvasPointerDown(event) {
    if (!state.image) return;
    const point = canvasPoint(event);
    if (state.pickMode) { pickColor(point); return; }
    if (state.mode === 'select') {
      const hits=state.candles.map((c,i)=>({c,i})).filter(({c})=>Math.abs(c.x-point.x)<=Math.max(6,(c.bodyWidth||2)/2+4)&&point.y>=c.wickTop-6&&point.y<=c.wickBottom+6).sort((a,b)=>Math.abs(a.c.x-point.x)-Math.abs(b.c.x-point.x));
      if(hits.length)selectCandle(hits[0].i,true);return;
    }
    if (state.mode !== 'crop') return;
    activePointer = event.pointerId; q('#screenshot-canvas').setPointerCapture(event.pointerId); state.cropDraft = { x: point.x, y: point.y, width: 0, height: 0 }; drawCanvas();
  }
  function canvasPointerMove(event) {
    if (activePointer !== event.pointerId || !state.cropDraft) return;
    const p = canvasPoint(event), draft = state.cropDraft;
    state.crop = { x: Math.min(draft.x, p.x), y: Math.min(draft.y, p.y), width: Math.abs(p.x - draft.x), height: Math.abs(p.y - draft.y) };
    drawCanvas(); updateCropLabel();
  }
  function canvasPointerUp(event) {
    if (activePointer !== event.pointerId) return;
    canvasPointerMove(event);
    activePointer = null;
    if (state.cropDraft && state.crop.width >= 8 && state.crop.height >= 8) {
      state.crop = { x: Math.floor(state.crop.x), y: Math.floor(state.crop.y), width: Math.ceil(state.crop.width), height: Math.ceil(state.crop.height) };
      invalidateDetections(); updateCropLabel();
    } else if (state.cropDraft) { state.crop = { x: 0, y: 0, width: state.image.naturalWidth, height: state.image.naturalHeight }; updateCropLabel(); showStatus('Crop was too small; using the full image.'); }
    state.cropDraft = null; drawCanvas();
  }
  function pickColor(point) {
    const ctx = getSourceContext();
    try {
      const pixel = ctx.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
      if (pixel[3] < 96) { showStatus('That pixel is transparent. Choose a colored candle body.', true); return; }
      const hex = '#' + [...pixel.slice(0, 3)].map(n => n.toString(16).padStart(2, '0')).join('');
      q(state.pickMode === 'up' ? '#screenshot-up-color' : '#screenshot-down-color').value = hex;
      const picked = directionColorLabel(state.pickMode); invalidateDetections(); setMode('crop'); showStatus(`Sampled candle color ${picked} (${hex}).`);
    } catch { showStatus('Could not sample that image pixel. Try a smaller crop or another image.', true); }
  }
  function drawRebuilt(){
    const canvas=q('#screenshot-rebuilt');if(!canvas)return;
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#10151b';ctx.fillRect(0,0,canvas.width,canvas.height);
    if(!state.candles.length)return;
    const top=Math.min(...state.candles.map(c=>c.wickTop)),bottom=Math.max(...state.candles.map(c=>c.wickBottom)),span=Math.max(1,bottom-top),step=canvas.width/state.candles.length;
    const y=v=>18+(v-top)/span*198;
    state.candles.forEach((c,i)=>{const x=(i+.5)*step,selected=i===state.selectedCandleIndex;ctx.strokeStyle=ctx.fillStyle=selected?'#ffbe65':c.direction==='up'?'#61bf83':'#e16b73';ctx.lineWidth=selected?3:2;ctx.beginPath();ctx.moveTo(x,y(c.wickTop));ctx.lineTo(x,y(c.wickBottom));ctx.stroke();ctx.fillRect(x-step*.28,y(c.bodyTop),step*.56,Math.max(2,y(c.bodyBottom)-y(c.bodyTop)));if(selected){ctx.font='bold 13px sans-serif';ctx.fillText('#'+(i+1),Math.max(0,x-9),237);}});
  }
  function drawCanvas() {
    drawRebuilt();
    if (!state.image) return;
    const canvas = q('#screenshot-canvas'), ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);ctx.fillStyle='#10151b';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.save();ctx.globalAlpha=state.originalVisible?state.originalOpacity:0;ctx.drawImage(state.image,0,0);ctx.restore();
    if (state.crop) {
      ctx.save(); ctx.fillStyle = 'rgba(7, 12, 18, .42)'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle='#10151b';ctx.fillRect(state.crop.x,state.crop.y,state.crop.width,state.crop.height);ctx.globalAlpha=state.originalVisible?state.originalOpacity:0; ctx.drawImage(state.image, state.crop.x, state.crop.y, state.crop.width, state.crop.height, state.crop.x, state.crop.y, state.crop.width, state.crop.height);ctx.globalAlpha=1; ctx.strokeStyle = '#79dce8'; ctx.lineWidth = Math.max(2, canvas.width / 900); ctx.setLineDash([8, 5]); ctx.strokeRect(state.crop.x, state.crop.y, state.crop.width, state.crop.height); ctx.restore();
    }
    ctx.save();ctx.globalAlpha=state.overlayOpacity;
    state.candles.forEach(c=>{ctx.fillStyle=ctx.strokeStyle=c.direction==='up'?'#61bf83':'#e16b73';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(c.x,c.wickTop);ctx.lineTo(c.x,c.wickBottom);ctx.stroke();const width=Math.max(2,c.bodyWidth||2);ctx.fillRect(c.x-width/2,c.bodyTop,width,Math.max(1,c.bodyBottom-c.bodyTop));});ctx.restore();
    const candle=state.candles[state.selectedCandleIndex];
    if(candle){
      ctx.save();ctx.globalAlpha=state.overlayOpacity;ctx.strokeStyle='#ffbe65';ctx.fillStyle='rgba(255,174,75,.65)';ctx.shadowColor='#ffb64d';ctx.shadowBlur=10;ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(candle.x,candle.wickTop);ctx.lineTo(candle.x,candle.wickBottom);ctx.stroke();
      const width=Math.max(2,candle.bodyWidth||2);ctx.fillRect(candle.x-width/2,candle.bodyTop,width,Math.max(2,candle.bodyBottom-candle.bodyTop));
      ctx.shadowBlur=0;ctx.fillStyle='#ffce8a';ctx.font='bold 16px sans-serif';ctx.fillText('#'+(state.selectedCandleIndex+1),candle.x+width/2+5,Math.max(18,candle.wickTop-7));ctx.restore();
    }
    const selected = state.matches[state.selectedMatchIndex];
    if (selected) {
      ctx.save(); ctx.globalAlpha=state.overlayOpacity;ctx.strokeStyle = selected.shapeOnly ? '#e6bd68' : '#f2a65a'; ctx.fillStyle = selected.shapeOnly ? 'rgba(230,189,104,.24)' : 'rgba(242,166,90,.24)'; ctx.lineWidth = Math.max(2, canvas.width / 850);
      for (let i = selected.startIndex; i <= selected.endIndex; i++) {
        const c = state.candles[i]; if (!c) continue;
        const bodyWidth = Math.max(2, Number(c.bodyWidth) || state.minimumBodyWidth);
        ctx.beginPath(); ctx.moveTo(c.x, c.wickTop); ctx.lineTo(c.x, c.wickBottom); ctx.stroke();
        ctx.fillRect(c.x - bodyWidth / 2, c.bodyTop, bodyWidth, Math.max(1, c.bodyBottom - c.bodyTop));
        ctx.strokeRect(c.x - bodyWidth / 2 - 2, c.bodyTop - 2, bodyWidth + 4, Math.max(5, c.bodyBottom - c.bodyTop + 4));
      }
      ctx.restore();
    }
  }
  function updateCropLabel() { const c = state.crop; q('#screenshot-crop-label').textContent = c ? `Crop: x ${Math.round(c.x)}, y ${Math.round(c.y)}, ${Math.round(c.width)} × ${Math.round(c.height)} px` : ''; }
  function invalidateDetections() {
    if (!state.image) return;
    state.candles = []; state.matches = []; state.selectedCandleIndex = null; state.selectedMatchIndex = null; state.extractionWarnings = []; state.confirmed = false; q('#screenshot-confirm-geometry').checked = false; q('#screenshot-candle-review').hidden = true; q('#screenshot-results').hidden = true; q('#screenshot-detect').disabled = false; drawCanvas();
  }
  function getSourceContext() {
    if (!state.image) throw new Error('No image is loaded.');
    if (!state.sourceCanvas) {
      const canvas = document.createElement('canvas'); canvas.width = state.image.naturalWidth; canvas.height = state.image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The browser could not allocate an original-image canvas.');
      context.drawImage(state.image, 0, 0); state.sourceCanvas = canvas;
    }
    const context = state.sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The original-image canvas is unavailable.');
    return context;
  }
  function hexRgb(selector) { const hex = q(selector).value.slice(1); return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)); }
  function detectCandles() {
    if (!state.image || !window.ScreenshotExtractor?.extract) { showStatus('The local screenshot extractor is not available.', true); return; }
    try {
      const ctx = getSourceContext(), imageData = ctx.getImageData(0, 0, state.image.naturalWidth, state.image.naturalHeight);
      const result = window.ScreenshotExtractor.extract(imageData, { crop: state.crop, upColor: hexRgb('#screenshot-up-color'), downColor: hexRgb('#screenshot-down-color'), directionMode: q('#screenshot-direction-mode').value, colorTolerance: state.colorTolerance, minimumBodyWidth: state.minimumBodyWidth });
      state.candles = result.candles || []; state.extractionWarnings = result.warnings || [];
      const aligned=result.candles.filter(c=>result.candles.filter(o=>Math.abs(o.wickBottom-c.wickBottom)<=2).length>=3&&c.wickBottom-c.bodyBottom<=2&&c.bodyBottom-c.bodyTop>8);
      if(aligned.length>=3)state.extractionWarnings.push('Possible volume histogram: '+aligned.length+' bars share a bottom baseline. Crop to the price panel or remove volume bars before confirming; this is a heuristic warning, not a reliable volume classifier.'); state.warnings = [...state.extractionWarnings]; state.matches = []; state.confirmed = false;
      q('#screenshot-confirm-geometry').checked = false; q('#screenshot-analyze').disabled = true; q('#screenshot-candle-review').hidden = false; q('#screenshot-results').hidden = true;
      q('#screenshot-review-warnings').textContent=state.extractionWarnings.filter(w=>w.startsWith('Possible volume')||w.includes('hollow')).join(' ');
      state.selectedCandleIndex=null;renderCandleReview();setMode('select');
      if(state.candles.length)selectCandle(0,false);
      if (state.candles.length < 51) q('#screenshot-context-note').textContent = `Only ${state.candles.length} candles were extracted. This is too few to provide a full preceding SMA50 context at any candidate. The detector applies its normal eligibility rules; no missing context is invented.`;
      else q('#screenshot-context-note').textContent = 'SMA50 trend context is computed only from these extracted candles. Screenshot pixels do not supply preceding history beyond this crop.';
      showStatus(`${state.candles.length} candle candidates detected. Review the rebuilt preview before confirming. ${state.extractionWarnings.find(w=>w.startsWith('Possible volume'))||''}`);
      drawCanvas();
    } catch (error) { showStatus(`Could not read image pixels: ${error?.message || error}. Try another image or a tighter crop.`, true); }
  }
  function renderCandleReview() {
    q('#screenshot-candle-rows').innerHTML = state.candles.map((c, i) => `<tr data-review-candle="${i}" tabindex="0" aria-selected="false"><td><button type="button" data-select-candle="${i}" aria-label="Highlight candle ${i+1}">#${i + 1}</button></td><td>${c.direction === 'up' ? 'Up' : 'Down'}</td><td>${c.hollow === true ? 'Hollow' : c.hollow === false ? 'Filled' : 'Unclear'}</td><td>${Math.round(c.bodyWidth || 0)}</td><td>${Math.round(c.bodyTop)}</td><td>${Math.round(c.bodyBottom)}</td><td>${Math.round(c.wickTop)}</td><td>${Math.round(c.wickBottom)}</td><td><button type="button" data-remove-candle="${i}" aria-label="Remove candle ${i + 1}">Remove</button></td></tr>`).join('') || '<tr><td colspan="9">No candle bodies were detected. Try different colors, tolerance, or crop.</td></tr>';
    q('#screenshot-candle-rows').querySelectorAll('[data-review-candle]').forEach(row=>{
      row.addEventListener('click',e=>{if(!e.target.closest('[data-remove-candle]'))selectCandle(Number(row.dataset.reviewCandle),false);});
      row.addEventListener('keydown',e=>{if(e.target===row&&['Enter',' '].includes(e.key)){e.preventDefault();selectCandle(Number(row.dataset.reviewCandle),false);}});
    });
    q('#screenshot-candle-rows').querySelectorAll('[data-remove-candle]').forEach(button => button.addEventListener('click', () => {
      state.candles.splice(Number(button.dataset.removeCandle), 1); state.matches = []; state.selectedCandleIndex = null; state.selectedMatchIndex = null; state.confirmed = false; q('#screenshot-confirm-geometry').checked = false; q('#screenshot-analyze').disabled = true; q('#screenshot-results').hidden = true; renderCandleReview(); drawCanvas();
    }));
  }
  function selectCandle(index,fromImage){
    if(!state.candles[index])return;
    state.selectedCandleIndex=index;state.selectedMatchIndex=null;
    q('#screenshot-candle-rows').querySelectorAll('[data-review-candle]').forEach(row=>{const selected=Number(row.dataset.reviewCandle)===index;row.setAttribute('aria-selected',String(selected));row.classList.toggle('selected',selected);if(selected&&fromImage){const wrap=row.closest('.screenshot-table-wrap');wrap.scrollTop+=row.getBoundingClientRect().top-wrap.getBoundingClientRect().top-wrap.clientHeight/2;}});
    drawCanvas();showStatus('Candle #'+(index+1)+' selected - highlighted in amber on the image.');
    if(!fromImage)q('#screenshot-canvas').scrollIntoView({block:'center'});
  }
  function getCalibration() {
    const topText = q('#screenshot-top-price').value.trim(), bottomText = q('#screenshot-bottom-price').value.trim();
    if (!topText && !bottomText) return { valid: false, present: false };
    const top = Number(topText), bottom = Number(bottomText);
    return { valid: !!topText && !!bottomText && Number.isFinite(top) && Number.isFinite(bottom) && top > bottom && bottom > 0, present: true, top, bottom };
  }
  function updateAnalyzeButton() {
    const calibration = getCalibration(), logNeedsCalibration = q('#screenshot-scale').value === 'log' && !calibration.valid;
    q('#screenshot-analyze').disabled = !state.confirmed || !state.candles.length || logNeedsCalibration;
    if (!state.image || q('#screenshot-candle-review').hidden) return;
    if (logNeedsCalibration) q('#screenshot-context-note').textContent = 'Logarithmic scale selected: enter valid positive top and bottom prices, with the top greater than the bottom, before analysis.';
    else if (calibration.valid) q('#screenshot-context-note').textContent = `Price coordinates are mapped using your ${q('#screenshot-scale').value === 'log' ? 'logarithmic' : 'linear'} top/bottom calibration. They are estimates from the chosen crop bounds.`;
    else if (state.candles.length < 51) q('#screenshot-context-note').textContent = `Only ${state.candles.length} bars are available. The full pre-pattern SMA50 context is absent; the scanner applies its normal eligibility rules without inventing missing context. No price calibration is set, so only candle-shape rules can run.`;
    else q('#screenshot-context-note').textContent = 'No price-axis calibration is set. Relative linear pixel geometry is used for candle-shape rules only; chart percentage tolerances are skipped.';
  }
  function invalidateAnalysis() { state.matches = []; q('#screenshot-results').hidden = true; drawCanvas(); }
  function pixelsToBars() {
    const c = state.crop, calibration = getCalibration(), scale = q('#screenshot-scale').value;
    const price = y => {
      const fraction = Math.max(0, Math.min(1, (c.y + c.height - y) / c.height));
      if (calibration.valid) return scale === 'log'
        ? Math.exp(Math.log(calibration.bottom) + fraction * (Math.log(calibration.top) - Math.log(calibration.bottom)))
        : calibration.bottom + fraction * (calibration.top - calibration.bottom);
      return Math.max(Number.EPSILON, c.y + c.height - y + 1);
    };
    return state.candles.map((candle, i) => {
      const bodyHigh = price(candle.bodyTop), bodyLow = price(candle.bodyBottom), open = candle.direction === 'up' ? bodyLow : bodyHigh, close = candle.direction === 'up' ? bodyHigh : bodyLow;
      return { time: i * 86400, open, high: Math.max(open, close, price(candle.wickTop)), low: Math.min(open, close, price(candle.wickBottom)), close };
    });
  }
  function analyzePatterns() {
    if (!state.confirmed || !state.candles.length) { showStatus('Review and confirm the extracted candle geometry first.', true); return; }
    const calibration = getCalibration(), scale = q('#screenshot-scale').value;
    if (scale === 'log' && !calibration.valid) { showStatus('Logarithmic price scale requires valid positive top and bottom calibration values before analysis.', true); updateAnalyzeButton(); return; }
    const engine = window.PatternScreenshotEngine;
    if (!engine || typeof engine.scanCandles !== 'function') { showStatus('The local pattern engines are not available.', true); return; }
    const bars = pixelsToBars(), matches = [], warnings = [...state.extractionWarnings];
    try {
      const standardResult = engine.scanCandles(bars, { trendRule: 'SMA50' });
      const standard = (standardResult.matches || []).map(m => ({ ...m, family: 'candle', shapeOnly: false }));
      matches.push(...standard);
      if (bars.length < 51) warnings.push('Fewer than 51 extracted bars: no candidate has a complete pre-pattern SMA50 context. The scanner still applies its rules normally; context is not inferred.');
      if (q('#screenshot-shape-only').checked) {
        const scanWithoutTrend = engine.scanCandles(bars, { trendRule: 'No detection' });
        const standardKeys = new Set(standard.map(matchKey));
        const unverified = (scanWithoutTrend.matches || []).filter(m => m.startIndex < 50 && !standardKeys.has(matchKey(m)));
        matches.push(...unverified.map(m => ({ ...m, family: 'candle', shapeOnly: true })));
        if (unverified.length) warnings.push('Shape-only results bypass the prior SMA50 trend check. Prior trend and context-dependent name/direction are unverified (for example, Hammer versus Hanging Man); these are not validated outcomes.');
      }
      if (calibration.valid) {
        for (const [method, family] of [['scanCharts', 'chart'], ['scanResearchCharts', 'chart-research']]) {
          if (typeof engine[method] !== 'function') continue;
          const chartResult = engine[method](bars); matches.push(...(chartResult.matches || []).map(m => ({ ...m, family })));
        }
      } else warnings.push('Chart-pattern geometry scan skipped: without two price-axis values, percentage tolerances are not meaningful. Linear relative placeholders were used only for candle-shape rules.');
      state.matches = matches.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex || String(a.patternId).localeCompare(String(b.patternId)));
      state.selectedMatchIndex = state.matches.length ? 0 : null;
      state.warnings = [...new Set(warnings)]; renderMatches(); q('#screenshot-results').hidden = false; drawCanvas();
      showStatus(`${state.matches.length} possible candidate${state.matches.length === 1 ? '' : 's'} found in the reviewed screenshot geometry.`);
    } catch (error) { showStatus(`Pattern scan failed: ${error?.message || error}`, true); }
  }
  function matchKey(match) { return [match.patternId, match.startIndex, match.endIndex, match.confirmedIndex].join(':'); }
  function patternLink(match) {
    const data = window.UNIFIED_DATA || {}, id = String(match.patternId || ''), pattern = (data.patterns || []).find(p => p.id === id);
    if (pattern?.category === 'chart' && match.family === 'chart-research') return `#research/charts/${encodeURIComponent(id)}`;
    const chartDefs = data.chartDefinitions || [];
    if (match.family === 'chart-research' || chartDefs.some(p => (p.id || p.patternId) === id)) return `#research/charts/${encodeURIComponent(id)}`;
    return `#pattern/${encodeURIComponent(id)}`;
  }
  function renderMatches() {
    const list = q('#screenshot-match-list');
    if (!state.matches.length) list.innerHTML = '<li>No candidates matched these screenshot-derived bars under the current rules. This is not evidence that a pattern is absent from the underlying market history.</li>';
    else list.innerHTML = state.matches.map((match, index) => `<li data-candidate-index="${index}" class="${index === state.selectedMatchIndex ? 'selected' : ''}"><div><a data-pattern-route href="${esc(patternLink(match))}">${esc(match.name || match.patternId || 'Pattern candidate')}</a><span>${match.shapeOnly ? 'Shape only · prior trend unverified; context-dependent direction is not verified' : `Possible ${match.family === 'candle' ? 'candlestick' : 'chart'} candidate`} · bars ${match.startIndex + 1}–${match.endIndex + 1}</span></div><button type="button" data-highlight-candidate="${index}" aria-pressed="${index === state.selectedMatchIndex}">Highlight</button></li>`).join('');
    list.querySelectorAll('[data-candidate-index]').forEach(row => {
      const select = () => setSelectedMatch(Number(row.dataset.candidateIndex));
      row.addEventListener('pointerenter', select); row.addEventListener('focusin', select);
    });
    list.querySelectorAll('[data-highlight-candidate]').forEach(button => button.addEventListener('click', () => setSelectedMatch(Number(button.dataset.highlightCandidate))));
    list.querySelectorAll('[data-pattern-route]').forEach(link => link.addEventListener('click', () => q('#screenshot-dialog').close()));
    q('#screenshot-warnings').innerHTML = state.warnings.map(warning => `<p class="screenshot-note">${esc(warning)}</p>`).join('');
  }
  function setSelectedMatch(index) {
    if (!Number.isInteger(index) || index < 0 || index >= state.matches.length) return;
    state.selectedCandleIndex=null;state.selectedMatchIndex = index;
    q('#screenshot-match-list').querySelectorAll('[data-candidate-index]').forEach(row => {
      const selected = Number(row.dataset.candidateIndex) === index;
      row.classList.toggle('selected', selected);
      row.querySelector('[data-highlight-candidate]')?.setAttribute('aria-pressed', String(selected));
    });
    drawCanvas();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();
