import Section from "../models/Section.js";
import Student from "../models/Student.js";

const DEFAULT_REGULAR_CAPACITY = 45;
const DEFAULT_IRREGULAR_CAPACITY = 5;
const DEFAULT_TOTAL_CAPACITY = 50;

function toStatus(regular, irregular, totalCapacity) {
  const regularCount = Number(regular || 0);
  const regularCapacity = Number(
    totalCapacity != null ? totalCapacity : DEFAULT_REGULAR_CAPACITY
  );
  if (regularCount < regularCapacity) return "Available";
  if (regularCount === regularCapacity) return "Full";
  return "Overloaded";
}

export async function syncSectionsFromStudents(req, res) {
  try {
    // Use block-track students for automatic grouping.
    const enrolledStudents = await Student.find({
      status: { $in: ["Block"] },
    }).lean();

    const grouped = new Map();
    for (const student of enrolledStudents) {
      const year = String(student.year ?? "").trim();
      const section = String(student.section ?? "").trim().toUpperCase();
      const semester = String(student.semester ?? "").trim() || "N/A";
      if (!year || !section) continue;

      const key = `${year}::${section}::${semester}`;
      grouped.set(key, {
        year,
        section,
        semester,
        regular: (grouped.get(key)?.regular || 0) + 1,
      });
    }

    const existing = await Section.find({}).lean();
    const existingByKey = new Map(
      existing.map((s) => [`${s.year}::${s.section}::${s.semester}`, s])
    );

    const bulkOps = [];
    for (const [key, group] of grouped.entries()) {
      const current = existingByKey.get(key);
      const irregular = Number(current?.irregular ?? 0);
      const regularCapacity = Number(current?.regular_capacity ?? DEFAULT_REGULAR_CAPACITY);
      const irregularCapacity = Number(current?.irregular_capacity ?? DEFAULT_IRREGULAR_CAPACITY);
      const totalCapacity = Number(current?.total_capacity ?? (regularCapacity + irregularCapacity) ?? DEFAULT_TOTAL_CAPACITY);

      bulkOps.push({
        updateOne: {
          filter: { year: group.year, section: group.section, semester: group.semester },
          update: {
            $set: {
              year: group.year,
              section: group.section,
              semester: group.semester,
              regular: group.regular,
              irregular,
              regular_capacity: regularCapacity,
              irregular_capacity: irregularCapacity,
              total_capacity: totalCapacity,
              status: toStatus(group.regular, irregular, regularCapacity),
            },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length) {
      await Section.bulkWrite(bulkOps, { ordered: false });
    }

    // Keep manually created sections and reset regular count to 0 when no enrolled
    // students currently match that year/section/semester grouping.
    const liveKeys = new Set(grouped.keys());
    const staleOps = existing
      .filter((s) => !liveKeys.has(`${s.year}::${s.section}::${s.semester}`))
      .map((s) => {
        const irregular = Number(s.irregular ?? 0);
        const totalCapacity = Number(
          s.total_capacity ??
            (Number(s.regular_capacity ?? DEFAULT_REGULAR_CAPACITY) +
              Number(s.irregular_capacity ?? DEFAULT_IRREGULAR_CAPACITY))
        );
        const regularCapacity = Number(s.regular_capacity ?? DEFAULT_REGULAR_CAPACITY);

        return {
          updateOne: {
            filter: { _id: s._id },
            update: {
              $set: {
                regular: 0,
                status: toStatus(0, irregular, regularCapacity),
              },
            },
          },
        };
      });

    if (staleOps.length) {
      await Section.bulkWrite(staleOps, { ordered: false });
    }

    const sections = await Section.find({}).sort({ year: 1, section: 1, semester: 1 }).lean();
    res.status(200).json({ message: "Sections synced successfully", sections });
  } catch (error) {
    console.error("Error in syncSectionsFromStudents controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getAllSections(req, res) {
  try {
    const sections = await Section.find({}).sort({ year: 1, section: 1, semester: 1 }).lean();
    res.status(200).json(sections);
  } catch (error) {
    console.error("Error in getAllSections controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createSection(req, res) {
  try {
    const rawSectionName = String(req.body?.section ?? "").trim();
    const sectionName = rawSectionName.toUpperCase();
    const year = String(req.body?.year ?? "").trim();
    const semester = String(req.body?.semester ?? "").trim();

    if (!sectionName) {
      return res.status(400).json({ message: "Section name is required" });
    }

    if (!["1", "2", "3", "4"].includes(year)) {
      return res.status(400).json({ message: "Year must be 1, 2, 3, or 4" });
    }

    if (!["1st", "2nd"].includes(semester)) {
      return res.status(400).json({ message: "Semester must be 1st or 2nd" });
    }

    const existing = await Section.findOne({ year, section: sectionName, semester }).lean();
    if (existing) {
      return res.status(409).json({ message: "Section already exists" });
    }

    const regular = 0;
    const irregular = 0;
    const regularCapacity = DEFAULT_REGULAR_CAPACITY;
    const irregularCapacity = DEFAULT_IRREGULAR_CAPACITY;
    const totalCapacity = DEFAULT_TOTAL_CAPACITY;

    const created = await Section.create({
      section: sectionName,
      year,
      semester,
      regular,
      irregular,
      regular_capacity: regularCapacity,
      irregular_capacity: irregularCapacity,
      total_capacity: totalCapacity,
      status: toStatus(regular, irregular, totalCapacity),
    });

    res.status(201).json(created);
  } catch (error) {
    console.error("Error in createSection controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateSectionById(req, res) {
  try {
    const payload = req.body || {};
    const update = {};

    if (payload.irregular != null) {
      update.irregular = Math.max(0, Number(payload.irregular) || 0);
    }

    if (payload.regular_capacity != null) {
      update.regular_capacity = Math.max(0, Number(payload.regular_capacity) || 0);
    }

    if (payload.irregular_capacity != null) {
      update.irregular_capacity = Math.max(0, Number(payload.irregular_capacity) || 0);
    }

    if (payload.total_capacity != null) {
      update.total_capacity = Math.max(0, Number(payload.total_capacity) || 0);
    }

    const current = await Section.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ message: "Section not found" });
    }

    const next = {
      regular: current.regular,
      irregular: update.irregular ?? current.irregular,
      regular_capacity: update.regular_capacity ?? current.regular_capacity,
      irregular_capacity: update.irregular_capacity ?? current.irregular_capacity,
      total_capacity:
        update.total_capacity ??
        ((update.regular_capacity ?? current.regular_capacity) +
          (update.irregular_capacity ?? current.irregular_capacity)),
    };

    update.status = toStatus(next.regular, next.irregular, next.total_capacity);

    const updated = await Section.findByIdAndUpdate(req.params.id, update, { new: true });
    res.status(200).json(updated);
  } catch (error) {
    console.error("Error in updateSectionById controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getSectionsMeta(req, res) {
  try {
    const irregularTotal = await Student.countDocuments({ status: "Irregular" });
    res.status(200).json({ irregularTotal });
  } catch (error) {
    console.error("Error in getSectionsMeta controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteSectionById(req, res) {
  try {
    const section = await Section.findById(req.params.id).lean();
    if (!section) {
      return res.status(404).json({ message: "Section not found" });
    }

    const enrolledExists = await Student.exists({
      year: String(section.year ?? "").trim(),
      section: String(section.section ?? "").trim(),
      semester: String(section.semester ?? "").trim(),
      status: "Enrolled",
    });

    if (enrolledExists) {
      return res.status(409).json({
        message: "Cannot delete section with enrolled students",
      });
    }

    await Section.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: "Section deleted successfully" });
  } catch (error) {
    console.error("Error in deleteSectionById controller", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
