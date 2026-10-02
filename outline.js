(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BeadOutline=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const coverageCutoff=48;
  const squareDistance=(data,a,b)=>(data[a]-data[b])**2+(data[a+1]-data[b+1])**2+(data[a+2]-data[b+2])**2;

  // Opaque antialias pixels lie between the flat background and a real color.
  // A fringe by itself is not a drawn stroke; looking one pixel farther in
  // can recover the actual ink without mistaking a smooth silhouette for ink.
  function isBackgroundBlend(data,pixel,opaque,background){
    if(!background)return false;
    let dot=0,length=0;
    for(let c=0;c<3;c++){const v=data[opaque+c]-background[c];dot+=(data[pixel+c]-background[c])*v;length+=v*v;}
    if(length<1)return false;
    const fraction=dot/length;
    if(fraction<=0||fraction>=.98)return false;
    let error=0;
    for(let c=0;c<3;c++)error+=(data[pixel+c]-background[c]-(data[opaque+c]-background[c])*fraction)**2;
    return error<=Math.max(10*10*3,length*.01);
  }

  function outsideMask(data,width,height){
    const length=width*height,border=[];
    for(let x=0;x<width;x++){border.push(x);if(height>1)border.push((height-1)*width+x);}
    for(let y=1;y<height-1;y++){border.push(y*width);if(width>1)border.push(y*width+width-1);}
    let transparentCount=0;
    const bins=new Map();
    for(const index of border){
      const i=index*4;
      if(data[i+3]<coverageCutoff){transparentCount++;continue;}
      if(data[i+3]<224)continue;
      const key=(data[i]>>4)*256+(data[i+1]>>4)*16+(data[i+2]>>4);
      let bin=bins.get(key);
      if(!bin){bin={count:0,r:0,g:0,b:0};bins.set(key,bin);}
      bin.count++;bin.r+=data[i];bin.g+=data[i+1];bin.b+=data[i+2];
    }
    let background,passable,backgroundColor=null;
    if(transparentCount>=Math.max(1,border.length*.05)){
      background='transparent';passable=index=>data[index*4+3]<coverageCutoff;
    }else{
      let best=null;
      for(const bin of bins.values())if(!best||bin.count>best.count)best=bin;
      if(!best)return null;
      const r=best.r/best.count,g=best.g/best.count,b=best.b/best.count;
      backgroundColor=[r,g,b];
      passable=index=>{const i=index*4;return data[i+3]<coverageCutoff||(data[i+3]>=224&&(data[i]-r)**2+(data[i+1]-g)**2+(data[i+2]-b)**2<=18*18*3);};
      let matches=0;
      for(const index of border)if(passable(index))matches++;
      if(matches<border.length*.88)return null;
      background='solid';
    }
    // Flood from the actual frame, not from every transparent/white pixel:
    // enclosed holes are deliberately not part of the external silhouette.
    const exterior=new Uint8Array(length),queue=new Int32Array(length);
    let head=0,tail=0;
    function visit(index){if(!exterior[index]&&passable(index)){exterior[index]=1;queue[tail++]=index;}}
    for(const index of border)visit(index);
    while(head<tail){
      const index=queue[head++],x=index%width,y=Math.floor(index/width);
      if(x>0)visit(index-1);if(x+1<width)visit(index+1);
      if(y>0)visit(index-width);if(y+1<height)visit(index+width);
    }
    return {exterior,background,backgroundColor,count:tail,queue};
  }

  function enhance(source,sourceWidth,sourceHeight,sampled,width,height,{transparent=true}={}){
    if(![sourceWidth,sourceHeight,width,height].every(n=>Number.isInteger(n)&&n>0)||sourceWidth>1024||sourceHeight>1024||width*height>19200||!source||source.length!==sourceWidth*sourceHeight*4||!sampled||sampled.length!==width*height*4)throw new RangeError('轮廓处理图片尺寸无效');
    const data=new Uint8ClampedArray(sampled),mask=new Uint8Array(width*height);
    const result={data,mask,applied:false,changedCells:0,outlineCells:0,reason:'no-outline',background:null};
    const outside=outsideMask(source,sourceWidth,sourceHeight);
    if(!outside){result.reason='complex-background';return result;}
    const {exterior,background,backgroundColor,queue}=outside;
    result.background=background;
    if(outside.count===sourceWidth*sourceHeight){result.reason='no-subject';return result;}
    const sx=sourceWidth/width,sy=sourceHeight/height,minCell=Math.min(sx,sy);
    const maxDepth=Math.max(2,Math.min(12,Math.ceil(minCell*.7)+2));
    const candidates=new Uint8Array(exterior.length),supported=new Uint8Array(exterior.length),inks=new Uint32Array(exterior.length);
    let boundaryCount=0;
    for(let y=0;y<sourceHeight;y++)for(let x=0;x<sourceWidth;x++){
      const index=y*sourceWidth+x,i=index*4;
      if(exterior[index]||source[i+3]<coverageCutoff)continue;
      const left=x>0&&exterior[index-1],right=x+1<sourceWidth&&exterior[index+1];
      const top=y>0&&exterior[index-sourceWidth],bottom=y+1<sourceHeight&&exterior[index+sourceWidth];
      if(!left&&!right&&!top&&!bottom)continue;
      boundaryCount++;
      const dx=Number(left)-Number(right),dy=Number(top)-Number(bottom);
      if(!dx&&!dy)continue;
      const fringeDepth=backgroundColor?Math.min(2,Math.max(1,Math.floor(minCell*.5))):0;
      let inkScore=0;
      for(let offset=0;offset<=fringeDepth;offset++){
        const ix=x+dx*offset,iy=y+dy*offset;
        if(ix<0||ix>=sourceWidth||iy<0||iy>=sourceHeight)break;
        const inkIndex=iy*sourceWidth+ix,ink=inkIndex*4;
        if(exterior[inkIndex]||source[ink+3]<coverageCutoff)break;
        if(offset&&!isBackgroundBlend(source,i,ink,backgroundColor))continue;
        let previous=ink,transitionAt=0,largestStep=0;
        for(let depth=offset+1;depth<=maxDepth;depth++){
          const px=x+dx*depth,py=y+dy*depth;
          if(px<0||px>=sourceWidth||py<0||py>=sourceHeight)break;
          const next=py*sourceWidth+px,j=next*4;
          if(exterior[next]||source[j+3]<coverageCutoff)break;
          const contrast=squareDistance(source,ink,j),step=squareDistance(source,previous,j);
          previous=j;
          if(!transitionAt&&contrast<=24*24*3)continue;
          if(!transitionAt)transitionAt=depth;
          if(depth-transitionAt>2)break;
          largestStep=Math.max(largestStep,step);
          // Require a sharp ink-to-fill transition followed by stable fill.
          // A silhouette edge alone, or a slow photographic gradient, is not
          // evidence that the picture had a drawn outer stroke.
          // A rasterized stroke can have one or two ink/fill mixture pixels.
          // Follow that short transition to its stable fill instead of
          // rejecting the entire curved contour at the first mixed pixel.
          if(contrast<40*40*3||largestStep<32*32*3)continue;
          if(isBackgroundBlend(source,ink,j,backgroundColor))break;
          let stable=true;
          for(let step=1;step<=2;step++){
            const qx=px+dx*step,qy=py+dy*step;
            if(qx<0||qx>=sourceWidth||qy<0||qy>=sourceHeight){stable=false;break;}
            const q=qy*sourceWidth+qx,k=q*4;
            if(exterior[q]||source[k+3]<coverageCutoff||squareDistance(source,j,k)>18*18*3){stable=false;break;}
          }
          if(stable){
            // Pick the ink with the least background dilution; simply taking
            // the deepest qualifying pixel can pick the inner ink/fill mix
            // and fragment an otherwise continuous colored stroke.
            const score=backgroundColor?(source[ink]-backgroundColor[0])**2+(source[ink+1]-backgroundColor[1])**2+(source[ink+2]-backgroundColor[2])**2:1;
            if(score>inkScore){candidates[index]=1;inks[index]=ink;inkScore=score;}
            break;
          }
        }
      }
      if(candidates[index]&&backgroundColor){
        // At a curved corner the discrete inward ray can miss the fully
        // covered ink pixel by one pixel. Recover a nearby, similar source
        // ink color; the contrasting fill is excluded by the color bound.
        const ink=inks[index],ix=(ink/4)%sourceWidth,iy=Math.floor(ink/4/sourceWidth);
        for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
          const px=ix+ox,py=iy+oy;
          if(px<0||px>=sourceWidth||py<0||py>=sourceHeight)continue;
          const p=py*sourceWidth+px,j=p*4;
          if(exterior[p]||source[j+3]<coverageCutoff||squareDistance(source,ink,j)>24*24*3)continue;
          const score=(source[j]-backgroundColor[0])**2+(source[j+1]-backgroundColor[1])**2+(source[j+2]-backgroundColor[2])**2;
          if(score>inkScore){inks[index]=j;inkScore=score;}
        }
      }
    }
    // A connected, similarly colored run must be long enough to be a stroke.
    // This rejects specks and avoids turning internal texture into a contour.
    const visited=new Uint8Array(exterior.length);
    const minimumRun=Math.max(6,Math.ceil(minCell*.6));
    let supportedCount=0;
    for(let start=0;start<candidates.length;start++){
      if(!candidates[start]||visited[start])continue;
      let head=0,tail=1,minX=sourceWidth,maxX=0,minY=sourceHeight,maxY=0;
      queue[0]=start;visited[start]=1;
      while(head<tail){
        const index=queue[head++],x=index%sourceWidth,y=Math.floor(index/sourceWidth);
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const px=x+dx,py=y+dy;
          if((!dx&&!dy)||px<0||px>=sourceWidth||py<0||py>=sourceHeight)continue;
          const neighbor=py*sourceWidth+px;
          if(!candidates[neighbor]||visited[neighbor]||squareDistance(source,inks[index],inks[neighbor])>26*26*3)continue;
          visited[neighbor]=1;queue[tail++]=neighbor;
        }
      }
      if(tail<minimumRun||Math.max(maxX-minX+1,maxY-minY+1)<Math.max(3,minCell*1.25))continue;
      for(let j=0;j<tail;j++)supported[queue[j]]=1;
      supportedCount+=tail;
    }
    if(supportedCount<Math.max(12,boundaryCount*.12))return result;
    const cells=new Map();
    for(let index=0;index<supported.length;index++){
      if(!supported[index])continue;
      const x=index%sourceWidth,y=Math.floor(index/sourceWidth),i=inks[index];
      const cell=Math.min(height-1,Math.floor((y+.5)/sy))*width+Math.min(width-1,Math.floor((x+.5)/sx));
      let bins=cells.get(cell);if(!bins){bins=new Map();cells.set(cell,bins);}
      const key=(source[i]>>4)*256+(source[i+1]>>4)*16+(source[i+2]>>4);
      let bin=bins.get(key);
      if(!bin){bin={weight:0,index:i,alpha:source[i+3]};bins.set(key,bin);}
      bin.weight+=source[i+3];
      if(source[i+3]>bin.alpha){bin.index=i;bin.alpha=source[i+3];}
    }
    for(const [cell,bins] of cells){
      let best=null;
      for(const bin of bins.values())if(!best||bin.weight>best.weight)best=bin;
      const out=cell*4,ink=best.index,alpha=source[ink+3]/255;
      let changed=false;
      for(let channel=0;channel<3;channel++){
        // Use an actual source color, never a fixed black or an invented mix
        // of the outer stroke and the adjacent fill.
        const value=transparent?source[ink+channel]:Math.round(source[ink+channel]*alpha+255*(1-alpha));
        if(data[out+channel]!==value)changed=true;
        data[out+channel]=value;
      }
      const opacity=transparent?Math.max(data[out+3],source[ink+3],128):255;
      if(data[out+3]!==opacity)changed=true;
      data[out+3]=opacity;mask[cell]=1;result.outlineCells++;
      if(changed)result.changedCells++;
    }
    result.applied=result.outlineCells>0;
    if(result.applied)result.reason='enhanced';
    return result;
  }
  return {enhance};
});
