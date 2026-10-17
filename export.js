(function(){'use strict';
  const ink='#293d32';
  const gridCell=24,gridMargin=48;
  const contrast=rgb=>rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>145?'#26382c':'#ffffff';
  function paletteInfo(pattern){
    const extended=pattern.paletteId==='mard291';
    const mard=pattern.paletteId==='mard221'||extended;
    return {
      name:mard?(pattern.paletteName||(extended?'MARD 291 色':'MARD 221 色')):(pattern.paletteId==='generic'?(pattern.paletteName||'通用配色'):'通用配色'),
      note:extended?'MARD 291 为社区扩展色卡，含特殊豆；请按实物选豆，透明／珠光等材质仅以参考颜色预览。':mard?'MARD 色号来自社区色卡；屏幕与打印颜色仅供参考，实物豆子可能有色差。':'C01 等为本图自定义编号，非品牌色号。对照实物色卡选豆；屏幕与打印颜色可能存在色差。'
    };
  }
  function purchaseText(pattern,{pitchMm=2.6,format='lines'}={}){
    if(!pattern||!(pattern.total>0)||!['mard221','mard291'].includes(pattern.paletteId))return '';
    const colors=(pattern.palette||[]).filter(color=>Number.isSafeInteger(color.count)&&color.count>0)
      .slice().sort((a,b)=>a.code.localeCompare(b.code,'en',{numeric:true}));
    if(!colors.length)return '';
    if(format==='codes')return colors.map(color=>color.code).join(' ');
    const pitch=Number.isFinite(pitchMm)&&pitchMm>0?pitchMm:2.6;
    const total=colors.reduce((sum,color)=>sum+color.count,0);
    const palette=pattern.paletteId==='mard291'?'MARD 291 色':'MARD 221 色';
    const items=colors.map(color=>`${color.code} × ${color.count} 颗`);
    return [
      '拼豆采购清单',
      `色卡：${palette}`,
      `规格/格距：${pitch} 毫米（当前设置，请向商家确认规格）`,
      '',
      items.join(format==='compact'?'，':'\n'),
      '',
      `合计：${colors.length} 种颜色，${total} 颗`,
      '数量按当前图纸用量计算，未加备用量，未扣已有库存。',
      '请向商家确认品牌、规格、色号和每包数量，再按包装购买。'
    ].join('\n');
  }
  function downloadPurchase(pattern,options={},status=()=>{}){
    const text=purchaseText(pattern,options);
    if(!text){status('请先生成有豆子的 MARD 图纸，再导出采购清单。',true);return false;}
    let url,link;
    try{
      const blob=new Blob(['\uFEFF',text.replace(/\n/g,'\r\n')],{type:'text/plain;charset=utf-8'});
      url=URL.createObjectURL(blob);link=document.createElement('a');
      link.href=url;link.download='拼豆采购清单.txt';
      document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      status('已发起 TXT 采购清单下载，可发送给商家确认。');return true;
    }catch{
      if(link)link.remove();if(url)URL.revokeObjectURL(url);
      status('TXT 下载失败，请使用复制清单，或手动复制预览文字。',true);return false;
    }
  }
  function drawGrid(canvas,pattern,{cell=gridCell,labels=true,beads=false,ironed=false,floating=true,tile=null}={}) {
    if(ironed)return BeadFinish.draw(canvas,pattern,{floating});
    const part=tile||{x:0,y:0,width:pattern.width,height:pattern.height};
    const margin=gridMargin;canvas.width=part.width*cell+margin*2;canvas.height=part.height*cell+margin*2;
    canvas.beadGeometry={width:canvas.width,height:canvas.height,cell,originX:margin,originY:margin};
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<part.height;y++)for(let x=0;x<part.width;x++){
      const id=pattern.cells[(part.y+y)*pattern.width+part.x+x],px=margin+x*cell,py=margin+y*cell;
      if(id<0){ctx.fillStyle='#f3f5f2';ctx.fillRect(px,py,cell,cell);continue;}
      const color=pattern.palette[id];ctx.fillStyle=color.hex;
      if(beads){ctx.beginPath();ctx.arc(px+cell/2,py+cell/2,cell*.46,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#00000014';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#ffffffa8';ctx.beginPath();ctx.arc(px+cell/2,py+cell/2,cell*.14,0,Math.PI*2);ctx.fill();}
      else{ctx.fillRect(px,py,cell,cell);if(labels){ctx.fillStyle=contrast(color.rgb);ctx.font=`500 ${Math.max(10,Math.round(cell*.5))}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(color.code,px+cell/2,py+cell/2);}}
    }
    if(!beads){for(let x=0;x<=part.width;x++){ctx.beginPath();ctx.strokeStyle=(part.x+x)%10===0?'#20362888':'#20362828';ctx.lineWidth=(part.x+x)%10===0?1.4:.6;ctx.moveTo(margin+x*cell,margin);ctx.lineTo(margin+x*cell,margin+part.height*cell);ctx.stroke();}for(let y=0;y<=part.height;y++){ctx.beginPath();ctx.strokeStyle=(part.y+y)%10===0?'#20362888':'#20362828';ctx.lineWidth=(part.y+y)%10===0?1.4:.6;ctx.moveTo(margin,margin+y*cell);ctx.lineTo(margin+part.width*cell,margin+y*cell);ctx.stroke();}}
    // Dedicated coordinate strips keep every row/column aligned with its cell.
    const right=margin+part.width*cell,bottom=margin+part.height*cell;
    ctx.strokeStyle='#b4c3b8';ctx.lineWidth=1;
    ctx.strokeRect(margin,margin-30,part.width*cell,30);
    ctx.strokeRect(margin,bottom,part.width*cell,30);
    ctx.strokeRect(margin-40,margin,40,part.height*cell);
    ctx.strokeRect(right,margin,40,part.height*cell);
    ctx.beginPath();
    for(let x=0;x<=part.width;x++){const px=margin+x*cell,tick=(part.x+x)%10===0?9:5;ctx.moveTo(px,margin);ctx.lineTo(px,margin-tick);ctx.moveTo(px,bottom);ctx.lineTo(px,bottom+tick);}
    for(let y=0;y<=part.height;y++){const py=margin+y*cell,tick=(part.y+y)%10===0?9:5;ctx.moveTo(margin,py);ctx.lineTo(margin-tick,py);ctx.moveTo(right,py);ctx.lineTo(right+tick,py);}
    ctx.stroke();
    ctx.fillStyle='#20382b';ctx.font=`700 ${Math.max(10,Math.min(18,Math.round(cell*.58)))}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(let x=0;x<part.width;x++){const value=String(part.x+x+1),px=margin+(x+.5)*cell;ctx.fillText(value,px,margin-15,Math.max(1,cell-2));ctx.fillText(value,px,bottom+15,Math.max(1,cell-2));}
    for(let y=0;y<part.height;y++){const value=String(part.y+y+1),py=margin+(y+.5)*cell;ctx.fillText(value,margin-20,py,36);ctx.fillText(value,right+20,py,36);}
    ctx.font='600 11px "Microsoft YaHei",sans-serif';
    ctx.fillText('列 →',margin+14,9,36);ctx.fillText('行 ↓',margin-20,margin-15,36);
    return canvas;
  }
  function drawSheet(pattern,name) {
    const palette=paletteInfo(pattern);
    const grid=drawGrid(document.createElement('canvas'),pattern,{cell:gridCell,labels:true});
    const sheet=document.createElement('canvas');sheet.width=Math.max(840,grid.width+64);
    const cols=Math.max(2,Math.floor((sheet.width-64)/250));
    const legendRows=Math.ceil(pattern.palette.length/cols);
    sheet.height=grid.height+288+legendRows*50;
    const ctx=sheet.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,sheet.width,sheet.height);
    ctx.fillStyle=ink;ctx.font='bold 28px sans-serif';ctx.fillText('拼豆图纸生成器 · '+name.slice(0,35),32,45,sheet.width-64);
    ctx.font='16px sans-serif';ctx.fillText(`横向 ${pattern.width} 格 × 纵向 ${pattern.height} 格  /  ${pattern.total.toLocaleString('zh-CN')} 颗豆子  /  ${pattern.palette.length} 种颜色`,32,76);
    ctx.drawImage(grid,(sheet.width-grid.width)/2,100);
    ctx.font='bold 22px sans-serif';ctx.fillText(`横向 ${pattern.width} 格 × 纵向 ${pattern.height} 格`,32,grid.height+132);
    ctx.fillStyle='#68786b';ctx.font='15px sans-serif';ctx.fillText('选板按整张图格数（含留空）预留；请核对拼板实际孔位数。',32,grid.height+158,sheet.width-64);
    const top=grid.height+196;ctx.fillStyle=ink;ctx.font='bold 18px sans-serif';ctx.fillText(`用色清单 · ${palette.name} · 每格 1 颗豆子`,32,top);
    pattern.palette.forEach((color,i)=>{const x=32+(i%cols)*(sheet.width-64)/cols,y=top+22+Math.floor(i/cols)*50;ctx.fillStyle=color.hex;ctx.fillRect(x,y,29,29);ctx.strokeStyle='#bec9c0';ctx.strokeRect(x,y,29,29);ctx.fillStyle=ink;ctx.font='bold 15px sans-serif';ctx.fillText(`${color.code}  ${color.count.toLocaleString('zh-CN')} 颗`,x+40,y+13);ctx.fillStyle='#68786b';ctx.font='12px monospace';ctx.fillText(color.hex.toUpperCase(),x+40,y+30);});
    ctx.fillStyle='#68786b';ctx.font='13px sans-serif';ctx.fillText(palette.note,32,sheet.height-26,sheet.width-64);
    return sheet;
  }
  function download(pattern,name,status){
    if(!pattern||!pattern.total)return;
    status('正在准备高清 PNG 图纸…');
    try{const sheet=drawSheet(pattern,name);sheet.toBlob(blob=>{if(!blob){status('图片导出失败，请减少格数后再试。',true);return;}const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(name||'拼豆图纸').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'-拼豆图纸.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status('PNG 图纸已下载，包含编号网格与用色清单。');},'image/png');}catch{status('导出失败，请减少格数后再试。',true);}
  }
  function printLegend(pattern){
    const legend=document.createElement('section');legend.className='print-legend';
    const heading=document.createElement('h2');heading.textContent=`全部用色 · ${paletteInfo(pattern).name} · 共 ${pattern.palette.length} 色 / ${pattern.total.toLocaleString('zh-CN')} 颗`;
    const list=document.createElement('div');list.className='print-legend-colors';
    for(const color of pattern.palette.slice().sort((a,b)=>a.code.localeCompare(b.code,'en',{numeric:true}))){
      const item=document.createElement('div');
      const swatch=document.createElement('i');swatch.style.background=color.hex;
      const code=document.createElement('strong');code.textContent=color.code;
      const count=document.createElement('span');count.textContent=`${color.count.toLocaleString('zh-CN')} 颗`;
      item.append(swatch,code,count);list.append(item);
    }
    const note=document.createElement('p');note.textContent='以上为整图总用量（未加备用豆），各页重复列出，请勿逐页累加。';
    legend.append(heading,list,note);return legend;
  }
  async function print(pattern,name,status){
    if(!pattern||!pattern.total)return;
    const palette=paletteInfo(pattern);
    const root=document.getElementById('print-root');root.replaceChildren();
    const page=document.createElement('section');page.className='print-page';
    const title=document.createElement('h1');title.textContent=name+' · 拼豆图纸';
    const summary=document.createElement('p');summary.textContent=`整图：横向 ${pattern.width} 格 × 纵向 ${pattern.height} 格 · ${pattern.total.toLocaleString('zh-CN')} 颗豆子 · ${pattern.palette.length} 种颜色 · ${palette.name}。每格 1 颗豆子，透明格留空。`;
    const note=document.createElement('p');note.textContent=palette.note+'选板按整张图格数（含留空）预留，请核对拼板实际孔位数。后续页面按最多 40 列 × 40 行分块，每页图纸下方附整图完整用色表；按全图行列坐标衔接，图纸并非实体拼豆的 1:1 尺寸。打印彩色图例时请启用“背景图形”。';
    const list=document.createElement('div');list.className='print-colors';
    for(const c of pattern.palette){const item=document.createElement('div');const swatch=document.createElement('i');swatch.style.background=c.hex;const label=document.createElement('span');label.textContent=`${c.code} · ${c.count} 颗 (${c.hex})`;item.append(swatch,label);list.append(item);}page.append(title,summary,note,list);root.append(page);
    // Keep the cell scale, but reserve A4 space for all 32 possible colors on every tile.
    const parts=BeadCore.tiles(pattern.width,pattern.height,40,40);const images=[];
    parts.forEach((tile,i)=>{const section=document.createElement('section');section.className='print-page print-pattern-page';const heading=document.createElement('p');heading.className='print-tile-heading';heading.textContent=`${name.slice(0,40)} · 分块 ${i+1}/${parts.length} · 列 ${tile.x+1}–${tile.x+tile.width} / 行 ${tile.y+1}–${tile.y+tile.height}`;const canvas=drawGrid(document.createElement('canvas'),pattern,{cell:gridCell,labels:true,tile});const img=new Image();img.alt=heading.textContent;img.src=canvas.toDataURL('image/png');img.style.width=(canvas.width/(40*gridCell+2*gridMargin)*185)+'mm';const footer=document.createElement('p');footer.className='print-board-summary';footer.textContent=`整图：横向 ${pattern.width} 格 × 纵向 ${pattern.height} 格（含留空）；本块：横向 ${tile.width} 格 × 纵向 ${tile.height} 格。选板请按整图格数核对。`;section.append(heading,img,footer,printLegend(pattern));root.append(section);images.push(img);});
    try{await Promise.all(images.map(img=>img.decode()));status(`已准备 ${parts.length+1} 页打印稿。可在打印窗口选择“另存为 PDF”。`);window.print();}catch{status('打印稿准备失败，请使用 PNG 下载。',true);}
  }
  window.BeadExport={drawGrid,drawSheet,download,print,contrast,purchaseText,downloadPurchase};
})();
