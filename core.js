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
  function quantize(data,width,height,{maxColors=16,transparent=true,catalog=null}={}) {
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
    function box(items) {
      const ranges=[0,1,2].map(c=>Math.max(...items.map(x=>x.rgb[c]))-Math.min(...items.map(x=>x.rgb[c])));
      const channel=ranges.indexOf(Math.max(...ranges));
      const weight=items.reduce((n,x)=>n+x.weight,0);
      return {items,channel,weight,score:ranges[channel]*Math.sqrt(weight)};
    }
    let colors;
    if(entries.length<=maxColors) colors=entries.map(x=>x.rgb);
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
    if(catalog) selected=colors.map(rgb=>{
      let nearest=catalog.colors[0],best=Infinity;
      for(const color of catalog.colors){const d=distance(color.rgb,rgb);if(d<best){best=d;nearest=color;}}
      return {code:nearest.code,rgb:nearest.rgb.slice(),hex:hex(nearest.rgb)};
    });
    selected=Array.from(new Map(selected.map(c=>[c.code||c.hex,c])).values());
    colors=selected.map(c=>c.rgb);
    const counts=colors.map(()=>0),cache=new Map();
    const cells=pixels.map(rgb=>{
      if(!rgb) return -1;
      const key=rgb[0]*65536+rgb[1]*256+rgb[2];
      let nearest=cache.get(key);
      if(nearest===undefined){let best=Infinity;colors.forEach((color,i)=>{const d=distance(color,rgb);if(d<best){best=d;nearest=i;}});cache.set(key,nearest);}
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
