(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BeadCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function fitGrid(width, height, columns, maxRows = 160) {
    if (![width,height,columns,maxRows].every(n=>Number.isFinite(n) && n>0)) throw new RangeError('图片尺寸无效');
    const scale = Math.min(Math.round(columns)/width,maxRows/height);
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
  }
  const hex = rgb => '#' + rgb.map(n=>n.toString(16).padStart(2,'0')).join('');
  const distance = (a,b) => 3*(a[0]-b[0])**2+4*(a[1]-b[1])**2+2*(a[2]-b[2])**2;
  // OKLab matrices: https://bottosson.github.io/posts/oklab/ (public domain).
  // Decode each 8-bit sRGB channel once; the hot loops only compare cached Lab values.
  const linearRGB=Float64Array.from({length:256},(_,i)=>{
    const value=i/255;
    return value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4;
  });
  function toOklab(rgb) {
    const r=linearRGB[rgb[0]],g=linearRGB[rgb[1]],b=linearRGB[rgb[2]];
    const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
    const m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
    const s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
    return [0.2104542553*l+0.7936177850*m-0.0040720468*s,
      1.9779984951*l-2.4285922050*m+0.4505937099*s,
      0.0259040371*l+0.7827717662*m-0.8086757660*s];
  }
  function fromOklab(lab) {
    const [L,a,b]=lab;
    const l=(L+0.3963377774*a+0.2158037573*b)**3;
    const m=(L-0.1055613458*a-0.0638541728*b)**3;
    const s=(L-0.0894841775*a-1.2914855480*b)**3;
    return [4.0767416621*l-3.3077115913*m+0.2309699292*s,
      -1.2684380046*l+2.6097574011*m-0.3413193965*s,
      -0.0041960863*l-0.7034186147*m+1.7076147010*s].map(value=>{
      const encoded=value<=0.0031308?12.92*value:1.055*value**(1/2.4)-0.055;
      return Math.round(255*Math.max(0,Math.min(1,encoded)));
    });
  }
  // Mildly favor chroma fidelity so a lightness match does not turn muted green
  // into magenta gray. Use the same metric for clustering, bead lookup and cells.
  const labDistance=(a,b)=>(a[0]-b[0])**2+1.5*((a[1]-b[1])**2+(a[2]-b[2])**2);
  function perceptualColors(entries,maxColors,rounds=4) {
    let first=0;
    for(let i=1;i<entries.length;i++)if(entries[i].weight>entries[first].weight)first=i;
    const centers=[entries[first].lab.slice()];
    const errors=new Float64Array(entries.length).fill(Infinity);
    const seedWeights=entries.map(entry=>Math.sqrt(entry.weight));
    // Contrast-sensitive deterministic seeds can retain a small dark outline without
    // reserving a black slot in photos or inventing a color absent from the source.
    while(centers.length<maxColors) {
      const latest=centers[centers.length-1];
      let next=-1,best=0;
      for(let i=0;i<entries.length;i++) {
        errors[i]=Math.min(errors[i],labDistance(entries[i].lab,latest));
        const score=errors[i]*seedWeights[i];
        if(score>best){best=score;next=i;}
      }
      if(next<0)break;
      centers.push(entries[next].lab.slice());
    }
    // Bound CPU work for mobile devices. Histogram weights preserve pixel frequency.
    for(let round=0;round<rounds;round++) {
      const sums=centers.map(()=>[0,0,0,0]);
      for(const entry of entries) {
        let nearest=0,best=Infinity;
        for(let i=0;i<centers.length;i++) {
          const d=labDistance(entry.lab,centers[i]);
          if(d<best){best=d;nearest=i;}
        }
        const sum=sums[nearest];
        for(let c=0;c<3;c++)sum[c]+=entry.lab[c]*entry.weight;
        sum[3]+=entry.weight;
      }
      let movement=0;
      for(let i=0;i<centers.length;i++) {
        if(!sums[i][3])continue;
        const next=sums[i].slice(0,3).map(value=>value/sums[i][3]);
        movement+=labDistance(centers[i],next);
        centers[i]=next;
      }
      if(movement<1e-12)break;
    }
    return centers.map(fromOklab);
  }
  // CIELAB under the sRGB D65 reference white. All comparisons use this same
  // white point; no display brightness/saturation manipulation is applied.
  function toCielab(rgb) {
    const r=linearRGB[rgb[0]],g=linearRGB[rgb[1]],b=linearRGB[rgb[2]];
    const f=v=>v>216/24389?Math.cbrt(v):(24389/27*v+16)/116;
    const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047);
    const y=f(.2126729*r+.7151522*g+.072175*b);
    const z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);
    const a=500*(x-y),bb=200*(y-z);
    return [116*y-16,a,bb,Math.hypot(a,bb)];
  }
  // Squared CIEDE2000, kL=kC=kH=1; Sharma, Wu & Dalal (2005):
  // https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/
  // Squared distances avoid an unnecessary sqrt in every palette comparison.
  function deltaE2000(a,b) {
    const rad=Math.PI/180,c=(a[3]+b[3])/2,c7=c**7;
    const g=.5*(1-Math.sqrt(c7/(c7+6103515625)));
    const ap=(1+g)*a[1],bp=(1+g)*b[1];
    const ca=Math.hypot(ap,a[2]),cb=Math.hypot(bp,b[2]),cp=(ca+cb)/2;
    const ha=(Math.atan2(a[2],ap)/rad+360)%360,hb=(Math.atan2(b[2],bp)/rad+360)%360;
    let dh=hb-ha;if(ca*cb===0)dh=0;else if(dh>180)dh-=360;else if(dh<-180)dh+=360;
    let h=ha+hb;if(ca*cb!==0){if(Math.abs(ha-hb)<=180)h/=2;else h=(h+(h<360?360:-360))/2;}
    const l=(a[0]+b[0])/2,l50=(l-50)**2;
    const t=1-.17*Math.cos((h-30)*rad)+.24*Math.cos(2*h*rad)+.32*Math.cos((3*h+6)*rad)-.20*Math.cos((4*h-63)*rad);
    const dl=(b[0]-a[0])/(1+.015*l50/Math.sqrt(20+l50));
    const dc=(cb-ca)/(1+.045*cp),dH=2*Math.sqrt(ca*cb)*Math.sin(dh*rad/2)/(1+.015*cp*t);
    const cp7=cp**7,rt=-2*Math.sqrt(cp7/(cp7+6103515625))*Math.sin(60*Math.exp(-(((h-275)/25)**2))*rad);
    return Math.max(0,dl*dl+dc*dc+dH*dH+rt*dc*dH);
  }
  function fidelityGeneric(entries,maxColors) {
    if(entries.length<=maxColors)return entries.map(e=>e.rgb);
    function evaluate(colors,groups=false) {
      const values=colors.map(toCielab),sums=groups?colors.map(()=>[0,0,0,0]):null;
      let error=0;
      for(const entry of entries) {
        let best=Infinity,id=0;
        for(let j=0;j<values.length;j++){const d=deltaE2000(entry.cie,values[j]);if(d<best){best=d;id=j;}}
        error+=entry.weight*best;
        if(sums){const s=sums[id];for(let c=0;c<3;c++)s[c]+=entry.lab[c]*entry.weight;s[3]+=entry.weight;}
      }
      return {error,sums};
    }
    // Longer convergence reduces early-stop artifacts across every color budget.
    // Keep the previous starter if extra OKLab steps are worse under the final
    // CIEDE2000 matching metric. Never force a more saturated invented swatch.
    let colors=perceptualColors(entries,maxColors),best=evaluate(colors).error;
    const converged=perceptualColors(entries,maxColors,12),convergedError=evaluate(converged).error;
    if(convergedError<best){colors=converged;best=convergedError;}
    for(let round=0;round<3;round++) {
      const next=evaluate(colors,true).sums.map((s,i)=>s[3]?fromOklab(s.slice(0,3).map(v=>v/s[3])):colors[i]);
      const error=evaluate(next).error;
      if(error>=best-1e-9)break;
      colors=next;best=error;
    }
    return colors;
  }
  // Only the most recent catalog/source distance matrix is retained. Changing
  // the color budget or outline weights can reuse it; pixel counts, assignments
  // and chosen colors are always recomputed. New images never accumulate here.
  let fidelityDistanceCache=null;
  function fidelityCatalog(entries,catalog,maxColors,projected) {
    const seen=new Set(),candidates=[];
    for(const color of catalog.colors){const key=color.rgb.join(',');if(seen.has(key))continue;seen.add(key);candidates.push({...color,cie:toCielab(color.rgb)});}
    const n=entries.length,signature=candidates.map(c=>c.rgb.join(',')).join(';');
    let cached=fidelityDistanceCache;
    if(!cached||cached.signature!==signature||cached.keys.length!==n||entries.some((e,i)=>e.key!==cached.keys[i]))cached=fidelityDistanceCache=null;
    const distances=cached?cached.distances:[],nearest=cached?cached.nearest:new Uint16Array(n);
    // Compute the expensive metric once per unique source RGB/catalog pair.
    // 19,200 source colors × 291 beads remains below 23 MB, with no network/model.
    if(!cached){
      const lower=new Float64Array(n).fill(Infinity);
      for(let c=0;c<candidates.length;c++){
        const row=new Float32Array(n);
        for(let i=0;i<n;i++){const d=deltaE2000(entries[i].cie,candidates[c].cie);row[i]=d;if(d<lower[i]){lower[i]=d;nearest[i]=c;}}
        distances.push(row);
      }
      fidelityDistanceCache={signature,keys:Uint32Array.from(entries,e=>e.key),distances,nearest};
    }
    function score(indices){let result=0;for(let i=0;i<n;i++){let best=Infinity;for(const c of indices)best=Math.min(best,distances[c][i]);result+=entries[i].weight*best;}return result;}
    function fill(initial){
      const chosen=Array.from(new Set(initial)),selected=new Uint8Array(candidates.length),errors=new Float64Array(n).fill(Infinity);
      for(const c of chosen){selected[c]=1;for(let i=0;i<n;i++)errors[i]=Math.min(errors[i],distances[c][i]);}
      if(!chosen.length){let first=0,best=Infinity;for(let c=0;c<candidates.length;c++){let sum=0;for(let i=0;i<n;i++)sum+=entries[i].weight*distances[c][i];if(sum<best){best=sum;first=c;}}chosen.push(first);selected[first]=1;errors.set(distances[first]);}
      while(chosen.length<maxColors){
        let next=-1,best=0;
        for(let c=0;c<candidates.length;c++){if(selected[c])continue;let gain=0;for(let i=0;i<n;i++)if(distances[c][i]<errors[i])gain+=entries[i].weight*(errors[i]-distances[c][i]);if(gain>best){best=gain;next=c;}}
        if(next<0||best<=1e-9)break;
        chosen.push(next);selected[next]=1;for(let i=0;i<n;i++)errors[i]=Math.min(errors[i],distances[next][i]);
      }
      return chosen;
    }
    let chosen=Array.from(new Set(nearest));
    if(chosen.length>maxColors){
      chosen=fill([]);
      const starter=projected.map(rgb=>{const cie=toCielab(rgb);let id=0,best=Infinity;for(let c=0;c<candidates.length;c++){const d=deltaE2000(cie,candidates[c].cie);if(d<best){best=d;id=c;}}return id;});
      const alternate=fill(starter);if(score(alternate)<score(chosen))chosen=alternate;
      // Bounded palette swaps can escape local centroid choices. A candidate's
      // shared gain and per-removed-color penalty make each pass O(pixels×beads),
      // rather than multiplying that by the requested number of colors.
      for(let round=0;round<3;round++){
        const selected=new Set(chosen),first=new Float64Array(n).fill(Infinity),second=new Float64Array(n).fill(Infinity),owner=new Uint16Array(n);
        for(let j=0;j<chosen.length;j++)for(let i=0;i<n;i++){const d=distances[chosen[j]][i];if(d<first[i]){second[i]=first[i];first[i]=d;owner[i]=j;}else if(d<second[i])second[i]=d;}
        let bestGain=1e-8,replace=-1,add=-1;
        for(let c=0;c<candidates.length;c++){
          if(selected.has(c))continue;
          const penalties=new Float64Array(chosen.length);let shared=0;
          for(let i=0;i<n;i++){
            const d=distances[c][i],withOld=Math.min(d,first[i]),w=entries[i].weight;
            shared+=w*(first[i]-withOld);penalties[owner[i]]+=w*(Math.min(d,second[i])-withOld);
          }
          for(let j=0;j<chosen.length;j++){const gain=shared-penalties[j];if(gain>bestGain){bestGain=gain;replace=j;add=c;}}
        }
        if(replace<0)break;
        const next=chosen.slice();next[replace]=add;if(score(next)>=score(chosen)-1e-8)break;chosen=next;
      }
    }
    chosen.sort((a,b)=>a-b);
    // Reuse the matrix for final cells; doubles resolve near ties deterministically.
    for(let i=0;i<n;i++){
      let best=Infinity,id=chosen[0];
      for(const c of chosen){const d=distances[c][i];if(d<best){best=d;id=c;}}
      for(const c of chosen)if(c!==id&&Math.abs(distances[c][i]-best)<=1e-5*Math.max(1,best)){
        const d=deltaE2000(entries[i].cie,candidates[c].cie),current=deltaE2000(entries[i].cie,candidates[id].cie);if(d<current||d===current&&c<id)id=c;
      }
      entries[i].matchedCode=candidates[id].code;
    }
    return chosen.map(i=>({code:candidates[i].code,rgb:candidates[i].rgb.slice(),hex:hex(candidates[i].rgb)}));
  }
  function constrainedColors(entries,catalog,maxColors,projectedColors) {
    // Optimize the colors that can actually be bought. Snapping independently
    // quantized centers to a bead catalog can collapse several useful shades.
    // Equal reference RGB values always keep the first manufacturer's code.
    const seen=new Set(),candidates=[];
    for(const color of catalog.colors) {
      const key=color.rgb.join(',');
      if(seen.has(key))continue;
      seen.add(key);candidates.push({...color,lab:toOklab(color.rgb)});
    }
    const count=entries.length,distances=[],nearest=new Uint32Array(count);
    const lower=new Float64Array(count).fill(Infinity);
    for(let c=0;c<candidates.length;c++) {
      // At the maximum grid and MARD 291 this cache uses less than 23 MB.
      // Full-precision comparisons below choose the final result and exact ties.
      const row=new Float32Array(count);
      for(let i=0;i<count;i++) {
        const d=labDistance(entries[i].lab,candidates[c].lab);
        row[i]=d;
        if(d<lower[i]){lower[i]=d;nearest[i]=c;}
      }
      distances.push(row);
    }
    const needed=Array.from(new Set(nearest));
    function result(indices) {
      return indices.slice().sort((a,b)=>a-b).map(i=>{
        const c=candidates[i];return {code:c.code,rgb:c.rgb.slice(),hex:hex(c.rgb)};
      });
    }
    // No reduction is necessary when every source color's closest real bead
    // fits the budget, even if the source contains thousands of unique RGBs.
    if(needed.length<=maxColors)return result(needed);
    function closest(lab) {
      let best=Infinity,id=0;
      for(let c=0;c<candidates.length;c++) {
        const d=labDistance(lab,candidates[c].lab);
        if(d<best){best=d;id=c;}
      }
      return id;
    }
    function score(indices) {
      let sum=0;
      for(const entry of entries) {
        let best=Infinity;
        for(const c of indices)best=Math.min(best,labDistance(entry.lab,candidates[c].lab));
        sum+=entry.weight*best;
      }
      return sum;
    }
    function fill(initial) {
      const indices=Array.from(new Set(initial)),selected=new Uint8Array(candidates.length);
      const errors=new Float64Array(count).fill(Infinity);
      for(const c of indices) {
        selected[c]=1;
        for(let i=0;i<count;i++)errors[i]=Math.min(errors[i],distances[c][i]);
      }
      if(!indices.length) {
        let first=0,best=Infinity;
        for(let c=0;c<candidates.length;c++) {
          let sum=0;
          for(let i=0;i<count;i++)sum+=entries[i].weight*distances[c][i];
          if(sum<best){best=sum;first=c;}
        }
        indices.push(first);selected[first]=1;errors.set(distances[first]);
      }
      while(indices.length<maxColors) {
        let next=-1,gain=0;
        for(let c=0;c<candidates.length;c++) {
          if(selected[c])continue;
          let improvement=0;
          const row=distances[c];
          for(let i=0;i<count;i++)if(row[i]<errors[i])improvement+=entries[i].weight*(errors[i]-row[i]);
          if(improvement>gain){gain=improvement;next=c;}
        }
        if(next<0||gain<=1e-12)break;
        indices.push(next);selected[next]=1;
        for(let i=0;i<count;i++)errors[i]=Math.min(errors[i],distances[next][i]);
      }
      return indices;
    }
    let chosen=fill([]),bestScore=score(chosen);
    // A bounded constrained Lloyd pass relocates a greedy starter color that
    // became redundant after more colors were added. Refill collapsed slots.
    for(let round=0;round<2;round++) {
      const sums=chosen.map(()=>[0,0,0,0]);
      for(let i=0;i<count;i++) {
        let id=0,best=Infinity;
        for(let j=0;j<chosen.length;j++) {
          const d=labDistance(entries[i].lab,candidates[chosen[j]].lab);
          if(d<best){best=d;id=j;}
        }
        const sum=sums[id],entry=entries[i];
        for(let c=0;c<3;c++)sum[c]+=entry.lab[c]*entry.weight;
        sum[3]+=entry.weight;
      }
      const next=fill(sums.filter(sum=>sum[3]>0).map(sum=>closest(sum.slice(0,3).map(n=>n/sum[3]))));
      const nextScore=score(next);
      if(nextScore>=bestScore-1e-12)break;
      chosen=next;bestScore=nextScore;
    }
    // Greedy selection is not globally optimal. Preserve the previous solution
    // if it has lower total error, while filling any slots lost to its snapping.
    const baseline=Array.from(new Set(projectedColors.map(rgb=>closest(toOklab(rgb)))));
    if(score(baseline)<bestScore)chosen=fill(baseline);
    return result(chosen);
  }
  function quantize(data,width,height,{maxColors=16,transparent=true,catalog=null,quality='legacy',importance=null}={}) {
    if (!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>19200||data.length!==width*height*4) throw new RangeError('像素数据或图纸尺寸无效');
    if (!Number.isInteger(maxColors)||maxColors<1||maxColors>64) throw new RangeError('颜色数量无效');
    if(importance!==null&&(!importance||importance.length!==width*height||Array.from(importance).some(n=>!Number.isFinite(n)||n<1||n>3)))throw new RangeError('颜色重要性权重无效');
    if (catalog && (!Array.isArray(catalog.colors)||!catalog.colors.length||catalog.colors.some(c=>!c.code||!Array.isArray(c.rgb)||c.rgb.length!==3||c.rgb.some(n=>!Number.isInteger(n)||n<0||n>255)))) throw new RangeError('色卡数据无效');
    const paletteInfo=catalog?{paletteId:catalog.id,paletteName:catalog.name}:{paletteId:'generic',paletteName:'通用配色'};
    const pixels=[], histogram=new Map();
    for(let i=0;i<data.length;i+=4) {
      const alpha=data[i+3];
      if(transparent && alpha<128) {pixels.push(null); continue;}
      // A bead is opaque: retained transparent-image pixels use their own RGB.
      // White compositing is only appropriate when a white background is wanted.
      const rgb=[0,1,2].map(k=>transparent?data[i+k]:Math.round((data[i+k]*alpha+255*(255-alpha))/255));
      const key=rgb[0]*65536+rgb[1]*256+rgb[2];
      pixels.push(rgb);
      const weight=importance===null?1:importance[i/4];
      if(histogram.has(key)) histogram.get(key).weight+=weight;
      else histogram.set(key,{rgb,weight,key});
    }
    const entries=Array.from(histogram.values()).sort((a,b)=>a.key-b.key);
    if(!entries.length) return {width,height,cells:pixels.map(()=>-1),palette:[],total:0,...paletteInfo};
    const fidelity=quality==='fidelity',perceptual=quality==='perceptual'||fidelity;
    const colorDistance=fidelity?deltaE2000:perceptual?labDistance:distance;
    if(perceptual)for(const entry of entries)entry.lab=toOklab(entry.rgb);
    if(fidelity)for(const entry of entries)entry.cie=toCielab(entry.rgb);
    function box(items) {
      const ranges=[0,1,2].map(c=>Math.max(...items.map(x=>x.rgb[c]))-Math.min(...items.map(x=>x.rgb[c])));
      const channel=ranges.indexOf(Math.max(...ranges));
      const weight=items.reduce((n,x)=>n+x.weight,0);
      return {items,channel,weight,score:ranges[channel]*Math.sqrt(weight)};
    }
    let colors;
    if(entries.length<=maxColors) colors=entries.map(x=>x.rgb);
    else if(fidelity&&!catalog)colors=fidelityGeneric(entries,maxColors);
    else if(perceptual) colors=perceptualColors(entries,maxColors);
    else {
      const boxes=[box(entries)];
      while(boxes.length<maxColors) {
        let index=-1;
        boxes.forEach((b,i)=>{if(b.items.length>1 && (index<0||b.score>boxes[index].score)) index=i;});
        if(index<0) break;
        const current=boxes.splice(index,1)[0];
        const sorted=current.items.slice().sort((a,b)=>a.rgb[current.channel]-b.rgb[current.channel]||a.key-b.key);
        let sum=0,cut=1;
        for(let i=0;i<sorted.length-1;i++){sum+=sorted[i].weight;cut=i+1;if(sum>=current.weight/2)break;}
        boxes.push(box(sorted.slice(0,cut)),box(sorted.slice(cut)));
      }
      colors=boxes.map(b=>[0,1,2].map(c=>Math.round(b.items.reduce((s,x)=>s+x.rgb[c]*x.weight,0)/b.weight)));
    }
    let selected=colors.map(rgb=>({rgb,hex:hex(rgb)}));
    const catalogValues=perceptual&&catalog?catalog.colors.map(c=>toOklab(c.rgb)):null;
    if(catalog&&fidelity)selected=fidelityCatalog(entries,catalog,maxColors,colors);
    else if(catalog&&perceptual)selected=constrainedColors(entries,catalog,maxColors,colors);
    else if(catalog) selected=colors.map(rgb=>{
      let nearest=catalog.colors[0],best=Infinity;
      const value=perceptual?toOklab(rgb):rgb;
      for(let i=0;i<catalog.colors.length;i++){
        const color=catalog.colors[i];
        const d=colorDistance(perceptual?catalogValues[i]:color.rgb,value);
        if(d<best){best=d;nearest=color;}
      }
      return {code:nearest.code,rgb:nearest.rgb.slice(),hex:hex(nearest.rgb)};
    });
    selected=Array.from(new Map(selected.map(c=>[c.code||c.hex,c])).values());
    colors=selected.map(c=>c.rgb);
    const colorValues=fidelity?colors.map(toCielab):perceptual?colors.map(toOklab):colors;
    const selectedCodes=fidelity&&catalog?new Map(selected.map((c,i)=>[c.code,i])):null;
    const counts=colors.map(()=>0),cache=new Map();
    const cells=pixels.map(rgb=>{
      if(!rgb) return -1;
      const key=rgb[0]*65536+rgb[1]*256+rgb[2];
      let nearest=cache.get(key);
      if(nearest===undefined){
        let best=Infinity;
        const entry=histogram.get(key),value=fidelity?entry.cie:perceptual?entry.lab:rgb;
        if(selectedCodes)nearest=selectedCodes.get(entry.matchedCode);
        else colorValues.forEach((color,i)=>{const d=colorDistance(color,value);if(d<best){best=d;nearest=i;}});
        cache.set(key,nearest);
      }
      counts[nearest]++;return nearest;
    });
    const sorted=selected.map((color,i)=>({...color,count:counts[i],old:i})).filter(c=>c.count>0).sort((a,b)=>b.count-a.count||a.hex.localeCompare(b.hex));
    const remap=new Map(sorted.map((c,i)=>[c.old,i]));
    return {width,height,cells:cells.map(i=>i<0?-1:remap.get(i)),palette:sorted.map((c,i)=>({code:c.code||'C'+String(i+1).padStart(2,'0'),hex:c.hex,rgb:c.rgb,count:c.count})),total:counts.reduce((s,n)=>s+n,0),...paletteInfo};
  }
  function tiles(width,height,columns=40,rows=50) {
    if(![width,height,columns,rows].every(n=>Number.isInteger(n)&&n>0)) throw new RangeError('分块尺寸无效');
    const result=[];
    for(let y=0;y<height;y+=rows)for(let x=0;x<width;x+=columns)result.push({x,y,width:Math.min(columns,width-x),height:Math.min(rows,height-y)});
    return result;
  }
  return {fitGrid,quantize,tiles};
});
