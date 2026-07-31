import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Section from "../models/Section.js";
import Student from "../models/Student.js";

const SECTION_TEMPLATE_PATH = fileURLToPath(
  new URL("../../../fileTemplates/sectionTemplates/sectionTemplate(JSON).json", import.meta.url)
);

function loadSectionTemplate() {
  const parsed = JSON.parse(readFileSync(SECTION_TEMPLATE_PATH, "utf8"));
  const template = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!template || typeof template !== "object") {
    throw new Error("Section template must contain a section object");
  }
  return template;
}

const SECTION_TEMPLATE = loadSectionTemplate();
export const DEFAULT_TOTAL_CAPACITY = Number(SECTION_TEMPLATE.totalCapacity) || 50;

export function normalizeSectionValue(value) {
  return String(value ?? "").trim();
}

export function normalizeSectionName(value) {
  return normalizeSectionValue(value).toUpperCase();
}

export function normalizeSemester(value) {
  return normalizeSectionValue(value) || "N/A";
}

export function getSectionCapacities(totalCapacity = DEFAULT_TOTAL_CAPACITY) {
  const parsedCapacity = Number(totalCapacity);
  const safeTotalCapacity = Number.isFinite(parsedCapacity) && parsedCapacity >= 0
    ? parsedCapacity
    : DEFAULT_TOTAL_CAPACITY;
  const irregularCapacity = safeTotalCapacity * 0.1;

  return {
    totalCapacity: safeTotalCapacity,
    irregularCapacity,
    blockCapacity: safeTotalCapacity - irregularCapacity,
  };
}

export function getSectionStatus(blockCount = 0, irregularCount = 0, totalCapacity = DEFAULT_TOTAL_CAPACITY) {
  const studentCount = Number(blockCount || 0) + Number(irregularCount || 0);
  const capacity = Number(totalCapacity || 0);
  if (studentCount < capacity) return "Available";
  if (studentCount === capacity) return "Full";
  return "Overloaded";
}

export function createSectionState({ year, semester, section, sourceSection = null }) {
  const capacities = getSectionCapacities(sourceSection?.totalCapacity ?? SECTION_TEMPLATE.totalCapacity);
  return {
    year: normalizeSectionValue(year),
    semester: normalizeSemester(semester),
    section: normalizeSectionName(section),
    createdAt: new Date().toISOString(),
    blockCount: 0,
    irregularCount: 0,
    ...capacities,
    status: getSectionStatus(0, 0, capacities.totalCapacity),
  };
}

export function addStudentToSectionState(section, status) {
  if (normalizeSectionValue(status).toLowerCase() === "irregular") {
    section.irregularCount = Number(section.irregularCount ?? 0) + 1;
  } else {
    section.blockCount = Number(section.blockCount ?? 0) + 1;
  }
  section.status = getSectionStatus(section.blockCount, section.irregularCount, section.totalCapacity);
  return section;
}

function sectionStudentFilter({ year, semester, section }) {
  return {
    year: normalizeSectionValue(year),
    semester: normalizeSemester(semester),
    section: normalizeSectionName(section),
  };
}

/**
 * Recalculate and persist one section from its actual students. The first
 * enrolled student causes an upsert based on the JSON template; later students
 * update the same year/semester/section record.
 */
export async function syncSectionFromStudents(sectionIdentity) {
  const identity = sectionStudentFilter(sectionIdentity);
  if (!identity.year || !identity.section) {
    throw new Error("A year and section are required to sync a section");
  }

  const current = await Section.findOne(identity).lean();
  const [blockCount, irregularCount] = await Promise.all([
    Student.countDocuments({ ...identity, status: "Block" }),
    Student.countDocuments({ ...identity, status: "Irregular" }),
  ]);

  console.log("[DEBUG] syncSectionFromStudents for", identity, {
    currentTotalCapacity: current?.totalCapacity,
    currentBlockCapacity: current?.blockCapacity,
    currentIrregularCapacity: current?.irregularCapacity,
  });

  let blockCapacity, irregularCapacity, totalCapacity;
  if (current && current.blockCapacity != null && current.irregularCapacity != null) {
    blockCapacity = current.blockCapacity;
    irregularCapacity = current.irregularCapacity;
    totalCapacity = current.totalCapacity;
    console.log("[DEBUG] Preserving existing capacities:", { blockCapacity, irregularCapacity, totalCapacity });
  } else {
    const capacities = getSectionCapacities(current?.totalCapacity ?? SECTION_TEMPLATE.totalCapacity);
    blockCapacity = capacities.blockCapacity;
    irregularCapacity = capacities.irregularCapacity;
    totalCapacity = capacities.totalCapacity;
    console.log("[DEBUG] Using default capacities:", { blockCapacity, irregularCapacity, totalCapacity });
  }

  const result = await Section.findOneAndUpdate(
    identity,
    {
      $set: {
        ...identity,
        blockCount,
        irregularCount,
        blockCapacity,
        irregularCapacity,
        totalCapacity,
        status: getSectionStatus(blockCount, irregularCount, totalCapacity),
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  console.log("[DEBUG] After sync:", {
    blockCapacity: result?.blockCapacity,
    irregularCapacity: result?.irregularCapacity,
    totalCapacity: result?.totalCapacity,
  });

  return result;
}

export async function syncAllSectionsFromStudents() {
  const groups = await Student.aggregate([
    {
      $match: {
        status: { $in: ["Block", "Irregular"] },
        year: { $nin: [null, ""] },
        section: { $nin: [null, ""] },
      },
    },
    {
      $group: {
        _id: {
          year: "$year",
          semester: "$semester",
          section: "$section",
        },
      },
    },
  ]);

  await Promise.all(
    groups.map(({ _id }) => syncSectionFromStudents(_id))
  );

  return Section.find({}).sort({ year: 1, section: 1, semester: 1 }).lean();
}