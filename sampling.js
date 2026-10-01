(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BeadSampling=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const directions=[[1,0],[0,1],[1,1],[1,-1]];

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
    const flatStamps=new Uint32Array(512),flatWeights=new Float64Array(512),flatR=new Float64Array(512),flatG=new Float64Array(512),flatB=new Float64Array(512);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const x0=x*sx,x1=(x+1)*sx,y0=y*sy,y1=(y+1)*sy;
      const cell=y*width+x,stamp=cell+1,area=sx*sy;
      let sumA=0,sumR=0,sumG=0,sumB=0,best=-1,flat=-1,totalRidge=0;
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
          const key=(r>>5)*64+(g>>5)*8+(b>>5);
          if(mode==='illustration'){
            if(flatStamps[key]!==stamp){flatStamps[key]=stamp;flatWeights[key]=flatR[key]=flatG[key]=flatB[key]=0;}
            flatWeights[key]+=aw;flatR[key]+=r*aw;flatG[key]+=g*aw;flatB[key]+=b*aw;
            if(flat<0||flatWeights[key]>flatWeights[flat])flat=key;
          }
          if(!ridge[index])continue;
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
      if(flat>=0&&flatWeights[flat]/sumA>.55){
        const amount=strength*.45;
        r+=(flatR[flat]/flatWeights[flat]-r)*amount;
        g+=(flatG[flat]/flatWeights[flat]-g)*amount;
        b+=(flatB[flat]/flatWeights[flat]-b)*amount;
      }
      if(best>=0){
        const fraction=weights[best]/area;
        const span=Math.max((maxX[best]-minX[best]+1)/sx,(maxY[best]-minY[best]+1)/sy);
        // A meaningful run of pixels is required: don't turn one noisy speck
        // into a bead, or strengthen high-frequency texture across the tile.
        if(fraction>=.025+.08*(1-strength)&&totalRidge/area<=.45&&span>=.55){
          const amount=Math.min(.95,strength*1.3),weight=alpha[best];
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
