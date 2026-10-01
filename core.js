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
  function perceptualColors(entries,maxColors) {
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
    for(let round=0;round<4;round++) {
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
  function quantize(data,width,height,{maxColors=16,transparent=true,catalog=null,quality='legacy'}={}) {
    if (!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>19200||data.length!==width*height*4) throw new RangeError('像素数据或图纸尺寸无效');
    if (!Number.isInteger(maxColors)||maxColors<1||maxColors>64) throw new RangeError('颜色数量无效');
    if (catalog && (!Array.isArray(catalog.colors)||!catalog.colors.length||catalog.colors.some(c=>!c.code||!Array.isArray(c.rgb)||c.rgb.length!==3||c.rgb.some(n=>!Number.isInteger(n)||n<0||n>255)))) throw new RangeError('色卡数据无效');
    const paletteInfo=catalog?{paletteId:catalog.id,paletteName:catalog.name}:{paletteId:'generic',paletteName:'通用配色'};
    const pixels=[], histogram=new Map();
    for(let i=0;i<data.length;i+=4) {
      const alpha=data[i+3];
      if(transparent && alpha<128) {pixels.push(null); continue;}
      const rgb=[0,1,2].map(k=>Math.round((data[i+k]*alpha+255*(255-alpha))/255));
      const key=rgb[0]*65536+rgb[1]*256+rgb[2];
      pixels.push(rgb);
      if(histogram.has(key)) histogram.get(key).weight++;
      else histogram.set(key,{rgb,weight:1,key});
    }
    const entries=Array.from(histogram.values()).sort((a,b)=>a.key-b.key);
    if(!entries.length) return {width,height,cells:pixels.map(()=>-1),palette:[],total:0,...paletteInfo};
    const perceptual=quality==='perceptual';
    const colorDistance=perceptual?labDistance:distance;
    if(perceptual)for(const entry of entries)entry.lab=toOklab(entry.rgb);
    function box(items) {
      const ranges=[0,1,2].map(c=>Math.max(...items.map(x=>x.rgb[c]))-Math.min(...items.map(x=>x.rgb[c])));
      const channel=ranges.indexOf(Math.max(...ranges));
      const weight=items.reduce((n,x)=>n+x.weight,0);
      return {items,channel,weight,score:ranges[channel]*Math.sqrt(weight)};
    }
    let colors;
    if(entries.length<=maxColors) colors=entries.map(x=>x.rgb);
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
    if(catalog) selected=colors.map(rgb=>{
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
    const colorValues=perceptual?colors.map(toOklab):colors;
    const counts=colors.map(()=>0),cache=new Map();
    const cells=pixels.map(rgb=>{
      if(!rgb) return -1;
      const key=rgb[0]*65536+rgb[1]*256+rgb[2];
      let nearest=cache.get(key);
      if(nearest===undefined){
        let best=Infinity;
        const value=perceptual?histogram.get(key).lab:rgb;
        colorValues.forEach((color,i)=>{const d=colorDistance(color,value);if(d<best){best=d;nearest=i;}});
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
