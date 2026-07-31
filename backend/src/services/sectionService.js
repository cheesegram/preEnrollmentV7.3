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

  let blockCapacity, irregularCapacity, totalCapacity;
  if (current && current.blockCapacity != null && current.irregularCapacity != null) {
    blockCapacity = current.blockCapacity;
    irregularCapacity = current.irregularCapacity;
    totalCapacity = current.totalCapacity;
  } else {
    const capacities = getSectionCapacities(current?.totalCapacity ?? SECTION_TEMPLATE.totalCapacity);
    blockCapacity = capacities.blockCapacity;
    irregularCapacity = capacities.irregularCapacity;
    totalCapacity = capacities.totalCapacity;
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

  return result;
}

export async function rebalanceSections(year, semester) {
  const filter = {
    year: String(year ?? "").trim(),
    semester: String(semester ?? "").trim() || "N/A",
  };

  const allSections = await Section.find(filter).sort({ section: 1 }).lean();
  if (allSections.length === 0) {
    const newSection = createSectionState({
      year: filter.year,
      semester: filter.semester,
      section: "A",
    });
    await Section.create(newSection);
    return [newSection];
  }

  const blockStudents = await Student.find({ ...filter, status: "Block" }).sort({ studentNumber: 1 }).lean();
  const irregularStudents = await Student.find({ ...filter, status: "Irregular" }).sort({ studentNumber: 1 }).lean();

  if (blockStudents.length === 0 && irregularStudents.length === 0) {
    for (const section of allSections) {
      await Section.findByIdAndDelete(section._id);
    }
    const newSection = createSectionState({
      year: filter.year,
      semester: filter.semester,
      section: "A",
    });
    await Section.create(newSection);
    return [newSection];
  }

  // Group students by section
  const blockBySection = new Map();
  const irregularBySection = new Map();
  
  for (const student of blockStudents) {
    if (!blockBySection.has(student.section)) {
      blockBySection.set(student.section, []);
    }
    blockBySection.get(student.section).push(student);
  }
  
  for (const student of irregularStudents) {
    if (!irregularBySection.has(student.section)) {
      irregularBySection.set(student.section, []);
    }
    irregularBySection.get(student.section).push(student);
  }

  // Calculate overflow and determine which students to keep
  const sectionsToKeep = [];
  const overflowBlock = [];
  const overflowIrregular = [];
  
  for (const section of allSections) {
    const sectionBlock = blockBySection.get(section.section) || [];
    const sectionIrregular = irregularBySection.get(section.section) || [];
    
    const blockOverflow = Math.max(0, sectionBlock.length - section.blockCapacity);
    const irregularOverflow = Math.max(0, sectionIrregular.length - section.irregularCapacity);
    
    if (sectionBlock.length === 0 && sectionIrregular.length === 0) {
      await Section.findByIdAndDelete(section._id);
    } else {
      sectionsToKeep.push(section);
      // Collect overflow students (excess beyond capacity)
      sectionBlock.slice(section.blockCapacity).forEach(s => overflowBlock.push(s));
      sectionIrregular.slice(section.irregularCapacity).forEach(s => overflowIrregular.push(s));
    }
  }

  // Assign overflow students
  const sectionBlockUsed = {};
  const sectionIrregularUsed = {};
  
  for (const section of sectionsToKeep) {
    sectionBlockUsed[section.section] = Math.min(blockBySection.get(section.section)?.length || 0, section.blockCapacity);
    sectionIrregularUsed[section.section] = Math.min(irregularBySection.get(section.section)?.length || 0, section.irregularCapacity);
  }

  const allOverflow = [...overflowBlock, ...overflowIrregular];

  for (const student of allOverflow) {
    let assigned = false;
    
    if (student.status === "Block") {
      for (const section of sectionsToKeep) {
        if (sectionBlockUsed[section.section] < section.blockCapacity) {
          await Student.findByIdAndUpdate(student._id, { $set: { section: section.section } });
          sectionBlockUsed[section.section]++;
          assigned = true;
          break;
        }
      }
    } else {
      for (const section of sectionsToKeep) {
        if (sectionIrregularUsed[section.section] < section.irregularCapacity) {
          await Student.findByIdAndUpdate(student._id, { $set: { section: section.section } });
          sectionIrregularUsed[section.section]++;
          assigned = true;
          break;
        }
      }
    }
    
    if (!assigned && sectionsToKeep.length > 0) {
      const sourceSection = sectionsToKeep[0];
      const newLetter = String.fromCharCode(65 + sectionsToKeep.length);
      const newSection = await Section.create({
        year: sourceSection.year,
        semester: sourceSection.semester,
        section: newLetter,
        blockCapacity: sourceSection.blockCapacity,
        irregularCapacity: sourceSection.irregularCapacity,
        totalCapacity: sourceSection.totalCapacity,
        blockCount: 0,
        irregularCount: 0,
        status: "Available",
      });
      sectionsToKeep.push(newSection);
      
      if (student.status === "Block") {
        sectionBlockUsed[newSection.section] = 1;
      } else {
        sectionIrregularUsed[newSection.section] = 1;
      }
      
      await Student.findByIdAndUpdate(student._id, { $set: { section: newSection.section } });
    }
  }

  await Promise.all(
    sectionsToKeep.map(section =>
      syncSectionFromStudents({
        year: section.year,
        semester: section.semester,
        section: section.section,
      })
    )
  );

  return Section.find(filter).sort({ year: 1, section: 1, semester: 1 }).lean();
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