/**
 * Minimal, correct 2D-affine `DOMMatrix` polyfill for the Convex Node runtime.
 *
 * WHY: pdfjs-dist's legacy build constructs `new DOMMatrix()` at MODULE-EVALUATION
 * time (e.g. `const SCALE_MATRIX = new DOMMatrix()`), so merely importing it throws
 * `ReferenceError: DOMMatrix is not defined` when the global is absent. pdfjs only
 * borrows `DOMMatrix` from `@napi-rs/canvas`, which we don't install (we extract
 * text, we never render). This supplies a self-contained global instead.
 *
 * SCOPE: a correct 2D affine matrix `[a b c d e f]` (the 3D `mNN` paths pdfjs uses
 * live in canvas/SVG rendering, which `getTextContent` never reaches). Methods
 * follow the DOM spec contract: `*Self` mutate and return `this`; `translate`/
 * `scale`/`multiply` return a NEW matrix (pdfjs relies on both via chaining).
 */

type MatrixInit =
  | number[]
  | { a: number; b: number; c: number; d: number; e: number; f: number }
  | string
  | undefined;

class DOMMatrixPolyfill {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: MatrixInit) {
    if (init == null) return;
    if (Array.isArray(init)) {
      if (init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      } else if (init.length === 16) {
        // 4x4 column-major → take the 2D affine components (m11,m12,m21,m22,m41,m42)
        this.a = init[0];
        this.b = init[1];
        this.c = init[4];
        this.d = init[5];
        this.e = init[12];
        this.f = init[13];
      }
    } else if (typeof init === "object") {
      this.a = init.a;
      this.b = init.b;
      this.c = init.c;
      this.d = init.d;
      this.e = init.e;
      this.f = init.f;
    }
    // String initializers (CSS transform syntax) are unused by text extraction.
  }

  // DOM aliases pdfjs may read.
  get m11() { return this.a; }
  get m12() { return this.b; }
  get m21() { return this.c; }
  get m22() { return this.d; }
  get m41() { return this.e; }
  get m42() { return this.f; }

  private static of(
    a: number, b: number, c: number, d: number, e: number, f: number,
  ): DOMMatrixPolyfill {
    const m = new DOMMatrixPolyfill();
    m.a = a; m.b = b; m.c = c; m.d = d; m.e = e; m.f = f;
    return m;
  }

  /** result = this · other (post-multiply), as a new matrix. */
  multiply(o: DOMMatrixPolyfill): DOMMatrixPolyfill {
    return DOMMatrixPolyfill.of(
      this.a * o.a + this.c * o.b,
      this.b * o.a + this.d * o.b,
      this.a * o.c + this.c * o.d,
      this.b * o.c + this.d * o.d,
      this.a * o.e + this.c * o.f + this.e,
      this.b * o.e + this.d * o.f + this.f,
    );
  }

  multiplySelf(o: DOMMatrixPolyfill): this {
    const r = this.multiply(o);
    return this.copyFrom(r);
  }

  /** this = other · this. */
  preMultiplySelf(o: DOMMatrixPolyfill): this {
    const r = o.multiply(this);
    return this.copyFrom(r);
  }

  translate(tx = 0, ty = 0): DOMMatrixPolyfill {
    return this.multiply(DOMMatrixPolyfill.of(1, 0, 0, 1, tx, ty));
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.copyFrom(this.translate(tx, ty));
  }

  scale(sx = 1, sy?: number): DOMMatrixPolyfill {
    return this.multiply(DOMMatrixPolyfill.of(sx, 0, 0, sy ?? sx, 0, 0));
  }

  scaleSelf(sx = 1, sy?: number): this {
    return this.copyFrom(this.scale(sx, sy));
  }

  inverse(): DOMMatrixPolyfill {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      return DOMMatrixPolyfill.of(NaN, NaN, NaN, NaN, NaN, NaN);
    }
    return DOMMatrixPolyfill.of(
      this.d / det,
      -this.b / det,
      -this.c / det,
      this.a / det,
      (this.c * this.f - this.d * this.e) / det,
      (this.b * this.e - this.a * this.f) / det,
    );
  }

  invertSelf(): this {
    return this.copyFrom(this.inverse());
  }

  private copyFrom(o: DOMMatrixPolyfill): this {
    this.a = o.a; this.b = o.b; this.c = o.c; this.d = o.d; this.e = o.e; this.f = o.f;
    return this;
  }
}

/**
 * Install the polyfill on `globalThis` if (and only if) no native DOMMatrix exists.
 * MUST be called before importing any pdfjs build. Idempotent.
 */
export function installDomMatrixPolyfill(): void {
  const g = globalThis as { DOMMatrix?: unknown };
  if (!g.DOMMatrix) {
    g.DOMMatrix = DOMMatrixPolyfill as unknown as typeof DOMMatrix;
  }
}
