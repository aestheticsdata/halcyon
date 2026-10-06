// The truncated cuboctahedron as a honeycomb cell, with its octagons left out.
//
// Two sponges here are built from this one cell and keep exactly the same faces
// of it: muRCO on the omnitruncated cubic honeycomb and the 4.4.6.6 sponge on the
// cantitruncated one. In both, every octagon is a face two truncated cuboctahedra
// share, so it lies inside one labyrinth and is an opening; the 12 squares and 8
// hexagons are the cell's whole contribution to the surface. It is the same table
// twice, so it lives here.
//
// It is a class for the same reason BitruncatedCubicLattice is: the table is built
// when a shape that needs it is built, not when a module is imported for a type.
//
// THE FRAME. Edge length 2, so that u = 1 + sqrt(2) puts every coordinate in
// Z[sqrt(2)] and none of them is a half. The 48 vertices are the signed
// permutations of (1, u, 2u - 1) — the same three magnitudes
// TruncatedCuboctahedronGenerator uses, at twice the scale. A square therefore
// sits 2 + 3 sqrt(2) along a (1, 1, 0) direction, a hexagon sqrt(3) u along a
// (1, 1, 1) one, and an octagon 2u - 1 along an axis.

import PolyhedronBuilder from "@data/builders/PolyhedronBuilder";
import { AXES, SIGNS } from "@data/builders/symmetry";

const U = 1 + Math.SQRT2;
const MAGNITUDES = [1, U, 2 * U - 1];

// Irrational coordinates, so the furthest-along-the-normal test needs one. The
// margin is enormous — the runner-up along any face normal trails by more than
// a whole edge — so this only has to beat rounding.
const REACH_TOLERANCE = 1e-6;

class TruncatedCuboctahedronCell {
  private readonly faces: number[][][];

  constructor() {
    this.faces = this.buildFaces();
  }

  // As offsets from the cell centre, squares first, each ring in order around
  // the face. The octagons on the axis normals are never asked for.
  public get squaresAndHexagons(): number[][][] {
    return this.faces;
  }

  // The 12 squares and 8 hexagons, found by which vertices reach furthest along
  // each face normal rather than tabulated.
  private buildFaces(): number[][][] {
    const polyhedron = new PolyhedronBuilder();
    const vertices = this.buildVertices();
    const normals: number[][] = [];

    AXES.forEach((zeroAxis) => {
      const [first, second] = AXES.filter((axis) => axis !== zeroAxis);

      SIGNS.forEach((firstSign) => {
        SIGNS.forEach((secondSign) => {
          const normal = [0, 0, 0];
          normal[first] = firstSign;
          normal[second] = secondSign;
          normals.push(normal);
        });
      });
    });

    SIGNS.forEach((signX) => {
      SIGNS.forEach((signY) => {
        SIGNS.forEach((signZ) => {
          normals.push([signX, signY, signZ]);
        });
      });
    });

    const faces = polyhedron.facesFromNormals(vertices, normals, REACH_TOLERANCE);

    return polyhedron.orderFaces(vertices, faces).map((face) => face.map((index) => vertices[index]));
  }

  private buildVertices(): number[][] {
    const orderings = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const vertices: number[][] = [];

    orderings.forEach((ordering) => {
      SIGNS.forEach((signX) => {
        SIGNS.forEach((signY) => {
          SIGNS.forEach((signZ) => {
            const signs = [signX, signY, signZ];
            vertices.push(ordering.map((slot, axis) => signs[axis] * MAGNITUDES[slot]));
          });
        });
      });
    });

    return vertices;
  }
}

export default TruncatedCuboctahedronCell;
