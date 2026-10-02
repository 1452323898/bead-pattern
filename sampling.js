(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BeadSampling=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const directions=[[1,0],[0,1],[1,1],[1,-1]];
  const bins=4096;

  // Join nearby tones across a histogram boundary before choosing a flat fill.
  // A small amount of image compression/noise must not split one purple fill
  // into several bins and let a minority beige background replace its color.
  function dominantFlat(keys,stamp,stamps,weights,red,green,blue){
    const seeds=[];
    for(const key of keys){
      let at=0;
      while(at<seeds.length&&weights[seeds[at]]>=weights[key])at++;
      if(at<4){seeds.splice(at,0,key);if(seeds.length>4)seeds.pop();}
    }
    let best=null;
    for(const seed of seeds){
      const sr=red[seed]/weights[seed],sg=green[seed]/weights[seed],sb=blue[seed]/weights[seed];
      const kr=seed>>8,kg=(seed>>4)&15,kb=seed&15;
      let weight=0,r=0,g=0,b=0;
      for(let dr=-1;dr<=1;dr++)for(let dg=-1;dg<=1;dg++)for(let db=-1;db<=1;db++){
        if(kr+dr<0||kr+dr>15||kg+dg<0||kg+dg>15||kb+db<0||kb+db>15)continue;
        const key=(kr+dr)*256+(kg+dg)*16+kb+db;
        if(stamps[key]!==stamp)continue;
        const w=weights[key],rr=red[key]/w,gg=green[key]/w,bb=blue[key]/w;
        if((rr-sr)**2+(gg-sg)**2+(bb-sb)**2>18*18)continue;
        weight+=w;r+=red[key];g+=green[key];b+=blue[key];
      }
      if(!best||weight>best.weight)best={weight,r:r/weight,g:g/weight,b:b/weight};
    }
    return best;
  }

  // Opposite, similar neighbors identify narrow strokes; a broad color edge
  // has one neighbor like the center and is deliberately left alone.
  function ridgeMap(data,width,height,radius,transparent){
    const feature=new Float32Array(data.length),mask=new Uint8Array(width*height);
    for(let i=0;i<data.length;i+=4){
      const a=data[i+3]/255;
      for(let c=0;c<3;c++)feature[i+c]=(data[i+c]*a+(transparent?0:255*(1-a)))/Math.sqrt(3);
      feature[i+3]=transparent?data[i+3]*Math.SQRT1_2:0;
    }
    const radii=radius>1?[1,radius]:[1];
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const index=y*width+x,i=index*4;
      if(transparent&&data[i+3]<32)continue;
      let found=false;
      for(const r of radii){
        for(const [dx,dy] of directions){
          const ax=Math.max(0,Math.min(width-1,x-dx*r)),ay=Math.max(0,Math.min(height-1,y-dy*r));
          const bx=Math.max(0,Math.min(width-1,x+dx*r)),by=Math.max(0,Math.min(height-1,y+dy*r));
          const a=(ay*width+ax)*4,b=(by*width+bx)*4;
          let da=0,db=0,dot=0,between=0;
          for(let c=0;c<4;c++){
            const u=feature[i+c]-feature[a+c],v=feature[i+c]-feature[b+c];
            da+=u*u;db+=v*v;dot+=u*v;between+=(u-v)*(u-v);
          }
          if(da>=28*28&&db>=28*28&&dot>0&&dot*dot>=.64*da*db&&between<=Math.max(48*48,Math.min(da,db)*.6)){found=true;break;}
        }
        if(found)break;
      }
      if(found)mask[index]=1;
    }
    const supported=new Uint8Array(mask.length);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const index=y*width+x;
      if(!mask[index])continue;
      for(let dy=-1;dy<=1&&!supported[index];dy++)for(let dx=-1;dx<=1;dx++){
        if((!dx&&!dy)||x+dx<0||x+dx>=width||y+dy<0||y+dy>=height)continue;
        const neighbor=(y+dy)*width+x+dx;
        if(!mask[neighbor])continue;
        let distance=0;
        for(let c=0;c<4;c++)distance+=(feature[index*4+c]-feature[neighbor*4+c])**2;
        if(distance<=48*48){supported[index]=1;break;}
      }
    }
    return supported;
  }

  function sample(data,sourceWidth,sourceHeight,width,height,{mode='photo',detail=70,transparent=true}={}){
    if(![sourceWidth,sourceHeight,width,height].every(n=>Number.isInteger(n)&&n>0)||sourceWidth*sourceHeight>4194304||width*height>19200||data.length!==sourceWidth*sourceHeight*4)throw new RangeError('采样图片尺寸无效');
    if(!['photo','illustration','lineart','pixel'].includes(mode))throw new RangeError('图片类型无效');
    if(!Number.isFinite(detail)||detail<0||detail>100)throw new RangeError('线条保留强度无效');
    const result=new Uint8ClampedArray(width*height*4),sx=sourceWidth/width,sy=sourceHeight/height;
    if(mode==='pixel'){
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=(Math.min(sourceHeight-1,Math.floor((y+.5)*sy))*sourceWidth+Math.min(sourceWidth-1,Math.floor((x+.5)*sx)))*4;
        result.set(data.subarray(i,i+4),(y*width+x)*4);
      }
      return result;
    }
    const strength=(mode==='lineart'?1:mode==='illustration'?.7:0)*detail/100;
    const enhanced=strength>0&&Math.min(sx,sy)>=2;
    const ridge=enhanced?ridgeMap(data,sourceWidth,sourceHeight,Math.min(4,Math.max(1,Math.floor(Math.min(sx,sy)*.4))),transparent):null;
    const stamps=new Uint32Array(512),weights=new Float64Array(512),alpha=new Float64Array(512);
    const red=new Float64Array(512),green=new Float64Array(512),blue=new Float64Array(512);
    const minX=new Int32Array(512),maxX=new Int32Array(512),minY=new Int32Array(512),maxY=new Int32Array(512);
    const flatStamps=new Uint32Array(bins),flatWeights=new Float64Array(bins),flatR=new Float64Array(bins),flatG=new Float64Array(bins),flatB=new Float64Array(bins);
    const preserve=Math.min(1,detail/60);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const x0=x*sx,x1=(x+1)*sx,y0=y*sy,y1=(y+1)*sy;
      const cell=y*width+x,stamp=cell+1,area=sx*sy;
      let sumA=0,sumR=0,sumG=0,sumB=0,best=-1,totalRidge=0;
      const flatKeys=[];
      for(let py=Math.floor(y0);py<Math.min(sourceHeight,Math.ceil(y1));py++){
        const wy=Math.min(y1,py+1)-Math.max(y0,py);
        for(let px=Math.floor(x0);px<Math.min(sourceWidth,Math.ceil(x1));px++){
          const w=wy*(Math.min(x1,px+1)-Math.max(x0,px)),index=py*sourceWidth+px,i=index*4;
          const originalA=data[i+3]/255,a=transparent?originalA:1,aw=w*a;
          const r=transparent?data[i]:data[i]*originalA+255*(1-originalA);
          const g=transparent?data[i+1]:data[i+1]*originalA+255*(1-originalA);
          const b=transparent?data[i+2]:data[i+2]*originalA+255*(1-originalA);
          sumA+=aw;sumR+=r*aw;sumG+=g*aw;sumB+=b*aw;
          if(!enhanced||!aw)continue;
          if(mode==='illustration'){
            const key=(r>>4)*256+(g>>4)*16+(b>>4);
            if(flatStamps[key]!==stamp){flatStamps[key]=stamp;flatWeights[key]=flatR[key]=flatG[key]=flatB[key]=0;flatKeys.push(key);}
            flatWeights[key]+=aw;flatR[key]+=r*aw;flatG[key]+=g*aw;flatB[key]+=b*aw;
          }
          if(!ridge[index])continue;
          // Stroke support uses the wider bins so tiny shade/compression
          // changes along a one-pixel line cannot fragment its continuity.
          const key=(r>>5)*64+(g>>5)*8+(b>>5);
          totalRidge+=w;
          if(stamps[key]!==stamp){
            stamps[key]=stamp;weights[key]=alpha[key]=red[key]=green[key]=blue[key]=0;
            minX[key]=maxX[key]=px;minY[key]=maxY[key]=py;
          }
          weights[key]+=w;alpha[key]+=aw;red[key]+=r*aw;green[key]+=g*aw;blue[key]+=b*aw;
          minX[key]=Math.min(minX[key],px);maxX[key]=Math.max(maxX[key],px);
          minY[key]=Math.min(minY[key],py);maxY[key]=Math.max(maxY[key],py);
          if(best<0||alpha[key]>alpha[best])best=key;
        }
      }
      const out=cell*4;
      if(!sumA)continue;
      let r=sumR/sumA,g=sumG/sumA,b=sumB/sumA,a=sumA/area;
      const flat=flatKeys.length?dominantFlat(flatKeys,stamp,flatStamps,flatWeights,flatR,flatG,flatB):null;
      if(flat&&flat.weight/sumA>.55){
        r+=(flat.r-r)*preserve;g+=(flat.g-g)*preserve;b+=(flat.b-b)*preserve;
      }
      if(best>=0){
        const fraction=weights[best]/area;
        const span=Math.max((maxX[best]-minX[best]+1)/sx,(maxY[best]-minY[best]+1)/sy);
        // A meaningful run of pixels is required: don't turn one noisy speck
        // into a bead, or strengthen high-frequency texture across the tile.
        if(fraction>=.025+.08*(1-strength)&&totalRidge/area<=.45&&span>=.55){
          // Once a continuous stroke is identified, keep its own hue rather
          // than tinting it with the surrounding fill. Low strength still
          // transitions gradually from the ordinary area sample.
          const amount=preserve,weight=alpha[best];
          r+=(red[best]/weight-r)*amount;g+=(green[best]/weight-g)*amount;b+=(blue[best]/weight-b)*amount;
          a=Math.max(a,a+(alpha[best]/weights[best]-a)*amount);
          // A subpixel opaque stroke can already have low coverage alpha in the
          // bounded working image. Qualified strokes must cross the bead cutoff;
          // uniform translucent fills never pass the ridge/continuity checks.
          if(transparent)a=Math.max(a,.5+.45*strength);
        }
      }
      result[out]=Math.round(r);result[out+1]=Math.round(g);result[out+2]=Math.round(b);result[out+3]=Math.round(a*255);
    }
    return result;
  }
  return {sample};
});
