(function(){'use strict';
  const ink='#293d32';
  const contrast=rgb=>rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>145?'#26382c':'#ffffff';
  function drawGrid(canvas,pattern,{cell=24,labels=true,beads=false,ironed=false,floating=true,tile=null}={}) {
    if(ironed)return BeadFinish.draw(canvas,pattern,{floating});
    const part=tile||{x:0,y:0,width:pattern.width,height:pattern.height};
    const margin=36;canvas.width=part.width*cell+margin*2;canvas.height=part.height*cell+margin*2;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<part.height;y++)for(let x=0;x<part.width;x++){
      const id=pattern.cells[(part.y+y)*pattern.width+part.x+x],px=margin+x*cell,py=margin+y*cell;
      if(id<0){ctx.fillStyle='#f3f5f2';ctx.fillRect(px,py,cell,cell);continue;}
      const color=pattern.palette[id];ctx.fillStyle=color.hex;
      if(beads){ctx.beginPath();ctx.arc(px+cell/2,py+cell/2,cell*.46,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#00000014';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='#ffffffa8';ctx.beginPath();ctx.arc(px+cell/2,py+cell/2,cell*.14,0,Math.PI*2);ctx.fill();}
      else{ctx.fillRect(px,py,cell,cell);if(labels){ctx.fillStyle=contrast(color.rgb);ctx.font=`500 ${Math.max(10,Math.round(cell*.5))}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(color.code,px+cell/2,py+cell/2);}}
    }
    if(!beads){for(let x=0;x<=part.width;x++){ctx.beginPath();ctx.strokeStyle=(part.x+x)%10===0?'#20362888':'#20362828';ctx.lineWidth=(part.x+x)%10===0?1.4:.6;ctx.moveTo(margin+x*cell,margin);ctx.lineTo(margin+x*cell,margin+part.height*cell);ctx.stroke();}for(let y=0;y<=part.height;y++){ctx.beginPath();ctx.strokeStyle=(part.y+y)%10===0?'#20362888':'#20362828';ctx.lineWidth=(part.y+y)%10===0?1.4:.6;ctx.moveTo(margin,margin+y*cell);ctx.lineTo(margin+part.width*cell,margin+y*cell);ctx.stroke();}}
    ctx.fillStyle='#6b7b6e';ctx.font='11px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
    for(let x=0;x<part.width;x++)if(x===0||(part.x+x+1)%5===0||x===part.width-1){ctx.fillText(String(part.x+x+1),margin+(x+.5)*cell,margin-14);ctx.fillText(String(part.x+x+1),margin+(x+.5)*cell,margin+part.height*cell+16);}
    for(let y=0;y<part.height;y++)if(y===0||(part.y+y+1)%5===0||y===part.height-1){ctx.fillText(String(part.y+y+1),margin-17,margin+(y+.5)*cell);ctx.fillText(String(part.y+y+1),margin+part.width*cell+17,margin+(y+.5)*cell);}
    return canvas;
  }
  function drawSheet(pattern,name) {
    const grid=drawGrid(document.createElement('canvas'),pattern,{cell:24,labels:true});
    const sheet=document.createElement('canvas');sheet.width=Math.max(840,grid.width+64);
    const cols=Math.max(2,Math.floor((sheet.width-64)/250));
    const legendRows=Math.ceil(pattern.palette.length/cols);
    sheet.height=grid.height+224+legendRows*50;
    const ctx=sheet.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,sheet.width,sheet.height);
    ctx.fillStyle=ink;ctx.font='bold 28px sans-serif';ctx.fillText('拼豆图纸生成器 · '+name.slice(0,35),32,45,sheet.width-64);
    ctx.font='16px sans-serif';ctx.fillText(`${pattern.width} × ${pattern.height} 格  /  ${pattern.total.toLocaleString('zh-CN')} 颗豆子  /  ${pattern.palette.length} 种颜色`,32,76);
    ctx.drawImage(grid,(sheet.width-grid.width)/2,100);
    const top=grid.height+132;ctx.font='bold 18px sans-serif';ctx.fillText('用色清单 · 每格 1 颗豆子',32,top);
    pattern.palette.forEach((color,i)=>{const x=32+(i%cols)*(sheet.width-64)/cols,y=top+22+Math.floor(i/cols)*50;ctx.fillStyle=color.hex;ctx.fillRect(x,y,29,29);ctx.strokeStyle='#bec9c0';ctx.strokeRect(x,y,29,29);ctx.fillStyle=ink;ctx.font='bold 15px sans-serif';ctx.fillText(`${color.code}  ${color.count.toLocaleString('zh-CN')} 颗`,x+40,y+13);ctx.fillStyle='#68786b';ctx.font='12px monospace';ctx.fillText(color.hex.toUpperCase(),x+40,y+30);});
    ctx.fillStyle='#68786b';ctx.font='13px sans-serif';ctx.fillText('C01 等为本图自定义编号，非品牌色号。对照实物色卡选豆；屏幕与打印颜色可能存在色差。',32,sheet.height-26,sheet.width-64);
    return sheet;
  }
  function download(pattern,name,status){
    if(!pattern||!pattern.total)return;
    status('正在准备高清 PNG 图纸…');
    try{const sheet=drawSheet(pattern,name);sheet.toBlob(blob=>{if(!blob){status('图片导出失败，请减少格数后再试。',true);return;}const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(name||'拼豆图纸').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'-拼豆图纸.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status('PNG 图纸已下载，包含编号网格与用色清单。');},'image/png');}catch{status('导出失败，请减少格数后再试。',true);}
  }
  async function print(pattern,name,status){
    if(!pattern||!pattern.total)return;
    const root=document.getElementById('print-root');root.replaceChildren();
    const page=document.createElement('section');page.className='print-page';
    const title=document.createElement('h1');title.textContent=name+' · 拼豆图纸';
    const summary=document.createElement('p');summary.textContent=`${pattern.width} × ${pattern.height} 格 · ${pattern.total.toLocaleString('zh-CN')} 颗豆子 · ${pattern.palette.length} 种颜色。每格 1 颗豆子，透明格留空。`;
    const note=document.createElement('p');note.textContent='C01 等为本图自定义编号，非品牌色号。请对照实物色卡选豆。后续页面按最多 40 列 × 50 行分块，按全图行列坐标衔接；图纸并非实体拼豆的 1:1 尺寸。打印彩色图例时请启用“背景图形”。';
    const list=document.createElement('div');list.className='print-colors';
    for(const c of pattern.palette){const item=document.createElement('div');const swatch=document.createElement('i');swatch.style.background=c.hex;const label=document.createElement('span');label.textContent=`${c.code} · ${c.count} 颗 (${c.hex})`;item.append(swatch,label);list.append(item);}page.append(title,summary,note,list);root.append(page);
    const parts=BeadCore.tiles(pattern.width,pattern.height);const images=[];
    parts.forEach((tile,i)=>{const section=document.createElement('section');section.className='print-page';const heading=document.createElement('p');heading.textContent=`${name.slice(0,40)} · 分块 ${i+1}/${parts.length} · 列 ${tile.x+1}–${tile.x+tile.width} / 行 ${tile.y+1}–${tile.y+tile.height}`;const canvas=drawGrid(document.createElement('canvas'),pattern,{cell:24,labels:true,tile});const img=new Image();img.alt=heading.textContent;img.src=canvas.toDataURL('image/png');img.style.width=(canvas.width/1032*185)+'mm';section.append(heading,img);root.append(section);images.push(img);});
    try{await Promise.all(images.map(img=>img.decode()));status(`已准备 ${parts.length+1} 页打印稿。可在打印窗口选择“另存为 PDF”。`);window.print();}catch{status('打印稿准备失败，请使用 PNG 下载。',true);}
  }
  window.BeadExport={drawGrid,drawSheet,download,print,contrast};
})();
