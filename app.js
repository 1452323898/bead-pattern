(function(){'use strict';
  const $=id=>document.getElementById(id);
  const state={source:null,working:null,pattern:null,name:'拼豆图纸',view:'pattern',floating:true,zoom:1,fit:true,loadId:0,busy:false};
  const number=n=>n.toLocaleString('zh-CN');
  function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
  function updateControls(){const ready=!!state.pattern&&state.pattern.total>0;['download-btn','print-btn'].forEach(id=>$(id).disabled=!ready||state.busy);['zoom-in','zoom-out','zoom-fit'].forEach(id=>$(id).disabled=!state.pattern||state.view==='original');$('generate-btn').disabled=!state.source||state.busy;$('show-labels').disabled=state.view!=='pattern';}
  function showSource(source,name,url){state.source=source;state.working=null;state.name=name.replace(/\.[^.]+$/,'');$('source-name').textContent=name;$('source-size').textContent=`${source.width} × ${source.height} 像素`;$('source-info').hidden=false;$('source-thumb').src=url;$('original-preview').src=url;updateControls();generate();}
  async function loadFile(file){if(!file)return;const token=++state.loadId;state.busy=false;updateControls();if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status('请选择 JPG、PNG 或 WebP 图片。',true);return;}if(file.size>20*1024*1024){status('这张图片超过 20 MB，请缩小后再试。',true);return;}state.busy=true;updateControls();status('正在读取图片…');let url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(token!==state.loadId)return;if(img.naturalWidth*img.naturalHeight>40000000)throw new Error('这张图片超过 4000 万像素，请缩小后再试。');const thumb=document.createElement('canvas');const scale=Math.min(1,1000/img.naturalWidth,1000/img.naturalHeight);thumb.width=Math.max(1,Math.round(img.naturalWidth*scale));thumb.height=Math.max(1,Math.round(img.naturalHeight*scale));thumb.getContext('2d').drawImage(img,0,0,thumb.width,thumb.height);showSource(img,file.name,thumb.toDataURL('image/png'));}catch(e){if(token===state.loadId)status(e.message.includes('像素')?e.message:'图片未能读取，请换一张有效图片再试。',true);}finally{URL.revokeObjectURL(url);if(token===state.loadId){state.busy=false;updateControls();}}}
  function sample(){state.loadId++;state.busy=false;const canvas=document.createElement('canvas');canvas.width=480;canvas.height=480;const ctx=canvas.getContext('2d');const colors=['#284d3c','#ed9a54','#f8db9a','#e5eee1','#9bbfa6','#c86740'];const size=20;for(let y=0;y<24;y++)for(let x=0;x<24;x++){const dx=x-11.5,dy=y-11.5;let index=3;if(Math.abs(dx)+Math.abs(dy)<10)index=1;if(Math.abs(dx)+Math.abs(dy)<7)index=2;if(Math.abs(dx)+Math.abs(dy)<4)index=0;if((x<5||x>18)&&(y<5||y>18))index=4;if((x===y||x+y===23)&&Math.abs(dx)>8)index=5;ctx.fillStyle=colors[index];ctx.fillRect(x*size,y*size,size,size);}$('sampling').value='pixel';$('columns').value=48;syncLabels();showSource(canvas,'几何拼布示例',canvas.toDataURL());}
  function syncLabels(){$('columns-value').innerHTML=`${$('columns').value} <small>格</small>`;$('colors-value').innerHTML=`${$('colors').value} <small>色</small>`;document.querySelectorAll('[data-columns]').forEach(b=>b.classList.toggle('active',b.dataset.columns===$('columns').value));syncSamplingControls();}
  function invalidate(){syncLabels();updatePaletteNote();if(state.source)generate();}
  function selectedCatalog(){return BeadPalettes[$('palette').value]||null;}
  function syncSamplingControls(){
    const mode=$('sampling').value,details=mode==='illustration'||mode==='lineart';
    $('detail-field').hidden=!details;$('detail-strength').disabled=!details;
    $('detail-value').innerHTML=`${$('detail-strength').value} <small>%</small>`;
    const notes={photo:'适合人像、风景和有明暗渐变的图片，柔和缩小并优化配色。',illustration:'适合动漫头像、卡通和色块插画，让轮廓与主要颜色更清楚。',lineart:'优先保留细描边、五官和彩色线条。建议试试 72 / 96 格；一格以内的细节仍可能合并。',pixel:'适合已经画好的像素图，直接保留采样到的原色块，不增强线条。'};
    $('sampling-note').textContent=notes[mode]||notes.photo;
  }
  function sampleSource(size){
    const mode=$('sampling').value;
    if(mode==='pixel'){
      const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
      ctx.drawImage(state.source,0,0,size.width,size.height);
      return ctx.getImageData(0,0,size.width,size.height).data;
    }
    if(!state.working){
      const scale=Math.min(1,1024/state.source.width,1024/state.source.height);
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(state.source.width*scale));canvas.height=Math.max(1,Math.round(state.source.height*scale));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(state.source,0,0,canvas.width,canvas.height);
      state.working=ctx.getImageData(0,0,canvas.width,canvas.height);
    }
    return BeadSampling.sample(state.working.data,state.working.width,state.working.height,size.width,size.height,{mode,detail:+$('detail-strength').value,transparent:$('transparent').checked});
  }
  function updatePaletteNote(){const catalog=selectedCatalog();$('palette-note').textContent=catalog?(catalog.id==='mard291'?'使用 MARD 291 色扩展参考色卡，含透明、珠光等特殊豆。请确认手头有对应色号；成品预览只显示参考颜色。T1 是透明豆色号，仍需放豆，与透明图片中的留空格不同。':'使用 MARD 221 色常规色号。屏幕色值来自社区参考色卡，请对照实物选豆；屏幕、打印与实物可能有色差。'):'C01 等为本图自定义编号，并非品牌色号。请对照实物色卡选豆，屏幕颜色仅供参考。';}
  function generate(){if(!state.source)return;try{const size=BeadCore.fitGrid(state.source.width,state.source.height,+$('columns').value);state.pattern=BeadCore.quantize(sampleSource(size),size.width,size.height,{maxColors:+$('colors').value,transparent:$('transparent').checked,catalog:selectedCatalog(),quality:$('sampling').value==='pixel'?'legacy':'perceptual'});resetView();renderPalette();render();const p=state.pattern;status(p.total===0?'这张图片在当前设置下全是透明格子。可取消“透明区域不放豆子”再试。':`图纸已生成 · ${number(p.total)} 颗豆子，${p.palette.length} 种颜色。${size.width!==+$('columns').value?'长图已按比例缩小，纵向最多 160 格。':'每格 1 颗豆子，粗线每 10 格。'}`);}catch(e){status('生成失败：'+e.message,true);}updateControls();}
  function renderPalette(){const p=state.pattern;$('bead-total').textContent=number(p.total);$('pattern-size').textContent=`${p.width} × ${p.height}`;$('palette-badge').textContent=`${p.palette.length} 色`;$('grid-meta').textContent=`${p.width} × ${p.height} 格`;$('palette-list').replaceChildren();for(const color of p.palette){const row=document.createElement('div');row.className='color-row';const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=color.hex;const name=document.createElement('span');name.className='color-name';name.textContent=color.code;const hex=document.createElement('small');hex.textContent=color.hex.toUpperCase();name.append(hex);const count=document.createElement('span');count.className='color-count';count.textContent=number(color.count);const unit=document.createElement('small');unit.textContent='颗';count.append(unit);row.append(swatch,name,count);$('palette-list').append(row);}}
  function render(){const p=state.pattern;const original=state.view==='original';$('ironed-note').hidden=!p||state.view!=='ironed';$('finish-controls').hidden=!p||state.view!=='ironed';$('canvas-stage').classList.toggle('finished-stage',!!p&&state.view==='ironed');$('preview').setAttribute('aria-label',state.view==='ironed'?'普通烫的拼豆成品参考效果':state.view==='beads'?'熨烫前的拼豆效果预览':'生成的拼豆图纸，详细颜色数量见用色清单');$('empty-state').hidden=!!p;$('canvas-content').hidden=!p;$('preview').hidden=!p||original;$('original-preview').hidden=!p||!original;document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===state.view;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});if(p&&!original){BeadExport.drawGrid($('preview'),p,{cell:24,labels:$('show-labels').checked,beads:state.view==='beads',ironed:state.view==='ironed',floating:state.floating});sizePreview();}else if(original){const area=$('canvas-content');area.style.width='100%';area.style.height='100%';}updateControls();}
  function sizePreview(){
    if(!state.pattern||state.view==='original')return;
    const stage=$('canvas-stage'),canvas=$('preview'),area=$('canvas-content'),pad=state.view==='ironed'?6:16;
    const fitScale=Math.min(Math.max(1,stage.clientWidth-pad*2)/canvas.width,Math.max(1,stage.clientHeight-pad*2)/canvas.height,1);
    const scale=state.fit?fitScale:state.zoom,w=Math.round(canvas.width*scale),h=Math.round(canvas.height*scale);
    const width=Math.max(stage.clientWidth,w+pad*2),height=Math.max(stage.clientHeight,h+pad*2);
    area.style.width=width+'px';area.style.height=height+'px';
    canvas.style.width=w+'px';canvas.style.height=h+'px';canvas.style.left=(width-w)/2+'px';canvas.style.top=(height-h)/2+'px';
    canvas.classList.toggle('can-pan',width>stage.clientWidth||height>stage.clientHeight);
    if(state.fit){stage.scrollLeft=0;stage.scrollTop=0;}
  }
  let drag=null;
  function endDrag(){
    if(!drag)return;const pointer=drag.id;drag=null;
    $('preview').classList.remove('dragging');
    if($('preview').hasPointerCapture(pointer))$('preview').releasePointerCapture(pointer);
  }
  function resetView(){endDrag();state.fit=true;state.zoom=1;$('canvas-stage').scrollLeft=0;$('canvas-stage').scrollTop=0;}
  function zoom(factor,clientX,clientY){
    if(!state.pattern||state.view==='original')return;
    const canvas=$('preview'),stage=$('canvas-stage'),old=canvas.getBoundingClientRect(),frame=stage.getBoundingClientRect();
    const x=clientX??frame.left+stage.clientWidth/2,y=clientY??frame.top+stage.clientHeight/2;
    const u=Math.max(0,Math.min(1,(x-old.left)/old.width)),v=Math.max(0,Math.min(1,(y-old.top)/old.height));
    const scale=old.width/canvas.width;state.fit=false;state.zoom=Math.max(.05,Math.min(3,scale*factor));sizePreview();
    const next=canvas.getBoundingClientRect();stage.scrollLeft+=next.left+u*next.width-x;stage.scrollTop+=next.top+v*next.height-y;
  }
  $('preview').addEventListener('wheel',e=>{
    if(!state.pattern||state.view==='original'||e.ctrlKey)return;
    e.preventDefault();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?$('canvas-stage').clientHeight:1);
    zoom(Math.exp(-Math.max(-180,Math.min(180,delta))*.003),e.clientX,e.clientY);
  },{passive:false});
  $('preview').addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse'||e.button!==0||!state.pattern||state.view==='original')return;
    const stage=$('canvas-stage');if(stage.scrollWidth<=stage.clientWidth&&stage.scrollHeight<=stage.clientHeight)return;
    e.preventDefault();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop};
    $('preview').setPointerCapture(e.pointerId);$('preview').classList.add('dragging');
  });
  $('preview').addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id)return;if(!(e.buttons&1)){endDrag();return;}
    $('canvas-stage').scrollLeft=drag.left-(e.clientX-drag.x);$('canvas-stage').scrollTop=drag.top-(e.clientY-drag.y);
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(event=>$('preview').addEventListener(event,endDrag));
  window.addEventListener('blur',endDrag);
  $('file-input').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value='';});$('empty-upload').addEventListener('click',()=>$('file-input').click());$('upload-zone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file-input').click();}});['dragenter','dragover'].forEach(type=>$('upload-zone').addEventListener(type,e=>{e.preventDefault();$('upload-zone').classList.add('dragging');}));['dragleave','drop'].forEach(type=>$('upload-zone').addEventListener(type,e=>{e.preventDefault();$('upload-zone').classList.remove('dragging');if(type==='drop')loadFile(e.dataTransfer.files[0]);}));
  $('sample-btn').addEventListener('click',sample);$('generate-btn').addEventListener('click',generate);['columns','colors','detail-strength'].forEach(id=>{$(id).addEventListener('input',syncLabels);$(id).addEventListener('change',invalidate);});['sampling','transparent','palette'].forEach(id=>$(id).addEventListener('change',invalidate));document.querySelectorAll('[data-columns]').forEach(b=>b.addEventListener('click',()=>{$('columns').value=b.dataset.columns;invalidate();}));document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{resetView();state.view=b.dataset.view;render();}));$('show-labels').addEventListener('change',render);$('zoom-fit').addEventListener('click',()=>{resetView();sizePreview();});$('zoom-in').addEventListener('click',()=>zoom(1.4));$('zoom-out').addEventListener('click',()=>zoom(1/1.4));new ResizeObserver(()=>sizePreview()).observe($('canvas-stage'));
  $('floating-shadow').addEventListener('change',()=>{state.floating=$('floating-shadow').checked;render();});
  $('clear-btn').addEventListener('click',()=>{state.loadId++;state.busy=false;resetView();state.source=null;state.working=null;state.pattern=null;$('source-info').hidden=true;$('original-preview').removeAttribute('src');$('source-thumb').removeAttribute('src');$('bead-total').textContent='—';$('pattern-size').textContent='—';$('palette-badge').textContent='0 色';$('grid-meta').textContent='等待上传图片';$('palette-list').innerHTML='<div class="palette-empty"><span aria-hidden="true">◌</span><p>图纸生成后<br>每种颜色的用量会出现在这里</p></div>';render();status('已移除图片，可以开始新的创作。');});
  $('download-btn').addEventListener('click',()=>{if(BeadExport.download)BeadExport.download(state.pattern,state.name,status);});$('print-btn').addEventListener('click',()=>{if(BeadExport.print)BeadExport.print(state.pattern,state.name,status);});
  $('copy-prompt').addEventListener('click',async()=>{
    const field=$('cutout-prompt');
    try{await navigator.clipboard.writeText(field.value);$('copy-status').textContent='已复制；记得把【主体】改成你要保留的内容。';}
    catch{field.focus();field.select();$('copy-status').textContent='提示词已选中，请长按复制，或按 Ctrl+C / ⌘C。';}
  });
  syncSamplingControls();updatePaletteNote();updateControls();
})();
