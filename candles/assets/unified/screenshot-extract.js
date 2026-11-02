(function (root) {
  'use strict';

  function extract(imageData, options) {
    options = options || {};
    const warnings = [];
    if (!imageData || !Number.isInteger(imageData.width) || !Number.isInteger(imageData.height) ||
        !imageData.data || imageData.data.length < imageData.width * imageData.height * 4) {
      throw new TypeError('imageData must contain width, height, and RGBA data');
    }
    const width = imageData.width, height = imageData.height, pixels = imageData.data;
    const requested = options.crop || { x: 0, y: 0, width, height };
    const x0 = Math.max(0, Math.floor(requested.x || 0));
    const y0 = Math.max(0, Math.floor(requested.y || 0));
    const x1 = Math.min(width, Math.ceil((requested.x || 0) + requested.width));
    const y1 = Math.min(height, Math.ceil((requested.y || 0) + requested.height));
    const crop = { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
    if (!crop.width || !crop.height) return { candles: [], warnings: ['Crop contains no image pixels.'], crop };

    const tolerance = options.colorTolerance == null ? 70 : Math.max(0, Number(options.colorTolerance));
    const hueTolerance = options.hueTolerance == null ? 30 : Math.max(0, Math.min(180, Number(options.hueTolerance)));
    const minBodyWidth = options.minimumBodyWidth == null ? 2 : Math.max(1, Math.floor(options.minimumBodyWidth));
    const directionMode = options.directionMode === 'hollow' ? 'hollow' : 'color';
    const up = options.upColor || [0, 180, 90], down = options.downColor || [220, 55, 65];
    const sameSelectedColor = up.length >= 3 && down.length >= 3 && up[0] === down[0] && up[1] === down[1] && up[2] === down[2];
    const masks = [new Uint8Array(crop.width * crop.height), new Uint8Array(crop.width * crop.height)];
    const colors = [up, down];
    let hueRejected = 0;
    function chroma(rgb) {
      const max = Math.max(rgb[0], rgb[1], rgb[2]), min = Math.min(rgb[0], rgb[1], rgb[2]);
      const delta = max - min;
      let hue = 0;
      if (delta) {
        if (max === rgb[0]) hue = 60 * (((rgb[1] - rgb[2]) / delta) % 6);
        else if (max === rgb[1]) hue = 60 * ((rgb[2] - rgb[0]) / delta + 2);
        else hue = 60 * ((rgb[0] - rgb[1]) / delta + 4);
      }
      return { hue: (hue + 360) % 360, saturation: max ? delta / max : 0 };
    }
    function hueDistance(a, b) { const d = Math.abs(a - b); return Math.min(d, 360 - d); }
    const swatchChroma = colors.map(chroma);
    for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
      const src = ((y + y0) * width + x + x0) * 4, i = y * crop.width + x;
      if (pixels[src + 3] < 96) continue;
      let best = tolerance * tolerance + 1, which = -1;
      for (let k = 0; k < 2; k++) {
        const c = colors[k];
        if (!c || c.length < 3) continue;
        const dr = pixels[src] - c[0], dg = pixels[src + 1] - c[1], db = pixels[src + 2] - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d > tolerance * tolerance) continue;
        const pixelChroma = chroma([pixels[src], pixels[src + 1], pixels[src + 2]]);
        if (swatchChroma[k].saturation >= 0.15 &&
            (pixelChroma.saturation < 0.12 || hueDistance(pixelChroma.hue, swatchChroma[k].hue) > hueTolerance)) {
          hueRejected++;
          continue;
        }
        if (d < best) { best = d; which = k; }
      }
      if (which >= 0) masks[which][i] = 1;
    }

    if (hueRejected) warnings.push('Chromatic swatch filtering excluded nearby gray or different-hue pixels; review the crop and swatches if expected candles are missing.');

    const candidates = [];
    const total = crop.width * crop.height;
    for (let colorIndex = 0; colorIndex < masks.length; colorIndex++) {
      if (colorIndex === 1 && sameSelectedColor) continue;
      const mask = masks[colorIndex], queue = new Int32Array(total);
      for (let seed = 0; seed < total; seed++) {
        if (!mask[seed]) continue;
        const rows = new Map();
        let head = 0, tail = 0;
        queue[tail++] = seed; mask[seed] = 0;
        while (head < tail) {
          const index = queue[head++], y = Math.floor(index / crop.width), x = index - y * crop.width;
          let xs = rows.get(y);
          if (!xs) { xs = []; rows.set(y, xs); }
          xs.push(x);
          for (let ny = Math.max(0, y - 1); ny <= Math.min(crop.height - 1, y + 1); ny++) {
            for (let nx = Math.max(0, x - 1); nx <= Math.min(crop.width - 1, x + 1); nx++) {
              const next = ny * crop.width + nx;
              if (mask[next]) { mask[next] = 0; queue[tail++] = next; }
            }
          }
        }

        const rowRuns = [];
        let componentMaxRowSpan = 0;
        for (const xs of rows.values()) {
          let left = Infinity, right = -Infinity;
          for (const x of xs) { left = Math.min(left, x); right = Math.max(right, x); }
          componentMaxRowSpan = Math.max(componentMaxRowSpan, right - left + 1);
        }
        const bodyRowSpan = Math.max(minBodyWidth, Math.ceil(componentMaxRowSpan * 0.65));
        for (const [y, xs] of rows) {
          let left = Infinity, right = -Infinity;
          for (const x of xs) { left = Math.min(left, x); right = Math.max(right, x); }
          if (right - left + 1 >= bodyRowSpan && xs.length >= 2) rowRuns.push({ y, left, right });
        }
        rowRuns.sort((a, b) => a.y - b.y);
        const bands = [];
        for (const run of rowRuns) {
          let band = bands.find(b => run.y === b.bottom + 1 && run.right >= b.left - 2 && run.left <= b.right + 2);
          if (!band) { band = { top: run.y, bottom: run.y, left: run.left, right: run.right }; bands.push(band); }
          else { band.bottom = run.y; band.left = Math.min(band.left, run.left); band.right = Math.max(band.right, run.right); }
        }
        
        
        
        const pixelAt=(x,y)=>{const i=((y+y0)*width+x+x0)*4;return [pixels[i],pixels[i+1],pixels[i+2]];};
        const colorDistance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
        function obscuredBodyGap(a,b){
          if(a.left!==b.left||a.right!==b.right||b.top<=a.bottom+1)return false;
          const bw=a.right-a.left+1,required=Math.max(3,Math.ceil(bw*.25));
          for(let y=a.bottom+1;y<b.top;y++){
            const xs=new Set(rows.get(y)||[]);
            let supported=false;
            for(const side of [-1,1]){
              const edge=side<0?a.left:a.right;
              let retained=0;
              while(xs.has(edge-side*retained)&&retained<bw)retained++;
              if(retained<required||retained>=bw*.65)continue;
              const covered=side<0?a.right:a.left,outside=covered+side*-2;
              if(outside<0||outside>=crop.width)continue;
              const ink=pixelAt(covered,y),outer=pixelAt(outside,y),background=pixelAt(outside,a.top);
              if(colorDistance(ink,outer)<=30&&colorDistance(outer,background)>=24&&colorDistance(ink,colors[colorIndex])>tolerance){supported=true;break;}
            }
            if(!supported)return false;
          }
          return true;
        }
        for(let i=0;i+1<bands.length;){
          if(obscuredBodyGap(bands[i],bands[i+1])){
            const hiddenRows=bands[i].obscuredRows||new Set();
            for(let y=bands[i].bottom+1;y<bands[i+1].top;y++)hiddenRows.add(y);
            bands[i].obscuredRows=hiddenRows;
            bands[i].bottom=bands[i+1].bottom;bands.splice(i+1,1);
            warnings.push('A partially covered candle body was joined across a visible horizontal annotation. Verify its outline against the original image.');
          }else i++;
        }
        for (const b of bands) {
          const bw = b.right - b.left + 1, bh = b.bottom - b.top + 1;
          const center = Math.floor((b.left + b.right) / 2), radius = Math.max(1, Math.floor(bw / 3));
          const hasNearCenter = y => (rows.get(y) || []).some(x => Math.abs(x - center) <= radius);
          let wickTop = b.top, wickBottom = b.bottom;
          while (wickTop > 0 && hasNearCenter(wickTop - 1)) wickTop--;
          while (wickBottom + 1 < crop.height && hasNearCenter(wickBottom + 1)) wickBottom++;
          
          
          if (bw > bh * 12 && wickTop === b.top && wickBottom === b.bottom) {
            warnings.push('A wide, unsupported horizontal colored feature was ignored; crop the chart area more tightly if it is a candle.');
            continue;
          }
          const innerWidth = bw - 2, innerHeight = bh - 2;
          let hollow = null;
          if (innerWidth > 0 && innerHeight > 0) {
            let occupied = 0, observedRows = 0;
            for (let y = b.top + 1; y < b.bottom; y++) {
              if(b.obscuredRows?.has(y))continue;
              observedRows++;
              for (const x of rows.get(y) || []) if (x > b.left && x < b.right) occupied++;
            }
            hollow = observedRows ? occupied / (innerWidth * observedRows) < 0.5 : null;
          }
          const colorDirection = colorIndex === 0 ? 'up' : 'down';
          let direction = colorDirection;
          if (directionMode === 'hollow') {
            if (hollow === true) direction = 'up';
            else if (hollow === false) direction = 'down';
            else warnings.push('A candle body was too short or narrow to determine hollow versus filled; its color-selected direction was used.');
          }
          candidates.push({ x: center + x0, bodyLeft: b.left + x0, bodyRight: b.right + x0, bodyTop: b.top + y0, bodyBottom: b.bottom + y0,
            wickTop: wickTop + y0, wickBottom: wickBottom + y0,
            bodyWidth: bw, hollow, direction, quality: 'heuristic' });
          if (hollow === true && directionMode === 'color') {
            warnings.push('A hollow candle body was detected; color mode follows the selected color, which may not indicate direction for hollow charts.');
          }
        }
      }
    }

    candidates.sort((a, b) => a.x - b.x || a.bodyTop - b.bodyTop);
    
    
    const rgb=(x,y)=>{const i=(y*width+x)*4;return [pixels[i],pixels[i+1],pixels[i+2]];};
    const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    function traceWick(c,start,direction){
      const flank=Math.max(3,Math.ceil(c.bodyWidth/2)+2);
      function supported(y){
        if(y<y0||y>=y1||c.x-flank<x0||c.x+flank>=x1)return false;
        const left=rgb(c.x-flank,y),right=rgb(c.x+flank,y);
        for(let dx=-1;dx<=1;dx++){
          const x=c.x+dx,ink=rgb(x,y);
          if(distance(ink,left)<24||distance(ink,right)<24)continue;
          
          const side=Math.max(2,Math.ceil(c.bodyWidth*.3));
          if(distance(ink,rgb(x-side,y))<18&&distance(ink,rgb(x+side,y))<18)continue;
          return true;
        }
        return false;
      }
      function horizontalOcclusion(y,otherY){
        if(y<y0||y>=y1||otherY<y0||otherY>=y1||c.x-flank<x0||c.x+flank>=x1)return false;
        const ink=rgb(c.x,y),left=rgb(c.x-flank,y),right=rgb(c.x+flank,y);
        
        
        return distance(ink,left)<18&&distance(ink,right)<18&&
          distance(left,rgb(c.x-flank,otherY))>=24&&distance(right,rgb(c.x+flank,otherY))>=24;
      }
      let last=start,y=start+direction;
      while(y>=y0&&y<y1){
        if(supported(y)){last=y;y+=direction;continue;}
        
        
        if(supported(y+direction)&&supported(y+2*direction)){last=y+2*direction;y+=3*direction;continue;}
        if(horizontalOcclusion(y,y-direction)&&horizontalOcclusion(y+direction,y+2*direction)&&
            supported(y+2*direction)&&supported(y+3*direction)){
          last=y+3*direction;y+=4*direction;continue;
        }
        break;
      }
      if(last!==start&&(last===y0||last===y1-1)){
        warnings.push('A possible wick reaches the crop edge and may be a vertical grid line. Its extra extent was not assumed; review this candle or widen the crop.');
        return start;
      }
      return last;
    }
    function measureWick(c){
      const flank=Math.max(3,Math.ceil(c.bodyWidth/2)+2),counts=new Map();
      if(c.x-flank>=x0&&c.x+flank<x1){
        for(let y=c.wickTop;y<=c.wickBottom;y++){
          if(y>=c.bodyTop&&y<=c.bodyBottom)continue;
          const left=rgb(c.x-flank,y),right=rgb(c.x+flank,y);
          const foreground=x=>distance(rgb(x,y),left)>=24&&distance(rgb(x,y),right)>=24;
          const seed=[c.x,c.x+1,c.x-1].find(x=>foreground(x));
          if(seed===undefined)continue;
          let l=seed,r=seed;
          while(l>c.x-flank+1&&foreground(l-1))l--;
          while(r<c.x+flank-1&&foreground(r+1))r++;
          if(r-l+1>Math.max(2,c.bodyWidth-1))continue;
          const key=l+':'+r,entry=counts.get(key)||{left:l,right:r,count:0};entry.count++;counts.set(key,entry);
        }
      }
      const observed=[...counts.values()].sort((a,b)=>b.count-a.count||Math.abs((a.left+a.right)/2-c.x)-Math.abs((b.left+b.right)/2-c.x))[0];
      c.wickLeft=observed?observed.left:c.x;c.wickRight=observed?observed.right:c.x;c.wickWidth=c.wickRight-c.wickLeft+1;
    }
    for(const c of candidates){c.wickTop=traceWick(c,c.wickTop,-1);c.wickBottom=traceWick(c,c.wickBottom,1);measureWick(c);}
    const candles = candidates;
    if (!candles.length) warnings.push('No candle bodies matched the selected colors and crop. Adjust the crop or candle colors.');
    warnings.push('Screenshot geometry is approximate. No prices, missing candles, or calibrated confidence scores are inferred.');
    return { candles, warnings: Array.from(new Set(warnings)), crop };
  }

  const api = { extract };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ScreenshotExtractor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
