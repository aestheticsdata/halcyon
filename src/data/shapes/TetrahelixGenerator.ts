// The Boerdijk–Coxeter helix, or tetrahelix: regular tetrahedra glued face to
// face in a single unbranched chain, each one the last reflected through the
// face they share. What is drawn is the surface left over — every face no two
// tetrahedra share — which winds as three helical ribbons of triangles.
//
// ONE-DIMENSIONALLY INFINITE, not three, and that sets it apart from every other
// apeirohedron in the registry. There is no honeycomb, no packing and no pair of
// labyrinths: the surface is a tube with a plain inside and a plain outside, so
// SkewApeirohedronBuilder — which exists to orient faces that have no centre to
// face away from — has nothing to do here, and its reversed back-face copies
// would only double the triangle count.
//
// NOR IS IT THE KNOT SWEEP, though the ticket suggested it might be. KnotPath
// transports a frame along a smooth curve and closes the residual twist around a
// loop; a tetrahelix has neither a smooth centreline to transport along nor a
// loop to close, and its cross-section is not a ring of samples but three
// vertices that are themselves points of the helix. Every vertex lies on ONE
// helix, a fixed angle and a fixed rise apart, so the whole surface is a closed
// form in the vertex index and no builder is needed — MeshBuilder's accumulator
// is all it takes.
//
// Which also answers the drift the ticket warned about. Nothing is accumulated:
// vertex n is placed at angle n * theta and height n * rise directly, so the
// hundredth vertex carries exactly the error of one cosine and the axis cannot
// wander however long the chain grows.
//
// THE NUMBERS, for unit edge, from the helix's own article:
//
//   radius  3 * sqrt(3) / 10
//   rise    1 / sqrt(10) per vertex
//   theta   arccos(-2/3) ~ 131.81 degrees per vertex
//
// Vertices n, n+1, n+2 and n+3 are always a regular tetrahedron — all six
// distances come out at exactly one edge — so consecutive tetrahedra share the
// three vertices n+1, n+2, n+3, which is the glued face.
//
// THETA IS NOT A RATIONAL FRACTION OF A TURN, and that is what earns the name
// apeirohedron rather than very long polyhedron. No two tetrahedra of the chain
// ever share an orientation, however long it grows, so there is no period to
// cut it at and no finite run is the whole of it — unlike every other stacking
// of Platonic solids, as the article puts it. Halcyon renders a finite
// stretch, which is where the two end caps come from: they are the faces a
// longer chain would have glued away, and they are painted apart from the
// ribbons for that reason.
//
// THE FACES. Tetrahedron n keeps two of its four faces, (n, n+1, n+3) and
// (n, n+2, n+3); the other two, (n, n+1, n+2) and (n+1, n+2, n+3), are glued to
// its neighbours. Counting from there, a vertex away from the ends lies on six
// triangles — three of each kind — and every edge carries exactly two, which is
// what makes the run, caps included, one closed surface.
//
// THE THREE RIBBONS. Triangle (n, n+1, n+3) meets (n+1, n+3, n+4) along the edge
// (n+1, n+3), and that one meets (n+3, n+4, n+6) along (n+3, n+4): the strip
// advances three vertices per pair, so the first kind is on ribbon n mod 3 and
// the second on ribbon (n - 1) mod 3. Each ribbon is bounded by two of the three
// steep strands that join every third vertex, which are the lines the eye picks
// out.
//
// CHIRALITY. The helix is chiral and comes in two hands, theta = +arccos(-2/3)
// and its negative; the plate prints both. This is the RIGHT-HANDED one, theta
// positive in a right-handed frame climbing +y, so the three-step strands turn
// right-handed by 3 * theta - 360 ~ 35.4 degrees per step. "Handed" is a
// convention about those strands and not about every edge: each form also
// carries the two two-step helices, which wind the OTHER way (Sadoc and Rivier,
// cited on the article's figure). The mirror is the same shape for the picker's
// purposes and does not get its own entry.
//
// References:
//   https://en.wikipedia.org/wiki/Boerdijk%E2%80%93Coxeter_helix
//   https://en.wikipedia.org/wiki/Skew_apeirohedron

import MeshBuilder from "@data/builders/MeshBuilder";
import Vec3Math from "@data/builders/Vec3Math";

import type { Object3D } from "@data/types";

type Vec3 = [number, number, number];

// Eighteen vertices are fifteen tetrahedra: enough to show the strands turning
// through well over a quarter of a turn, and few enough that the tube is not a
// thread at the scale the other shapes are framed at.
const DEFAULT_VERTEX_COUNT = 18;

