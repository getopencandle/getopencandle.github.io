/* OpenCandle recognition rules. Existing PolyForm Noncommercial license: LICENSE.txt. */
(()=>{'use strict';
const CB=(()=>{
// Snapshot of user-owned OpenCandle implementation; see sources/own-code.json.


/**
 * Candlestick pattern detection (original code).
 *
 * Each family is written from the standard textbook description of the pattern (Nison, "Japanese Candlestick Charting
 * Techniques"; Bulkowski, "Encyclopedia of Candlestick Charts"). Every numeric threshold below, the
 * trend rule wiring and the marker text are our own choice and exported so tests cite one place.
 *
 * Bar vocabulary: body = |close - open|, range = high - low, upper = high - max(open, close), lower = min(open, close) - low,
 * white = close > open, black = close < open. A bar with a missing or nonfinite price, or a zero range, never takes part in a
 * pattern. avgBody(i) is the mean body of the CANDLE_THRESHOLDS.averageBodyLength bars before bar i (bar i excluded);
 * a bar without a full window has no average, so patterns that need a long or small body are not reported there.
 */
const CANDLE_THRESHOLDS=Object.freeze({
 /** A doji's body is at most this share of its range. */
 dojiBody:0.05,
 /** A "small" or "missing" shadow is at most this share of the range. */
 smallShadow:0.1,
 /** A hammer-type shadow is at least this many bodies long. */
 longShadowBodies:2,
 /** Long lower or upper shadow: the shadow is at least this share of the range. */
 longShadowRange:2/3,
 /** Bars in the average body window. */
 averageBodyLength:14,
 /** A small (star or inside) body is at most this share of the average body. */
 smallBody:0.5,
 /** Marubozu shadows are each at most this share of the range. */
 marubozuShadow:0.05,
 /** Three white soldiers or black crows close (open) within this share of the range of the extreme. */
 nearExtreme:0.25,
 /** Tweezer extremes and the on-neck close match within this share of the larger range. */
 matchTolerance:0.05,
});


/** reversal: bullish needs a prior downtrend, bearish a prior uptrend. continuation: bullish needs an uptrend, bearish a
 *  downtrend. none: the trend rule does not apply (neutral families, and Kicking, which Nison treats as trend-free). Role per family. */


const TREND_RULES                     =Object.freeze(['SMA50','SMA50, SMA200','No detection']);

const PATTERN_TYPES                       =Object.freeze(['Bullish','Bearish','Both']);




const finite=(value        )                =>typeof value==='number'&&Number.isFinite(value);
const T=CANDLE_THRESHOLDS;

/** Per-bar shape values, computed once per calculation. */
class CandleMetrics {
          o         ;         h         ;         l         ;         c         ;         ok          ;         body         ;         range         ;         upper         ;         lower         ;         avgBody                ;
 constructor(bars               ){
  const n=bars.length;this.o=[];this.h=[];this.l=[];this.c=[];this.ok=[];this.body=[];this.range=[];this.upper=[];this.lower=[];this.avgBody=[];
  for(const bar of bars){
   const valid=[bar.open,bar.high,bar.low,bar.close].every(finite)&&bar.high>=bar.low&&bar.high>=Math.max(bar.open,bar.close)&&bar.low<=Math.min(bar.open,bar.close)&&bar.high>bar.low;
   this.ok.push(valid);this.o.push(bar.open);this.h.push(bar.high);this.l.push(bar.low);this.c.push(bar.close);
   this.body.push(valid?Math.abs(bar.close-bar.open):NaN);this.range.push(valid?bar.high-bar.low:NaN);
   this.upper.push(valid?bar.high-Math.max(bar.open,bar.close):NaN);this.lower.push(valid?Math.min(bar.open,bar.close)-bar.low:NaN);
  }
  const w=T.averageBodyLength;let sum=0,bad=0;
  for(let i=0;i<n;i++){
   // window = bars i-w .. i-1
   if(i>=1){const add=this.body[i-1];if(finite(add))sum+=add;else bad++;}
   if(i>w){const drop=this.body[i-1-w];if(finite(drop))sum-=drop;else bad--;}
   this.avgBody.push(i>=w&&bad===0?sum/w:null);
  }
 }
 /** All bars i-size+1 .. i are usable. */
 usable(i       ,size       ){if(i-size+1<0)return false;for(let k=i-size+1;k<=i;k++)if(!this.ok[k])return false;return true;}
 white(i       ){return this.c[i]>this.o[i];}
 black(i       ){return this.c[i]<this.o[i];}
 top(i       ){return Math.max(this.o[i],this.c[i]);}
 bottom(i       ){return Math.min(this.o[i],this.c[i]);}
 mid(i       ){return (this.o[i]+this.c[i])/2;}
 doji(i       ){return this.body[i]<=T.dojiBody*this.range[i];}
 long(i       ){const avg=this.avgBody[i];return avg!==null&&avg>0&&this.body[i]>avg;}
 small(i       ){const avg=this.avgBody[i];return avg!==null&&avg>0&&this.body[i]<=T.smallBody*avg;}
 marubozu(i       ){return this.long(i)&&this.upper[i]<=T.marubozuShadow*this.range[i]&&this.lower[i]<=T.marubozuShadow*this.range[i];}
}

const side=(code       ,name       ,test                                    )           =>({code,name,test});
const insideBody=(k              ,i       ,outer       )=>k.top(i)<=k.top(outer)&&k.bottom(i)>=k.bottom(outer);
const soldier=(k              ,i       )=>k.white(i)&&k.long(i)&&k.upper[i]<=T.nearExtreme*k.range[i];
const crow=(k              ,i       )=>k.black(i)&&k.long(i)&&k.lower[i]<=T.nearExtreme*k.range[i];

/** Every family, keyed by id. Order is the "All candlestick patterns" marker order on a bar. */
const CANDLE_FAMILIES                        =Object.freeze([
 {id:'doji',size:1,role:'none',definition:'Doji: body at most dojiBody of the range.',
  neutral:side('D','Doji',(k,i)=>k.doji(i))},
 {id:'dojiwings',size:1,role:'reversal',definition:'Dragonfly: a doji whose upper shadow is at most smallShadow of the range. Gravestone: a doji whose lower shadow is at most smallShadow of the range.',
  bullish:side('DD','Dragonfly Doji',(k,i)=>k.doji(i)&&k.upper[i]<=T.smallShadow*k.range[i]),
  bearish:side('GD','Gravestone Doji',(k,i)=>k.doji(i)&&k.lower[i]<=T.smallShadow*k.range[i])},
 {id:'hammer',size:1,role:'reversal',definition:'Not a doji; lower shadow at least longShadowBodies bodies; upper shadow at most smallShadow of the range. After a downtrend it is a Hammer, after an uptrend a Hanging man.',
  bullish:side('H','Hammer',(k,i)=>!k.doji(i)&&k.lower[i]>=T.longShadowBodies*k.body[i]&&k.upper[i]<=T.smallShadow*k.range[i]),
  bearish:side('HM','Hanging man',(k,i)=>!k.doji(i)&&k.lower[i]>=T.longShadowBodies*k.body[i]&&k.upper[i]<=T.smallShadow*k.range[i])},
 {id:'invhammer',size:1,role:'reversal',definition:'Not a doji; upper shadow at least longShadowBodies bodies; lower shadow at most smallShadow of the range. After a downtrend it is an Inverted hammer, after an uptrend a Shooting star.',
  bullish:side('IH','Inverted hammer',(k,i)=>!k.doji(i)&&k.upper[i]>=T.longShadowBodies*k.body[i]&&k.lower[i]<=T.smallShadow*k.range[i]),
  bearish:side('SS','Shooting star',(k,i)=>!k.doji(i)&&k.upper[i]>=T.longShadowBodies*k.body[i]&&k.lower[i]<=T.smallShadow*k.range[i])},
 {id:'engulfing',size:2,role:'reversal',definition:'The second real body covers the first and is larger: bullish = black then white with open <= prior close and close >= prior open; bearish mirrors it.',
  bullish:side('EG','Bullish engulfing',(k,i)=>k.black(i-1)&&k.white(i)&&k.o[i]<=k.c[i-1]&&k.c[i]>=k.o[i-1]&&k.body[i]>k.body[i-1]),
  bearish:side('EG','Bearish engulfing',(k,i)=>k.white(i-1)&&k.black(i)&&k.o[i]>=k.c[i-1]&&k.c[i]<=k.o[i-1]&&k.body[i]>k.body[i-1])},
 {id:'harami',size:2,role:'reversal',definition:'A long first body, then a smaller non-doji body of either color inside it (Nison). The first body color gives the direction (black = bullish).',
  bullish:side('HR','Bullish harami',(k,i)=>k.black(i-1)&&k.long(i-1)&&!k.doji(i)&&insideBody(k,i,i-1)&&k.body[i]<k.body[i-1]),
  bearish:side('HR','Bearish harami',(k,i)=>k.white(i-1)&&k.long(i-1)&&!k.doji(i)&&insideBody(k,i,i-1)&&k.body[i]<k.body[i-1])},
 {id:'haramicross',size:2,role:'reversal',definition:'A long first body, then a doji whose body lies inside it. The first body\'s color gives the direction (black = bullish).',
  bullish:side('HC','Bullish harami cross',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.doji(i)&&insideBody(k,i,i-1)),
  bearish:side('HC','Bearish harami cross',(k,i)=>k.white(i-1)&&k.long(i-1)&&k.doji(i)&&insideBody(k,i,i-1))},
 // Nison (Japanese Candlestick Charting Techniques, "Dark-cloud cover" and "Piercing pattern"): the second session opens
 // above the prior session's HIGH (dark cloud) or below its LOW (piercing), not merely beyond its close.
 {id:'piercing',size:2,role:'reversal',definition:'Piercing: a long black body, then a white body opening below its low and closing above its midpoint but below its open. Dark cloud cover mirrors it (opening above the prior high).',
  bullish:side('PL','Piercing',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.white(i)&&k.o[i]<k.l[i-1]&&k.c[i]>k.mid(i-1)&&k.c[i]<k.o[i-1]),
  bearish:side('DC','Dark cloud cover',(k,i)=>k.white(i-1)&&k.long(i-1)&&k.black(i)&&k.o[i]>k.h[i-1]&&k.c[i]<k.mid(i-1)&&k.c[i]>k.o[i-1])},
 {id:'dojistar',size:2,role:'reversal',definition:'A long body, then a doji whose body gaps beyond its close (below after black = bullish, above after white = bearish).',
  bullish:side('DS','Bullish doji star',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.doji(i)&&k.top(i)<k.c[i-1]),
  bearish:side('DS','Bearish doji star',(k,i)=>k.white(i-1)&&k.long(i-1)&&k.doji(i)&&k.bottom(i)>k.c[i-1])},
 {id:'star',size:3,role:'reversal',definition:'Morning star: a long black body, a small non-doji body gapping below its close, then a white body closing above the first body\'s midpoint. Evening star mirrors it.',
  bullish:side('MS','Morning star',(k,i)=>k.black(i-2)&&k.long(i-2)&&k.small(i-1)&&!k.doji(i-1)&&k.top(i-1)<k.c[i-2]&&k.white(i)&&k.c[i]>k.mid(i-2)),
  bearish:side('ES','Evening star',(k,i)=>k.white(i-2)&&k.long(i-2)&&k.small(i-1)&&!k.doji(i-1)&&k.bottom(i-1)>k.c[i-2]&&k.black(i)&&k.c[i]<k.mid(i-2))},
 {id:'dojistar3',size:3,role:'reversal',definition:'Morning Doji star and Evening Doji star: the star pattern with a doji as the middle bar.',
  bullish:side('MDS','Morning Doji star',(k,i)=>k.black(i-2)&&k.long(i-2)&&k.doji(i-1)&&k.top(i-1)<k.c[i-2]&&k.white(i)&&k.c[i]>k.mid(i-2)),
  bearish:side('EDS','Evening Doji star',(k,i)=>k.white(i-2)&&k.long(i-2)&&k.doji(i-1)&&k.bottom(i-1)>k.c[i-2]&&k.black(i)&&k.c[i]<k.mid(i-2))},
 {id:'abandoned',size:3,role:'reversal',definition:'A doji whose whole range gaps away from both neighbours: black, gap-down doji, gap-up white = bullish; the mirror is bearish.',
  bullish:side('AB','Bullish abandoned baby',(k,i)=>k.black(i-2)&&k.doji(i-1)&&k.h[i-1]<k.l[i-2]&&k.white(i)&&k.l[i]>k.h[i-1]),
  bearish:side('AB','Bearish abandoned baby',(k,i)=>k.white(i-2)&&k.doji(i-1)&&k.l[i-1]>k.h[i-2]&&k.black(i)&&k.h[i]<k.l[i-1])},
 {id:'soldiers',size:3,role:'reversal',definition:'Three long white bodies, each closing higher, each opening inside the prior body, each with an upper shadow at most nearExtreme of its range. Three black crows mirror it.',
  bullish:side('3WS','Three white soldiers',(k,i)=>[i-2,i-1,i].every(j=>soldier(k,j))&&k.c[i-1]>k.c[i-2]&&k.c[i]>k.c[i-1]&&k.o[i-1]>k.o[i-2]&&k.o[i-1]<=k.c[i-2]&&k.o[i]>k.o[i-1]&&k.o[i]<=k.c[i-1]),
  bearish:side('3BC','Three black crows',(k,i)=>[i-2,i-1,i].every(j=>crow(k,j))&&k.c[i-1]<k.c[i-2]&&k.c[i]<k.c[i-1]&&k.o[i-1]<k.o[i-2]&&k.o[i-1]>=k.c[i-2]&&k.o[i]<k.o[i-1]&&k.o[i]>=k.c[i-1])},
 // Nison ("Tweezers tops and bottoms"): matching highs or lows of two or more lines, made of real bodies, shadows or
 // doji; colour is not part of the definition, so no colour is required here. The trend rule supplies the "after a rally /
 // decline" context.
 {id:'tweezer',size:2,role:'reversal',definition:'Tweezer bottom: two bars whose lows are equal within matchTolerance of the larger range. Tweezer top: two bars with equal highs. Colour is not required.',
  bullish:side('TB','Tweezer bottom',(k,i)=>Math.abs(k.l[i]-k.l[i-1])<=T.matchTolerance*Math.max(k.range[i],k.range[i-1])),
  bearish:side('TT','Tweezer top',(k,i)=>Math.abs(k.h[i]-k.h[i-1])<=T.matchTolerance*Math.max(k.range[i],k.range[i-1]))},
 {id:'marubozu',size:1,role:'continuation',definition:'A long body whose shadows are each at most marubozuShadow of the range (white = bullish, black = bearish).',
  bullish:side('MW','Marubozu white',(k,i)=>k.white(i)&&k.marubozu(i)),
  bearish:side('MB','Marubozu black',(k,i)=>k.black(i)&&k.marubozu(i))},
 {id:'spinwhite',size:1,role:'none',definition:'Spinning top white: a white non-doji body smaller than each of its shadows.',
  neutral:side('STW','Spinning top white',(k,i)=>k.white(i)&&!k.doji(i)&&k.upper[i]>k.body[i]&&k.lower[i]>k.body[i])},
 {id:'spinblack',size:1,role:'none',definition:'Spinning top black: a black non-doji body smaller than each of its shadows.',
  neutral:side('STB','Spinning top black',(k,i)=>k.black(i)&&!k.doji(i)&&k.upper[i]>k.body[i]&&k.lower[i]>k.body[i])},
 // Nison (Beyond Candlesticks, "Kicker"): the gap between opposite marubozu is decisive whatever the prior trend, so the
 // family is not trend-gated (role none). Saved instances may still carry the old trendRule input (retired, ignored).
 {id:'kicking',size:2,role:'none',definition:'Two marubozu of opposite color with a gap between their ranges: black then gap-up white = bullish; white then gap-down black = bearish. The prior trend is not required.',
  bullish:side('K','Bullish kicking',(k,i)=>k.black(i-1)&&k.marubozu(i-1)&&k.white(i)&&k.marubozu(i)&&k.l[i]>k.h[i-1]),
  bearish:side('K','Bearish kicking',(k,i)=>k.white(i-1)&&k.marubozu(i-1)&&k.black(i)&&k.marubozu(i)&&k.h[i]<k.l[i-1])},
 {id:'threemethods',size:5,role:'continuation',definition:'Rising three methods: a long white bar, three bars with smaller bodies inside its range, then a long white bar closing above the first close. Falling three methods mirrors it.',
  bullish:side('R3M','Rising three methods',(k,i)=>k.white(i-4)&&k.long(i-4)&&[i-3,i-2,i-1].every(j=>k.h[j]<=k.h[i-4]&&k.l[j]>=k.l[i-4]&&k.body[j]<k.body[i-4])&&k.white(i)&&k.long(i)&&k.c[i]>k.c[i-4]),
  bearish:side('F3M','Falling three methods',(k,i)=>k.black(i-4)&&k.long(i-4)&&[i-3,i-2,i-1].every(j=>k.h[j]<=k.h[i-4]&&k.l[j]>=k.l[i-4]&&k.body[j]<k.body[i-4])&&k.black(i)&&k.long(i)&&k.c[i]<k.c[i-4])},
 {id:'tristar',size:3,role:'reversal',definition:'Three dojis whose middle body gaps below both neighbours (bullish) or above both (bearish).',
  bullish:side('TS','Bullish tri-star',(k,i)=>k.doji(i-2)&&k.doji(i-1)&&k.doji(i)&&k.top(i-1)<k.bottom(i-2)&&k.top(i-1)<k.bottom(i)),
  bearish:side('TS','Bearish tri-star',(k,i)=>k.doji(i-2)&&k.doji(i-1)&&k.doji(i)&&k.bottom(i-1)>k.top(i-2)&&k.bottom(i-1)>k.top(i))},
 {id:'tasuki',size:3,role:'continuation',definition:'Upside Tasuki gap: two white bars with a gap up between their ranges, then a black bar opening inside the second body and closing inside the gap. Downside Tasuki gap mirrors it.',
  bullish:side('UTG','Upside Tasuki gap',(k,i)=>k.white(i-2)&&k.white(i-1)&&k.l[i-1]>k.h[i-2]&&k.black(i)&&k.o[i]<k.c[i-1]&&k.o[i]>k.o[i-1]&&k.c[i]<k.l[i-1]&&k.c[i]>k.h[i-2]),
  bearish:side('DTG','Downside Tasuki gap',(k,i)=>k.black(i-2)&&k.black(i-1)&&k.h[i-1]<k.l[i-2]&&k.white(i)&&k.o[i]>k.c[i-1]&&k.o[i]<k.o[i-1]&&k.c[i]>k.h[i-1]&&k.c[i]<k.l[i-2])},
 {id:'window',size:2,role:'continuation',definition:'Rising window: the low is above the prior high. Falling window: the high is below the prior low.',
  bullish:side('RW','Rising window',(k,i)=>k.l[i]>k.h[i-1]),
  bearish:side('FW','Falling window',(k,i)=>k.h[i]<k.l[i-1])},
 {id:'shadow',size:1,role:'reversal',definition:'Long lower shadow: the lower shadow is at least longShadowRange of the range. Long upper shadow: the upper shadow is.',
  bullish:side('LLS','Long lower shadow',(k,i)=>k.lower[i]>=T.longShadowRange*k.range[i]),
  bearish:side('LUS','Long upper shadow',(k,i)=>k.upper[i]>=T.longShadowRange*k.range[i])},
 {id:'onneck',size:2,role:'continuation',definition:'On neck: a long black bar, then a white bar opening below its low and closing at its low (within matchTolerance of its range).',
  bearish:side('ON','On neck',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.white(i)&&k.o[i]<k.l[i-1]&&Math.abs(k.c[i]-k.l[i-1])<=T.matchTolerance*k.range[i-1])},
]                  );
const candleFamily=(id       )             =>{const row=CANDLE_FAMILIES.find(family=>family.id===id);if(!row)throw new Error('Unknown candlestick family.');return row;};

/** Trend at each bar from the close and the trend rule (our own wiring of the rule names):
 *  SMA50: up when close > SMA50, down when close < SMA50. SMA50, SMA200: up when close > SMA50 > SMA200, down when
 *  close < SMA50 < SMA200. No detection: both. A bar without the averages has no trend. */
function trendStates(bars               ,rule          ,sma                                                               )                              {
 if(rule==='No detection')return {up:bars.map(()=>true),down:bars.map(()=>true)};
 const close=bars.map(bar=>finite(bar.close)?bar.close:null),fast=sma(close,50),slow=rule==='SMA50, SMA200'?sma(close,200):null;
 const up          =[],down          =[];
 bars.forEach((_,i)=>{
  const c=close[i],f=fast[i],s=slow?slow[i]:null;
  if(!finite(c)||!finite(f)||slow&&!finite(s)){up.push(false);down.push(false);return;}
  up.push(c>f&&(!slow||f>(s          )));down.push(c<f&&(!slow||f<(s          )));
 });
 return {up,down};
}


/** Hits of one family on every bar. `trend` gates the directional sides by the family role, read on the bar before the
 *  pattern's first bar (: "preceded by a trend"); the first bars without a prior bar have no trend unless the rule
 *  is No detection. `types` selects the directional sides; neutral sides are always reported. */
function detectCandleFamily(k              ,family             ,trend                              ,types                                  ,noDetection        )            {
 const out            =[];const n=k.c.length;
 const trendOk=(direction                    ,i       )=>{
  if(noDetection||family.role==='none')return true;
  const at=i-family.size;if(at<0)return false;
  const needUp=family.role==='reversal'?direction==='bearish':direction==='bullish';
  return needUp?trend.up[at]:trend.down[at];
 };
 for(let i=0;i<n;i++){
  if(!k.usable(i,family.size))continue;
  if(family.neutral&&family.neutral.test(k,i))out.push({index:i,direction:'neutral',family:family.id,code:family.neutral.code,name:family.neutral.name});
  if(family.bullish&&types.bullish&&trendOk('bullish',i)&&family.bullish.test(k,i))out.push({index:i,direction:'bullish',family:family.id,code:family.bullish.code,name:family.bullish.name});
  if(family.bearish&&types.bearish&&trendOk('bearish',i)&&family.bearish.test(k,i))out.push({index:i,direction:'bearish',family:family.id,code:family.bearish.code,name:family.bearish.name});
 }
 return out;
}

return {CandleMetrics,trendStates,CANDLE_FAMILIES,CANDLE_THRESHOLDS};})();
const GB=(()=>{
// Snapshot of user-owned OpenCandle implementation; see sources/own-code.json.


/**
 * Chart pattern detection (original code, every rule).
 *
 * The detection below is OpenCandle's own, written from the usual textbook shapes (Bulkowski, "Encyclopedia of Chart
 * Patterns").
 * Flags, pennants and cup and handle are reasoned from the public description of those shapes (a sharp pole
 * then a small parallel or converging consolidation; a rounded bowl between two equal rims, then a short shallow handle).
 *
 * Pivots: bar j is a pivot high when its high is above every high of the `pivotLength` bars before it and at least every
 * high of the `pivotLength` bars after it (pivot low mirrors it with lows). A pivot is known only on its confirmation bar
 * j + pivotLength, so detection is causal: nothing is reported before the bar that completes it, and later bars never
 * change an earlier report. Pivots form an alternating zigzag; a second pivot of the same kind replaces the first when it
 * is more extreme, else it is ignored.
 *
 * Each time a pivot is appended, the newest pivots are tested against every enabled pattern. `tolerance` (percent) is the
 * largest relative difference for two levels to count as equal and the smallest relative move for a level to count as
 * rising, falling or clearly lower or higher.
 */



const CHART_PATTERNS                            =Object.freeze([
 {id:'doubletop',name:'Double top',direction:'bearish',rule:'High, low, high: the two highs equal within tolerance, the low below the lower high by more than tolerance.'},
 {id:'doublebottom',name:'Double bottom',direction:'bullish',rule:'Low, high, low: the two lows equal within tolerance, the high above the higher low by more than tolerance.'},
 {id:'tripletop',name:'Triple top',direction:'bearish',rule:'Three highs within tolerance of each other (max - min against the max), both lows between them below the lowest high by more than tolerance.'},
 {id:'triplebottom',name:'Triple bottom',direction:'bullish',rule:'Three lows within tolerance of each other, both highs between them above the highest low by more than tolerance.'},
 {id:'headshoulders',name:'Head and shoulders',direction:'bearish',rule:'Five pivots high, low, high, low, high: the middle high (head) above both outer highs (shoulders) by more than tolerance, the shoulders equal within tolerance, both lows below the lower shoulder.'},
 {id:'invheadshoulders',name:'Inverted head and shoulders',direction:'bullish',rule:'The mirror of Head and shoulders on lows.'},
 {id:'triangle',name:'Triangle',direction:'neutral',rule:'Last two highs and last two lows: highs not rising and lows not falling (a move within tolerance is flat), not both flat, and the second high-low width narrower than the first.'},
 {id:'rectangle',name:'Rectangle',direction:'neutral',rule:'Last two highs equal within tolerance and last two lows equal within tolerance, the lows below the highs by more than tolerance.'},
 {id:'risingwedge',name:'Rising wedge',direction:'bearish',rule:'Last two highs and lows both rising by more than tolerance, lows rising faster (the width narrows).'},
 {id:'fallingwedge',name:'Falling wedge',direction:'bullish',rule:'Last two highs and lows both falling by more than tolerance, highs falling faster (the width narrows).'},
 // Flags and pennants: five pivots, the pole (low then high for bullish) and a two-high, two-low consolidation.
 {id:'bullflag',name:'Bullish flag',direction:'bullish',rule:'Five pivots low, high, low, high, low: the pole (first low to first high) rises by more than 3 x tolerance; both later lows stay above the pole midpoint; the flag highs and lows are each flat or falling (neither rises by more than tolerance) and the second high-low width is at least half the first (parallel, not converging).'},
 {id:'bearflag',name:'Bearish flag',direction:'bearish',rule:'The mirror of Bullish flag: a falling pole (high to low) of more than 3 x tolerance, both later highs below the pole midpoint, the flag highs and lows each flat or rising, the second width at least half the first.'},
 {id:'bullpennant',name:'Bullish pennant',direction:'bullish',rule:'The Bullish flag pole and midpoint rules, but the consolidation converges: the second high falls and the second low rises, each by more than tolerance.'},
 {id:'bearpennant',name:'Bearish pennant',direction:'bearish',rule:'The Bearish flag pole and midpoint rules, but the consolidation converges: the second high falls and the second low rises, each by more than tolerance.'},
 // Cups: four pivots, rim, bottom, rim, handle.
 {id:'cuphandle',name:'Cup and handle',direction:'bullish',rule:'Four pivots high, low, high, low: the two rims (highs) equal within tolerance, the bottom below the lower rim by more than tolerance; the cup is rounded (at least 40% of the bars from rim to rim have their low in the bottom quarter of the cup depth, a V gives about 25%); the handle low stays above the cup midpoint, and the handle (right rim to handle low) lasts at most half as many bars as the cup.'},
 {id:'invcuphandle',name:'Inverted cup and handle',direction:'bearish',rule:'The mirror of Cup and handle on lows: two equal low rims, a rounded dome (at least 40% of the bars with their high in the top quarter), a handle high below the dome midpoint, lasting at most half the dome.'},
]                      );
const chartPatternInfo=(id               )                 =>CHART_PATTERNS.find(row=>row.id===id) ;




const finite=(value        )                =>typeof value==='number'&&Number.isFinite(value);

/** Accepted pivot events in confirmation order: a new pivot, or a more extreme pivot of the same kind that replaces the
 *  last one (`replaces` true). Each carries the bar that confirmed it. */
function zigzagEvents(bars               ,length       )                                                   {
 const out                                                   =[];let last           =null;
 for(let i=2*length;i<bars.length;i++){
  const j=i-length;let usable=true;for(let k=j-length;k<=i;k++)if(!finite(bars[k].high)||!finite(bars[k].low)){usable=false;break;}if(!usable)continue;
  let highPivot=true,lowPivot=true;
  for(let k=j-length;k<=i;k++){if(k===j)continue;const before=k<j;
   if(before?!(bars[k].high<bars[j].high):!(bars[k].high<=bars[j].high))highPivot=false;
   if(before?!(bars[k].low>bars[j].low):!(bars[k].low>=bars[j].low))lowPivot=false;}
  for(const kind of ['high','low']         ){
   if(kind==='high'?!highPivot:!lowPivot)continue;
   const pivot      ={index:j,price:kind==='high'?bars[j].high:bars[j].low,kind};
   if(last&&last.kind===kind){if(kind==='high'?pivot.price>last.price:pivot.price<last.price){last=pivot;out.push({...pivot,confirmedAt:i,replaces:true});}continue;}
   last=pivot;out.push({...pivot,confirmedAt:i,replaces:false});
  }
 }
 return out;
}
/** The final alternating zigzag (after replacements). */
function zigzagPivots(bars               ,length       )        {
 const out        =[];for(const event of zigzagEvents(bars,length)){const pivot={index:event.index,price:event.price,kind:event.kind};if(event.replaces)out[out.length-1]=pivot;else out.push(pivot);}return out;
}

const equal=(a       ,b       ,tol       )=>Math.abs(a-b)<=tol*Math.max(Math.abs(a),Math.abs(b));
const segment=(a      ,b      )=>({from:{index:a.index,price:a.price},to:{index:b.index,price:b.price}});
/** The line through a and b, continued to bar `at`. */
const extended=(a      ,b      ,at       )=>{const slope=b.index===a.index?0:(b.price-a.price)/(b.index-a.index);return {from:{index:a.index,price:a.price},to:{index:at,price:b.price+slope*(at-b.index)}};};

/** The share of cup bars that must sit in the cup's extreme quarter for it to count as rounded. */
const CUP_ROUND_SHARE=0.4;
/** Share of bars a..c (inclusive) whose low (top: high) is within a quarter of the depth from the bottom (top) price. */
function roundShare(bars               ,a       ,c       ,bottom       ,depth       ,top        )            {
 let near=0;for(let k=a;k<=c;k++){const value=top?bars[k].high:bars[k].low;if(!finite(value))return null;if(top?value>=bottom-depth/4:value<=bottom+depth/4)near++;}
 return near/(c-a+1);
}

function test(id               ,p                 ,tol       ,at       ,bars               )                     {
 const n=p.length,info=chartPatternInfo(id);
 const hit=(pivots                 ,lines                         )                =>({id,direction:info.direction,name:info.name,confirmedAt:at,pivots,lines});
 const zigzag=(pivots                 )=>pivots.slice(1).map((pivot,k)=>segment(pivots[k],pivot));
 const last=p[n-1];
 if(id==='doubletop'||id==='doublebottom'){
  if(n<3)return null;const [a,b,c]=p.slice(n-3);const top=id==='doubletop';if(c.kind!==(top?'high':'low'))return null;
  if(!equal(a.price,c.price,tol))return null;
  const ok=top?b.price<Math.min(a.price,c.price)*(1-tol):b.price>Math.max(a.price,c.price)*(1+tol);if(!ok)return null;
  return hit([a,b,c],[...zigzag([a,b,c]),{from:{index:b.index,price:b.price},to:{index:at,price:b.price}}]);
 }
 if(id==='tripletop'||id==='triplebottom'){
  if(n<5)return null;const q=p.slice(n-5),top=id==='tripletop';if(last.kind!==(top?'high':'low'))return null;
  const peaks=[q[0],q[2],q[4]].map(row=>row.price),valleys=[q[1],q[3]].map(row=>row.price);
  const hi=Math.max(...peaks),lo=Math.min(...peaks);if(hi-lo>tol*Math.max(Math.abs(hi),Math.abs(lo)))return null;
  const ok=top?valleys.every(v=>v<lo*(1-tol)):valleys.every(v=>v>hi*(1+tol));if(!ok)return null;
  return hit(q,[...zigzag(q),extended(q[1],q[3],at)]);
 }
 if(id==='headshoulders'||id==='invheadshoulders'){
  if(n<5)return null;const q=p.slice(n-5),top=id==='headshoulders';if(last.kind!==(top?'high':'low'))return null;
  const [ls,t1,head,t2,rs]=q;if(!equal(ls.price,rs.price,tol))return null;
  if(top?!(head.price>Math.max(ls.price,rs.price)*(1+tol)):!(head.price<Math.min(ls.price,rs.price)*(1-tol)))return null;
  if(top?!(Math.max(t1.price,t2.price)<Math.min(ls.price,rs.price)):!(Math.min(t1.price,t2.price)>Math.max(ls.price,rs.price)))return null;
  return hit(q,[...zigzag(q),extended(t1,t2,at)]);
 }
 if(id==='bullflag'||id==='bearflag'||id==='bullpennant'||id==='bearpennant'){
  // Pole p0-e1, then the consolidation e1, r1, e2, r2 (e = pole-end side, r = retrace side).
  if(n<5)return null;const q=p.slice(n-5),bull=id==='bullflag'||id==='bullpennant';if(last.kind!==(bull?'low':'high'))return null;
  const [p0,e1,r1,e2,r2]=q,pole=e1.price-p0.price,mid=p0.price+pole/2;
  if(!(bull?pole>3*tol*Math.abs(p0.price):-pole>3*tol*Math.abs(p0.price)))return null;
  if(bull?!(Math.min(r1.price,r2.price)>mid):!(Math.max(r1.price,r2.price)<mid))return null;
  const [h1,l1,h2,l2]=bull?[e1,r1,e2,r2]:[r1,e1,r2,e2],dh=(h2.price-h1.price)/Math.abs(h1.price),dl=(l2.price-l1.price)/Math.abs(l1.price);
  if(!finite(dh)||!finite(dl))return null;
  const flag=id==='bullflag'||id==='bearflag';
  const ok=flag?(bull?dh<=tol&&dl<=tol:dh>=-tol&&dl>=-tol)&&h2.price-l2.price>=(h1.price-l1.price)/2:dh<-tol&&dl>tol;
  if(!ok)return null;
  return hit(q,[segment(p0,e1),extended(h1,h2,at),extended(l1,l2,at)]);
 }
 if(id==='cuphandle'||id==='invcuphandle'){
  // Rim a, bottom b, rim c, handle d.
  if(n<4)return null;const q=p.slice(n-4),cup=id==='cuphandle';if(last.kind!==(cup?'low':'high'))return null;
  const [a,b,c,d]=q;if(!equal(a.price,c.price,tol))return null;
  const rim=cup?Math.min(a.price,c.price):Math.max(a.price,c.price),depth=cup?rim-b.price:b.price-rim;
  if(cup?!(b.price<rim*(1-tol)):!(b.price>rim*(1+tol)))return null;
  const mid=cup?b.price+depth/2:b.price-depth/2;if(cup?!(d.price>mid):!(d.price<mid))return null;
  if(d.index-c.index>(c.index-a.index)/2)return null;
  const share=roundShare(bars,a.index,c.index,b.price,depth,!cup);if(share===null||share<CUP_ROUND_SHARE)return null;
  return hit(q,[...zigzag(q),extended(a,c,at)]);
 }
 // Four-pivot shapes: the last two highs and the last two lows.
 if(n<4)return null;const q=p.slice(n-4),highs=q.filter(row=>row.kind==='high'),lows=q.filter(row=>row.kind==='low');
 if(highs.length!==2||lows.length!==2)return null;
 const [h1,h2]=highs,[l1,l2]=lows,dh=(h2.price-h1.price)/Math.abs(h1.price),dl=(l2.price-l1.price)/Math.abs(l1.price);
 if(!finite(dh)||!finite(dl))return null;
 const flatHigh=Math.abs(dh)<=tol,flatLow=Math.abs(dl)<=tol,narrower=h2.price-l2.price<h1.price-l1.price;
 let ok=false;
 if(id==='rectangle')ok=flatHigh&&flatLow&&Math.max(l1.price,l2.price)<Math.min(h1.price,h2.price)*(1-tol);
 if(id==='triangle')ok=(dh<-tol||flatHigh)&&(dl>tol||flatLow)&&!(flatHigh&&flatLow)&&narrower;
 if(id==='risingwedge')ok=dh>tol&&dl>tol&&dl>dh&&narrower;
 if(id==='fallingwedge')ok=dh<-tol&&dl<-tol&&dh<dl&&narrower;
 if(!ok)return null;
 return hit(q,[extended(h1,h2,at),extended(l1,l2,at)]);
}

/** Patterns with a breakout level (Bulkowski: a top is confirmed by a close below the valley or neckline, a bottom by a close
 *  above the peak or neckline). The other shapes are reported unconfirmed (on their last pivot) in both modes. */
const BREAKOUT_PATTERNS                            =new Set                (['doubletop','doublebottom','tripletop','triplebottom','headshoulders','invheadshoulders']);

/** The breakout rule of a found breakout pattern: the level a close must cross at bar k, the extreme a close must not pass
 *  first (the pattern's highest high for a top, lowest low for a bottom: past it the shape is void) and the window. */
function breakoutRule(hit                )                                                                    {
 const p=hit.pivots,top=hit.direction==='bearish',window=p[p.length-1].index-p[0].index;
 const extreme=top?Math.max(...p.filter(row=>row.kind==='high').map(row=>row.price)):Math.min(...p.filter(row=>row.kind==='low').map(row=>row.price));
 if(hit.id==='doubletop'||hit.id==='doublebottom'){const level=p[1].price;return {top,level:()=>level,invalid:extreme,window};}
 if(hit.id==='tripletop'||hit.id==='triplebottom'){const level=top?Math.min(p[1].price,p[3].price):Math.max(p[1].price,p[3].price);return {top,level:()=>level,invalid:extreme,window};}
 // Head and shoulders: the neckline through the two troughs (peaks), continued.
 const [a,b]=[p[1],p[3]],slope=b.index===a.index?0:(b.price-a.price)/(b.index-a.index);
 return {top,level:k=>b.price+slope*(k-b.index),invalid:extreme,window};
}
/** The breakout bar of a breakout pattern, or null: the first bar after the last pivot whose close crosses the level, within
 *  `window` bars (the pattern's own width, an OpenCandle choice) and before any close past the pattern's extreme. Reported
 *  no earlier than the bar the pattern became known (`confirmedAt`). Reads only bars up to the bar it returns. */
function breakoutBar(bars               ,hit                )            {
 const rule=breakoutRule(hit),last=hit.pivots[hit.pivots.length-1].index,end=Math.min(bars.length-1,last+rule.window);
 for(let k=last+1;k<=end;k++){
  const close=bars[k].close;if(!finite(close))continue;
  if(rule.top?close>rule.invalid:close<rule.invalid)return null;
  if(rule.top?close<rule.level(k):close>rule.level(k))return Math.max(k,hit.confirmedAt);
 }
 return null;
}
/** Every hit of the chosen patterns, in reporting-bar order. tolerancePercent is a percent (2 = 2%). With
 *  options.breakout a breakout pattern is reported on its breakout bar (confirmedAt) or not at all. */
function detectChartPatterns(bars               ,ids                          ,pivotLength       ,tolerancePercent       ,options                    ={})                  {
 const tol=tolerancePercent/100,out                  =[],seen        =[];
 for(const event of zigzagEvents(bars,pivotLength)){
  const pivot      ={index:event.index,price:event.price,kind:event.kind};
  if(event.replaces)seen[seen.length-1]=pivot;else seen.push(pivot);
  for(const id of ids){
   const found=test(id,seen,tol,event.confirmedAt,bars);if(!found)continue;
   if(!options.breakout||!BREAKOUT_PATTERNS.has(id)){out.push(found);continue;}
   const at=breakoutBar(bars,found);if(at===null)continue;
   out.push(test(id,found.pivots,tol,at,bars) );
  }
 }
 // Breakouts can arrive after later pivots; a stable sort keeps the pivot order within one bar.
 return options.breakout?out.map((hit,order)=>({hit,order})).sort((a,b)=>a.hit.confirmedAt-b.hit.confirmedAt||a.order-b.order).map(row=>row.hit):out;
}

return {CHART_PATTERNS,BREAKOUT_PATTERNS,detectChartPatterns};})();
const D=(({CANDLE_FAMILIES,CANDLE_THRESHOLDS})=>{

const RULE_VERSION='oc-independent-1.0.0';
const PROFILE=Object.freeze({
  ...CANDLE_THRESHOLDS,
  nearFraction:0.05,
  similarBodyFraction:0.25,
  rickshawCenterFraction:0.15,
  inNeckPenetration:0.20,
  thrustingMinPenetration:0.20,
  hikkakeConfirmationBars:3,
  trendWindow:50,
});

const specs=[];
const reference=key=>key?'https://www.thepatternsite.com/'+key+'.html':null;
const baseKeys={
  doji:{neutral:'Doji'},dojiwings:{bullish:'Dragonfly',bearish:'Gravestone'},
  hammer:{bullish:'Hammer',bearish:'HangingMan'},invhammer:{bullish:'InvertedHammerOneLine',bearish:'ShootingStar'},
  engulfing:{bullish:'BullEngulfing',bearish:'BearEngulfing'},harami:{bullish:'HaramiBull',bearish:'HaramiBear'},
  haramicross:{bullish:'HaramiCrossBull',bearish:'HaramiCrossBear'},piercing:{bullish:'Piercing',bearish:'DarkCloudCover'},
  dojistar:{bullish:'DojiStarBull',bearish:'DojiStarBear'},star:{bullish:'MorningStar',bearish:'EveningStar'},
  dojistar3:{bullish:'MorningDojiStar',bearish:'EveningDojiStar'},abandoned:{bullish:'AbandonBabyBull',bearish:'AbandonBaby'},
  soldiers:{bullish:'ThreeWhiteSoldiers',bearish:'ThreeBlackCrows'},tweezer:{bullish:'TweezersBottom',bearish:'TweezersTop'},
  marubozu:{bullish:'WhiteMarubozu',bearish:'BlackMarubozu'},spinwhite:{neutral:'SpinTopWhite'},spinblack:{neutral:'SpinTopBlack'},
  kicking:{bullish:'KickingBull',bearish:'KickingBear'},threemethods:{bullish:'Rising3Methods',bearish:'Falling3Methods'},
  tristar:{bullish:'TriStarBull',bearish:'TriStarBear'},tasuki:{bullish:'UpsideTasukiGap',bearish:'DownsideTasukiGap'},
  window:{bullish:'RisingWindow',bearish:'FallingWindow'},shadow:{bullish:'LongLowerShadow',bearish:'LongUpperShadow'},onneck:{bearish:'OnNeck'},
};
const extras=new Set(['Doji','InvertedHammerOneLine','LongLowerShadow','LongUpperShadow']);
function add(key,name,size,role,direction,formula,test,extra={}){
  specs.push(Object.freeze({id:key.toLowerCase(),referenceKey:extras.has(key)?null:key+'.html',name,size,role,direction,ruleVersion:RULE_VERSION,
    definition:formula,sourceUrl:extras.has(key)?null:reference(key),implementation:'independent',validationStatus:'automated_contract_tests; human_review_pending',
    trendPolicy:role==='none'?'none':role==='context-up'?'up':role==='context-down'?'down':role==='reversal'?(direction==='bullish'?'down':'up'):(direction==='bullish'?'up':'down'),
    confirmation:'pattern_close',test,...extra}));
}
for(const family of CANDLE_FAMILIES){
  for(const direction of ['bullish','bearish','neutral']){
    const side=family[direction];if(!side)continue;
    add(baseKeys[family.id][direction],side.name,family.size,family.role,direction,family.definition,side.test,{origin:'user-owned OpenCandle baseline',family:family.id});
  }
}

const p=PROFILE;
const top=(k,i)=>Math.max(k.o[i],k.c[i]),bot=(k,i)=>Math.min(k.o[i],k.c[i]);
const bodyInside=(k,i,j)=>top(k,i)<=top(k,j)&&bot(k,i)>=bot(k,j);
const rangeInside=(k,i,j)=>k.h[i]<k.h[j]&&k.l[i]>k.l[j];
const tinyUpper=(k,i)=>k.upper[i]<=p.smallShadow*k.range[i];
const tinyLower=(k,i)=>k.lower[i]<=p.smallShadow*k.range[i];
const near=(a,b,scale)=>Math.abs(a-b)<=p.nearFraction*scale;
const nearAt=(k,a,b,i,j)=>near(a,b,Math.max(k.range[i],k.range[j]));
const nearBody=(k,i,j)=>Math.abs(k.body[i]-k.body[j])<=p.similarBodyFraction*Math.max(k.body[i],k.body[j]);
const shapeMaru=(k,i)=>k.upper[i]<=p.marubozuShadow*k.range[i]&&k.lower[i]<=p.marubozuShadow*k.range[i];
const invHammer=(k,i)=>!k.doji(i)&&k.upper[i]>=p.longShadowBodies*k.body[i]&&tinyLower(k,i);
const all=(start,end,test)=>{for(let j=start;j<=end;j++)if(!test(j))return false;return true;};

for(const n of [8,10,12,13])add(n+'NewPriceLines',n+' new price lines',n,'none','neutral',`Each of the ${n} highs is strictly greater than its immediate predecessor within the pattern; no trend filter.`,(k,i)=>all(i-n+2,i,j=>k.h[j]>k.h[j-1]));
add('AboveStomach','Above the stomach',2,'reversal','bullish','A down candle is followed by an up candle whose entire body starts at or above the first body midpoint.',(k,i)=>k.black(i-1)&&k.white(i)&&k.o[i]>=k.mid(i-1));
add('BelowStomach','Below the stomach',2,'reversal','bearish','A long up body is followed by a body of either color entirely below its midpoint.',(k,i)=>k.white(i-1)&&k.long(i-1)&&top(k,i)<k.mid(i-1));
add('AdvanceBlock','Advance block',3,'reversal','bearish','Three up candles close successively higher, later opens lie within the previous body, and upper shadows increase strictly.',(k,i)=>all(i-2,i,j=>k.white(j))&&all(i-1,i,j=>k.c[j]>k.c[j-1]&&k.o[j]>k.o[j-1]&&k.o[j]<k.c[j-1]&&k.upper[j]>k.upper[j-1]));

for(const bullish of [true,false]){
  const key=bullish?'Bull':'Bear',direction=bullish?'bullish':'bearish';
  add(key+'Breakaway',direction+' breakaway',5,'reversal',direction,'Five bars: long trend-colored first body, same-color body gap, two further closes along that trend, then a long opposite body closing inside the initial body gap.',(k,i)=>{
    const a=i-4,b=i-3,c=i-2,d=i-1;
    return k.long(a)&&k.long(i)&&(bullish?
      k.black(a)&&k.black(b)&&top(k,b)<bot(k,a)&&k.c[c]<k.c[b]&&k.black(d)&&k.c[d]<k.c[c]&&k.white(i)&&k.c[i]>top(k,b)&&k.c[i]<bot(k,a):
      k.white(a)&&k.white(b)&&bot(k,b)>top(k,a)&&k.c[c]>k.c[b]&&k.white(d)&&k.c[d]>k.c[c]&&k.black(i)&&k.c[i]<bot(k,b)&&k.c[i]>top(k,a));
  });
  add('BeltHold'+key,direction+' belt hold',1,'reversal',direction,'A long directional body opens at its extreme within smallShadow of range; the closing shadow must exceed that tolerance.',(k,i)=>k.long(i)&&(bullish?k.white(i)&&tinyLower(k,i)&&!tinyUpper(k,i):k.black(i)&&tinyUpper(k,i)&&!tinyLower(k,i)));
  add('MeetingLines'+key,direction+' meeting lines',2,'reversal',direction,'Two long opposite-colored bodies close within nearFraction of their larger range; the second body points in the named direction.',(k,i)=>k.long(i-1)&&k.long(i)&&nearAt(k,k.c[i],k.c[i-1],i,i-1)&&(bullish?k.black(i-1)&&k.white(i):k.white(i-1)&&k.black(i)));
  add('SeparateLines'+key,direction+' separating lines',2,'continuation',direction,'Two long opposite-colored bodies share an opening level within nearFraction of the larger range; the second resumes the named trend.',(k,i)=>k.long(i-1)&&k.long(i)&&nearAt(k,k.o[i],k.o[i-1],i,i-1)&&(bullish?k.black(i-1)&&k.white(i):k.white(i-1)&&k.black(i)));
  add('SidebySideWhiteLines'+key,direction+' side-by-side white lines',3,'continuation',direction,'The final two up bodies have similar lengths and openings; both bodies sit wholly beyond the first body in the trend direction.',(k,i)=>k.white(i-1)&&k.white(i)&&nearBody(k,i,i-1)&&nearAt(k,k.o[i],k.o[i-1],i,i-1)&&(bullish?k.white(i-2)&&Math.min(bot(k,i-1),bot(k,i))>top(k,i-2):k.black(i-2)&&Math.max(top(k,i-1),top(k,i))<bot(k,i-2)));
  add('ThreeLineStrike'+key,direction+' three-line strike',4,'continuation',direction,'Three trend-colored candles extend to new extremes; a long opposite body then opens beyond the previous close and crosses the first open. Direction names the preceding trend, not the final candle.',(k,i)=>k.long(i)&&(bullish?
    all(i-3,i-1,j=>k.white(j))&&all(i-2,i-1,j=>k.h[j]>k.h[j-1])&&k.black(i)&&k.o[i]>k.c[i-1]&&k.c[i]<k.o[i-3]:
    all(i-3,i-1,j=>k.black(j))&&all(i-2,i-1,j=>k.l[j]<k.l[j-1])&&k.white(i)&&k.o[i]<k.c[i-1]&&k.c[i]>k.o[i-3]));
}

for(const white of [false,true]){
  const color=white?'White':'Black',test=(k,i)=>white?k.white(i):k.black(i);
  add(white?'WhiteCandle':'BlkCandle',color+' candle',1,'none','neutral','Positive real body with the named close/open ordering; no length or trend requirement.',test);
  add(white?'LongWhiteDay':'LongBlack','Long '+color.toLowerCase()+' day',1,'none','neutral','Named body color, with body larger than the previous 14-bar mean body.',(k,i)=>test(k,i)&&k.long(i));
  add(white?'ShortWhiteCandle':'BlkCandleShort','Short '+color.toLowerCase()+' candle',1,'none','neutral','Named color, non-doji body at most half the previous 14-bar mean body.',(k,i)=>test(k,i)&&!k.doji(i)&&k.small(i));
  add(white?'ClosingWhiteMarubozu':'CloseBlkMarubozu','Closing '+color.toLowerCase()+' marubozu',1,'none','neutral','A long body closes at its directional extreme within marubozuShadow of range. The opening-side shadow is unrestricted.',(k,i)=>test(k,i)&&k.long(i)&&(white?k.upper[i]:k.lower[i])<=p.marubozuShadow*k.range[i]);
  add(white?'OpenWhiteMarubozu':'OpenBlkMaru','Opening '+color.toLowerCase()+' marubozu',1,'none','neutral','A long body opens at its directional starting extreme within marubozuShadow of range. The closing-side shadow is unrestricted.',(k,i)=>test(k,i)&&k.long(i)&&(white?k.lower[i]:k.upper[i])<=p.marubozuShadow*k.range[i]);
}
add('CollapseDojiStar','Collapsing doji star',3,'reversal','bearish','An up body, a doji with its whole range below the first low, then a down body with its whole range below the doji low.',(k,i)=>k.white(i-2)&&k.doji(i-1)&&k.h[i-1]<k.l[i-2]&&k.black(i)&&k.h[i]<k.l[i-1]);
add('ConcealBaby','Concealing baby swallow',4,'reversal','bullish','Four down bodies: two long marubozu, then a lower opening with upper wick entering the second body, then a full-range engulfment of the third bar.',(k,i)=>all(i-3,i,j=>k.black(j))&&k.marubozu(i-3)&&k.marubozu(i-2)&&k.o[i-1]<k.c[i-2]&&k.h[i-1]>k.c[i-2]&&k.upper[i-1]>=2*k.body[i-1]&&k.h[i]>k.h[i-1]&&k.l[i]<k.l[i-1]);
add('Deliberation','Deliberation',3,'reversal','bearish','Three up bodies with rising opens/closes; the first two are long, the third small and opens near the second close.',(k,i)=>all(i-2,i,j=>k.white(j))&&k.long(i-2)&&k.long(i-1)&&k.small(i)&&all(i-1,i,j=>k.o[j]>k.o[j-1]&&k.c[j]>k.c[j-1])&&nearAt(k,k.o[i],k.c[i-1],i,i-1));
add('GappingDownDoji','Gapping down doji',1,'context-down','neutral','Doji with its full range below the preceding low; preceding downtrend required.',(k,i)=>i>0&&k.doji(i)&&k.h[i]<k.l[i-1],{contextBars:1});
add('GappingUpDoji','Gapping up doji',1,'context-up','neutral','Doji with its full range above the preceding high; preceding uptrend required.',(k,i)=>i>0&&k.doji(i)&&k.l[i]>k.h[i-1],{contextBars:1});
add('NorthernDoji','Northern doji',1,'context-up','neutral','Doji preceded by an uptrend.',(k,i)=>k.doji(i));
add('SouthernDoji','Southern doji',1,'context-down','neutral','Doji preceded by a downtrend.',(k,i)=>k.doji(i));
add('LongLegDoji','Long-legged doji',1,'none','neutral','Doji with each shadow at least 30% of the whole range.',(k,i)=>k.doji(i)&&k.upper[i]>=0.30*k.range[i]&&k.lower[i]>=0.30*k.range[i]);
add('RickshawMan','Rickshaw man',1,'none','neutral','Doji with each shadow at least 30% of range and body midpoint within 15% of range of the range midpoint.',(k,i)=>k.doji(i)&&k.upper[i]>=.3*k.range[i]&&k.lower[i]>=.3*k.range[i]&&Math.abs(k.mid(i)-(k.h[i]+k.l[i])/2)<=p.rickshawCenterFraction*k.range[i]);
add('HighWave','High wave',1,'none','neutral','Small non-doji body; both shadows exceed twice its length.',(k,i)=>k.small(i)&&!k.doji(i)&&k.upper[i]>2*k.body[i]&&k.lower[i]>2*k.body[i]);
add('TakuriLine','Takuri line',1,'reversal','bullish','Doji with a lower shadow of at least 80% of range and upper shadow at most 10%.',(k,i)=>k.doji(i)&&k.lower[i]>=.8*k.range[i]&&tinyUpper(k,i));
add('HammerInv','Inverted hammer, two-line',2,'reversal','bullish','A long down body closes near its low; the next candle is a small non-doji inverted-hammer shape opening below that close.',(k,i)=>k.black(i-1)&&k.long(i-1)&&tinyLower(k,i-1)&&k.small(i)&&invHammer(k,i)&&k.o[i]<k.c[i-1]);
add('ShootingStar2','Shooting star, two-line',2,'reversal','bearish','An up candle followed by a small non-doji body gapping above it, with upper wick at least three bodies and a small lower wick.',(k,i)=>k.white(i-1)&&k.small(i)&&!k.doji(i)&&bot(k,i)>top(k,i-1)&&k.upper[i]>=3*k.body[i]&&tinyLower(k,i));
add('HomingPigeon','Homing pigeon',2,'reversal','bullish','Long down body followed by a smaller down body contained in it.',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.black(i)&&k.small(i)&&bodyInside(k,i,i-1));
add('Identical3Crows','Identical three crows',3,'reversal','bearish','Three long down candles close lower; each later open is near the preceding close.',(k,i)=>all(i-2,i,j=>k.black(j)&&k.long(j))&&all(i-1,i,j=>k.c[j]<k.c[j-1]&&nearAt(k,k.o[j],k.c[j-1],j,j-1)));
add('InNeck','In neck',2,'continuation','bearish','After a long down body, an up candle opens below its low and closes above its close by no more than 20% of the first body.',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.white(i)&&k.o[i]<k.l[i-1]&&k.c[i]>k.c[i-1]&&k.c[i]<=k.c[i-1]+p.inNeckPenetration*k.body[i-1]);
add('Thrusting','Thrusting',2,'continuation','bearish','After a long down body, an up candle opens below its low and closes more than 20% but less than 50% into the first body.',(k,i)=>k.black(i-1)&&k.long(i-1)&&k.white(i)&&k.o[i]<k.l[i-1]&&k.c[i]>k.c[i-1]+p.thrustingMinPenetration*k.body[i-1]&&k.c[i]<k.mid(i-1));
add('LadderBottom','Ladder bottom',5,'reversal','bullish','Three long down bodies with falling opens/closes, a fourth down body with upper wick longer than its body, then an up candle opening above the fourth body.',(k,i)=>all(i-4,i-2,j=>k.black(j)&&k.long(j))&&all(i-3,i-2,j=>k.o[j]<k.o[j-1]&&k.c[j]<k.c[j-1])&&k.black(i-1)&&k.upper[i-1]>k.body[i-1]&&k.white(i)&&k.o[i]>top(k,i-1));
add('LastEngulfBottom','Last engulfing bottom',2,'reversal','bullish','Following a downtrend, an up body is strictly engulfed by a down body; the name denotes reversal context rather than final body color.',(k,i)=>k.white(i-1)&&k.black(i)&&top(k,i)>top(k,i-1)&&bot(k,i)<bot(k,i-1));
add('LastEngulfTop','Last engulfing top',2,'reversal','bearish','Following an uptrend, a down body is strictly engulfed by an up body.',(k,i)=>k.black(i-1)&&k.white(i)&&top(k,i)>top(k,i-1)&&bot(k,i)<bot(k,i-1));
add('MatchingLow','Matching low',2,'reversal','bullish','Two down bodies close within nearFraction of the larger bar range.',(k,i)=>k.black(i-1)&&k.black(i)&&nearAt(k,k.c[i],k.c[i-1],i,i-1));
add('MatHold','Mat hold',5,'continuation','bullish','Long up body; three small declining bodies beginning above its close and staying above its low (second/fourth down); long up close above every prior pattern high.',(k,i)=>k.white(i-4)&&k.long(i-4)&&k.black(i-3)&&k.black(i-1)&&all(i-3,i-1,j=>k.small(j)&&bot(k,j)>k.l[i-4])&&k.c[i-3]>k.c[i-4]&&k.c[i-2]<k.c[i-3]&&k.c[i-1]<k.c[i-2]&&k.white(i)&&k.long(i)&&k.c[i]>Math.max(...k.h.slice(i-4,i)));
add('StickSandwich','Stick sandwich',3,'reversal','bullish','Down/up/down sequence; the middle range stays above the first close, and the last close matches the first within nearFraction.',(k,i)=>k.black(i-2)&&k.white(i-1)&&k.l[i-1]>k.c[i-2]&&k.black(i)&&nearAt(k,k.c[i],k.c[i-2],i,i-2));
for(const bull of [true,false]){
  const dir=bull?'bullish':'bearish';
  add(bull?'ThreeInsideUp':'ThreeInsideDown','Three inside '+(bull?'up':'down'),3,'reversal',dir,'Long first body, smaller opposite-colored body inside it, then a third candle closing beyond the first open in the reversal direction.',(k,i)=>k.long(i-2)&&bodyInside(k,i-1,i-2)&&k.body[i-1]<k.body[i-2]&&(bull?k.black(i-2)&&k.white(i-1)&&k.white(i)&&k.c[i]>k.o[i-2]:k.white(i-2)&&k.black(i-1)&&k.black(i)&&k.c[i]<k.o[i-2]));
  add(bull?'ThreeOutsideUp':'ThreeOutsideDown','Three outside '+(bull?'up':'down'),3,'reversal',dir,'An opposite-colored second body strictly engulfs the first; a third same-direction candle closes beyond the engulfing close.',(k,i)=>top(k,i-1)>top(k,i-2)&&bot(k,i-1)<bot(k,i-2)&&(bull?k.black(i-2)&&k.white(i-1)&&k.white(i)&&k.c[i]>k.c[i-1]:k.white(i-2)&&k.black(i-1)&&k.black(i)&&k.c[i]<k.c[i-1]));
  add(bull?'UpGap3Methods':'DownGap3Methods',(bull?'Upside':'Downside')+' gap three methods',3,'continuation',dir,'Two long trend-colored bodies have a full-range gap. The final opposite body opens inside the second body and closes inside the first, filling the gap.',(k,i)=>k.long(i-2)&&k.long(i-1)&&k.o[i]>bot(k,i-1)&&k.o[i]<top(k,i-1)&&k.c[i]>bot(k,i-2)&&k.c[i]<top(k,i-2)&&(bull?k.white(i-2)&&k.white(i-1)&&k.black(i)&&k.l[i-1]>k.h[i-2]:k.black(i-2)&&k.black(i-1)&&k.white(i)&&k.h[i-1]<k.l[i-2]));
}
add('ThreeStarsSouth','Three stars in the south',3,'reversal','bullish','Three down bodies: first long with lower wick at least its body, second smaller with higher low, final near-shadowless body strictly inside the second range.',(k,i)=>all(i-2,i,j=>k.black(j))&&k.long(i-2)&&k.lower[i-2]>=k.body[i-2]&&k.body[i-1]<k.body[i-2]&&k.l[i-1]>k.l[i-2]&&shapeMaru(k,i)&&rangeInside(k,i,i-1));
add('TwoBlackGapping','Two black gapping',2,'continuation','bearish','Two down candles after a full-range downward gap from the preceding context bar; the second high is below the first high.',(k,i)=>i>=2&&k.black(i-1)&&k.black(i)&&k.h[i-1]<k.l[i-2]&&k.h[i]<k.h[i-1],{contextBars:1});
add('TwoCrows','Two crows',3,'reversal','bearish','Long up body, down body gapping above it, then a down body opening inside the second body and closing inside the first.',(k,i)=>k.white(i-2)&&k.long(i-2)&&k.black(i-1)&&bot(k,i-1)>top(k,i-2)&&k.black(i)&&k.o[i]>bot(k,i-1)&&k.o[i]<top(k,i-1)&&k.c[i]>bot(k,i-2)&&k.c[i]<top(k,i-2));
add('UpGapTwoCrows','Upside gap two crows',3,'reversal','bearish','Long up body followed by a down body gapping above it; the last down body engulfs the second body while still closing above the first close.',(k,i)=>k.white(i-2)&&k.long(i-2)&&k.black(i-1)&&bot(k,i-1)>top(k,i-2)&&k.black(i)&&top(k,i)>top(k,i-1)&&bot(k,i)<bot(k,i-1)&&k.c[i]>k.c[i-2]);
add('Unique3RiverBottom','Unique three river bottom',3,'reversal','bullish','Long down body, then a down body inside it whose lower wick makes a new low, then a small up body below the second body.',(k,i)=>k.black(i-2)&&k.long(i-2)&&k.black(i-1)&&bodyInside(k,i-1,i-2)&&k.l[i-1]<k.l[i-2]&&k.white(i)&&k.small(i)&&top(k,i)<bot(k,i-1));

for(const bull of [true,false]){
  add(bull?'HikkakeBull':'HikkakeBear',(bull?'Bullish':'Bearish')+' hikkake, confirmed',3,'none',bull?'bullish':'bearish',
    'Inside bar followed by a false break (both high/low lower for bullish, higher for bearish). Within the next three bars, a strict high/low cross of the inside-bar boundary confirms. Report only at the first crossing.',
    ()=>false,{confirmation:'later_boundary_cross',special:'hikkake',bullish:bull});
}

const DEFINITIONS=Object.freeze(specs);
if(new Set(specs.map(x=>x.id)).size!==specs.length)throw new Error('Duplicate definition ID');
function listDefinitions(){return specs.map(({test,...metadata})=>({...metadata}));}

function hikkakeMatches(k,definition,i){
  const matches=[];
  for(let e=Math.max(2,i-p.hikkakeConfirmationBars);e<i;e++){
    if(!k.usable(i,i-e+3)||!rangeInside(k,e-1,e-2))continue;
    const bull=definition.bullish;
    if(!(bull?k.h[e]<k.h[e-1]&&k.l[e]<k.l[e-1]:k.h[e]>k.h[e-1]&&k.l[e]>k.l[e-1]))continue;
    const cross=j=>bull?k.h[j]>k.h[e-1]:k.l[j]<k.l[e-1];
    if(cross(i)&&!Array.from({length:i-e-1},(_,n)=>e+1+n).some(cross))matches.push({start:e-2,end:e,confirmedAt:i});
  }
  return matches;
}

return {DEFINITIONS,PROFILE,RULE_VERSION,listDefinitions,hikkakeMatches};})(CB);
const E=(({CandleMetrics,trendStates},{CHART_PATTERNS,BREAKOUT_PATTERNS,detectChartPatterns},{DEFINITIONS,PROFILE,RULE_VERSION,listDefinitions,hikkakeMatches})=>{
const API_VERSION='1';
const LIBRARY_VERSION='0.8.2-pre.1';
const readonly=object=>Object.freeze(object);
const CHART_DEFINITIONS=readonly(CHART_PATTERNS.map(row=>readonly({...row,confirmation:BREAKOUT_PATTERNS.has(row.id)?'pivot_and_close_breakout':'pivot_shape_only',ruleVersion:RULE_VERSION})));

function checkOptions(options,allowed){
  if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('options must be an object');
  for(const key of Object.keys(options))if(!allowed.includes(key))throw new RangeError('Unknown option: '+key);
  for(const key of ['datasetId','symbol','timeframe'])if(options[key]!==undefined&&(typeof options[key]!=='string'||!options[key]))throw new TypeError(key+' must be a nonempty string');
}

function validateBars(bars){
  if(!Array.isArray(bars))throw new TypeError('bars must be an array');
  let previous=-Infinity;
  for(let i=0;i<bars.length;i++){
    const b=bars[i];
    if(!b||!['time','open','high','low','close'].every(k=>typeof b[k]==='number'&&Number.isFinite(b[k])))throw new TypeError(`bar ${i}: finite time/OHLC required`);
    if(!Number.isSafeInteger(b.time)||b.time<=previous)throw new RangeError(`bar ${i}: time must be strictly increasing integer Unix seconds`);
    if(Math.min(b.open,b.high,b.low,b.close)<=0||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close,b.high))throw new RangeError(`bar ${i}: invalid positive-price OHLC envelope`);
    if(b.volume!==undefined&&(typeof b.volume!=='number'||!Number.isFinite(b.volume)||b.volume<0))throw new RangeError(`bar ${i}: invalid volume`);
    previous=b.time;
  }
  return true;
}
function sma(values,period){
  const out=[];let sum=0;
  for(let i=0;i<values.length;i++){sum+=values[i];if(i>=period)sum-=values[i-period];out.push(i>=period-1?sum/period:null);}
  return out;
}
function trendPass(def,trend,start,disabled){
  if(disabled||def.trendPolicy==='none')return true;
  const at=start-1;if(at<0)return false;
  return def.trendPolicy==='up'?trend.up[at]:trend.down[at];
}
// Stable non-cryptographic identifiers, usable unchanged in a browser or Node.
// Artifact integrity uses SHA-256 in the separate corpus builder.
const hash=value=>{
  const text=JSON.stringify(value);let a=0x811c9dc5,b=0x9e3779b9,c=0x85ebca6b,d=0xc2b2ae35;
  for(let i=0;i<text.length;i++){const n=text.charCodeAt(i);a=Math.imul(a^n,0x01000193);b=Math.imul(b^n,0x85ebca6b);c=Math.imul(c^n,0xc2b2ae35);d=Math.imul(d^n,0x27d4eb2f);}
  return [a,b,c,d].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
};
const parameterId=params=>hash(params).slice(0,16);
function detection(def,bars,span,context,configId,details={}){
  const {start,end,confirmedAt}=span;
  const stable=[RULE_VERSION,configId,context.datasetId||'',context.symbol||'',context.timeframe||'',def.id,bars[start].time,bars[end].time,bars[confirmedAt].time];
  return {id:hash(stable).slice(0,24),patternId:def.id,name:def.name,category:details.category||'candlestick',direction:def.direction,
    startIndex:start,endIndex:end,confirmedIndex:confirmedAt,startTime:bars[start].time,endTime:bars[end].time,confirmedBarTime:bars[confirmedAt].time,
    availableAt:'after_confirmed_bar_close',ruleVersion:RULE_VERSION,configId,datasetId:context.datasetId||null,symbol:context.symbol||null,timeframe:context.timeframe||null,
    evidenceStatus:'detector_candidate',reviewStatus:'unreviewed',confirmation:def.confirmation||'pattern_close',...details};
}
function scanCandles(bars,options={}){
  checkOptions(options,['datasetId','symbol','timeframe','patternIds','trendRule']);
  validateBars(bars);
  const trendRule=options.trendRule??'SMA50';
  if(!['SMA50','SMA50, SMA200','No detection'].includes(trendRule))throw new RangeError('Unknown trendRule');
  const ids=options.patternIds===undefined?DEFINITIONS.map(d=>d.id):options.patternIds;
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw new TypeError('patternIds must be an array of unique IDs');
  const defs=ids.map(id=>{const d=DEFINITIONS.find(d=>d.id===id);if(!d)throw new RangeError('Unknown candlestick pattern: '+id);return d;});
  const params={ruleVersion:RULE_VERSION,trendRule,profile:PROFILE},configId=parameterId(params);
  const k=new CandleMetrics(bars),trend=trendStates(bars,trendRule,sma),matches=[];
  for(let i=0;i<bars.length;i++)for(const def of defs){
    if(def.special==='hikkake'){
      for(const span of hikkakeMatches(k,def,i))matches.push(detection(def,bars,span,options,configId));
      continue;
    }
    if(!k.usable(i,def.size+(def.contextBars||0)))continue;
    const start=i-def.size+1;
    if(!trendPass(def,trend,start,trendRule==='No detection'))continue;
    if(def.test(k,i))matches.push(detection(def,bars,{start,end:i,confirmedAt:i},options,configId));
  }
  return {apiVersion:API_VERSION,libraryVersion:LIBRARY_VERSION,ruleVersion:RULE_VERSION,configId,parameters:params,barCount:bars.length,matches};
}

function scanCharts(bars,options={}){
  checkOptions(options,['datasetId','symbol','timeframe','patternIds','pivotLength','tolerancePercent','breakout']);
  validateBars(bars);
  const ids=options.patternIds??CHART_DEFINITIONS.map(d=>d.id),pivotLength=options.pivotLength??5,tolerancePercent=options.tolerancePercent??2,breakout=options.breakout??true;
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!CHART_DEFINITIONS.some(d=>d.id===id)))throw new RangeError('Unknown or duplicate chart pattern ID');
  if(!Number.isInteger(pivotLength)||pivotLength<1||pivotLength>100)throw new RangeError('pivotLength must be an integer from 1 through 100');
  if(!Number.isFinite(tolerancePercent)||tolerancePercent<=0||tolerancePercent>25)throw new RangeError('tolerancePercent must be > 0 and <= 25');
  if(typeof breakout!=='boolean')throw new TypeError('breakout must be boolean');
  const params={ruleVersion:RULE_VERSION,pivotLength,tolerancePercent,breakout},configId=parameterId(params),seen=new Set(),matches=[];
  for(const hit of detectChartPatterns(bars,ids,pivotLength,tolerancePercent,{breakout})){
    const def=CHART_DEFINITIONS.find(d=>d.id===hit.id),start=hit.pivots[0].index,end=hit.pivots.at(-1).index;
    const result=detection(def,bars,{start,end,confirmedAt:hit.confirmedAt},options,configId,{category:'chart',confirmation:breakout&&BREAKOUT_PATTERNS.has(hit.id)?'pivot_and_close_breakout':'pivot_shape_only',pivots:hit.pivots,lines:hit.lines});
    if(!seen.has(result.id)){seen.add(result.id);matches.push(result);}
  }
  return {apiVersion:API_VERSION,libraryVersion:LIBRARY_VERSION,ruleVersion:RULE_VERSION,configId,parameters:params,barCount:bars.length,matches};
}


return {scanCandles,scanCharts,validateBars};})(CB,GB,D);
const G=((validateBars)=>{
// Original research implementation. Frozen candlestick detectors are not modified.
const CHART_RESEARCH_VERSION='oc-chart-research-0.2.0';
const GAP_PROFILE=Object.freeze({trendLength:50,minIslandBars:1,maxIslandBars:null,gapComparison:'strict_positive_price_interval',islandSelection:'longest',confirmation:'completed_exit_bar',priceBasis:'caller_supplied_consistent_OHLC',sessionPolicy:'caller_must_supply_contiguous_valid_sessions_and_split_at_corporate_actions'});
const GAP_DEFINITIONS=Object.freeze([
 ['islandtop','Island reversal top','bearish','up'],['islandbottom','Island reversal bottom','bullish','down'],
 ['fullrangegapup','Full-range gap up','bullish','none'],['fullrangegapdown','Full-range gap down','bearish','none'],
 ['partialgapup','Partial opening gap up','bullish','none'],['partialgapdown','Partial opening gap down','bearish','none']
].map(([id,name,direction,trendPolicy])=>Object.freeze({id,name,direction,trendPolicy,category:'chart',ruleVersion:CHART_RESEARCH_VERSION,confirmation:'completed_bar',implementation:'independent',validationStatus:'research_candidate_not_performance_validated'})));
const hash=value=>{let a=2166136261,b=0x9e3779b9;for(const c of JSON.stringify(value)){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),2246822507);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');};

function scanGapPatterns(bars,options={}){
 validateBars(bars);
 if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('options must be an object');
 for(const key of Object.keys(options))if(!['datasetId','symbol','timeframe','patternIds','minIslandBars','maxIslandBars','islandSelection'].includes(key))throw new RangeError('Unknown option: '+key);
 for(const key of ['datasetId','symbol','timeframe'])if(options[key]!==undefined&&(typeof options[key]!=='string'||!options[key]))throw new TypeError(key+' must be a nonempty string');
 const parameters={...GAP_PROFILE,minIslandBars:options.minIslandBars===undefined?GAP_PROFILE.minIslandBars:options.minIslandBars,maxIslandBars:options.maxIslandBars===undefined?GAP_PROFILE.maxIslandBars:options.maxIslandBars,islandSelection:options.islandSelection===undefined?GAP_PROFILE.islandSelection:options.islandSelection};
 if(!Number.isSafeInteger(parameters.minIslandBars)||parameters.minIslandBars<1)throw new RangeError('minIslandBars must be a positive safe integer');
 if(parameters.maxIslandBars!==null&&(!Number.isSafeInteger(parameters.maxIslandBars)||parameters.maxIslandBars<parameters.minIslandBars))throw new RangeError('maxIslandBars must be null or a safe integer at least minIslandBars');
 if(!['longest','all'].includes(parameters.islandSelection))throw new RangeError('islandSelection must be longest or all');
 const CONFIG_ID=hash([CHART_RESEARCH_VERSION,parameters]);
 // One rolling mean per possible start; island price envelopes update incrementally.
 const priorMeans=new Array(bars.length).fill(null);let closeSum=0;
 for(let start=0;start<bars.length;start++){if(start>=GAP_PROFILE.trendLength)priorMeans[start]=closeSum/GAP_PROFILE.trendLength;closeSum+=bars[start].close;if(start>=GAP_PROFILE.trendLength)closeSum-=bars[start-GAP_PROFILE.trendLength].close;}
 const definitions=new Map(GAP_DEFINITIONS.map(d=>[d.id,d]));
 if(options.patternIds!==undefined&&(!Array.isArray(options.patternIds)||options.patternIds.some(id=>!definitions.has(id))||new Set(options.patternIds).size!==options.patternIds.length))throw new RangeError('Unknown gap patternIds');
 const wanted=new Set(options.patternIds??definitions.keys()),matches=[];
 const add=(patternId,start,end,confirmed,evidence)=>{
  if(!wanted.has(patternId))return;const def=definitions.get(patternId);
  matches.push({id:hash([CHART_RESEARCH_VERSION,CONFIG_ID,options.datasetId??null,options.symbol??null,options.timeframe??null,patternId,bars[start].time,bars[end].time,bars[confirmed].time]),patternId,name:def.name,category:'chart',direction:def.direction,startIndex:start,endIndex:end,confirmedIndex:confirmed,startTime:bars[start].time,endTime:bars[end].time,confirmedBarTime:bars[confirmed].time,availableAt:'after_confirmed_bar_close',ruleVersion:CHART_RESEARCH_VERSION,configId:CONFIG_ID,datasetId:options.datasetId??null,symbol:options.symbol??null,timeframe:options.timeframe??null,evidenceStatus:'detector_candidate',reviewStatus:'unreviewed',confirmation:'completed_bar',evidence});
 };
 for(let i=1;i<bars.length;i++){
  const previous=bars[i-1],current=bars[i];
  if(current.low>previous.high)add('fullrangegapup',i-1,i,i,{gapLower:previous.high,gapUpper:current.low,comparison:'current.low > previous.high'});
  if(current.high<previous.low)add('fullrangegapdown',i-1,i,i,{gapLower:current.high,gapUpper:previous.low,comparison:'current.high < previous.low'});
  if(current.open>previous.close&&current.open<=previous.high)add('partialgapup',i-1,i,i,{previousClose:previous.close,openingPrice:current.open,openingKnownAt:'bar_open',releasePolicy:'after_completed_bar',comparison:'previous.close < current.open <= previous.high'});
  if(current.open<previous.close&&current.open>=previous.low)add('partialgapdown',i-1,i,i,{previousClose:previous.close,openingPrice:current.open,openingKnownAt:'bar_open',releasePolicy:'after_completed_bar',comparison:'previous.low <= current.open < previous.close'});
  for(const [id,top]of [['islandtop',true],['islandbottom',false]]){
   if(!wanted.has(id))continue;
   let low=Infinity,high=-Infinity,longest=null;
   const earliest=parameters.maxIslandBars===null?GAP_PROFILE.trendLength:Math.max(GAP_PROFILE.trendLength,i-parameters.maxIslandBars);
   for(let start=i-1;start>=earliest;start--){
    low=Math.min(low,bars[start].low);high=Math.max(high,bars[start].high);
    // Earlier candles only widen the cluster; a touched exit boundary can never recover.
    if(top?low<=current.high:high>=current.low)break;
    if(i-start<parameters.minIslandBars)continue;
    const prior=bars[start-1],mean=priorMeans[start];
    if(top?prior.close<=mean:prior.close>=mean)continue;
    const gapLower=top?Math.max(prior.high,current.high):high,gapUpper=top?low:Math.min(prior.low,current.low);
    if(!(gapUpper>gapLower))continue;
    const evidence={islandBars:i-start,islandLow:low,islandHigh:high,commonGapLower:gapLower,commonGapUpper:gapUpper,priorIndex:start-1,priorClose:prior.close,priorSma50:mean,context:'pre-island close versus preceding 50-close average',selection:parameters.islandSelection};
    if(parameters.islandSelection==='all')add(id,start,i-1,i,evidence);else longest={start,evidence};
   }
   if(longest)add(id,longest.start,i-1,i,longest.evidence);
  }
 }
 return {apiVersion:'1',libraryVersion:'0.8.2-chart-research',ruleVersion:CHART_RESEARCH_VERSION,configId:CONFIG_ID,parameters:{...parameters,patternIds:[...wanted]},barCount:bars.length,matches};
}

return {GAP_DEFINITIONS,GAP_PROFILE,scanGapPatterns};})(E.validateBars);
const P=((validateBars)=>{
// Original causal geometry research implementation. No existing detector is changed.
const GEOMETRY_VERSION='oc-chart-research-0.2.0';
const GEOMETRY_PROFILE=Object.freeze({pivotRadius:2,pivotCount:6,minSpanBars:15,maxSpanBars:null,priceTolerance:0.005,minWidthFraction:0.02,minContraction:0.20,maxChannelWidthDrift:0.15,candidateStrategy:'latest_confirmed_alternating_pivots'});
const names={ascendingtriangle:'Ascending triangle',descendingtriangle:'Descending triangle',symmetricaltriangle:'Symmetrical triangle',ascendingchannel:'Ascending channel',descendingchannel:'Descending channel',horizontalchannel:'Horizontal channel'};
const rules={ascendingtriangle:'The upper fitted boundary is flat; the lower boundary rises with strictly increasing low touches. Width contracts at least 20%.',descendingtriangle:'The lower fitted boundary is flat; the upper boundary falls with strictly decreasing high touches. Width contracts at least 20%.',symmetricaltriangle:'The upper boundary falls with decreasing highs and the lower rises with increasing lows. Width contracts at least 20%; equal slope magnitudes are not required.',ascendingchannel:'Both fitted boundaries rise; width changes by no more than 15% of initial width.',descendingchannel:'Both fitted boundaries fall; width changes by no more than 15% of initial width.',horizontalchannel:'Both fitted boundaries are flat; width changes by no more than 15% of initial width.'};
const GEOMETRY_DEFINITIONS=Object.freeze(Object.entries(names).map(([id,name])=>Object.freeze({id,name,category:'chart',family:id.includes('triangle')?'triangles':'channels',direction:'neutral',ruleVersion:GEOMETRY_VERSION,confirmation:'confirmed_pivot_shape',trendPolicy:'none',definition:rules[id]+' Default settings use the latest six alternating confirmed pivots, three per boundary, spanning at least 15 bar intervals with no maximum span. These are configurable recognition settings, not universal definitions. The latest-N candidate strategy does not enumerate every possible historical pivot subset. Pivots require two strict neighbors on each side and become available two bars later. Flat means at most 0.5% of the six-touch mean price in fitted change over the formation; nonflat change must exceed that amount. Fit residual and whole-bar containment tolerance is 0.5% of that mean. Width must remain at least 2% of the mean at start, end and recognition. This reports a shape, not a breakout or trading signal.'})));
function resolveGeometryProfile(overrides={}){
 if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw new TypeError('profile must be an object');
 for(const key of Object.keys(overrides))if(!Object.hasOwn(GEOMETRY_PROFILE,key))throw new RangeError('Unknown geometry profile option: '+key);
 const p={...GEOMETRY_PROFILE,...overrides};
 for(const key of ['pivotRadius','minSpanBars'])if(!Number.isSafeInteger(p[key])||p[key]<1)throw new RangeError(key+' must be a positive safe integer');
 if(!Number.isSafeInteger(p.pivotCount)||p.pivotCount<4||p.pivotCount%2)throw new RangeError('pivotCount must be an even safe integer at least four');
 if(p.maxSpanBars!==null&&(!Number.isSafeInteger(p.maxSpanBars)||p.maxSpanBars<p.minSpanBars))throw new RangeError('maxSpanBars must be null or an integer at least minSpanBars');
 for(const key of ['priceTolerance','minWidthFraction','minContraction','maxChannelWidthDrift'])if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<0)throw new RangeError(key+' must be finite and nonnegative');
 if(p.minWidthFraction===0)throw new RangeError('minWidthFraction must be positive');
 if(p.minContraction>=1)throw new RangeError('minContraction must be less than one');
 if(p.candidateStrategy!=='latest_confirmed_alternating_pivots')throw new RangeError('Unsupported candidateStrategy; exhaustive historical subset search is not implemented');
 return Object.freeze(p);
}
function hash(s){let a=2166136261,b=2246822507;for(const c of s){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),3266489909);}return [a,b].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');}
function fit(points,origin){const xs=points.map(p=>p.index-origin),mx=xs.reduce((a,b)=>a+b)/xs.length,my=points.reduce((n,p)=>n+p.price,0)/points.length;let cov=0,den=0;points.forEach((p,i)=>{cov+=(xs[i]-mx)*(p.price-my);den+=(xs[i]-mx)**2;});const slope=cov/den,intercept=my-slope*mx;return {slope,intercept,origin};}
const at=(line,index)=>line.intercept+line.slope*(index-line.origin);
function classify(bars,pivots,known,p){
 const first=pivots[0].index,last=pivots.at(-1).index,span=last-first;
 if(span<p.minSpanBars||(p.maxSpanBars!==null&&span>p.maxSpanBars))return null;
 const highs=pivots.filter(v=>v.kind==='high'),lows=pivots.filter(v=>v.kind==='low');
 if(highs.length!==p.pivotCount/2||lows.length!==p.pivotCount/2)return null;
 const upper=fit(highs,first),lower=fit(lows,first),scale=pivots.reduce((n,v)=>n+v.price,0)/p.pivotCount,tolerance=scale*p.priceTolerance;
 if(highs.some(v=>Math.abs(v.price-at(upper,v.index))>tolerance)||lows.some(v=>Math.abs(v.price-at(lower,v.index))>tolerance))return null;
 const initialWidth=at(upper,first)-at(lower,first),finalWidth=at(upper,last)-at(lower,last),knownWidth=at(upper,known)-at(lower,known);
 if(initialWidth<scale*p.minWidthFraction||finalWidth<scale*p.minWidthFraction||knownWidth<scale*p.minWidthFraction)return null;
 // Reject bars outside the fitted formation, including the two bars needed to confirm its final pivot.
 for(let i=first;i<=known;i++)if(bars[i].high>at(upper,i)+tolerance||bars[i].low<at(lower,i)-tolerance)return null;
 const highChange=upper.slope*span,lowChange=lower.slope*span;
 const highFlat=Math.abs(highChange)<=tolerance,lowFlat=Math.abs(lowChange)<=tolerance;
 const contracting=finalWidth<=initialWidth*(1-p.minContraction);
 let id=null;
 if(contracting&&highFlat&&lowChange>tolerance&&lows.every((v,i)=>i===0||v.price>lows[i-1].price))id='ascendingtriangle';
 else if(contracting&&lowFlat&&highChange<-tolerance&&highs.every((v,i)=>i===0||v.price<highs[i-1].price))id='descendingtriangle';
 else if(contracting&&highChange<-tolerance&&lowChange>tolerance&&highs.every((v,i)=>i===0||v.price<highs[i-1].price)&&lows.every((v,i)=>i===0||v.price>lows[i-1].price))id='symmetricaltriangle';
 else if(Math.abs(finalWidth-initialWidth)<=initialWidth*p.maxChannelWidthDrift){
  if(highFlat&&lowFlat)id='horizontalchannel';
  else if(highChange>tolerance&&lowChange>tolerance)id='ascendingchannel';
  else if(highChange<-tolerance&&lowChange<-tolerance)id='descendingchannel';
 }
 if(!id)return null;
 return {id,upper,lower,scale,tolerance,initialWidth,finalWidth,highChange,lowChange};
}
function scanGeometryPatterns(bars,options={}){
 if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('options must be an object');
 for(const key of Object.keys(options))if(!['datasetId','symbol','timeframe','patternIds','profile'].includes(key))throw new RangeError('Unknown option: '+key);
 for(const key of ['datasetId','symbol','timeframe'])if(options[key]!==undefined&&(typeof options[key]!=='string'||!options[key]))throw new TypeError(key+' must be a nonempty string');
 const ids=options.patternIds===undefined?Object.keys(names):options.patternIds;if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw new TypeError('patternIds must be a unique array');
 if(ids.some(id=>!Object.hasOwn(names,id)))throw new RangeError('Unknown geometry pattern');
 const profile=resolveGeometryProfile(options.profile);
 validateBars(bars);
 const parameters={ruleVersion:GEOMETRY_VERSION,profile},configId=hash(JSON.stringify(parameters)),matches=[],pivots=[],emitted=new Set(),radius=profile.pivotRadius;
 for(let known=radius*2;known<bars.length;known++){
  const index=known-radius;let high=true,low=true;
  for(let k=index-radius;k<=known;k++)if(k!==index){if(bars[k].high>=bars[index].high)high=false;if(bars[k].low<=bars[index].low)low=false;}
  // Outside bars can be both extrema. Their intrabar order is unknown, so neither is used.
  if(high===low)continue;
  const kind=high?'high':'low',price=high?bars[index].high:bars[index].low,pivot={index,price,kind,confirmedAt:known},previous=pivots.at(-1);
  if(previous?.kind===kind){if(kind==='high'?price<=previous.price:price>=previous.price)continue;pivots[pivots.length-1]=pivot;}else pivots.push(pivot);
  if(pivots.length>profile.pivotCount)pivots.shift();if(pivots.length<profile.pivotCount)continue;
  const geometry=classify(bars,pivots,known,profile);if(!geometry||!ids.includes(geometry.id))continue;
  const signature=geometry.id+'|'+pivots.map(v=>v.index).join(',');if(emitted.has(signature))continue;emitted.add(signature);
  const start=pivots[0].index,end=pivots.at(-1).index,identity=[GEOMETRY_VERSION,configId,options.datasetId||'',options.symbol||'',options.timeframe||'',signature,bars[known].time].join('|');
  matches.push({id:hash(identity),patternId:geometry.id,name:names[geometry.id],category:'chart',direction:'neutral',startIndex:start,endIndex:end,confirmedIndex:known,startTime:bars[start].time,endTime:bars[end].time,confirmedBarTime:bars[known].time,availableAt:'after_confirmed_bar_close',ruleVersion:GEOMETRY_VERSION,configId,datasetId:options.datasetId??null,symbol:options.symbol??null,timeframe:options.timeframe??null,evidenceStatus:'detector_candidate',reviewStatus:'unreviewed',confirmation:'confirmed_pivot_shape',stage:'shape',breakoutConfirmed:false,recognitionSettings:profile,pivots:pivots.map(v=>({...v})),lines:[geometry.upper,geometry.lower].map((line,i)=>({role:i?'support':'resistance',from:{index:start,price:at(line,start)},to:{index:known,price:at(line,known)}})),measurements:{priceScale:geometry.scale,tolerance:geometry.tolerance,initialWidth:geometry.initialWidth,finalWidth:geometry.finalWidth,upperChange:geometry.highChange,lowerChange:geometry.lowChange}});
 }
 return {apiVersion:'1',libraryVersion:'0.8.2-pre.1',ruleVersion:GEOMETRY_VERSION,configId,parameters,barCount:bars.length,matches};
}

