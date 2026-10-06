// The material resolution and the colour arithmetic under it, in the node
// environment and with no canvas in sight.
//
// That is not incidental — it is why the parse is a regex rather than a scratch
// 1x1 context reading fillStyle back. The blend below is the whole ticket: a
// multiply that gets the identity wrong changes the opening frame of every one
// of the twenty primitives, silently and by a few units per channel, which is
// precisely the class of error a screenshot diff catches late and a test catches
// immediately.
//
// The colours are real registry strings rather than round numbers, including
// both whitespace conventions the shape files actually use.

import data from "@data/data";
import { formatRgba, multiplyColor, parseCssColor } from "@rendering/cssColor";
import { classifyMaterial, DEFAULT_MESH_MATERIAL, resolveMaterial } from "@rendering/material";
import { describe, expect, it } from "vitest";

import type { MeshMaterial } from "@rendering/material";

// src/data/shapes/sphere.ts's two alternating faces, verbatim, spacing included.
const SPHERE_LIGHT = "rgba(0,180,89,1)";
const SPHERE_DARK = "rgba(0, 89, 150, 1)";

const materialOf = (patch: Partial<MeshMaterial> = {}): MeshMaterial => ({ ...DEFAULT_MESH_MATERIAL, ...patch });

describe("parseCssColor", () => {
  it("reads both whitespace conventions the registry authors", () => {
    expect(parseCssColor(SPHERE_LIGHT)).toEqual([0, 180, 89, 1]);
    expect(parseCssColor("rgba(100, 194, 166,1)")).toEqual([100, 194, 166, 1]);
  });

  it("reads rgb() as opaque, which is the form getComputedStyle hands back", () => {
    expect(parseCssColor("rgb(234, 240, 255)")).toEqual([234, 240, 255, 1]);
  });

  it("expands short hex digit by digit rather than parsing it as a number", () => {
    expect(parseCssColor("#abc")).toEqual([0xaa, 0xbb, 0xcc, 1]);
    expect(parseCssColor("#ffffff")).toEqual([255, 255, 255, 1]);
  });

  it("returns null for anything it does not recognise, so the caller can pass it through", () => {
    expect(parseCssColor("hsl(200 50% 40%)")).toBeNull();
    expect(parseCssColor("rebeccapurple")).toBeNull();
    expect(parseCssColor("dog")).toBeNull();
    // Nothing here runs under strictNullChecks, so a malformed fourth slot is a
    // runtime possibility rather than a compile error.
    expect(parseCssColor(undefined as unknown as string)).toBeNull();
  });
});

describe("multiplyColor", () => {
  it("leaves a colour untouched when multiplied by white", () => {
    expect(multiplyColor([0, 180, 89, 1], [255, 255, 255, 1])).toEqual([0, 180, 89, 1]);
  });

  it("takes alpha from the authored colour, never from the base", () => {
    expect(multiplyColor([200, 100, 50, 0.4], [255, 0, 0, 1])).toEqual([200, 0, 0, 0.4]);
  });

  // The property that makes multiply the right operator rather than replacement:
  // two faces of one shape keep their ratio, so the sphere is still a checker
  // after the swatch moves and the Menger sponge is still six-coloured.
  it("scales every channel by the same factor, so a shape keeps its internal contrast", () => {
    const base = parseCssColor("rgb(128, 128, 128)");
    const light = multiplyColor(parseCssColor(SPHERE_LIGHT) ?? [0, 0, 0, 1], base ?? [0, 0, 0, 1]);
    const dark = multiplyColor(parseCssColor(SPHERE_DARK) ?? [0, 0, 0, 1], base ?? [0, 0, 0, 1]);

    expect(light).not.toEqual(dark);
    expect(light[1] / 180).toBeCloseTo(dark[2] / 150, 2);
  });
});

describe("classifyMaterial", () => {
  it("reads a declared key as a texture and everything else as a colour", () => {
    expect(classifyMaterial("dog")).toEqual({ kind: "texture", key: "dog" });
    expect(classifyMaterial("galaxy")).toEqual({ kind: "texture", key: "galaxy" });
    expect(classifyMaterial(SPHERE_LIGHT)).toEqual({ kind: "color", css: SPHERE_LIGHT, rgba: [0, 180, 89, 1] });
  });

  // The whole reason classification moved off a prefix test: a hex colour is a
  // colour, and an undeclared word is not silently a texture.
  it("classifies by the declared set rather than by how the string begins", () => {
    expect(classifyMaterial("#7ea6e0")).toEqual({ kind: "color", css: "#7ea6e0", rgba: [0x7e, 0xa6, 0xe0, 1] });
    expect(classifyMaterial("marble")).toMatchObject({ kind: "color", rgba: null });
  });
});