// The chain spans the same height the torus knots do across their widest
// extent, so it fills the frame the way they do.
const HALF_LENGTH = 116;

const RADIUS_PER_EDGE = (3 * Math.sqrt(3)) / 10;
const RISE_PER_EDGE = 1 / Math.sqrt(10);
const TWIST = Math.acos(-2 / 3);

// Matched in value and spread in hue, the lesson muT taught: FLAT shading already
// supplies the value, and a ramp authored on top fights it rather than adding to
// it. Unlike muT the key here is not the face normal — every ribbon turns
// through every direction — so the three stay legible as three at any pose.
const RIBBON_TONES = ["rgba(214, 96, 112, 1)", "rgba(206, 168, 72, 1)", "rgba(88, 156, 214, 1)"];

// The two faces where the finite run was cut; grey, because they belong to no
// ribbon and are not part of the infinite surface.
const CAP_TONE = "rgba(150, 152, 160, 1)";

const MIN_VERTEX_COUNT = 4;

export interface TetrahelixOptions {
  vertexCount?: number;
}

class TetrahelixGenerator {
  private readonly builder: MeshBuilder;
  private readonly vec: Vec3Math;
  private readonly vertexCount: number;
  private readonly edge: number;

  constructor(options: TetrahelixOptions = {}) {
    const vertexCount = options.vertexCount ?? DEFAULT_VERTEX_COUNT;

    // Below four vertices there is not a single tetrahedron, and the caps would
    // be emitted against a chain that does not exist.
    if (vertexCount < MIN_VERTEX_COUNT) {
      throw new Error(`A tetrahelix needs at least ${MIN_VERTEX_COUNT} vertices, got ${vertexCount}.`);
    }

    this.builder = new MeshBuilder();
    this.vec = new Vec3Math();
    this.vertexCount = vertexCount;
    this.edge = (2 * HALF_LENGTH) / ((vertexCount - 1) * RISE_PER_EDGE);
  }

  public build(): Object3D {
    for (let n = 0; n < this.vertexCount; n += 1) {
      this.builder.addPoint(this.vertexAt(n));
    }

    const last = this.vertexCount - 1;

    this.addOrientedTriangle([0, 1, 2], CAP_TONE);

    for (let n = 0; n + 3 <= last; n += 1) {
      this.addOrientedTriangle([n, n + 1, n + 3], RIBBON_TONES[n % 3]);
      this.addOrientedTriangle([n, n + 2, n + 3], RIBBON_TONES[(n + 2) % 3]);
    }

    this.addOrientedTriangle([last - 2, last - 1, last], CAP_TONE);

    return this.builder.mesh;
  }

  private vertexAt(n: number): number[] {
    const angle = n * TWIST;
    const radius = RADIUS_PER_EDGE * this.edge;

    return [radius * Math.cos(angle), n * RISE_PER_EDGE * this.edge - HALF_LENGTH, -radius * Math.sin(angle)];
  }

  // Wound against the centre of the tetrahedron the face belongs to, which is
  // always on the inside of the tube. Every face here is a face of some
  // tetrahedron of the chain — the caps of the first and the last — so its
  // fourth vertex is never more than one index away, and the centre is the
  // honest inward direction even where the tube bends round the axis. The
  // engine wants (b - a) x (c - a) pointing back inside.
  private addOrientedTriangle(face: number[], color: string) {
    const [a, b, c] = face.map((index) => this.pointAsVec(index));
    const inward = this.vec.sub(this.cellCentre(face), a);
    const normal = this.vec.cross(this.vec.sub(b, a), this.vec.sub(c, a));

    if (this.vec.dot(normal, inward) > 0) {
      this.builder.addTriangle([face[0], face[1], face[2], color]);
      return;
    }

    this.builder.addTriangle([face[0], face[2], face[1], color]);
  }

  // The tetrahedron a face belongs to is the four consecutive vertices starting
  // at its lowest index, clamped so the top cap reads the last one.
  private cellCentre(face: number[]): Vec3 {
    const first = Math.min(Math.min(...face), this.vertexCount - 4);

    return this.vec.centroid([0, 1, 2, 3].map((offset) => this.pointAsVec(first + offset)));
  }

  private pointAsVec(index: number): Vec3 {
    const point = this.builder.pointAt(index);

    return [point[0], point[1], point[2]];
  }
}

export default TetrahelixGenerator;
