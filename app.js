(function(){'use strict';
  const $=id=>document.getElementById(id);
  const state={source:null,working:null,pattern:null,outlineResult:null,name:'拼豆图纸',view:'pattern',floating:true,pitchMm:2.6,reference:'phone',paper:true,zoom:1,fit:true,loadId:0,busy:false};
  const number=n=>n.toLocaleString('zh-CN');
  function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
  function updateControls(){const ready=!!state.pattern&&state.pattern.total>0;['download-btn','print-btn'].forEach(id=>$(id).disabled=!ready||state.busy);['zoom-in','zoom-out','zoom-fit'].forEach(id=>$(id).disabled=!state.pattern||state.view==='original');$('generate-btn').disabled=!state.source||state.busy;$('show-labels').disabled=state.view!=='pattern';}
  function showSource(source,name,url){state.source=source;state.working=null;state.outlineResult=null;state.name=name.replace(/\.[^.]+$/,'');$('source-name').textContent=name;$('source-size').textContent=`${source.width} × ${source.height} 像素`;$('source-info').hidden=false;$('source-thumb').src=url;$('original-preview').src=url;updateControls();generate();}
  async function loadFile(file){if(!file)return;const token=++state.loadId;state.busy=false;updateControls();if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status('请选择 JPG、PNG 或 WebP 图片。',true);return;}if(file.size>20*1024*1024){status('这张图片超过 20 MB，请缩小后再试。',true);return;}state.busy=true;updateControls();status('正在读取图片…');let url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(token!==state.loadId)return;if(img.naturalWidth*img.naturalHeight>40000000)throw new Error('这张图片超过 4000 万像素，请缩小后再试。');const thumb=document.createElement('canvas');const scale=Math.min(1,1000/img.naturalWidth,1000/img.naturalHeight);thumb.width=Math.max(1,Math.round(img.naturalWidth*scale));thumb.height=Math.max(1,Math.round(img.naturalHeight*scale));thumb.getContext('2d').drawImage(img,0,0,thumb.width,thumb.height);showSource(img,file.name,thumb.toDataURL('image/png'));}catch(e){if(token===state.loadId)status(e.message.includes('像素')?e.message:'图片未能读取，请换一张有效图片再试。',true);}finally{URL.revokeObjectURL(url);if(token===state.loadId){state.busy=false;updateControls();}}}
  function sample(){state.loadId++;state.busy=false;const canvas=document.createElement('canvas');canvas.width=480;canvas.height=480;const ctx=canvas.getContext('2d');const colors=['#284d3c','#ed9a54','#f8db9a','#e5eee1','#9bbfa6','#c86740'];const size=20;for(let y=0;y<24;y++)for(let x=0;x<24;x++){const dx=x-11.5,dy=y-11.5;let index=3;if(Math.abs(dx)+Math.abs(dy)<10)index=1;if(Math.abs(dx)+Math.abs(dy)<7)index=2;if(Math.abs(dx)+Math.abs(dy)<4)index=0;if((x<5||x>18)&&(y<5||y>18))index=4;if((x===y||x+y===23)&&Math.abs(dx)>8)index=5;ctx.fillStyle=colors[index];ctx.fillRect(x*size,y*size,size,size);}$('sampling').value='pixel';$('columns').value=48;syncLabels();showSource(canvas,'几何拼布示例',canvas.toDataURL());}
  function syncLabels(){$('columns-value').innerHTML=`${$('columns').value} <small>格</small>`;$('colors-value').innerHTML=`${$('colors').value} <small>色</small>`;document.querySelectorAll('[data-columns]').forEach(b=>b.classList.toggle('active',b.dataset.columns===$('columns').value));syncSamplingControls();}
  function invalidate(){syncLabels();updatePaletteNote();if(state.source)generate();else updateOutlineResult();}
  function selectedCatalog(){return BeadPalettes[$('palette').value]||BeadPalettes.mard221;}
  function syncSamplingControls(){
    const mode=$('sampling').value,details=mode==='illustration'||mode==='lineart';
    $('detail-field').hidden=!details;$('detail-strength').disabled=!details;
    $('detail-value').innerHTML=`${$('detail-strength').value} <small>%</small>`;
    const notes={photo:'适合人像、风景和明暗渐变，柔和缩小并保留色调。肤色与衣服层次多时，可尝试 24–32 色。',illustration:'适合动漫头像、卡通和色块插画，优先保留原有主色块，减少相邻颜色混灰。',lineart:'优先保留细描边、五官和彩色线条的原色。建议试试 72 / 96 格；一格以内的细节仍可能合并。',pixel:'适合已经画好的像素图，保留采样到的原色块；按所选色卡匹配豆子颜色。'};
    $('sampling-note').textContent=notes[mode]||notes.photo;
  }
  function workingSource(){
    if(!state.working){
      const scale=Math.min(1,1024/state.source.width,1024/state.source.height);
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(state.source.width*scale));canvas.height=Math.max(1,Math.round(state.source.height*scale));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(state.source,0,0,canvas.width,canvas.height);
      state.working=ctx.getImageData(0,0,canvas.width,canvas.height);
    }
    return state.working;
  }
  function sampleSource(size){
    const mode=$('sampling').value;
    if(mode==='pixel'){
      const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
      ctx.drawImage(state.source,0,0,size.width,size.height);
      return ctx.getImageData(0,0,size.width,size.height).data;
    }
    const working=workingSource();
    return BeadSampling.sample(working.data,working.width,working.height,size.width,size.height,{mode,detail:+$('detail-strength').value,transparent:$('transparent').checked});
  }
  function updateOutlineResult(){
    const node=$('outline-result'),result=state.outlineResult;
    node.hidden=!$('enhance-outline').checked||!state.source;
    if(node.hidden){node.textContent='';return;}
    node.textContent=result?.applied?`已识别并保留 ${number(result.outlineCells)} 个外轮廓格，沿用原描边色。`:
      result?.reason==='complex-background'?'背景较复杂，暂未增强外轮廓。可先抠图，或换用纯色底插画。':
      '没有识别到清晰的原有外描边，保持原采样。可尝试透明或纯色底插画。';
  }
  function updatePaletteNote(){const catalog=selectedCatalog();$('palette-note').textContent=catalog.id==='mard291'?'只使用 MARD 291 参考库已有的色号与对应色值。含透明、珠光等特殊豆，屏幕不能还原其材质；T1 是透明豆，仍需放豆。色值来自社区表，非官方实测，购买前请核对实物色卡。':'只使用 MARD 221 参考库已有的色号与对应色值，图纸、预览和清单共用同一套配色。RGB 来自社区表，非官方实测；屏幕、批次及烫制可能产生色差，购买前请核对实物色卡。';}
  function generate(){
    if(!state.source)return;
    try{
      const size=BeadCore.fitGrid(state.source.width,state.source.height,+$('columns').value),transparent=$('transparent').checked;
      let data=sampleSource(size),importance=null,outlineResult=null;
      if($('enhance-outline').checked){
        const working=workingSource();
        outlineResult=BeadOutline.enhance(working.data,working.width,working.height,data,size.width,size.height,{transparent});
        data=outlineResult.data;
        if(outlineResult.applied)importance=Uint8Array.from(outlineResult.mask,cell=>cell?3:1);
      }
      state.pattern=BeadCore.quantize(data,size.width,size.height,{maxColors:+$('colors').value,transparent,catalog:selectedCatalog(),quality:'fidelity',importance});
      state.outlineResult=outlineResult;resetView();renderPalette();render();
      const p=state.pattern;
      status(p.total===0?'这张图片在当前设置下全是透明格子。可取消“透明区域不放豆子”再试。':`图纸已生成 · ${number(p.total)} 颗豆子，${p.palette.length} 种颜色。${size.width!==+$('columns').value?'长图已按比例缩小，纵向最多 160 格。':'每格 1 颗豆子，粗线每 10 格。'}`);
    }catch(e){status('生成失败：'+e.message,true);}
    updateControls();
  }
  function renderPalette(){const p=state.pattern;$('bead-total').textContent=number(p.total);$('pattern-size').textContent=`${p.width} × ${p.height}`;$('palette-badge').textContent=`${p.palette.length} 色`;$('grid-meta').textContent=`${p.width} × ${p.height} 格`;$('palette-list').replaceChildren();for(const color of p.palette){const row=document.createElement('div');row.className='color-row';const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=color.hex;const name=document.createElement('span');name.className='color-name';name.textContent=color.code;const hex=document.createElement('small');hex.textContent=color.hex.toUpperCase();name.append(hex);const count=document.createElement('span');count.className='color-count';count.textContent=number(color.count);const unit=document.createElement('small');unit.textContent='颗';count.append(unit);row.append(swatch,name,count);$('palette-list').append(row);}}
  function updateSizeInfo(){
    const measurement=state.pattern&&state.view!=='original'?BeadSize.measure(state.pattern,state.pitchMm):null;
    $('physical-size-panel').hidden=!measurement;
    $('paper-reference-control').hidden=state.view!=='pattern';
    if(!measurement){['reference-coin','reference-phone','dimension-overlay','paper-reference-frame','paper-reference-label'].forEach(id=>$(id).setAttribute('hidden',''));return;}
    const cm=mm=>(mm/10).toLocaleString('zh-CN',{maximumFractionDigits:2});
    $('physical-size-value').textContent=`约 ${cm(measurement.widthMm)} × ${cm(measurement.heightMm)} cm`;
    $('physical-size-note').textContent=`按 ${state.pitchMm} 毫米格距估算 · 主体 ${measurement.bounds.width} × ${measurement.bounds.height} 格，不计透明外边。材料与烫制会影响实际大小。`;
    const notes={coin:'示意硬币直径 2.5 cm',phone:'示意手机 7 × 15 cm',both:'示意硬币直径 2.5 cm · 示意手机 7 × 15 cm'};
    $('reference-note').textContent=state.reference==='none'?'屏幕显示并非实物 1:1；可选择参照物比较大小。':`${notes[state.reference]}，与图案等比例缩放；屏幕显示并非实物 1:1。`;
  }
  function render(){
    const p=state.pattern,original=state.view==='original';
    $('ironed-note').hidden=!p||state.view!=='ironed';$('finish-controls').hidden=!p||state.view!=='ironed';
    $('gesture-note').hidden=!p||original;
    $('canvas-stage').classList.toggle('interactive-preview',!!p&&!original);
    $('canvas-stage').classList.toggle('finished-stage',!!p&&state.view==='ironed');
    $('preview').setAttribute('aria-label',state.view==='ironed'?'普通烫的拼豆成品参考效果':state.view==='beads'?'熨烫前的拼豆效果预览':'生成的拼豆图纸，详细颜色数量见用色清单');
    $('empty-state').hidden=!!p;$('canvas-content').hidden=!p;$('preview').hidden=!p||original;$('original-preview').hidden=!p||!original;
    document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===state.view;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    updateSizeInfo();
    updateOutlineResult();
    if(p&&!original){BeadExport.drawGrid($('preview'),p,{cell:24,labels:$('show-labels').checked,beads:state.view==='beads',ironed:state.view==='ironed',floating:state.floating});sizePreview();}
    else if(original){const area=$('canvas-content');area.style.width='100%';area.style.height='100%';}
    updateControls();
  }
  function sizePreview(){
    if(!state.pattern||state.view==='original')return;
    const stage=$('canvas-stage'),canvas=$('preview'),area=$('canvas-content'),pad=state.view==='ironed'?6:16;
    const options={pitchMm:state.pitchMm,reference:state.reference,geometry:canvas.beadGeometry,dimensions:true,paper:state.view==='pattern'&&state.paper};
    const fit=scene=>Math.min(Math.max(1,stage.clientWidth-pad*2)/scene.width,Math.max(1,stage.clientHeight-pad*2)/scene.height,1);
    let scene=BeadSize.layout(state.pattern,options),fitScale=fit(scene);
    // Reserve a readable annotation gutter at fit size. Keep this geometry
    // independent of zoom so the image and all references pan/zoom together.
    for(let step=0;step<4;step++){
      options.annotationGap=Math.max(canvas.beadGeometry.cell*2,28/fitScale);
      scene=BeadSize.layout(state.pattern,options);fitScale=fit(scene);
    }
    state.fitScale=fitScale;
    const scale=state.fit?fitScale:state.zoom,w=scene.width*scale,h=scene.height*scale;
    const width=Math.max(stage.clientWidth,w+pad*2),height=Math.max(stage.clientHeight,h+pad*2),left=(width-w)/2,top=(height-h)/2;
    area.style.width=width+'px';area.style.height=height+'px';
    const place=(node,box)=>{node.style.width=box.width*scale+'px';node.style.height=box.height*scale+'px';node.style.left=left+box.x*scale+'px';node.style.top=top+box.y*scale+'px';};
    place(canvas,scene.base);
    ['coin','phone'].forEach(kind=>$('reference-'+kind).hidden=true);
    for(const reference of scene.references){const node=$('reference-'+reference.kind);node.hidden=false;place(node,reference);}
    const paper=scene.paper,frame=$('paper-reference-frame'),paperLabel=$('paper-reference-label');
    frame.hidden=paperLabel.hidden=!paper;
    if(paper){
      place(frame,paper);frame.dataset.widthMm=paper.widthMm;frame.dataset.heightMm=paper.heightMm;
      const title=document.createElement('strong'),detail=document.createElement('small');
      title.textContent=`${paper.name} 纸张参照${paper.fits?'':' · 主体超出'}`;
      detail.textContent=`${paper.widthMm/10} × ${paper.heightMm/10} cm`;
      paperLabel.replaceChildren(title,detail);
      paperLabel.style.left=left+paper.label.x*scale+'px';paperLabel.style.top=top+paper.label.y*scale+'px';
    }
    const overlay=$('dimension-overlay');overlay.toggleAttribute('hidden',!scene.dimensions);overlay.replaceChildren();
    if(scene.dimensions){
      place(overlay,{x:0,y:0,width:scene.width,height:scene.height});
      overlay.setAttribute('viewBox',`0 0 ${w} ${h}`);overlay.setAttribute('aria-label',$('physical-size-value').textContent);
      const svg=(tag,attrs)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);overlay.append(node);return node;};
      const line=(a,b,kind)=>svg('line',{x1:a.x*scale,y1:a.y*scale,x2:b.x*scale,y2:b.y*scale,class:kind});
      for(const axis of ['width','height']){
        const d=scene.dimensions[axis];
        d.extensions.forEach(e=>line(e.from,e.to,'dimension-extension'));
        line(d.from,d.to,'dimension-line');
        for(const p of [d.from,d.to]){
          const x=p.x*scale,y=p.y*scale;
          svg('path',{d:axis==='width'?`M${x-3} ${y-4}L${x+3} ${y+4}`:`M${x-4} ${y+3}L${x+4} ${y-3}`,class:'dimension-tick'});
        }
        const x=d.label.x*scale,y=d.label.y*scale;
        const text=svg('text',{x,y,'text-anchor':'middle','dominant-baseline':'middle','data-dimension':axis,transform:`rotate(${d.label.rotation||0} ${x} ${y})`});
        text.textContent=`${axis==='width'?'宽':'高'}约 ${(d.valueMm/10).toLocaleString('zh-CN',{maximumFractionDigits:2})} cm`;
      }
    }
    canvas.classList.toggle('can-pan',width>stage.clientWidth||height>stage.clientHeight);
    if(state.fit){stage.scrollLeft=0;stage.scrollTop=0;}
  }
  let drag=null;
  function endDrag(){
    if(!drag)return;const pointer=drag.id;drag=null;
    $('preview').classList.remove('dragging');
    if($('preview').hasPointerCapture(pointer))$('preview').releasePointerCapture(pointer);
  }
  function resetView(){endDrag();endTouch();state.fit=true;state.zoom=1;$('canvas-stage').scrollLeft=0;$('canvas-stage').scrollTop=0;}
  function zoom(factor,clientX,clientY,targetX=clientX,targetY=clientY){
    if(!state.pattern||state.view==='original')return;
    const canvas=$('preview'),stage=$('canvas-stage'),old=canvas.getBoundingClientRect(),frame=stage.getBoundingClientRect();
    const x=clientX??frame.left+stage.clientWidth/2,y=clientY??frame.top+stage.clientHeight/2;
    // An anchor may be in the surrounding scene, including a size reference.
    const u=(x-old.left)/old.width,v=(y-old.top)/old.height;
    const scale=old.width/canvas.width;state.fit=false;state.zoom=Math.max(Math.min(.05,state.fitScale||.05),Math.min(3,scale*factor));sizePreview();
    const next=canvas.getBoundingClientRect();stage.scrollLeft+=next.left+u*next.width-(targetX??x);stage.scrollTop+=next.top+v*next.height-(targetY??y);
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
  const touchPoints=new Map();
  let touchGesture=null,touchFrame=0;
  function touchSnapshot(){
    const points=Array.from(touchPoints.values());
    if(!points.length)return null;
    if(points.length===1)return {count:1,x:points[0].x,y:points[0].y};
    const [a,b]=points;
    return {count:2,x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};
  }
  function applyTouch(){
    if(touchFrame)cancelAnimationFrame(touchFrame);touchFrame=0;
    const next=touchSnapshot(),previous=touchGesture;
    if(next&&previous&&next.count===previous.count){
      if(next.count===2){
        const factor=previous.distance>1&&next.distance>1?next.distance/previous.distance:1;
        zoom(factor,previous.x,previous.y,next.x,next.y);
      }else{
        const stage=$('canvas-stage');
        stage.scrollLeft+=previous.x-next.x;stage.scrollTop+=previous.y-next.y;
      }
    }
    // Rebase even at a limit, so reversing direction responds immediately.
    touchGesture=next;
  }
  function endTouch(){
    if(touchFrame)cancelAnimationFrame(touchFrame);touchFrame=0;
    const stage=$('canvas-stage'),pointers=Array.from(touchPoints.keys());
    touchPoints.clear();touchGesture=null;
    for(const pointer of pointers)if(stage.hasPointerCapture(pointer))stage.releasePointerCapture(pointer);
  }
  function removeTouch(e){
    if(!touchPoints.has(e.pointerId))return;
    if(e.type==='pointerup')touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    applyTouch();touchPoints.delete(e.pointerId);touchGesture=touchSnapshot();
    const stage=$('canvas-stage');if(stage.hasPointerCapture(e.pointerId))stage.releasePointerCapture(e.pointerId);
  }
  $('canvas-stage').addEventListener('pointerdown',e=>{
    if(e.pointerType!=='touch'||!state.pattern||state.view==='original')return;
    e.preventDefault();endDrag();applyTouch();
    touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});touchGesture=touchSnapshot();
    $('canvas-stage').setPointerCapture(e.pointerId);
  },{passive:false});
  $('canvas-stage').addEventListener('pointermove',e=>{
    if(!touchPoints.has(e.pointerId))return;
    e.preventDefault();touchPoints.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!touchFrame)touchFrame=requestAnimationFrame(applyTouch);
  },{passive:false});
  ['pointerup','lostpointercapture'].forEach(event=>$('canvas-stage').addEventListener(event,removeTouch));
  $('canvas-stage').addEventListener('pointercancel',e=>{if(touchPoints.has(e.pointerId))endTouch();});
  $('canvas-stage').addEventListener('contextmenu',e=>{if(touchPoints.size)e.preventDefault();});
  window.addEventListener('blur',endTouch);
  window.addEventListener('resize',endTouch);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)endTouch();});
  $('file-input').addEventListener('change',e=>{loadFile(e.target.files[0]);e.target.value='';});$('empty-upload').addEventListener('click',()=>$('file-input').click());$('upload-zone').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file-input').click();}});['dragenter','dragover'].forEach(type=>$('upload-zone').addEventListener(type,e=>{e.preventDefault();$('upload-zone').classList.add('dragging');}));['dragleave','drop'].forEach(type=>$('upload-zone').addEventListener(type,e=>{e.preventDefault();$('upload-zone').classList.remove('dragging');if(type==='drop')loadFile(e.dataTransfer.files[0]);}));
  $('sample-btn').addEventListener('click',sample);$('generate-btn').addEventListener('click',generate);['columns','colors','detail-strength'].forEach(id=>{$(id).addEventListener('input',syncLabels);$(id).addEventListener('change',invalidate);});['sampling','transparent','palette'].forEach(id=>$(id).addEventListener('change',invalidate));document.querySelectorAll('[data-columns]').forEach(b=>b.addEventListener('click',()=>{$('columns').value=b.dataset.columns;invalidate();}));document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{resetView();state.view=b.dataset.view;render();}));$('show-labels').addEventListener('change',render);$('zoom-fit').addEventListener('click',()=>{resetView();sizePreview();});$('zoom-in').addEventListener('click',()=>zoom(1.4));$('zoom-out').addEventListener('click',()=>zoom(1/1.4));new ResizeObserver(()=>sizePreview()).observe($('canvas-stage'));
  $('floating-shadow').addEventListener('change',()=>{state.floating=$('floating-shadow').checked;render();});
  $('enhance-outline').addEventListener('change',invalidate);
  $('bead-pitch').addEventListener('change',()=>{
    const custom=$('bead-pitch').value==='custom';$('custom-pitch-field').hidden=!custom;$('pitch-error').hidden=true;$('custom-pitch').removeAttribute('aria-invalid');
    if(custom){$('custom-pitch').value=state.pitchMm;}else{state.pitchMm=+$('bead-pitch').value;}
    resetView();render();
  });
  $('custom-pitch').addEventListener('input',()=>{
    const field=$('custom-pitch'),pitch=field.valueAsNumber;
    const valid=Number.isFinite(pitch)&&pitch>=1&&pitch<=10&&field.validity.valid;
    $('pitch-error').hidden=valid;field.setAttribute('aria-invalid',String(!valid));
    if(valid){state.pitchMm=pitch;resetView();render();}
  });
  $('size-reference').addEventListener('change',()=>{state.reference=$('size-reference').value;resetView();render();});
  $('paper-reference').addEventListener('change',()=>{state.paper=$('paper-reference').checked;resetView();render();});
  $('clear-btn').addEventListener('click',()=>{state.loadId++;state.busy=false;resetView();state.source=null;state.working=null;state.pattern=null;$('source-info').hidden=true;$('original-preview').removeAttribute('src');$('source-thumb').removeAttribute('src');$('bead-total').textContent='—';$('pattern-size').textContent='—';$('palette-badge').textContent='0 色';$('grid-meta').textContent='等待上传图片';$('palette-list').innerHTML='<div class="palette-empty"><span aria-hidden="true">◌</span><p>图纸生成后<br>每种颜色的用量会出现在这里</p></div>';render();status('已移除图片，可以开始新的创作。');});
  $('download-btn').addEventListener('click',()=>{if(BeadExport.download)BeadExport.download(state.pattern,state.name,status);});$('print-btn').addEventListener('click',()=>{if(BeadExport.print)BeadExport.print(state.pattern,state.name,status);});
  $('copy-prompt').addEventListener('click',async()=>{
    const field=$('cutout-prompt');
    try{await navigator.clipboard.writeText(field.value);$('copy-status').textContent='已复制；记得把【主体】改成你要保留的内容。';}
    catch{field.focus();field.select();$('copy-status').textContent='提示词已选中，请长按复制，或按 Ctrl+C / ⌘C。';}
  });
  syncSamplingControls();updatePaletteNote();updateControls();
})();