return {GEOMETRY_DEFINITIONS,GEOMETRY_PROFILE,scanGeometryPatterns};})(E.validateBars);
const R=((validateBars,{GAP_DEFINITIONS,GAP_PROFILE,scanGapPatterns},{GEOMETRY_DEFINITIONS,GEOMETRY_PROFILE,scanGeometryPatterns})=>{

const CHART_RESEARCH_VERSION='oc-chart-research-0.2.0';
const API_VERSION='1';
const PROFILE=Object.freeze({ruleVersion:CHART_RESEARCH_VERSION,gaps:GAP_PROFILE,geometry:GEOMETRY_PROFILE});
const definitions=[...GAP_DEFINITIONS,...GEOMETRY_DEFINITIONS];
if(new Set(definitions.map(d=>d.id)).size!==definitions.length)throw Error('Duplicate research definition IDs');
function listResearchDefinitions(){return definitions.map(d=>structuredClone(d));}

/** Separately versioned candidate engine. It does not inherit the candle-study results. */
function scanResearchCharts(bars,options={}){
 if(!options||typeof options!=='object'||Array.isArray(options))throw new TypeError('options must be an object');
 for(const key of Object.keys(options))if(!['datasetId','symbol','timeframe','patternIds','gapOptions','geometryProfile'].includes(key))throw new RangeError('Unknown research option: '+key);
 for(const key of ['datasetId','symbol','timeframe'])if(options[key]!==undefined&&(typeof options[key]!=='string'||!options[key]))throw new TypeError(key+' must be a nonempty string');
 for(const key of ['gapOptions','geometryProfile'])if(options[key]!==undefined&&(!options[key]||typeof options[key]!=='object'||Array.isArray(options[key])))throw new TypeError(key+' must be an object');
 for(const key of Object.keys(options.gapOptions||{}))if(!['minIslandBars','maxIslandBars','islandSelection'].includes(key))throw new RangeError('Unknown gap option: '+key);
 validateBars(bars);
 const ids=options.patternIds===undefined?definitions.map(d=>d.id):options.patternIds;
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new TypeError('patternIds must be unique strings');
 for(const id of ids)if(!definitions.some(d=>d.id===id))throw new RangeError('Unknown chart research pattern: '+id);
 const context=Object.fromEntries(['datasetId','symbol','timeframe'].filter(k=>options[k]!==undefined).map(k=>[k,options[k]]));
 const groups=[[GAP_DEFINITIONS,scanGapPatterns,options.gapOptions||{}],[GEOMETRY_DEFINITIONS,scanGeometryPatterns,options.geometryProfile===undefined?{}:{profile:options.geometryProfile}]],results=[];
 for(const [defs,scan,extra]of groups){const selected=ids.filter(id=>defs.some(d=>d.id===id));results.push(scan(selected.length?bars:[],{...context,...extra,patternIds:selected}));}
 const matches=results.flatMap(r=>r.matches).sort((a,b)=>a.confirmedIndex-b.confirmedIndex||a.startIndex-b.startIndex||a.patternId.localeCompare(b.patternId)||a.id.localeCompare(b.id));
 for(const m of matches){
  if(m.ruleVersion!==definitions.find(d=>d.id===m.patternId)?.ruleVersion||m.availableAt!=='after_confirmed_bar_close'||m.evidenceStatus!=='detector_candidate'||m.reviewStatus!=='unreviewed')throw Error('Research result contract mismatch');
  if(!Number.isInteger(m.startIndex)||!Number.isInteger(m.endIndex)||!Number.isInteger(m.confirmedIndex)||m.startIndex<0||m.startIndex>m.endIndex||m.endIndex>m.confirmedIndex||m.confirmedIndex>=bars.length)throw Error('Research timing contract mismatch');
  if(m.startTime!==bars[m.startIndex].time||m.endTime!==bars[m.endIndex].time||m.confirmedBarTime!==bars[m.confirmedIndex].time)throw Error('Research time alignment mismatch');
 }
 const parameters={ruleVersion:CHART_RESEARCH_VERSION,gaps:results[0].parameters,geometry:results[1].parameters};
 const configId=CHART_RESEARCH_VERSION+':'+results.map(r=>r.configId).join(':');
 return {apiVersion:API_VERSION,libraryVersion:'0.8.2-pre.1',ruleVersion:CHART_RESEARCH_VERSION,configId,parameters,barCount:bars.length,evidenceStatus:'research_candidates_not_performance_validation',matches};
}

return {scanResearchCharts};})(E.validateBars,G,P);
window.PatternScreenshotEngine={scanCandles:E.scanCandles,scanCharts:E.scanCharts,scanResearchCharts:R.scanResearchCharts};
})();
