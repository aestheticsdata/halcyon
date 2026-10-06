import ammonia from "@data/shapes/ammonia";
import aspirin from "@data/shapes/aspirin";
import benzene from "@data/shapes/benzene";
import caffeine from "@data/shapes/caffeine";
import cantitruncatedCubicSponge from "@data/shapes/cantitruncatedCubicSponge";
import carbonDioxide from "@data/shapes/carbonDioxide";
import cross from "@data/shapes/cross";
import cube from "@data/shapes/cube";
import cuboctahedron from "@data/shapes/cuboctahedron";
import donut from "@data/shapes/donut";
import glucose from "@data/shapes/glucose";
import icosidodecahedron from "@data/shapes/icosidodecahedron";
import kisRhombicDodecahedron from "@data/shapes/kisRhombicDodecahedron";
import kisRhombicTriacontahedron from "@data/shapes/kisRhombicTriacontahedron";
import menger from "@data/shapes/menger";
import methane from "@data/shapes/methane";
import mucube from "@data/shapes/mucube";
import mucuboctahedron from "@data/shapes/mucuboctahedron";
import muoctahedron from "@data/shapes/muoctahedron";
import murhombicuboctahedron from "@data/shapes/murhombicuboctahedron";
import mutetrahedron from "@data/shapes/mutetrahedron";
import prismaticFourFive from "@data/shapes/prismaticFourFive";
import pyramid from "@data/shapes/pyramid";
import rhombicDodecahedron from "@data/shapes/rhombicDodecahedron";
import rhombicTriacontahedron from "@data/shapes/rhombicTriacontahedron";
import sphere from "@data/shapes/sphere";
import tetrahelix from "@data/shapes/tetrahelix";
import torusKnot from "@data/shapes/torusKnot";
import torusKnot25 from "@data/shapes/torusKnot25";
import torusKnot27 from "@data/shapes/torusKnot27";
import torusKnot34 from "@data/shapes/torusKnot34";
import truncatedCuboctahedron from "@data/shapes/truncatedCuboctahedron";
import truncatedIcosidodecahedron from "@data/shapes/truncatedIcosidodecahedron";
import water from "@data/shapes/water";

import type { Data3D } from "@data/types";

export type { Data3D, Object3D } from "@data/types";

// `satisfies` rather than an annotation, so the key list survives into the type
// system: `keyof typeof data` is the thirty-four names, not `string`. That is
// what lets shapeInfo.ts be checked against this registry — a shape added here
// and left unclassified there is a compile error rather than a solid that
// quietly falls out of the picker. The shape of each entry is still enforced.
const data = {
  sphere,
  cube,
  pyramid,
  cross,
  donut,
  torusKnot,
  torusKnot25,
  torusKnot27,
  torusKnot34,
  menger,
  cuboctahedron,
  rhombicDodecahedron,
  kisRhombicDodecahedron,
  truncatedCuboctahedron,
  icosidodecahedron,
  rhombicTriacontahedron,
  kisRhombicTriacontahedron,
  truncatedIcosidodecahedron,
  mucuboctahedron,
  mucube,
  muoctahedron,
  murhombicuboctahedron,
  mutetrahedron,
  cantitruncatedCubicSponge,
  prismaticFourFive,
  tetrahelix,
  water,
  methane,
  ammonia,
  carbonDioxide,
  benzene,
  caffeine,
  aspirin,
  glucose,
} satisfies Data3D;

export default data;
