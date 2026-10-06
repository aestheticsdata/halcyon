// The checks HAL-151 asked for, taken off the shipped mesh. Vertex n of the mesh
// is vertex n of the helix, which is what lets "interior" mean an index range
// here rather than a neighbourhood search: the three vertices at each end sit on
// a cap and carry fewer than six triangles by construction.

import TetrahelixGenerator from "@data/shapes/TetrahelixGenerator";
import { describe, expect, it } from "vitest";

import type { Object3D } from "@data/types";

type Vec3 = [number, number, number];

const sub = (a: number[], b: number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const distance = (a: number[], b: number[]): number => Math.sqrt(dot(sub(a, b), sub(a, b)));
const edgeKey = (first: number, second: number): string => [first, second].sort((a, b) => a - b).join("-");

const tetrahelix = new TetrahelixGenerator().build();
const vertexCount = tetrahelix.points.length;

const edgesOf = (mesh: Object3D): [number, number][] =>
  mesh.triangles.flatMap(([a, b, c]) => [
    [a, b],
    [b, c],
    [c, a],
  ]);

// Moller–Trumbore, strictly inside both the segment and the triangle, so two
// faces that merely touch along an edge or at a vertex do not count.
const segmentPiercesTriangle = (from: number[], to: number[], corners: number[][]): boolean => {
  const direction = sub(to, from);
  const edgeOne = sub(corners[1], corners[0]);
  const edgeTwo = sub(corners[2], corners[0]);
  const p = cross(direction, edgeTwo);
  const determinant = dot(edgeOne, p);

  if (Math.abs(determinant) < 1e-9) {
    return false;
  }

  const offset = sub(from, corners[0]);
  const u = dot(offset, p) / determinant;
  const q = cross(offset, edgeOne);
  const v = dot(direction, q) / determinant;
  const t = dot(edgeTwo, q) / determinant;
  const margin = 1e-6;

  return u > margin && v > margin && u + v < 1 - margin && t > margin && t < 1 - margin;
};

describe("TetrahelixGenerator", () => {
  it("emits two triangles per tetrahedron and one cap at each end", () => {
    expect(tetrahelix.triangles).toHaveLength(2 * (vertexCount - 3) + 2);
  });

  it("makes every tetrahedron of the chain regular", () => {
    const edge = distance(tetrahelix.points[0], tetrahelix.points[1]);

    for (let n = 0; n + 3 < vertexCount; n += 1) {
      for (let i = 0; i < 4; i += 1) {
        for (let j = i + 1; j < 4; j += 1) {
          expect(distance(tetrahelix.points[n + i], tetrahelix.points[n + j])).toBeCloseTo(edge, 9);
        }
      }
    }
  });

  it("puts six triangles at every vertex away from the caps", () => {
    const trianglesAt = new Map<number, number>();

    tetrahelix.triangles.forEach(([a, b, c]) => {
      [a, b, c].forEach((point) => {
        trianglesAt.set(point, (trianglesAt.get(point) ?? 0) + 1);
      });
    });

    for (let n = 3; n < vertexCount - 3; n += 1) {
      expect(trianglesAt.get(n)).toBe(6);
    }
  });

  // Every undirected edge carrying exactly two faces is what a closed surface
  // needs; every DIRECTED edge appearing exactly once is what a consistently
  // wound one needs, which is the property backface culling leans on.
  it("closes into one consistently wound surface", () => {
    const facesPerEdge = new Map<string, number>();
    const directed = new Set<string>();

    edgesOf(tetrahelix).forEach(([from, to]) => {
      facesPerEdge.set(edgeKey(from, to), (facesPerEdge.get(edgeKey(from, to)) ?? 0) + 1);
      expect(directed.has(`${from}>${to}`)).toBe(false);
      directed.add(`${from}>${to}`);
    });

    expect([...facesPerEdge.values()].every((count) => count === 2)).toBe(true);
    expect(vertexCount - facesPerEdge.size + tetrahelix.triangles.length).toBe(2);
  });

  // The engine wants (b - a) x (c - a) pointing back inside, so a closed mesh
  // wound its way encloses a negative signed volume.
  it("winds every face the way the engine culls", () => {
    const signedVolume = tetrahelix.triangles.reduce((sum, [a, b, c]) => {
      const [pa, pb, pc] = [a, b, c].map((index) => tetrahelix.points[index]);

      return sum + dot(pa, cross(pb, pc)) / 6;
    }, 0);

    expect(signedVolume).toBeLessThan(0);
  });

  it("never lets an edge pass through a face it does not touch", () => {
    const edges = [...new Set(edgesOf(tetrahelix).map(([from, to]) => edgeKey(from, to)))].map((key) =>
      key.split("-").map(Number),
    );
    let piercings = 0;

    edges.forEach(([from, to]) => {
      tetrahelix.triangles.forEach(([a, b, c]) => {
        if ([a, b, c].includes(from) || [a, b, c].includes(to)) {
          return;
        }

        const corners = [a, b, c].map((index) => tetrahelix.points[index]);

        if (segmentPiercesTriangle(tetrahelix.points[from], tetrahelix.points[to], corners)) {
          piercings += 1;
        }
      });
    });

    expect(piercings).toBe(0);
  });

  // Drift would show on a long chain first, so this builds one far longer than
  // the shipped run and asks that every vertex still sit on the same cylinder
  // around the y axis, at an evenly spaced height.
  it("stays on its axis however long the chain grows", () => {
    const long = new TetrahelixGenerator({ vertexCount: 2000 }).build();
    const radius = Math.hypot(long.points[0][0], long.points[0][2]);
    const rise = long.points[1][1] - long.points[0][1];

    long.points.forEach((point, n) => {
      expect(Math.hypot(point[0], point[2])).toBeCloseTo(radius, 9);
      expect(point[1] - long.points[0][1]).toBeCloseTo(n * rise, 9);
    });
  });

  // Across a one- or two-step edge a ribbon continues; across a three-step edge
  // — one of the strands — it hands over to the next. Which is what makes the
  // tones three ribbons rather than a scatter of three colours.
  it("changes ribbon only across the three-step strands", () => {
    const capTone = tetrahelix.triangles[0][3];
    const tonesPerEdge = new Map<string, string[]>();

    tetrahelix.triangles
      .filter((triangle) => triangle[3] !== capTone)
      .forEach(([a, b, c, tone]) => {
        [
          [a, b],
          [b, c],
          [c, a],
        ].forEach(([from, to]) => {
          tonesPerEdge.set(edgeKey(from, to), [...(tonesPerEdge.get(edgeKey(from, to)) ?? []), tone]);
        });
      });

    tonesPerEdge.forEach((tones, key) => {
      if (tones.length !== 2) {
        return;
      }

      const [from, to] = key.split("-").map(Number);

      expect(tones[0] !== tones[1]).toBe(to - from === 3);
    });
    expect(new Set(tetrahelix.triangles.map((triangle) => triangle[3])).size).toBe(4);
  });

  it("refuses a chain too short to hold one tetrahedron", () => {
    expect(() => new TetrahelixGenerator({ vertexCount: 3 })).toThrow();
  });
});
