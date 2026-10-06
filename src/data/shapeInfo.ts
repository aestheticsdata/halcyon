import type data from "@data/data";
import type { ShapeFamily } from "@data/shapeFamilies";

export interface ShapeReference {
  label: string;
  url: string;
}

export interface ShapeInfo {
  // Which section of the primitive picker the shape is listed under. Required
  // for the same reason `generator` below is, and the reason this record was
  // chosen as the family's home over a separate key-to-family map: a second list
  // of registry keys can drift from the registry, and a shape missing from it
  // would silently vanish from the picker instead of failing loudly.
  family: ShapeFamily;
  title: string;
  description: string;
  geometricFeature: string;
  densityLabel: string;
  // How the mesh is actually produced, as the SHAPE STORY footer prints it.
  // Required on purpose: a shape that lands without one is a compile error
  // rather than an em dash nobody notices. Each value names the construction the
  // shape's own file uses, not a generic description of the family.
  generator: string;
  textureSummary: string;
  // Optional: shapes with no canonical write-up (the cross) simply omit these.
  references?: ShapeReference[];
}

// Checked against the registry, exported widened. The `satisfies` clause is what
// makes a shape added to data.ts and left unclassified here a compile error —
// a missing key, a missing `family` and a mistyped family name all fail at this
// line. The export is deliberately widened back to a string key afterwards:
// every consumer looks a shape up by a name it got at runtime (Main takes it
// from the shape switcher), and narrowing the export would push the twenty
// literals through the whole call chain to buy nothing.
const entries = {
  sphere: {
    family: "UNCATEGORIZED",
    title: "Sphere",
    description: "A low-poly sphere built from latitude and longitude bands with a bold checker pattern.",
    geometricFeature: "Triangulated meridians and parallels approximate a smooth volume with a limited polygon budget.",
    densityLabel: "Medium density",
    generator: "lat/long bands",
    textureSummary: "No textures",
    references: [
      { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Sphere" },
      { label: "MathWorld", url: "https://mathworld.wolfram.com/Sphere.html" },
    ],
  },
  cube: {
    family: "UNCATEGORIZED",
    title: "Cube",
    description: "A hard-edged box mixing flat-colored faces with subdivided textured surfaces.",
    geometricFeature: "Two faces are heavily subdivided for texture mapping, while the others stay simple and flat.",
    densityLabel: "High density",
    generator: "unit hull + subdivided faces",
    textureSummary: "Dog and galaxy textures",
    references: [
      { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Cube" },
      { label: "MathWorld", url: "https://mathworld.wolfram.com/Cube.html" },
    ],
  },
  pyramid: {
    family: "UNCATEGORIZED",
    title: "Pyramid",
    description: "A classic square-based pyramid with strongly contrasted side colors and a sharp apex.",
    geometricFeature: "Five vertices define four lateral faces converging to a single tip plus a triangulated base.",
    densityLabel: "Low density",
    generator: "square base + apex fan",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Square_pyramid",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/SquarePyramid.html",
      },
    ],
  },
  cross: {
    family: "UNCATEGORIZED",
    title: "Cross",
    description: "An extruded cross silhouette that reads like a solid emblem rather than a rounded primitive.",
    geometricFeature: "A 2D profile is duplicated in depth, then stitched with side quads to create thickness.",
    densityLabel: "Medium density",
    generator: "extruded 2D profile",
    textureSummary: "No textures",
  },
  donut: {
    family: "SURFACES",
    title: "Donut",
    description: "A torus primitive with a dense triangulated ring and alternating pastel surface colors.",
    geometricFeature:
      "A circular tube is swept around a larger circle, producing a continuous loop with no sharp corners.",
    densityLabel: "High density",
    generator: "ring sweep",
    textureSummary: "No textures",
    references: [
      { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Torus" },
      { label: "MathWorld", url: "https://mathworld.wolfram.com/Torus.html" },
    ],
  },
  torusKnot: {
    family: "KNOTS",
    title: "Torus Knot",
    description: "A tubular surface wrapped along a trefoil-like closed knot with repeating braided curvature.",
    geometricFeature:
      "The tube follows a p/q knot centerline and uses transported frames to keep the cross-section stable.",
    densityLabel: "High density",
    generator: "p/q knot sweep",
    textureSummary: "No textures",
    references: [
      { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Torus_knot" },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/TorusKnot.html",
      },
    ],
  },
  torusKnot25: {
    family: "KNOTS",
    title: "Cinquefoil knot",
    description: "The (2, 5) torus knot, 5₁ — Solomon's seal, five lobes of the same tube sweep in two tones of amber.",
    geometricFeature:
      "Two turns around the main axis to five through the hole; coprime p and q are what make the curve close as one loop.",
    densityLabel: "High density",
    generator: "p/q knot sweep",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Cinquefoil_knot",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/SolomonsSealKnot.html",
      },
    ],
  },
  torusKnot27: {
    family: "KNOTS",
    title: "Septafoil knot",
    description: "The (2, 7) torus knot, 7₁ — seven lobes in mint over deep green, the longest curve of the four.",
    geometricFeature:
      "Its curve is the longest in the registry, so the sweep spends its whole tessellation budget on path segments.",
    densityLabel: "High density",
    generator: "p/q knot sweep",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/7_1_knot",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/TorusKnot.html",
      },
    ],
  },
  torusKnot34: {
    family: "KNOTS",
    title: "(3, 4) torus knot",
    description: "The (3, 4) torus knot, 8₁₉ — the only one of the four with p > 2, in pale cyan over deep teal.",
    geometricFeature:
      "Three turns around the main axis rather than two, so three strands cross every section of the torus instead of two.",
    densityLabel: "High density",
    generator: "p/q knot sweep",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/8_19_knot",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/TorusKnot.html",
      },
    ],
  },
  menger: {
    family: "FRACTALS",
    title: "Menger Sponge",
    description: "A level-2 cube fractal carved by recursively removing center volumes on each axis.",
    geometricFeature:
      "Only exposed voxel faces are emitted, revealing tunnels and cavities while preserving a clean outer silhouette.",
    densityLabel: "Very high density",
    generator: "level-2 recursive carve",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Menger_sponge",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/MengerSponge.html",
      },
    ],
  },
  cuboctahedron: {
    family: "POLYHEDRA",
    title: "Cuboctahedron",
    description:
      "An Archimedean solid mixing 8 triangles and 6 squares, coloured by face type in the blues of Conway's plate.",
    geometricFeature:
      "Its 12 vertices are the midpoints of a cube's edges, so cube and octahedron faces alternate around every vertex.",
    densityLabel: "Low density",
    generator: "convex hull builder",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Cuboctahedron",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/Cuboctahedron.html",
      },
    ],
  },
  rhombicDodecahedron: {
    family: "POLYHEDRA",
    title: "Rhombic dodecahedron",
    description: "A Catalan solid whose 12 identical rhombic faces are shaded in three tones, one per axis they share.",
    geometricFeature:
      "The convex hull of a cube and its dual octahedron, and the dual of the cuboctahedron: a face here for every vertex there.",
    densityLabel: "Low density",
    generator: "cube + octahedron hull",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Rhombic_dodecahedron",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/RhombicDodecahedron.html",
      },
    ],
  },
  kisRhombicDodecahedron: {
    family: "POLYHEDRA",
    title: "Kisrhombic dodecahedron",
    description:
      "The disdyakis dodecahedron: 48 identical scalene triangles in two alternating greens, one light and one dark.",
    geometricFeature:
      "A pyramid raised on each of the rhombic dodecahedron's 12 faces, placed by reciprocating the truncated cuboctahedron rather than by eye.",
    densityLabel: "Low density",
    generator: "tCO reciprocal",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Disdyakis_dodecahedron",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/DisdyakisDodecahedron.html",
      },
    ],
  },
  truncatedCuboctahedron: {
    family: "POLYHEDRA",
    title: "Truncated cuboctahedron",
    description:
      "An Archimedean solid of 12 squares, 8 hexagons and 6 octagons, in three ambers keyed to the face types.",
    geometricFeature:
      "Its 26 faces sit on the 26 axes of the cube — an octagon per face axis, a hexagon per corner axis, a square per edge axis.",
    densityLabel: "Medium density",
    generator: "signed permutations",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Truncated_cuboctahedron",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/TruncatedCuboctahedron.html",
      },
    ],
  },
  icosidodecahedron: {
    family: "POLYHEDRA",
    title: "Icosidodecahedron",
    description:
      "An Archimedean solid of 20 triangles and 12 pentagons in two roses, the icosahedral counterpart of the cuboctahedron.",
    geometricFeature:
      "Its 30 vertices are the midpoints of an icosahedron's edges, so triangles and pentagons alternate around every one of them.",
    densityLabel: "Low density",
    generator: "icosahedron edge midpoints",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Icosidodecahedron",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/Icosidodecahedron.html",
      },
    ],
  },
  rhombicTriacontahedron: {
    family: "POLYHEDRA",
    title: "Rhombic triacontahedron",
    description:
      "A Catalan solid of 30 identical golden rhombi, shaded in five tones — one per cube inscribed in the dodecahedron.",
    geometricFeature:
      "The convex hull of a dodecahedron and its dual icosahedron, and the dual of the icosidodecahedron: a face here for every vertex there.",
    densityLabel: "Low density",
    generator: "dodecahedron + icosahedron hull",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Rhombic_triacontahedron",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/RhombicTriacontahedron.html",
      },
    ],
  },
  kisRhombicTriacontahedron: {
    family: "POLYHEDRA",
    title: "Kisrhombic triacontahedron",
    description:
      "The disdyakis triacontahedron: 120 identical scalene triangles in two alternating tones, the densest solid of the family.",
    geometricFeature:
      "A pyramid raised on each of the rhombic triacontahedron's 30 faces, placed by reciprocating the truncated icosidodecahedron.",
    densityLabel: "High density",
    generator: "tID reciprocal",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Disdyakis_triacontahedron",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/DisdyakisTriacontahedron.html",
      },
    ],
  },
  truncatedIcosidodecahedron: {
    family: "POLYHEDRA",
    title: "Truncated icosidodecahedron",
    description:
      "An Archimedean solid of 30 squares, 20 hexagons and 12 decagons in three plums, the largest of Conway's family.",
    geometricFeature:
      "One vertex per flag of the icosahedron — each of the 120 sits where a decagon, a hexagon and a square plane meet.",
    densityLabel: "High density",
    generator: "icosahedron flag solve",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Truncated_icosidodecahedron",
      },
      {
        label: "MathWorld",
        url: "https://mathworld.wolfram.com/TruncatedIcosidodecahedron.html",
      },
    ],
  },
  mucuboctahedron: {
    family: "POLYHEDRA",
    title: "Mucuboctahedron",
    description:
      "An infinite skew polyhedron: a periodic sponge of squares and hexagons in the golds of Conway's plate, rendered as a finite chunk.",
    geometricFeature:
      "All the squares of the Kelvin foam's truncated octahedra plus half their hexagons; the other half are the openings.",
    densityLabel: "Medium density",
    generator: "bitruncated cubic lattice",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Skew_apeirohedron",
      },
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Bitruncated_cubic_honeycomb",
      },
    ],
  },
  mucube: {
    family: "POLYHEDRA",
    title: "Mucube",
    description:
      "One of the two sponges Petrie found, in brass: unit cubes stripped to open tubes, six of them meeting around every faceless cube.",
    geometricFeature:
      "Six squares at every vertex and square holes; the all-even and all-odd cubes become the holes, which is the one assignment leaving two faces on every edge.",
    densityLabel: "Medium density",
    generator: "cubic tubes + faceless holes",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Regular_skew_apeirohedron",
      },
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Cubic_honeycomb",
      },
    ],
  },
  muoctahedron: {
    family: "POLYHEDRA",
    title: "Muoctahedron",
    description:
      "Petrie's regular sponge {6,4|4}, in copper: every hexagon of the Kelvin foam, with all of its squares opened out as the tunnels.",
    geometricFeature:
      "Four hexagons at every vertex and square holes; the honeycomb puts one square and two hexagons on each edge, so deleting the squares leaves exactly two faces there.",
    densityLabel: "Medium density",
    generator: "bitruncated cubic lattice",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Regular_skew_apeirohedron",
      },
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Bitruncated_cubic_honeycomb",
      },
    ],
  },
  murhombicuboctahedron: {
    family: "POLYHEDRA",
    title: "Murhombicuboctahedron",
    description:
      "The denser sponge of Conway's plate: squares and hexagons in pale gold, with the octagons opened out as its tunnels.",
    geometricFeature:
      "Every square and hexagon of the omnitruncated cubic honeycomb; deleting only its octagons leaves two faces on every edge.",
    densityLabel: "High density",
    generator: "omnitruncated cubic lattice",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Skew_apeirohedron",
      },
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Omnitruncated_cubic_honeycomb",
      },
    ],
  },
  mutetrahedron: {
    family: "POLYHEDRA",
    title: "Mutetrahedron",
    description:
      "Coxeter's completion of the regular trio, in rust: every hexagon of the quarter cubic honeycomb, with its triangles opened out as the tunnels.",
    geometricFeature:
      "Six hexagons at every vertex and triangular holes; the second sublattice is point-inverted, without which not one hexagon would be shared.",
    densityLabel: "High density",
    generator: "quarter cubic lattice",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Regular_skew_apeirohedron",
      },
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Quarter_cubic_honeycomb",
      },
    ],
  },
  prismaticFourFive: {
    family: "POLYHEDRA",
    title: "Prismatic {4,5}",
    description:
      "Gott's prismatic pseudopolyhedron in cool slate: two square tilings one cube apart, joined through open shafts.",
    geometricFeature:
      "Five squares at every vertex, which forces both the spacing and the thickness — one shaft per 2x2 block of squares, and sheets exactly one edge apart.",
    densityLabel: "Medium density",
    generator: "punched slab + shaft walls",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Skew_apeirohedron",
      },
      {
        label: "Gott 1967",
        url: "https://www.jstor.org/stable/2314879",
      },
    ],
  },
  tetrahelix: {
    family: "POLYHEDRA",
    title: "Boerdijk–Coxeter helix",
    description:
      "Regular tetrahedra glued face to face in a single right-handed chain, its free faces wound into three ribbons of rose, gold and blue.",
    geometricFeature:
      "Six triangles at every vertex; the twist of arccos(−2/3) per tetrahedron is no rational fraction of a turn, so no two cells ever share an orientation.",
    densityLabel: "Low density",
    generator: "face-to-face tetrahedra",
    textureSummary: "No textures",
    references: [
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Boerdijk%E2%80%93Coxeter_helix",
      },
      {
        label: "Wikipedia",
        url: "https://en.wikipedia.org/wiki/Skew_apeirohedron",
      },
    ],
  },
  water: {
    family: "MOLECULES",
    title: "Water",
    description:
      "The first molecule of the registry: two white hydrogens on a red oxygen in CPK colours, bent rather than straight.",
    geometricFeature:
      "Three spheres and two rods in one mesh; the 104.45° bend between the O–H bonds is experiment's number, not a styling choice.",
    densityLabel: "Low density",
    generator: "ball-and-stick sweep",
    textureSummary: "No textures",
  },
  methane: {
    family: "MOLECULES",
    title: "Methane",
    description:
      "Four white hydrogens at the corners of a regular tetrahedron around a grey carbon — the shape every chemistry course opens on.",
    geometricFeature:
      "Five spheres and four rods in one mesh; where water's bend is experiment's number, the 109.47° between any two C–H bonds is symmetry's — arccos(−1/3), at any bond length.",
    densityLabel: "Low density",
    generator: "ball-and-stick sweep",
    textureSummary: "No textures",
  },
  ammonia: {
    family: "MOLECULES",
    title: "Ammonia",
    description:
      "Three white hydrogens on a blue nitrogen, tipped into a shallow pyramid by a lone pair this model does not draw.",
    geometricFeature:
      "Four spheres and three rods in one mesh; the hydrogens stand 120° apart in azimuth but only 106.7° apart between bonds, and that gap is the whole difference between a pyramid and a flat triangle.",
    densityLabel: "Low density",
    generator: "ball-and-stick sweep",
    textureSummary: "No textures",
  },
  carbonDioxide: {
    family: "MOLECULES",
    title: "Carbon Dioxide",
    description:
      "Two red oxygens double-bonded to a grey carbon and stretched into a dead straight line, the one shape in the family with no angle to get wrong.",
    geometricFeature:
      "Three spheres and two rods in one mesh — water's own count with the bend taken out; both bonds here are double, and every bond in this family draws as one rod whatever its order.",
    densityLabel: "Low density",
    generator: "ball-and-stick sweep",
    textureSummary: "No textures",
  },
  benzene: {
    family: "MOLECULES",
    title: "Benzene",
    description:
      "Six grey carbons in a flat regular hexagon, each with one white hydrogen pointing straight out from the centre — the ring every other aromatic in this family is built around.",
    geometricFeature:
      "Twelve spheres and twelve rods in one mesh, and the only shape here whose two shells share one set of six azimuths: a hexagon's side equals its circumradius, so the carbons sit at the C–C length and the hydrogens at C–C plus C–H, on the same spokes.",
    densityLabel: "Medium density",
    generator: "ball-and-stick sweep",
    textureSummary: "No textures",
  },
  caffeine: {
    family: "MOLECULES",
    title: "Caffeine",
    description:
      "Twenty-four atoms in a flat two-ring plate with three methyl groups standing off it — the first molecule here too big to derive by hand.",
    geometricFeature:
      "Twenty-four spheres and twenty-five rods in one mesh; the fused purine bicycle is planar to under a thousandth of an Ångström, and the nine methyl hydrogens are the only atoms that leave that plane.",
    densityLabel: "High density",
    generator: "ball-and-stick sweep",
    textureSummary: "No textures",
  },
  aspirin: {
    family: "MOLECULES",
    title: "Aspirin",
    description:
      "Twenty-one atoms: a benzene ring flat to four hundred-thousandths of an Ångström, with an acetate group standing square to it and a carboxylic acid half-turned out of the plane.",
    geometricFeature:
      "Twenty-one spheres and twenty-one rods, the densest mesh in the registry at 8064 of the 8192-triangle budget — and the first molecule here with a conformer rather than a shape, since the acetate and the acid both turn about single bonds.",
    densityLabel: "High density",
    generator: "ball-and-stick sweep",
    textureSummary: "No textures",
  },
  glucose: {
    family: "MOLECULES",
    title: "Glucose",
    description:
      "Twenty-four atoms in the pyranose CHAIR, not the flat hexagon of the textbook: three ring atoms up, three down, and every hydroxyl lying out in the ring's own plane.",
    geometricFeature:
      "Twenty-four spheres and twenty-four rods; the six ring atoms deviate up to 0.275 Å from their mean plane and the ring torsions alternate in sign, which is what a chair is — and all five substituents sit equatorial, which is what makes this the β anomer.",
    densityLabel: "High density",
    generator: "ball-and-stick sweep",
    textureSummary: "No textures",
  },
} satisfies Record<keyof typeof data, ShapeInfo>;

// The narrow shape of the table above, before the widening below throws it
// away. moleculeInfo.ts reads its key set out of this: the entries whose
// `family` is literally "MOLECULES" are exactly the shapes that owe chemistry,
// so a molecule landing in the registry without a moleculeInfo entry is a
// compile error there rather than an empty card. Exported as a type only —
// nothing may import these entries as a value and re-widen them itself.
export type ShapeInfoEntries = typeof entries;

const shapeInfo: Record<string, ShapeInfo> = entries;

export default shapeInfo;
