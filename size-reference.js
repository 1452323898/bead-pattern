(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BeadSize = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function measure(pattern, pitchMm = 2.6) {
    if (!Number.isFinite(pitchMm) || pitchMm < 1 || pitchMm > 10) {
      throw new RangeError('格距需为 1 至 10 毫米');
    }
    if (!pattern || !Number.isSafeInteger(pattern.width) || pattern.width < 1 ||
        !Number.isSafeInteger(pattern.height) || pattern.height < 1 ||
        !Number.isSafeInteger(pattern.width * pattern.height) ||
        !(Array.isArray(pattern.cells) || ArrayBuffer.isView(pattern.cells)) ||
        pattern.cells.length !== pattern.width * pattern.height) {
      throw new RangeError('图纸尺寸或格子数据无效');
    }
    const {width, height, cells} = pattern;
    let left = width, top = height, right = -1, bottom = -1;
    for (let index = 0; index < cells.length; index++) {
      const value = cells[index];
      if (!Number.isSafeInteger(value) || value < -1) throw new RangeError('图纸格子编号无效');
      if (value < 0) continue;
      const x = index % width, y = Math.floor(index / width);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    if (right < 0) return null;
    // Count whole occupied cells, not the distance between their center points.
    const bounds = {x:left, y:top, width:right-left+1, height:bottom-top+1};
    return {
      bounds,
      widthMm:bounds.width*pitchMm,
      heightMm:bounds.height*pitchMm,
      gridWidthMm:width*pitchMm,
      gridHeightMm:height*pitchMm,
      pitchMm
    };
  }

  function choosePaper(widthMm, heightMm) {
    const standards = [
      {name:'A5',short:148,long:210}, {name:'A4',short:210,long:297},
      {name:'A3',short:297,long:420}, {name:'A2',short:420,long:594},
      {name:'A1',short:594,long:841}
    ];
    const landscape = widthMm > heightMm;
    for (const standard of standards) {
      const width = landscape ? standard.long : standard.short;
      const height = landscape ? standard.short : standard.long;
      const fits = widthMm <= width && heightMm <= height;
      if (fits || standard.name === 'A1') {
        return {name:standard.name,widthMm:width,heightMm:height,
          orientation:landscape?'landscape':'portrait',fits};
      }
    }
  }

  function cmText(mm) {
    return `${Number((mm/10).toFixed(2))} cm`;
  }

  function layout(pattern, {pitchMm = 2.6, reference = 'phone', geometry,
      dimensions = false, paper = false, annotationGap} = {}) {
    const measurement = measure(pattern, pitchMm);
    if (!['none','coin','phone','both'].includes(reference)) throw new RangeError('参照物无效');
    if (!geometry || !['width','height','cell'].every(key => Number.isFinite(geometry[key]) && geometry[key] > 0) ||
        !['originX','originY'].every(key => Number.isFinite(geometry[key]) && geometry[key] >= 0)) {
      throw new RangeError('预览坐标无效');
    }
    const {width, height, cell, originX, originY} = geometry;
    const gap = annotationGap === undefined ? cell*2 : annotationGap;
    if (!Number.isFinite(gap) || gap <= 0) throw new RangeError('标尺间距无效');
    const scene = {width, height, base:{x:0,y:0,width,height}, references:[]};
    if (!measurement) return scene;

    const pixelsPerMm = cell / pitchMm;
    const subject = {
      x:originX+measurement.bounds.x*cell,
      y:originY+measurement.bounds.y*cell,
      width:measurement.bounds.width*cell,
      height:measurement.bounds.height*cell,
      widthMm:measurement.widthMm,heightMm:measurement.heightMm
    };
    // Every element stays at this one physical scale. Bounds are collected
    // before a single translation keeps the whole scene in positive space.
    const bounds = [scene.base];
    const positions = [scene.base,subject];
    const addLabel = (x,y,text,rotation = 0) => {
      const fontSize = gap/2;
      const textWidth = Array.from(text).reduce((sum,char)=>sum+(char.charCodeAt(0)>255?1:0.62),0)*fontSize;
      const label = {x,y,text,rotation,width:textWidth+fontSize,height:fontSize*1.5};
      const width = rotation ? label.height : label.width;
      const height = rotation ? label.width : label.height;
      bounds.push({x:x-width/2,y:y-height/2,width,height});
      positions.push(label);
      return label;
    };
    const addLine = (from,to) => {
      bounds.push({x:Math.min(from.x,to.x),y:Math.min(from.y,to.y),
        width:Math.abs(to.x-from.x),height:Math.abs(to.y-from.y)});
      positions.push(from,to);
      return {from,to};
    };

    if (dimensions || paper) {
      scene.subject = subject;
      scene.pixelsPerMm = pixelsPerMm;
      scene.annotationGap = gap;
      scene.paper = null;
      scene.dimensions = null;
    }
    if (paper) {
      const definition = choosePaper(measurement.widthMm,measurement.heightMm);
      const paperWidth = definition.widthMm*pixelsPerMm;
      const paperHeight = definition.heightMm*pixelsPerMm;
      const frame = {...definition,
        x:subject.x+(subject.width-paperWidth)/2,
        y:subject.y+(subject.height-paperHeight)/2,
        width:paperWidth,height:paperHeight};
      bounds.push(frame);
      positions.push(frame);
      const paperText = `${frame.name} 纸张参照 · ${cmText(frame.widthMm).replace(' cm','')} × ${cmText(frame.heightMm)}${frame.fits?'':'（图案超出）'}`;
      frame.label = addLabel(frame.x+frame.width/2,Math.min(0,frame.y)-gap,paperText);
      scene.paper = frame;
    }
    if (dimensions) {
      const outerLeft = Math.min(0,scene.paper ? scene.paper.x : 0);
      const outerBottom = Math.max(height,scene.paper ? scene.paper.y+scene.paper.height : height);
      const right = subject.x+subject.width;
      const bottom = subject.y+subject.height;
      const horizontalY = outerBottom+gap;
      const verticalX = outerLeft-gap;
      const widthDimension = {
        ...addLine({x:subject.x,y:horizontalY},{x:right,y:horizontalY}),
        valueMm:measurement.widthMm,
        label:addLabel(subject.x+subject.width/2,horizontalY+gap,cmText(measurement.widthMm)),
        extensions:[
          addLine({x:subject.x,y:bottom+gap*0.15},{x:subject.x,y:horizontalY+gap*0.2}),
          addLine({x:right,y:bottom+gap*0.15},{x:right,y:horizontalY+gap*0.2})
        ]
      };
      const heightDimension = {
        ...addLine({x:verticalX,y:subject.y},{x:verticalX,y:bottom}),
        valueMm:measurement.heightMm,
        label:addLabel(verticalX-gap,subject.y+subject.height/2,cmText(measurement.heightMm),-90),
        extensions:[
          addLine({x:subject.x-gap*0.15,y:subject.y},{x:verticalX-gap*0.2,y:subject.y}),
          addLine({x:subject.x-gap*0.15,y:bottom},{x:verticalX-gap*0.2,y:bottom})
        ]
      };
      scene.dimensions = {width:widthDimension,height:heightDimension};
    }

    const definitions = [];
    if (reference === 'coin' || reference === 'both') definitions.push({kind:'coin',widthMm:25,heightMm:25});
    if (reference === 'phone' || reference === 'both') definitions.push({kind:'phone',widthMm:70,heightMm:150});
    const referenceGap = Math.max(16,gap);
    let nextX = Math.max(...bounds.map(item=>item.x+item.width))+referenceGap;
    for (const definition of definitions) {
      const itemWidth = definition.widthMm * pixelsPerMm;
      const itemHeight = definition.heightMm * pixelsPerMm;
      const item = {
        kind:definition.kind,
        x:nextX,
        y:subject.y+subject.height-itemHeight,
        width:itemWidth,
        height:itemHeight,
        widthMm:definition.widthMm,
        heightMm:definition.heightMm
      };
      scene.references.push(item);
      bounds.push(item);
      positions.push(item);
      nextX += itemWidth+referenceGap;
    }
    const left = Math.min(...bounds.map(item=>item.x));
    const top = Math.min(...bounds.map(item=>item.y));
    const right = Math.max(...bounds.map(item=>item.x+item.width));
    const bottom = Math.max(...bounds.map(item=>item.y+item.height));
    scene.width = right-left;
    scene.height = bottom-top;
    for (const position of positions) { position.x -= left; position.y -= top; }
    if (![scene.width,scene.height,scene.base.x,scene.base.y].every(Number.isFinite)) throw new RangeError('预览尺寸过大');
    return scene;
  }

  return {measure, layout};
});
