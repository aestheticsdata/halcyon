// The negative half of the fixture suite. Every construct here is house-conformant and
// must produce zero diagnostics.
//
// It earns its place on R20 and R6/R8, the two rules whose failure mode is
// over-reporting rather than under-reporting: R20 must leave a correctly capitalised
// acronym and every camelCase member alone, and R6/R8 must leave a bare constructor
// alone. A rule that fires here is as broken as one that stays silent on violations.ts.

import type { Contract } from "./types";

class UIStateStore {
  private readonly viewportHud: number;
  private readonly dogUrl: string;

  constructor(viewportHud: number, dogUrl: string) {
    this.viewportHud = viewportHud;
    this.dogUrl = dogUrl;
  }

  public get hud(): number {
    return this.viewportHud;
  }

  public describe(): string {
    return this.dogUrl;
  }
}

class ViewportHUD {
  private readonly store: UIStateStore;

  constructor(store: UIStateStore) {
    this.store = store;
  }

  public read(): number {
    return this.store.hud;
  }
}

class MIDIBindingRouter {
  private readonly bound: number;

  constructor(bound: number) {
    this.bound = bound;
  }

  public get count(): number {
    return this.bound;
  }
}

class FPSMeter {
  private readonly samples: number[];

  constructor(samples: number[]) {
    this.samples = samples;
  }

  public total(): number {
    let running = 0;
    for (const sample of this.samples) {
      running += sample;
    }
    return running;
  }
}

class Triangle {
  private readonly shape: Contract;

  constructor(shape: Contract) {
    this.shape = shape;
  }

  public area(): number {
    return this.shape.area();
  }
}

const DEFAULT_SAMPLES = [1, 2, 3];

class Conformant {
  private readonly meter: FPSMeter;
  private readonly hud: ViewportHUD;
  private readonly triangle: Triangle;

  constructor(shape: Contract) {
    this.meter = new FPSMeter(DEFAULT_SAMPLES);
    this.hud = new ViewportHUD(new UIStateStore(1, "x"));
    this.triangle = new Triangle(shape);
  }

  public report(): number {
    return this.meter.total() + this.hud.read() + this.triangle.area();
  }
}

export default Conformant;
