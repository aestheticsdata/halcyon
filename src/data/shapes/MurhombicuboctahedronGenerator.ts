// Murhombicuboctahedron (muRCO), an infinite skew polyhedron — p. 337, "Their
// Archimedean Relatives", and the denser of the two on that page. Vertex
// configuration 6.4.4.4: three squares and one hexagon around every vertex.
//
// NOT A SOLID, exactly as muCO is not: a periodic sponge with no circumradius,
// rendered as a finite chunk.
//
// THE CONSTRUCTION. Conway gives the name, the configuration 6.4.4.4 and the
// derivation — "this can be obtained by exploding the faces of either muC or
// muO, so it has the same group" (p. 336) — but no honeycomb and no
// coordinates. The uniform realisation of that description is the
// OMNITRUNCATED CUBIC HONEYCOMB with its octagons removed, and the reason it
// has to be is countable rather than aesthetic: every edge of that honeycomb
// carries exactly three faces, and its two edge classes are
// (hexagon, octagon, square) and (octagon, square, square) — so deleting every
// octagon leaves every edge with exactly the two faces a surface needs, and
// leaves 6.4.4.4 at every vertex. Nothing else is removed and nothing is
// halved, which is why, unlike muCO, this one inherits the honeycomb's whole
// symmetry group. That matches Conway's stated 8deg:2.
//
// The honeycomb's cells are truncated cuboctahedra and octagonal prisms in a
// 1:3 ratio. A truncated cuboctahedron gives up its 6 octagons and keeps its 12
// squares and 8 hexagons; a prism gives up its 2 octagonal caps and keeps its 8
// lateral squares. The octagons are the sponge's openings, and they are exactly
// the faces that would have been interior to either half of it.
//
// THE TWO LABYRINTHS, which is what the winding needs. The truncated
// cuboctahedra at the cube corners, together with the prisms that join them,
// form one solid framework; the ones at the cube centres and their prisms form
// the other, and the two interpenetrate without touching. Every kept face
// separates one from the other; every octagon lies strictly inside one of them,
// which is another way of saying the octagons are the holes.
//
// WHERE THIS IS SOURCED AND WHERE IT IS DERIVED, stated plainly because the
// ticket asked for it: the name, the configuration, the group and "exploding
// the faces" are Conway's own words. The identification with the omnitruncated
// cubic honeycomb is a derivation, and it was checked rather than assumed. The
// honeycomb was built out to a block with a real interior and counted:
//
//   every interior edge carries exactly 3 faces, in exactly two classes,
//     (square, hexagon, octagon) and (square, square, octagon)
//   every interior vertex carries 3 squares, 1 hexagon and 2 octagons
//   deleting every octagon therefore leaves 2 faces on every edge and 4.4.4.6
//     at every vertex, which is Conway's 6.4.4.4
//
// That last count is the one that settles it. The competing reading — that muRCO
// is no honeycomb's sub-complex at all, and is instead built by shrinking muC's
// and muO's faces in place until they meet — turns on the claim that this
// honeycomb offers only TWO squares at a vertex and so cannot produce 6.4.4.4.
// It offers three. The alternative may well be another valid realisation of the
// same abstract polyhedron; it is not needed to reach this one.
//
// Conway's own figure may in turn be a non-uniform variant with skew hexagons.
// The planar-faced uniform realisation is the one drawn here.
//
// References:
//   "The Symmetries of Things", Conway, Burgiel & Goodman-Strauss, pp. 336-337
//   https://en.wikipedia.org/wiki/Skew_apeirohedron
//   https://en.wikipedia.org/wiki/Omnitruncated_cubic_honeycomb

import SkewApeirohedronBuilder from "@data/builders/SkewApeirohedronBuilder";
import { AXES, SIGNS } from "@data/builders/symmetry";
import TruncatedCuboctahedronCell from "@data/builders/TruncatedCuboctahedronCell";

import type { SkewCell } from "@data/builders/SkewApeirohedronBuilder";
import type { Object3D } from "@data/types";

const RADIUS = 100;

// Cubes of the underlying cubic honeycomb per axis. One is a single truncated
// cuboctahedron and its collar of prisms, which reads as a widget rather than
// as a sponge; two is the block the book's figure shows and is what the density
// note in shapeInfo is written against.
const DEFAULT_CUBES_PER_AXIS = 2;

// Edge length 2, the frame TruncatedCuboctahedronCell is written in, so that
// u = 1 + sqrt(2) puts every coordinate in Z[sqrt(2)] and none of them is a half.
const U = 1 + Math.SQRT2;

