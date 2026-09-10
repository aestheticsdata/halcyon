// Every rule the house style enforces, broken a known number of times.
// scripts/check-lint-rules.mjs asserts the count per rule, because a Grit plugin that
// matches nothing reports nothing and is indistinguishable from a clean file.
//
// The awkward shapes below are not padding. An adversarial pass over the first version
// of these plugins found four rules with silent holes, and every one of them was a shape
// this fixture did not contain: a generic class, a decorated class,
// `export default abstract class`, an acronym in the middle of a name, a member whose
// body declares its own class. A fixture that only exercises the easy form certifies a
// rule that only works on the easy form.
//
// It is deliberately outside src/: tsconfig only includes src, and `pnpm run lint` only
// checks src, so nothing here reaches the real build or the real lint run.

import { Contract } from "./types";

declare function decorate(target: unknown): void;

// R1 ×7 — every exported class form. Generics, `abstract`, decorators and heritage each
// defeated the original snippet-based rule outright.
export class NamedExport {
  public area(): number {
    return 1;
  }
}

export class GenericExport<T> {
  private held: T | null = null;

  public read(): T | null {
    return this.held;
  }
}

export class ExtendingExport extends Object {
  public area(): number {
    return 1;
  }
}

export class ImplementingExport implements Contract {
  public area(): number {
    return 1;
  }
}

@decorate
export class DecoratedExport {
  public area(): number {
    return 1;
  }
}

export abstract class AbstractExport {
  public abstract thing(): void;
}

// D4 abstract — four abstract classes across the file, each contributing two hits (the
// class keyword and its abstract member). `export default abstract class` is its own
// node and was invisible to every plugin before the fix.
abstract class AbstractPlain {
  public abstract thing(): void;
}

abstract class AbstractGeneric<T> {
  public abstract read(): T | null;
}

// D4 inheritance ×2, implements ×1.
class Subclass extends AbstractPlain {
  public thing(): void {}
}

class Implementor implements Contract {
  public area(): number {
    return 1;
  }
}

// D4 protected ×1.
class Protector {
  protected secret: number = 1;
}

// R3 ×1 — a parameter property.
class ParameterProperty {
  constructor(private readonly injected: number) {
    void this.injected;
  }
}

// R6 + R8 ×5 — a bare field, method, getter, setter and `nested`. The constructor is
// exempt and must not be counted. `nested` matters: its body declares a class carrying
// `private`, which used to satisfy the subtree search and silently exempt the method.
class BareMembers {
  loose: number = 1;

  constructor() {}

  method(): void {}

  get value(): number {
    return 1;
  }

  set value(next: number) {
    void next;
  }

  nested(): void {
    class Inner {
      private hidden: number = 2;

      public read(): number {
        return this.hidden;
      }
    }
    void Inner;
  }
}

// R6 + R8 negative — `#field` cannot carry an accessibility modifier (TS18010), so
// demanding one asks for something unwritable. Must stay silent.
class HashFields {
  #hidden: number = 1;

  public read(): number {
    return this.#hidden;
  }
}

// R20 ×7 — front, back, middle, the two acronyms dropped in the first port, and
// the newest family (HAL-194): MIDI is an acronym like every other one here.
class UiStateStore {
  private readonly held: number = 1;

  public read(): number {
    return this.held;
  }
}

class MidiRouter {
  private readonly held: number = 1;

  public read(): number {
    return this.held;
  }
}

class ShapeUiPanel {
  private readonly held: number = 1;

  public read(): number {
    return this.held;
  }
}

class RgbaTuple {
  private readonly held: number = 1;

  public read(): number {
    return this.held;
  }
}

class ThingUuid {
  private readonly held: number = 1;

  public read(): number {
    return this.held;
  }
}

interface DomBits {
  node: number;
}

type FpsAlias = number;

// R6 + R8 ×1 more — a `declare` field is its own node type, invisible to the four
// concrete member nodes.
class DeclaredField {
  declare loose: number;

  public read(): number {
    return this.loose;
  }
}

// R15 ×2 — module-level mutable state, plain and ambient. `declare let` is a
// TsDeclareStatement and is invisible to JsVariableStatement.
let moduleMutable = 0;

declare let ambientMutable: number;

// I4 ×1 — `for…in`.
class Looper {
  public run(bag: Record<string, number>, hint: Contract, bits: DomBits, rate: FpsAlias): void {
    for (const key in bag) {
      void key;
    }
    void moduleMutable;
    void ambientMutable;
    void hint;
    void bits;
    void rate;
  }
}

export default abstract class DefaultAbstractExport {
  public abstract read(): number;
}
