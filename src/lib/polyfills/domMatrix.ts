class DOMMatrixShim {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  m11 = 1; m12 = 0; m13 = 0; m14 = 0;
  m21 = 0; m22 = 1; m23 = 0; m24 = 0;
  m31 = 0; m32 = 0; m33 = 1; m34 = 0;
  m41 = 0; m42 = 0; m43 = 0; m44 = 1;
  is2D = true;
  isIdentity = true;

  constructor(init?: any) {
    if (Array.isArray(init)) {
      if (init.length === 6) {
        this.a = this.m11 = init[0];
        this.b = this.m12 = init[1];
        this.c = this.m21 = init[2];
        this.d = this.m22 = init[3];
        this.e = this.m41 = init[4];
        this.f = this.m42 = init[5];
      } else if (init.length === 16) {
        this.m11 = init[0]; this.m12 = init[1]; this.m13 = init[2]; this.m14 = init[3];
        this.m21 = init[4]; this.m22 = init[5]; this.m23 = init[6]; this.m24 = init[7];
        this.m31 = init[8]; this.m32 = init[9]; this.m33 = init[10]; this.m34 = init[11];
        this.m41 = init[12]; this.m42 = init[13]; this.m43 = init[14]; this.m44 = init[15];
        this.a = this.m11; this.b = this.m12; this.c = this.m21; this.d = this.m22;
        this.e = this.m41; this.f = this.m42;
        this.is2D = false;
      }
    }
  }

  multiply() { return this; }
  translate() { return this; }
  scale() { return this; }
  rotate() { return this; }
  transformPoint(point?: any) { return point ?? { x: 0, y: 0, z: 0, w: 1 }; }
  inverse() { return this; }
  flipX() { return this; }
  flipY() { return this; }
  skewX() { return this; }
  skewY() { return this; }
  toFloat32Array() {
    return new Float32Array([
      this.m11, this.m12, this.m13, this.m14,
      this.m21, this.m22, this.m23, this.m24,
      this.m31, this.m32, this.m33, this.m34,
      this.m41, this.m42, this.m43, this.m44,
    ]);
  }
  toFloat64Array() {
    return new Float64Array([
      this.m11, this.m12, this.m13, this.m14,
      this.m21, this.m22, this.m23, this.m24,
      this.m31, this.m32, this.m33, this.m34,
      this.m41, this.m42, this.m43, this.m44,
    ]);
  }
}

let _domMatrix: any = (globalThis as any).DOMMatrix || DOMMatrixShim;
try {
  Object.defineProperty(globalThis, "DOMMatrix", {
    get() { return _domMatrix; },
    set(v) { if (v) _domMatrix = v; },
    configurable: true,
    enumerable: true,
  });
  if (typeof global !== "undefined") {
    Object.defineProperty(global, "DOMMatrix", {
      get() { return _domMatrix; },
      set(v) { if (v) _domMatrix = v; },
      configurable: true,
      enumerable: true,
    });
  }
} catch {}

class Path2DShim {
  addPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  bezierCurveTo() {}
  quadraticCurveTo() {}
  arc() {}
  arcTo() {}
  ellipse() {}
  rect() {}
}

let _path2D: any = (globalThis as any).Path2D || Path2DShim;
try {
  Object.defineProperty(globalThis, "Path2D", {
    get() { return _path2D; },
    set(v) { if (v) _path2D = v; },
    configurable: true,
    enumerable: true,
  });
  if (typeof global !== "undefined") {
    Object.defineProperty(global, "Path2D", {
      get() { return _path2D; },
      set(v) { if (v) _path2D = v; },
      configurable: true,
      enumerable: true,
    });
  }
} catch {}

class ImageDataShim {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace: string = "srgb";
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
}

let _imageData: any = (globalThis as any).ImageData || ImageDataShim;
try {
  Object.defineProperty(globalThis, "ImageData", {
    get() { return _imageData; },
    set(v) { if (v) _imageData = v; },
    configurable: true,
    enumerable: true,
  });
  if (typeof global !== "undefined") {
    Object.defineProperty(global, "ImageData", {
      get() { return _imageData; },
      set(v) { if (v) _imageData = v; },
      configurable: true,
      enumerable: true,
    });
  }
} catch {}

export {};