// The cubic honeycomb's cube side in this frame: a truncated cuboctahedron, a
// prism, and the next truncated cuboctahedron.
const CUBE = 4 * U;
const HALF_CUBE = 2 * U;

// The book's plate paints muRCO the paler of the two, which is also what keeps
// it apart from muCO in a picker chip. Inner tones are the same hues in shadow:
// the openings show the far side of the same surface, not another material.
const SQUARE_OUTER = "rgba(246, 210, 130, 1)";
const HEXAGON_OUTER = "rgba(224, 176, 82, 1)";
const SQUARE_INNER = "rgba(158, 122, 62, 1)";
const HEXAGON_INNER = "rgba(134, 98, 42, 1)";

// The prism's octagonal cap, in the two axes across its own. Consecutive points
// differ by 2, which is the edge length everything here is written at.
const OCTAGON_RING = [
  [1, U],
  [U, 1],
  [U, -1],
  [1, -U],
  [-1, -U],
  [-U, -1],
  [-U, 1],
  [-1, U],
];

const PRISM_HALF_LENGTH = 1;

class MurhombicuboctahedronGenerator {
  private readonly builder: SkewApeirohedronBuilder;
  private readonly cubesPerAxis: number;
  private readonly truncatedCuboctahedron: number[][][];
  private readonly prisms: number[][][][];

  constructor(cubesPerAxis: number = DEFAULT_CUBES_PER_AXIS) {
    this.builder = new SkewApeirohedronBuilder();
    this.cubesPerAxis = cubesPerAxis;
    this.truncatedCuboctahedron = new TruncatedCuboctahedronCell().squaresAndHexagons;
    this.prisms = AXES.map((axis) => this.buildPrismFaces(axis));
  }

  public build(): Object3D {
    return this.builder.build({
      cells: this.buildCells(),
      radius: RADIUS,
      colorFor: (tone) => this.colorFor(tone.sides, tone.inner),
    });
  }

  // The four cell positions of one cube of the honeycomb: a truncated
  // cuboctahedron on the corner and one at the centre, a prism across each face
  // joining corner cells, and a prism along each edge joining centre cells.
  // Corner cells and face prisms make up one framework, centre cells and edge
  // prisms the other.
  private buildCells(): SkewCell[] {
    const cells: SkewCell[] = [];

    for (let i = 0; i < this.cubesPerAxis; i += 1) {
      for (let j = 0; j < this.cubesPerAxis; j += 1) {
        for (let k = 0; k < this.cubesPerAxis; k += 1) {
          const origin = [i * CUBE, j * CUBE, k * CUBE];

          cells.push({ centre: origin, sideA: true, faces: this.truncatedCuboctahedron });
          cells.push({
            centre: origin.map((axis) => axis + HALF_CUBE),
            sideA: false,
            faces: this.truncatedCuboctahedron,
          });

          AXES.forEach((axis) => {
            const face = [...origin];
            face[axis] += HALF_CUBE;
            cells.push({ centre: face, sideA: true, faces: this.prisms[axis] });

            // The edge prism runs along `axis` too, but sits displaced in the
            // other two — which is what puts it between the centre cells rather
            // than between the corner ones.
            const edge = origin.map((value, index) => (index === axis ? value : value + HALF_CUBE));
            cells.push({ centre: edge, sideA: false, faces: this.prisms[axis] });
          });
        }
      }
    }

    return cells;
  }

  // The 8 lateral squares only. The two octagonal caps are the openings, and
  // they are also the faces that would have been interior to this prism's own
  // framework.
  private buildPrismFaces(axis: number): number[][][] {
    const [first, second] = AXES.filter((other) => other !== axis);

    return OCTAGON_RING.map((corner, index) => {
      const next = OCTAGON_RING[(index + 1) % OCTAGON_RING.length];

      return SIGNS.flatMap((sign) =>
        (sign === 1 ? [corner, next] : [next, corner]).map((offset) => {
          const point = [0, 0, 0];
          point[axis] = sign * PRISM_HALF_LENGTH;
          point[first] = offset[0];
          point[second] = offset[1];

          return point;
        }),
      );
    });
  }

  private colorFor(sides: number, inner: boolean): string {
    if (sides === 4) {
      return inner ? SQUARE_INNER : SQUARE_OUTER;
    }

    return inner ? HEXAGON_INNER : HEXAGON_OUTER;
  }
}

export default MurhombicuboctahedronGenerator;
