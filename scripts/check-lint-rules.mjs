// Proves that every house-style rule still fires.
//
// This exists because of one property of Biome's Grit plugins: a plugin whose pattern
// matches nothing reports nothing, and Biome does not consider that an error. A typo in
// a node name, or a grammar change in a Biome upgrade, turns a rule off silently — and
// a silently disabled rule looks exactly like a clean codebase. `pnpm run lint` passing
// is therefore not evidence that the rules work; this is.
//
// It asserts a count rather than mere presence, because two of the rules fail by
// over-reporting rather than by going quiet: R6/R8 must not claim the exempt
// constructor, and R20 must not claim a correctly capitalised acronym or a camelCase
// member. conformant.ts is the other half of that check.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const BIOME = join(ROOT, "node_modules", ".bin", "biome");
const FIXTURES = join(HERE, "lint-fixtures");

// Plugin rules are keyed by message prefix: every plugin diagnostic is reported under
// the generic "plugin" category, so the message is the only thing that identifies it.
const PLUGIN_RULES = [
  ["R1 export class", "R1: declare a bare", 7],
  ["D4 inheritance/implements", "D4: no inheritance", 4],
  ["D4 abstract", "D4: no `abstract`", 8],
  ["D4 protected", "D4: no `protected`", 1],
  ["R6/R8 accessibility", "R6/R8: every field", 6],
  ["R15 module-level let", "R15: no module-level", 2],
  ["I4 for…of", "I4: use `for…of`", 1],
  ["R20 acronym case", "R20: an acronym keeps", 7],
];

// Native rules are keyed by their diagnostic category, which is what proves the rule is
// actually enabled in biome.json rather than merely spelled correctly.
const NATIVE_RULES = [
  ["R3 parameter properties", "lint/style/noParameterProperties", 1],
  ["R19 import type", "lint/style/useImportType", 1],
];

function lint(file) {
  try {
    return execFileSync(BIOME, ["lint", "--max-diagnostics=200", join(FIXTURES, file)], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // Biome exits non-zero whenever it reports a diagnostic, which is the normal case
    // for violations.ts. The output is what matters, not the status.
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}

function countMessages(output) {
  return output
    .split("\n")
    .map((line) => line.match(/^\s*×\s*(.*)$/))
    .filter(Boolean)
    .map((match) => match[1].trim());
}

const failures = [];

const violations = lint("violations.ts");
const messages = countMessages(violations);

for (const [name, prefix, expected] of PLUGIN_RULES) {
  const actual = messages.filter((message) => message.startsWith(prefix)).length;
  if (actual !== expected) {
    failures.push(`${name}: expected ${expected} diagnostic(s), got ${actual}`);
  }
}

for (const [name, category, expected] of NATIVE_RULES) {
  const actual = violations.split(category).length - 1;
  if (actual !== expected) {
    failures.push(`${name}: expected ${expected} diagnostic(s) of ${category}, got ${actual}`);
  }
}

const conformant = countMessages(lint("conformant.ts"));
if (conformant.length !== 0) {
  failures.push(`conformant.ts must be clean, got ${conformant.length}:\n    ${conformant.join("\n    ")}`);
}

const checked = PLUGIN_RULES.length + NATIVE_RULES.length;

if (failures.length > 0) {
  console.error(`✗ ${failures.length} of ${checked} house-style rules are not behaving as specified:\n`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error("\nA rule reporting 0 is a rule that has silently stopped working.");
  process.exit(1);
}

console.log(`✓ all ${checked} house-style rules fire as specified, and conformant.ts stays clean`);
