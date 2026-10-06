// The counts HAL-132 asked to have confirmed from a block with a real interior,
// taken off the shipped mesh rather than off a second copy of the honeycomb — a
// test that rebuilt the cantitruncated cubic honeycomb would agree with itself
// whatever the generator did. The honeycomb-level count, which is what decided
// that two face classes go rather than one, is in the generator's header.
//
// Faces are recovered through SkewApeirohedronBuilder's emission contract: a face
// of n sides is fanned from its first vertex, and each fan triangle is followed
// immediately by its own reversed copy. This sponge mixes squares (four
// triangles) with hexagons (eight), so the block size is not constant; a face is
// read fan triangle by fan triangle for as long as the next one continues the
// fan — same apex, starting where the last one ended. Two distinct faces never
// share a vertex pair that is a diagonal of one of them, so a new face can never
// be mistaken for the continuation of the previous one.
//
// INTERIOR, defined without reference to the cells because the mesh has none: an
// edge is closed when it carries two faces, and a vertex is interior when every
// edge at it is closed.

import CantitruncatedCubicSpongeGenerator from "@data/shapes/CantitruncatedCubicSpongeGenerator";
import { describe, expect, it } from "vitest";

const CELLS_PER_AXIS = 3;
const CELLS = CELLS_PER_AXIS ** 3;
const EDGE_TOLERANCE = 1e-9;

const sponge = new CantitruncatedCubicSpongeGenerator(CELLS_PER_AXIS).build();

// Each face's point indices, in the order the outer skin is wound.
const faces = (): number[][] => {
  const rings: number[][] = [];
  let index = 0;

  while (index < sponge.triangles.length) {
    const first = sponge.triangles[index];
    const ring = [first[0], first[1], first[2]];
    index += 2;

    while (
      index < sponge.triangles.length &&
      sponge.triangles[index][0] === ring[0] &&
      sponge.triangles[index][1] === ring[ring.length - 1]
    ) {
      ring.push(sponge.triangles[index][2]);
      index += 2;
    }

    rings.push(ring);
  }

  return rings;
};

const edgeKey = (first: number, second: number): string => [first, second].sort((a, b) => a - b).join("-");

const rings = faces();

const directedEdges = new Map<string, string[]>();
const facesPerVertex = new Map<number, number[][]>();

rings.forEach((ring) => {
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length];
    const edge = edgeKey(point, next);

    directedEdges.set(edge, [...(directedEdges.get(edge) ?? []), `${point}>${next}`]);
    facesPerVertex.set(point, [...(facesPerVertex.get(point) ?? []), ring]);
  });
});

const isClosed = (edge: string): boolean => directedEdges.get(edge)?.length === 2;

const edgesAt = (point: number): string[] =>
  [...directedEdges.keys()].filter((edge) => edge.split("-").map(Number).includes(point));

const interiorVertices = [...facesPerVertex.keys()].filter((point) => edgesAt(point).every(isClosed));

const sharesEdge = (first: number[], second: number[]): boolean =>
  first.some((point, index) => {
    const edge = edgeKey(point, first[(index + 1) % first.length]);

    return second.some((other, otherIndex) => edgeKey(other, second[(otherIndex + 1) % second.length]) === edge);
  });

describe("CantitruncatedCubicSpongeGenerator", () => {
  it("recovers every square and hexagon of every truncated cuboctahedron, and nothing else", () => {
    expect(rings.filter((ring) => ring.length === 4)).toHaveLength(12 * CELLS);
    expect(rings.filter((ring) => ring.length === 6)).toHaveLength(8 * CELLS);
    expect(rings.every((ring) => new Set(ring).size === ring.length)).toBe(true);
  });

  it("draws every edge at one length", () => {
    const lengths = [...directedEdges.keys()].map((edge) => {
      const [first, second] = edge.split("-").map((point) => sponge.points[Number(point)]);

      return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
    });

    lengths.forEach((length) => {
      expect(length).toBeCloseTo(lengths[0], -Math.log10(EDGE_TOLERANCE));
    });
  });

  it("leaves no edge carrying more than two faces", () => {
    const counts = [...directedEdges.values()].map((directions) => directions.length);

    expect(counts.filter((count) => count > 2)).toHaveLength(0);
    expect(counts.filter((count) => count === 2).length).toBeGreaterThan(0);
  });

  // The labyrinth claim, checked on the mesh: if every kept face really does
  // separate a truncated cuboctahedron from the other framework, orienting each
  // away from its own cell makes the two faces on any edge run it in opposite
  // directions. One face oriented against the rest would break this.
  it("winds the two faces on every closed edge in opposite directions", () => {
    [...directedEdges.values()]
      .filter((directions) => directions.length === 2)
      .forEach(([first, second]) => {
        expect(first).not.toBe(second);
      });
  });

  // 4.4.6.6, not merely two of each: the squares meet each other along an edge,
  // and so do the hexagons. 4.6.4.6 would pass a bare tally.
  it("puts two squares and two hexagons at every interior vertex, in the order 4.4.6.6", () => {
    expect(interiorVertices.length).toBeGreaterThan(0);
    interiorVertices.forEach((point) => {
      const around = facesPerVertex.get(point) ?? [];
      const squares = around.filter((ring) => ring.length === 4);
      const hexagons = around.filter((ring) => ring.length === 6);

      expect(around).toHaveLength(4);
      expect(squares).toHaveLength(2);
      expect(hexagons).toHaveLength(2);
      expect(sharesEdge(squares[0], squares[1])).toBe(true);
      expect(sharesEdge(hexagons[0], hexagons[1])).toBe(true);
    });
  });

  // The chunk's edge is cut through octagons only, so every opening at the
  // boundary is a whole octagonal tunnel mouth: each loop of open edges is eight
  // long and passes through no vertex twice.
  it("opens the chunk's boundary as octagons and nothing else", () => {
    const open = [...directedEdges.keys()].filter((edge) => !isClosed(edge));
    const neighbours = new Map<number, number[]>();

    open.forEach((edge) => {
      const [first, second] = edge.split("-").map(Number);

      neighbours.set(first, [...(neighbours.get(first) ?? []), second]);
      neighbours.set(second, [...(neighbours.get(second) ?? []), first]);
    });

    expect([...neighbours.values()].every((adjacent) => adjacent.length === 2)).toBe(true);

    const visited = new Set<number>();

    [...neighbours.keys()].forEach((start) => {
      if (visited.has(start)) {
        return;
      }

      let loop = 0;
      let previous = -1;
      let current = start;

      do {
        visited.add(current);
        const next = (neighbours.get(current) ?? []).find((point) => point !== previous) ?? start;
        previous = current;
        current = next;
        loop += 1;
      } while (current !== start);

      expect(loop).toBe(8);
    });
  });
});