describe("resolveMaterial", () => {
  // The opening-frame guarantee, as one assertion: at the defaults every
  // triangle in the registry resolves to the string it was authored with.
  it("returns the authored colour unchanged under the default material", () => {
    const resolved = resolveMaterial(classifyMaterial(SPHERE_LIGHT), DEFAULT_MESH_MATERIAL);

    expect(parseCssColor(resolved.fill)).toEqual(parseCssColor(SPHERE_LIGHT));
    expect(resolved.textureKey).toBeNull();
  });

  it("keeps an authored texture, and its key, in authored mode", () => {
    expect(resolveMaterial(classifyMaterial("dog"), DEFAULT_MESH_MATERIAL)).toEqual({
      fill: "dog",
      rgba: null,
      textureKey: "dog",
      uvScale: 1,
    });
  });

  it("tints an authored colour by the base colour", () => {
    const resolved = resolveMaterial(classifyMaterial(SPHERE_LIGHT), materialOf({ baseColor: "rgb(255, 0, 0)" }));

    expect(resolved.fill).toBe(formatRgba([0, 0, 0, 1]));
  });

  it("fills with the base colour and suppresses the texture in solid mode", () => {
    const material = materialOf({ mode: "solid", baseColor: "rgb(255, 0, 0)" });

    expect(resolveMaterial(classifyMaterial(SPHERE_LIGHT), material)).toEqual({
      fill: "rgb(255, 0, 0)",
      rgba: [255, 0, 0, 1],
      textureKey: null,
      uvScale: 1,
    });
    expect(resolveMaterial(classifyMaterial("dog"), material)).toEqual({
      fill: "rgb(255, 0, 0)",
      rgba: [255, 0, 0, 1],
      textureKey: null,
      uvScale: 1,
    });
  });

  it("passes an unblendable colour through rather than dropping it to black", () => {
    const resolved = resolveMaterial(classifyMaterial("hsl(200 50% 40%)"), materialOf({ baseColor: "rgb(255, 0, 0)" }));

    expect(resolved.fill).toBe("hsl(200 50% 40%)");
  });

  // A procedural mode overrides the authored slot the way SOLID does, and just
  // as completely: the cube's bitmap faces sample the checker too, or the mode
  // would be a checker on four sixths of a cube.
  it("hands every triangle the generated key in a procedural mode, textures included", () => {
    const material = materialOf({ mode: "checker", baseColor: "rgb(255, 0, 0)" });

    expect(resolveMaterial(classifyMaterial(SPHERE_LIGHT), material).textureKey).toBe("checker");
    expect(resolveMaterial(classifyMaterial("dog"), material).textureKey).toBe("checker");
    expect(resolveMaterial(classifyMaterial(SPHERE_LIGHT), materialOf({ mode: "uvGrid" })).textureKey).toBe("uvGrid");
  });

  // Reachable, unlike the authored-texture branch's fallback: the spherical
  // projection can hand a face a degenerate UV triangle, and that face falls
  // back to this colour. Carrying the channels is what keeps it lit.
  it("falls a procedural face back to the base colour, with channels to light it by", () => {
    const resolved = resolveMaterial(classifyMaterial("dog"), materialOf({ mode: "checker", baseColor: "#7ea6e0" }));

    expect(resolved.fill).toBe("#7ea6e0");
    expect(resolved.rgba).toEqual([0x7e, 0xa6, 0xe0, 1]);
  });
});

// UV SCALE, and the one rule that keeps the console's first frame where it is.
//
// The row ships at 8. Applying that in AUTHORED would tile the cube's two bitmap
// faces sixty-four times over on boot, which is why the scale is resolved here
// rather than read off the mesh material at the fill.
describe("the resolved tiling", () => {
  it("is inert outside the procedural modes, whatever the row is set to", () => {
    const material = materialOf({ uvScale: 16 });

    expect(resolveMaterial(classifyMaterial("dog"), material).uvScale).toBe(1);
    expect(resolveMaterial(classifyMaterial(SPHERE_LIGHT), material).uvScale).toBe(1);
    expect(resolveMaterial(classifyMaterial("dog"), materialOf({ mode: "solid", uvScale: 16 })).uvScale).toBe(1);
  });

  // Over the authored coordinates as well as the generated ones, so the cube
  // does not tile at two densities across its own six faces.
  it("carries the row's value in both procedural modes, for authored and generated UVs alike", () => {
    expect(resolveMaterial(classifyMaterial("dog"), materialOf({ mode: "checker", uvScale: 16 })).uvScale).toBe(16);
    expect(resolveMaterial(classifyMaterial(SPHERE_LIGHT), materialOf({ mode: "uvGrid", uvScale: 3 })).uvScale).toBe(3);
  });
});

