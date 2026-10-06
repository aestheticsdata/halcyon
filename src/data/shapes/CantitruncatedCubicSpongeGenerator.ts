// The cantitruncated cubic sponge, an infinite skew polyhedron — the 4.4.6.6
// cell of the Wikipedia plate's uniform table, captioned "related to
// cantitruncated cubic honeycomb". Two squares and two hexagons around every
// vertex, in the cyclic order 4.4.6.6.
//
// NOT A SOLID, exactly as muCO and muRCO are not: a periodic sponge with no
// circumradius, rendered as a finite chunk.
//
// THE HONEYCOMB. The cantitruncated cubic honeycomb has three cell types:
// truncated cuboctahedra on the cube centres of the underlying cubic lattice,
// truncated octahedra on its vertices, and cubes on its edges, turned 45 degrees
// about the edge so their side faces meet the truncated cuboctahedra square on.
// Its faces fall into four classes, not three, because its squares come in two:
//
//   octagons     truncated cuboctahedron | truncated cuboctahedron
//   hexagons     truncated cuboctahedron | truncated octahedron
//   squares      truncated cuboctahedron | cube
//   squares      truncated octahedron    | cube
//
// WHAT HAS TO BE DELETED, which is not what the ticket expected. The ticket
// filed this as the muRCO pattern — delete the octagons and the rest is the
// surface. Counted, that is wrong: every vertex of this honeycomb carries one
// octagon, two hexagons and three squares, and deleting the octagon leaves
// 4.4.4.6.6 there, with 648 of the 1188 interior edges of the block below still
// carrying three faces. The octagons are not enough.
//
// The vertex settles what is. Four cells meet at every vertex — two truncated
// cuboctahedra, a truncated octahedron and a cube — and a surface through it
// separates them into two labyrinths. A 2 + 2 split leaves four faces at the
// vertex, which is the count 4.4.6.6 needs; of the three such splits, only
// {truncated cuboctahedra} | {truncated octahedron, cube} leaves no octagon, and
// what it leaves is hexagon, hexagon, square, square. So TWO whole classes go:
// the octagons, interior to the truncated cuboctahedra's framework, and the
// squares between truncated octahedra and cubes, interior to the other one.
// Nothing is halved, so this is still the muRCO pattern — a deletion, inheriting
// the honeycomb's full symmetry — just of two classes instead of one.
//
// THE TWO LABYRINTHS fall straight out of that. The truncated cuboctahedra,
// joined through their octagons, form one primitive cubic framework; the
// truncated octahedra, joined through the cubes along the lattice edges, form the
// other. They interpenetrate without touching, the way the two sides of
// Schwarz's P surface do, and every kept face separates one from the other.
//
// WHERE THIS IS SOURCED AND WHERE IT IS DERIVED. The configuration 4.4.6.6, the
// caption and the honeycomb's three cell types are the articles'. Which faces
// are kept is derived, and it was checked rather than assumed: the whole
// honeycomb — all three cell types, every face — was built out to a 5x5x5 block
// and counted:
//
//   every interior edge carries exactly 3 faces
//   every interior vertex carries 1 octagon, 2 hexagons and 3 squares
//   deleting the octagons alone leaves 3 faces on 648 of 1188 edges
//   deleting the octagons and the truncated-octahedron squares leaves 2 faces
//     on all 1188, and 6.6.4.4 at every one of the 648 vertices
//
// WHY ONLY ONE CELL TYPE IS WALKED. Every kept face is a face of a truncated
// cuboctahedron: its hexagons are the ones the truncated octahedra share with it
// and its squares are the ones the cubes do. So the surface is exactly every
// truncated cuboctahedron with its octagons left out, and the other two cell
// types contribute nothing it does not already hold. Walking them as well would
// only add, at the edge of the chunk, cube and truncated-octahedron faces whose
// truncated cuboctahedron is not there — fins hanging off the chunk. Walked
// alone, the chunk's boundary is the octagons, so its openings are the same
// tunnels the interior has.
//
// References:
//   https://en.wikipedia.org/wiki/Skew_apeirohedron
//   https://en.wikipedia.org/wiki/Cantitruncated_cubic_honeycomb

import SkewApeirohedronBuilder from "@data/builders/SkewApeirohedronBuilder";
import TruncatedCuboctahedronCell from "@data/builders/TruncatedCuboctahedronCell";

import type { SkewCell } from "@data/builders/SkewApeirohedronBuilder";
import type { Object3D } from "@data/types";

const RADIUS = 100;

// Truncated cuboctahedra per axis. Two leaves the other labyrinth as a single
// void with nothing around it; three is the first that encloses a truncated
// octahedron completely, which is what makes the tunnels read as tunnels.
const DEFAULT_CELLS_PER_AXIS = 3;

// Two truncated cuboctahedra share an octagon, which sits 2u - 1 from each
// centre in TruncatedCuboctahedronCell's frame, u = 1 + sqrt(2).
const PITCH = 2 * (1 + 2 * Math.SQRT2);

// Verdigris, to keep it apart from the gold and rust of the mu-polyhedra in a
// picker chip. Inner tones are the same hues in shadow: the openings show the far
// side of the same surface, not another material.
const SQUARE_OUTER = "rgba(132, 200, 170, 1)";
const HEXAGON_OUTER = "rgba(72, 152, 132, 1)";
const SQUARE_INNER = "rgba(66, 104, 88, 1)";
const HEXAGON_INNER = "rgba(36, 78, 68, 1)";

class CantitruncatedCubicSpongeGenerator {
  private readonly builder: SkewApeirohedronBuilder;
  private readonly cellsPerAxis: number;
  private readonly truncatedCuboctahedron: number[][][];

  constructor(cellsPerAxis: number = DEFAULT_CELLS_PER_AXIS) {
    this.builder = new SkewApeirohedronBuilder();
    this.cellsPerAxis = cellsPerAxis;
    this.truncatedCuboctahedron = new TruncatedCuboctahedronCell().squaresAndHexagons;
  }

  public build(): Object3D {
    return this.builder.build({
      cells: this.buildCells(),
      radius: RADIUS,
      colorFor: (tone) => this.colorFor(tone.sides, tone.inner),
    });
  }

  // Every cell is on side B. The truncated cuboctahedra are one labyrinth whole,
  // so one flag orients every face, and it is B rather than A because the outer
  // tone is painted on the skin facing side A: the other framework is what wraps
  // the chunk and what the viewer stands in, and the cuboctahedra's insides are
  // the tunnels, seen in shadow through the octagons.
  private buildCells(): SkewCell[] {
    const cells: SkewCell[] = [];

    for (let i = 0; i < this.cellsPerAxis; i += 1) {
      for (let j = 0; j < this.cellsPerAxis; j += 1) {
        for (let k = 0; k < this.cellsPerAxis; k += 1) {
          cells.push({ centre: [i * PITCH, j * PITCH, k * PITCH], sideA: false, faces: this.truncatedCuboctahedron });
        }
      }
    }

    return cells;
  }

  private colorFor(sides: number, inner: boolean): string {
    if (sides === 4) {
      return inner ? SQUARE_INNER : SQUARE_OUTER;
    }

    return inner ? HEXAGON_INNER : HEXAGON_OUTER;
  }
}

export default CantitruncatedCubicSpongeGenerator;
