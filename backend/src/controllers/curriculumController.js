import mongoose from "mongoose";

const flexibleSchema = new mongoose.Schema(
  { _id: String },
  { strict: false, versionKey: false }
);

function normalizeYearKey(year) {
  const raw = String(year || "").trim().toLowerCase();
  const map = {
    "1": "1st",
    "1st": "1st",
    first: "1st",
    "2": "2nd",
    "2nd": "2nd",
    second: "2nd",
    "3": "3rd",
    "3rd": "3rd",
    third: "3rd",
    "4": "4th",
    "4th": "4th",
    fourth: "4th",
  };
  return map[raw] || null;
}

function getCurriculumModel() {
  const preEnrollmentDb = mongoose.connection.useDb("pre-enrollment", { useCache: true });
  return preEnrollmentDb.models.Curriculum || preEnrollmentDb.model("Curriculum", flexibleSchema, "curriculum");
}

function buildSubjects(data) {
  if (Array.isArray(data?.subjects) && data.subjects.length > 0) {
    return data.subjects;
  }

  if (Array.isArray(data?.semesters)) {
    return data.semesters.flatMap((semester) =>
      Array.isArray(semester?.subjects) ? semester.subjects : []
    );
  }

  return [];
}

function normalizeCurriculumPayload(rawData) {
  if (!rawData || typeof rawData !== "object") {
    return null;
  }

  const { _id, _rev, __v, ...sanitizedData } = rawData;
  const subjects = buildSubjects(sanitizedData);

  if (!subjects.length) {
    return null;
  }

  return {
    ...sanitizedData,
    subjects,
  };
}

export async function getCurriculumByYear(req, res) {
  try {
    const normalizedYear = normalizeYearKey(req.params.year);

    if (!normalizedYear) {
      return res.status(400).json({ message: "Invalid year value" });
    }

    const Curriculum = getCurriculumModel();

    const curriculum = await Curriculum.findOne({ _id: `curriculum_${normalizedYear}_year` }).lean();

    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found for the specified year" });
    }

    res.status(200).json(curriculum);
  } catch (error) {
    console.error("Error in getCurriculumByYear controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function upsertCurriculum(req, res) {
  try {
    const { year, data } = req.body;
    const normalizedYear = normalizeYearKey(year);

    if (!normalizedYear || !data || typeof data !== "object") {
      return res.status(400).json({ message: "Year and data are required" });
    }

    const Curriculum = getCurriculumModel();
    const docId = `curriculum_${normalizedYear}_year`;

    const normalizedPayload = normalizeCurriculumPayload(data);

    if (!normalizedPayload) {
      return res.status(400).json({ message: "Curriculum must include at least one subject" });
    }

    const updatePayload = {
      _id: docId,
      year: normalizedYear,
      ...normalizedPayload,
    };

    await Curriculum.updateOne(
      { _id: docId },
      { $set: updatePayload },
      { upsert: true }
    );

    const result = await Curriculum.findById(docId).lean();

    res.status(200).json({
      message: "Curriculum saved successfully",
      replacedDocumentId: docId,
      data: result,
    });
  } catch (error) {
    console.error("Error in upsertCurriculum controller", error);
    if (error?.errInfo?.details) {
      console.error(
        "Validation details:",
        JSON.stringify(error.errInfo.details, null, 2)
      );
    }
    res.status(500).json({
      message: "Internal server error",
      details: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
}

export async function getCurriculumById(req, res) {
  try {
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      return res.status(400).json({ message: "Invalid curriculum id" });
    }

    const Curriculum = getCurriculumModel();
    const curriculum = await Curriculum.findById(id).lean();

    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    res.status(200).json(curriculum);
  } catch (error) {
    console.error("Error in getCurriculumById controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function upsertCurriculumById(req, res) {
  try {
    const id = String(req.params.id ?? "").trim();
    const data = req.body?.data;

    if (!id || !data || typeof data !== "object") {
      return res.status(400).json({ message: "Document id and data are required" });
    }

    const normalizedPayload = normalizeCurriculumPayload(data);
    if (!normalizedPayload) {
      return res.status(400).json({ message: "Curriculum must include at least one subject" });
    }

    const Curriculum = getCurriculumModel();
    const updatePayload = {
      _id: id,
      ...normalizedPayload,
    };

    await Curriculum.updateOne(
      { _id: id },
      { $set: updatePayload },
      { upsert: true }
    );

    const result = await Curriculum.findById(id).lean();

    res.status(200).json({
      message: "Curriculum saved successfully",
      replacedDocumentId: id,
      data: result,
    });
  } catch (error) {
    console.error("Error in upsertCurriculumById controller", error);
    if (error?.errInfo?.details) {
      console.error(
        "Validation details:",
        JSON.stringify(error.errInfo.details, null, 2)
      );
    }
    res.status(500).json({
      message: "Internal server error",
      details: process.env.NODE_ENV === "production" ? undefined : error.message,
    });
  }
}

export async function getAllCurricula(req, res) {
  try {
    const Curriculum = getCurriculumModel();
    const curricula = await Curriculum.find({}).lean();
    res.status(200).json(curricula);
  } catch (error) {
    console.error("Error in getAllCurricula controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
