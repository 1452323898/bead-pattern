(function(){'use strict';
  let cached=null;
  const makeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.ceil(w);c.height=Math.ceil(h);return c;};
  function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  function cellShape(ctx,x,y,s,mask){
    // Round exposed corners geometrically; keep shared edges and diagonal contacts intact.
    const r=s*.28,tl=!(mask&1)&&!(mask&4)&&!(mask&16)?r:0,tr=!(mask&2)&&!(mask&4)&&!(mask&32)?r:0;
    const bl=!(mask&1)&&!(mask&8)&&!(mask&64)?r:0,br=!(mask&2)&&!(mask&8)&&!(mask&128)?r:0;
    ctx.beginPath();ctx.moveTo(x+tl,y);ctx.lineTo(x+s-tr,y);ctx.quadraticCurveTo(x+s,y,x+s,y+tr);
    ctx.lineTo(x+s,y+s-br);ctx.quadraticCurveTo(x+s,y+s,x+s-br,y+s);
    ctx.lineTo(x+bl,y+s);ctx.quadraticCurveTo(x,y+s,x,y+s-bl);ctx.lineTo(x,y+tl);ctx.quadraticCurveTo(x,y,x+tl,y);ctx.closePath();
  }
  function texture(){
    const size=192,tile=makeCanvas(size,size),ctx=tile.getContext('2d'),rand=random(92619);
    const pixels=ctx.createImageData(size,size);
    for(let i=0;i<pixels.data.length;i+=4){const value=rand()>.5?255:0;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;pixels.data[i+3]=Math.floor(rand()*5);}
    ctx.putImageData(pixels,0,0);
    return tile;
  }
  function material(pattern){
    if(cached&&cached.pattern===pattern)return cached;
    if(cached){cached.face.width=cached.side.width=1;cached=null;}
    const cell=Math.max(1,Math.min(40,Math.floor(1200/Math.max(pattern.width,pattern.height))));
    const face=makeCanvas(pattern.width*cell,pattern.height*cell),ctx=face.getContext('2d');
    const occupied=(x,y)=>x>=0&&y>=0&&x<pattern.width&&y<pattern.height&&pattern.cells[y*pattern.width+x]>=0;
    const light=new Path2D(),dark=new Path2D(),seams=new Path2D();
    for(let y=0;y<pattern.height;y++)for(let x=0;x<pattern.width;x++){
      const id=pattern.cells[y*pattern.width+x];if(id<0)continue;
      const left=occupied(x-1,y),right=occupied(x+1,y),top=occupied(x,y-1),bottom=occupied(x,y+1);
      const px=x*cell,py=y*cell;
      const neighbors=(left?1:0)|(right?2:0)|(top?4:0)|(bottom?8:0)|(occupied(x-1,y-1)?16:0)|(occupied(x+1,y-1)?32:0)|(occupied(x-1,y+1)?64:0)|(occupied(x+1,y+1)?128:0);
      cellShape(ctx,px,py,cell,neighbors);ctx.fillStyle=pattern.palette[id].hex;ctx.fill();
      if(!top){light.moveTo(px+cell*.17,py+.6);light.lineTo(px+cell*.83,py+.6);}
      if(!left){light.moveTo(px+.6,py+cell*.17);light.lineTo(px+.6,py+cell*.83);}
      if(!bottom){dark.moveTo(px+cell*.17,py+cell-.6);dark.lineTo(px+cell*.83,py+cell-.6);}
      if(!right){dark.moveTo(px+cell-.6,py+cell*.17);dark.lineTo(px+cell-.6,py+cell*.83);}
      if(right){seams.moveTo(px+cell-.25,py+cell*.2);seams.lineTo(px+cell-.25,py+cell*.77);}
      if(bottom){seams.moveTo(px+cell*.2,py+cell-.25);seams.lineTo(px+cell*.77,py+cell-.25);}
    }
    // source-atop keeps the alpha of every empty grid cell intact.
    ctx.globalCompositeOperation='source-atop';
    ctx.lineWidth=.65;ctx.strokeStyle='rgba(50,35,25,.075)';ctx.stroke(seams);
    const grain=texture();ctx.fillStyle=ctx.createPattern(grain,'repeat');ctx.fillRect(0,0,face.width,face.height);grain.width=1;
    const lightFall=ctx.createLinearGradient(0,0,face.width,face.height);
    lightFall.addColorStop(0,'rgba(255,255,255,.12)');lightFall.addColorStop(.55,'rgba(255,255,255,0)');lightFall.addColorStop(1,'rgba(32,24,16,.09)');ctx.fillStyle=lightFall;ctx.fillRect(0,0,face.width,face.height);
    ctx.lineWidth=Math.max(.8,cell*.045);ctx.lineCap='round';ctx.strokeStyle='rgba(255,255,255,.4)';ctx.stroke(light);ctx.strokeStyle='rgba(35,26,16,.22)';ctx.stroke(dark);ctx.globalCompositeOperation='source-over';
    const side=makeCanvas(face.width,face.height),sideCtx=side.getContext('2d');sideCtx.drawImage(face,0,0);sideCtx.globalCompositeOperation='source-atop';sideCtx.fillStyle='rgba(27,24,22,.35)';sideCtx.fillRect(0,0,side.width,side.height);
    cached={pattern,cell,face,side};return cached;
  }
  function draw(canvas,pattern,{floating=true}={}){
    const m=material(pattern),w=m.face.width,h=m.face.height;
    const a=1,b=0,c=0,d=1;
    const corners=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>[a*x+c*y,b*x+d*y]);
    const minX=Math.min(...corners.map(p=>p[0])),minY=Math.min(...corners.map(p=>p[1]));
    const width=Math.max(...corners.map(p=>p[0]))-minX,height=Math.max(...corners.map(p=>p[1]))-minY;
    const size=Math.max(width,height),blur=Math.max(1.5,size*.004),maxLift=Math.max(14,size*.045),lift=floating?maxLift:2;
    const depth=Math.max(2,Math.round(m.cell*.13));
    const margin=Math.ceil(Math.max(12,maxLift+blur*3+depth+4));
    canvas.width=Math.ceil(width+margin*2);canvas.height=Math.ceil(height+margin*2+depth);
    const ctx=canvas.getContext('2d');
    const background=ctx.createRadialGradient(canvas.width*.35,canvas.height*.26,0,canvas.width*.5,canvas.height*.5,Math.max(canvas.width,canvas.height)*.72);
    background.addColorStop(0,'#ffffff');background.addColorStop(.7,'#f5f3ee');background.addColorStop(1,'#eae7df');ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);
    const scene=makeCanvas(canvas.width,canvas.height),s=scene.getContext('2d');
    s.setTransform(a,b,c,d,margin-minX,margin-minY);
    for(let z=depth;z>0;z--)s.drawImage(m.side,Math.round(z*.25),z);
    s.drawImage(m.face,0,0);
    // Move the source out of frame: only its alpha-shaped shadow lands on the backdrop.
    ctx.save();ctx.shadowColor=floating?'rgba(31,28,24,.48)':'rgba(38,33,27,.18)';ctx.shadowBlur=floating?blur:1;
    ctx.shadowOffsetX=canvas.width*2+lift*.85;ctx.shadowOffsetY=lift;ctx.drawImage(scene,-canvas.width*2,0);ctx.restore();
    ctx.drawImage(scene,0,0);scene.width=1;
    return canvas;
  }
  window.BeadFinish={draw};
})();
