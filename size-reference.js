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

  function layout(pattern, {pitchMm = 2.6, reference = 'coin', geometry} = {}) {
    const measurement = measure(pattern, pitchMm);
    if (!['none','coin','phone','both'].includes(reference)) throw new RangeError('参照物无效');
    if (!geometry || !['width','height','cell'].every(key => Number.isFinite(geometry[key]) && geometry[key] > 0) ||
        !['originX','originY'].every(key => Number.isFinite(geometry[key]) && geometry[key] >= 0)) {
      throw new RangeError('预览坐标无效');
    }
    const {width, height, cell, originY} = geometry;
    const scene = {width, height, base:{x:0,y:0,width,height}, references:[]};
    if (!measurement || reference === 'none') return scene;

    const definitions = [];
    if (reference === 'coin' || reference === 'both') definitions.push({kind:'coin',widthMm:25,heightMm:25});
    if (reference === 'phone' || reference === 'both') definitions.push({kind:'phone',widthMm:70,heightMm:150});
    const pixelsPerMm = cell / pitchMm;
    const subjectBottom = originY + (measurement.bounds.y + measurement.bounds.height) * cell;
    const tallest = Math.max(...definitions.map(item => item.heightMm * pixelsPerMm));
    const topOffset = Math.max(0, tallest - subjectBottom);
    // The canvas and references share this unscaled scene, so later pan/zoom
    // transforms cannot change their physical size ratio.
    scene.base.y = topOffset;
    scene.height = height + topOffset;
    const gap = Math.max(16, cell * 2);
    let nextX = width + gap;
    for (const definition of definitions) {
      const itemWidth = definition.widthMm * pixelsPerMm;
      const itemHeight = definition.heightMm * pixelsPerMm;
      const item = {
        kind:definition.kind,
        x:nextX,
        y:Math.max(0, subjectBottom + topOffset - itemHeight),
        width:itemWidth,
        height:itemHeight,
        widthMm:definition.widthMm,
        heightMm:definition.heightMm
      };
      scene.references.push(item);
      scene.height = Math.max(scene.height, item.y + item.height);
      nextX += itemWidth + gap;
    }
    scene.width = nextX - gap;
    if (![scene.width,scene.height,scene.base.y].every(Number.isFinite)) throw new RangeError('预览尺寸过大');
    return scene;
  }

  return {measure, layout};
});