// What the key light multiplies (E3a/COS-241).
//
// The contract is one sentence — `rgba` is the numeric form of `fill` — and it
// is worth its own block because breaking it is silent: the canvas goes on
// painting `fill` correctly while the light shades a colour nobody can see, and
// every visual check still passes.
describe("the resolved channels", () => {
  it("hands back the blended colour as numbers, not only as a string", () => {
    const resolved = resolveMaterial(classifyMaterial(SPHERE_LIGHT), materialOf({ baseColor: "rgb(128, 128, 128)" }));

    expect(resolved.rgba).toEqual([0, 90, 45, 1]);
    expect(resolved.fill).toBe(formatRgba([0, 90, 45, 1]));
  });

  // The blend is what an unreadable BASE breaks, not the colour. Dropping the
  // channels here would unlight the shape as well as untint it.
  it("keeps the authored channels when the base colour cannot be read", () => {
    const resolved = resolveMaterial(classifyMaterial(SPHERE_LIGHT), materialOf({ baseColor: "hsl(200 50% 40%)" }));

    expect(resolved.fill).toBe(SPHERE_LIGHT);
    expect(resolved.rgba).toEqual([0, 180, 89, 1]);
  });

  it("has no channels for a texture key or an unreadable authored colour", () => {
    expect(resolveMaterial(classifyMaterial("dog"), DEFAULT_MESH_MATERIAL).rgba).toBeNull();
    expect(resolveMaterial(classifyMaterial("hsl(200 50% 40%)"), DEFAULT_MESH_MATERIAL).rgba).toBeNull();
  });

  // Over the registry rather than over three hand-picked colours: this is the
  // invariant Lighting relies on for every triangle it shades, and the blend has
  // four branches that could each drift from it on their own.
  it("agrees with its own fill string on every triangle of all thirty-three shapes", () => {
    const material = materialOf({ baseColor: "rgb(128, 200, 255)" });
    const disagreements = Object.entries(data).flatMap(([name, object3D]) =>
      object3D.triangles
        .map((triangle) => resolveMaterial(classifyMaterial(triangle[3]), material))
        .filter((resolved) => resolved.rgba !== null)
        .filter((resolved) => JSON.stringify(parseCssColor(resolved.fill)) !== JSON.stringify(resolved.rgba))
        .map((resolved) => `${name}: ${resolved.fill}`),
    );

    expect(disagreements).toEqual([]);
  });
});

// The opening frame, proved over the whole registry rather than sampled by eye.
//
// This is the ticket's headline constraint — every primitive must render exactly
// as it did before the material model existed — and it is the half of it a test
// can actually settle. The geometry half is snapshot:geometry's, and the
// transform half is ShapeRig's; what is left is whether the resolution is the
// identity at the defaults, for every one of the several thousand triangles in
// the registry rather than for the handful anyone would think to check. The
// count pinned below moves whenever the registry legitimately grows — water
// brought it to twenty-one (HAL-156) and the molecules of HAL-153 have moved
// it by one apiece since, as prismatic {4,5} has for HAL-147 and the
// muoctahedron for HAL-129 — and pinning it is the point: a shape vanishing
// from the registry must fail here, not slip out silently.
//
// Colours are compared parsed, not as strings: the registry authors
// `rgba(0,180,89,1)` and the blend prints `rgba(0, 180, 89, 1)`, which is the
// same colour spelled differently and the same pixel either way.
describe("the default material over the whole registry", () => {
  it("resolves every authored triangle in all thirty-three shapes to the colour it was authored with", () => {
    const shapes = Object.entries(data);

    expect(shapes).toHaveLength(33);

    shapes.forEach(([name, object3D]) => {
      object3D.triangles.forEach((triangle, index) => {
        const slot = triangle[3];
        const resolved = resolveMaterial(classifyMaterial(slot), DEFAULT_MESH_MATERIAL);
        // Named in the assertion so a failure says which face of which shape.
        const where = `${name}[${index}] ${slot}`;

        if (resolved.textureKey !== null) {
          expect(`${where} -> ${resolved.fill}`).toBe(`${where} -> ${slot}`);

          return;
        }

        expect(`${where} -> ${JSON.stringify(parseCssColor(resolved.fill))}`).toBe(
          `${where} -> ${JSON.stringify(parseCssColor(slot))}`,
        );
      });
    });
  });

  it("leaves no triangle in the registry unparseable, which is what makes the blend total", () => {
    const unblendable = Object.entries(data).flatMap(([name, object3D]) =>
      object3D.triangles
        .map((triangle) => triangle[3])
        .filter((slot) => classifyMaterial(slot).kind === "color" && parseCssColor(slot) === null)
        .map((slot) => `${name}: ${slot}`),
    );

    expect(unblendable).toEqual([]);
  });
});
