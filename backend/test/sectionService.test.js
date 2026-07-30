import assert from "node:assert/strict";
import {
  DEFAULT_TOTAL_CAPACITY,
  addStudentToSectionState,
  createSectionState,
  getSectionCapacities,
  getSectionStatus,
  normalizeSectionName,
  normalizeSemester,
} from "../src/services/sectionService.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  \u2717 ${name}`);
    console.error(`    ${err && err.stack ? err.stack : err}`);
  }
}

console.log("\nSection Service Logic\n");

test("DEFAULT_TOTAL_CAPACITY is 50 (from template)", () => {
  assert.equal(DEFAULT_TOTAL_CAPACITY, 50);
});

test("getSectionCapacities derives 10%/90% split from totalCapacity", () => {
  const caps = getSectionCapacities(50);
  assert.equal(caps.totalCapacity, 50);
  assert.equal(caps.irregularCapacity, 5);
  assert.equal(caps.blockCapacity, 45);
});

test("getSectionCapacities falls back to 50 for invalid input", () => {
  const caps = getSectionCapacities(NaN);
  assert.equal(caps.totalCapacity, 50);
  assert.equal(caps.irregularCapacity, 5);
  assert.equal(caps.blockCapacity, 45);
});

test("getSectionStatus returns Available when under capacity", () => {
  assert.equal(getSectionStatus(1, 0, 50), "Available");
  assert.equal(getSectionStatus(49, 0, 50), "Available");
});

test("getSectionStatus returns Full when exactly at capacity", () => {
  assert.equal(getSectionStatus(45, 5, 50), "Full");
});

test("getSectionStatus returns Overloaded when over capacity", () => {
  assert.equal(getSectionStatus(46, 5, 50), "Overloaded");
});

test("createSectionState seeds a fresh section from the template", () => {
  const section = createSectionState({ year: "1", semester: "1st", section: "A" });
  assert.equal(section.year, "1");
  assert.equal(section.semester, "1st");
  assert.equal(section.section, "A");
  assert.equal(section.blockCount, 0);
  assert.equal(section.irregularCount, 0);
  assert.equal(section.totalCapacity, 50);
  assert.equal(section.irregularCapacity, 5);
  assert.equal(section.blockCapacity, 45);
  assert.equal(section.status, "Available");
});

test("addStudentToSectionState increments blockCount for Block students", () => {
  const section = createSectionState({ year: "1", semester: "1st", section: "A" });
  addStudentToSectionState(section, "Block");
  assert.equal(section.blockCount, 1);
  assert.equal(section.irregularCount, 0);
  assert.equal(section.status, "Available");
});

test("addStudentToSectionState increments irregularCount for Irregular students", () => {
  const section = createSectionState({ year: "1", semester: "1st", section: "A" });
  addStudentToSectionState(section, "Irregular");
  assert.equal(section.blockCount, 0);
  assert.equal(section.irregularCount, 1);
  assert.equal(section.status, "Available");
});

test("addStudentToSectionState reaches Full then Overloaded", () => {
  const section = createSectionState({ year: "1", semester: "1st", section: "A" });
  for (let i = 0; i < 45; i++) addStudentToSectionState(section, "Block");
  for (let i = 0; i < 5; i++) addStudentToSectionState(section, "Irregular");
  assert.equal(section.blockCount, 45);
  assert.equal(section.irregularCount, 5);
  assert.equal(section.status, "Full");
  addStudentToSectionState(section, "Block");
  assert.equal(section.status, "Overloaded");
});

test("normalizeSectionName uppercases and trims", () => {
  assert.equal(normalizeSectionName("  a  "), "A");
  assert.equal(normalizeSectionName("bC"), "BC");
});

test("normalizeSemester defaults to N/A for empty input", () => {
  assert.equal(normalizeSemester(""), "N/A");
  assert.equal(normalizeSemester("2nd"), "2nd");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
