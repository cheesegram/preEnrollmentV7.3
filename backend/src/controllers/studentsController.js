import Student from "../models/Student.js";
import Section from "../models/Section.js";
import mongoose from "mongoose";

const flexibleSchema = new mongoose.Schema({}, { strict: false });

const DEFAULT_REGULAR_CAPACITY = 45;
const DEFAULT_IRREGULAR_CAPACITY = 5;
const DEFAULT_TOTAL_CAPACITY = 50;

function getPreAdmissionModel(modelName, collectionName) {
  const preAdmissionDb = mongoose.connection.useDb("pre-admission", { useCache: true });
  return preAdmissionDb.models[modelName] || preAdmissionDb.model(modelName, flexibleSchema, collectionName);
}

function getPreEnrollmentModel(modelName, collectionName) {
  const preEnrollmentDb = mongoose.connection.useDb("pre-enrollment", { useCache: true });
  return preEnrollmentDb.models[modelName] || preEnrollmentDb.model(modelName, flexibleSchema, collectionName);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeSectionName(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeSemester(value) {
  const semester = normalizeText(value);
  return semester || "N/A";
}

function normalizeStatus(value) {
  const status = normalizeText(value);
  if (!status) {
    return "Enrolled";
  }

  const lowered = status.toLowerCase();
  if (lowered === "regular") {
    return "Enrolled";
  }

  if (lowered === "irregular") {
    return "Irregular";
  }

  return status;
}

function toStatus(regular, irregular, totalCapacity) {
  const total = Number(regular || 0) + Number(irregular || 0);
  const capacity = Number(totalCapacity || 0);
  if (total < capacity) return "Available";
  if (total === capacity) return "Full";
  return "Overloaded";
}

function isIrregularStatus(status) {
  return normalizeText(status).toLowerCase() === "irregular";
}

function sectionNameToIndex(sectionName) {
  const normalized = normalizeSectionName(sectionName);
  if (!/^[A-Z]+$/.test(normalized)) {
    return Number.MAX_SAFE_INTEGER;
  }

  let index = 0;
  for (const character of normalized) {
    index = index * 26 + (character.charCodeAt(0) - 64);
  }

  return index;
}

function indexToSectionName(index) {
  let current = index;
  let name = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function getNextSectionName(usedNames) {
  let index = 1;
  while (index < 1000) {
    const candidate = indexToSectionName(index);
    if (!usedNames.has(candidate)) {
      return candidate;
    }
    index += 1;
  }

  throw new Error("Unable to allocate a new section name");
}

function createSectionState({ year, semester, section, sourceSection = null }) {
  const regularCapacity = Number(
    sourceSection?.regular_capacity ?? DEFAULT_REGULAR_CAPACITY
  );
  const irregularCapacity = Number(
    sourceSection?.irregular_capacity ?? DEFAULT_IRREGULAR_CAPACITY
  );
  const totalCapacity = Number(
    sourceSection?.total_capacity ?? (regularCapacity + irregularCapacity) ?? DEFAULT_TOTAL_CAPACITY
  );

  return {
    year: normalizeText(year),
    semester: normalizeSemester(semester),
    section: normalizeSectionName(section),
    createdAt: new Date().toISOString(),
    regular: 0,
    irregular: 0,
    regular_capacity: regularCapacity,
    irregular_capacity: irregularCapacity,
    total_capacity: totalCapacity,
  };
}

function sectionHasCapacityForStudent(section, student) {
  if (isIrregularStatus(student.status)) {
    return Number(section?.irregular ?? 0) < Number(section?.irregular_capacity ?? DEFAULT_IRREGULAR_CAPACITY);
  }

  return Number(section?.regular ?? 0) < Number(section?.regular_capacity ?? DEFAULT_REGULAR_CAPACITY);
}

function sortSectionsByAge(left, right) {
  const leftCreatedAt = new Date(left?.createdAt ?? 0).getTime();
  const rightCreatedAt = new Date(right?.createdAt ?? 0).getTime();

  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  const leftIndex = sectionNameToIndex(left?.section);
  const rightIndex = sectionNameToIndex(right?.section);

  if (leftIndex !== rightIndex) {
    return leftIndex - rightIndex;
  }

  return normalizeSectionName(left?.section).localeCompare(normalizeSectionName(right?.section), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function chooseSectionForStudent(sectionGroups, student) {
  const year = normalizeText(student.year);
  const semester = normalizeSemester(student.semester);
  const groupKey = `${year}::${semester}`;

  let groupSections = sectionGroups.get(groupKey);
  if (!groupSections) {
    groupSections = [];
    sectionGroups.set(groupKey, groupSections);
  }

  const orderedSections = [...groupSections].sort(sortSectionsByAge);
  const availableSection = orderedSections.find((section) => sectionHasCapacityForStudent(section, student));

  if (availableSection) {
    return availableSection;
  }

  const usedNames = new Set(groupSections.map((section) => normalizeSectionName(section.section)).filter(Boolean));
  const sourceSection = orderedSections[0] ?? null;
  const nextSection = createSectionState({
    year,
    semester,
    section: getNextSectionName(usedNames),
    sourceSection,
  });
  groupSections.push(nextSection);
  return nextSection;
}

export async function getAllStudents(req, res) {
  try {
    const { status, year, section, semester } = req.query;
    const query = {};

    // filter by enrollment status (the UI sends "All students" when nothing selected)
    if (status && status !== 'All students') {
      query.status = status;
    }

    // optional year filter (client passes year as string e.g. "1")
    if (year && year !== 'All') {
      const num = Number(year);
      if (!Number.isNaN(num)) {
        // accommodate documents where year might be stored as string or number
        query.$or = [{ year: num }, { year: year }];
      } else {
        query.year = year;
      }
    }

    if (section && section !== 'All') {
      query.section = section;
    }

    if (semester && semester !== 'All') {
      query.semester = semester;
    }

    console.log('getAllStudents query', query);

    const students = await Student.find(query).sort({ createdAt: -1 }); // newest first
    console.log('returned', students.length, 'students');
    res.status(200).json(students);
  } catch (error) {
    console.error("Error in getAllStudents controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getPendingApplicants(req, res) {
  try {
    const Applicant = getPreAdmissionModel("Applicant", "applicants");
    const Validation = getPreAdmissionModel("Validation", "validation");

    const [applicants, validations] = await Promise.all([
      Applicant.find(
        { applicant_number: { $exists: true, $ne: null } },
        { _id: 0, applicant_number: 1, first_name: 1, last_name: 1 }
      ).lean(),
      Validation.find(
        { applicant_number: { $exists: true, $ne: null } },
        { _id: 0, applicant_number: 1, status: 1 }
      ).lean(),
    ]);

    const statusByApplicantNumber = new Map(
      validations.map((item) => [String(item.applicant_number), item.status])
    );

    const pendingApplicants = applicants
      .map((applicant) => {
        const applicantNumber = String(applicant.applicant_number);
        const firstName = String(applicant.first_name ?? "").trim();
        const lastName = String(applicant.last_name ?? "").trim();
        const status = statusByApplicantNumber.get(applicantNumber) ?? "Pending";

        return {
          applicant_number: applicantNumber,
          applicant_name: `${firstName} ${lastName}`.trim(),
          status,
        };
      })
      .filter((item) => {
        const normalizedStatus = String(item.status ?? "").toLowerCase();
        return !normalizedStatus || normalizedStatus.includes("pending");
      });

    res.status(200).json(pendingApplicants);
  } catch (error) {
    console.error("Error in getPendingApplicants controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getToBeAdmittedApplicants(req, res) {
  try {
    const ToBeAdmitted = getPreEnrollmentModel("ToBeAdmitted", "to_be_admitted");

    // Only fetch applicants that have year, section, and semester values
    const applicants = await ToBeAdmitted.find(
      {
        $and: [
          { year: { $exists: true, $ne: null, $ne: "" } },
          { section: { $exists: true, $ne: null, $ne: "" } },
          { semester: { $exists: true, $ne: null, $ne: "" } },
        ],
      },
      {
        _id: 0,
        applicantID: 1,
        applicant_id: 1,
        applicant_number: 1,
        first_name: 1,
        last_name: 1,
        status: 1,
        year: 1,
        section: 1,
        semester: 1,
      }
    ).lean();

    const formattedApplicants = applicants.map((applicant) => {
      const applicantID = String(
        applicant.applicantID ?? applicant.applicant_id ?? applicant.applicant_number ?? ""
      ).trim();
      const firstName = String(applicant.first_name ?? "").trim();
      const lastName = String(applicant.last_name ?? "").trim();

      return {
        applicantID,
        applicant_name: `${firstName} ${lastName}`.trim(),
        status: String(applicant.status ?? "Pending").trim() || "Pending",
        year: String(applicant.year ?? "").trim(),
        section: String(applicant.section ?? "").trim(),
        semester: String(applicant.semester ?? "").trim(),
      };
    }).filter((applicant) => applicant.applicantID || applicant.applicant_name || applicant.status);

    res.status(200).json(formattedApplicants);
  } catch (error) {
    console.error("Error in getToBeAdmittedApplicants controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getAdmittedApplicants(req, res) {
  try {
    const AdmittedApplicants = getPreAdmissionModel("AdmittedApplicant", "admitted-applicants");

    // Only fetch applicants that have year, section, and semester values
    const applicants = await AdmittedApplicants.find(
      {
        $and: [
          {
            $or: [
              { year: { $exists: true, $ne: null, $ne: "" } },
              { curriculum_year: { $exists: true, $ne: null, $ne: "" } },
              { year_level: { $exists: true, $ne: null, $ne: "" } },
            ],
          },
          {
            $or: [
              { section: { $exists: true, $ne: null, $ne: "" } },
              { curriculum_section: { $exists: true, $ne: null, $ne: "" } },
              { section_name: { $exists: true, $ne: null, $ne: "" } },
            ],
          },
          {
            $or: [
              { semester: { $exists: true, $ne: null, $ne: "" } },
              { curriculum_semester: { $exists: true, $ne: null, $ne: "" } },
              { term: { $exists: true, $ne: null, $ne: "" } },
            ],
          },
        ],
      }
    ).lean();

    const formattedApplicants = applicants.map((applicant) => {
      // Try multiple possible field name variations
      const applicantID = String(
        applicant.applicantID ??
        applicant.applicant_id ??
        applicant.applicant_number ??
        applicant.applicantId ??
        applicant.id ??
        applicant._id ??
        ""
      ).trim();

      const firstName = String(
        applicant.first_name ??
        applicant.firstName ??
        applicant.firstname ??
        applicant.given_name ??
        applicant.givenName ??
        ""
      ).trim();

      const lastName = String(
        applicant.last_name ??
        applicant.lastName ??
        applicant.lastname ??
        applicant.family_name ??
        applicant.familyName ??
        applicant.surname ??
        ""
      ).trim();

      const status = String(
        applicant.status ??
        applicant.enrollment_status ??
        applicant.enrollmentStatus ??
        "Pending"
      ).trim() || "Pending";

      // Extract year, semester, section for grouping
      const year = String(
        applicant.year ??
        applicant.curriculum_year ??
        applicant.year_level ??
        ""
      ).trim();

      const semester = String(
        applicant.semester ??
        applicant.curriculum_semester ??
        applicant.term ??
        ""
      ).trim();

      const section = String(
        applicant.section ??
        applicant.curriculum_section ??
        applicant.section_name ??
        ""
      ).trim();

      return {
        applicantID,
        applicant_name: `${firstName} ${lastName}`.trim(),
        status,
        year: year || "N/A",
        semester: semester || "N/A",
        section: section || "N/A",
      };
    }).filter((applicant) => {
      // Only include applicants that have all three attributes after extraction
      if (!applicant.applicantID && !applicant.applicant_name && !applicant.status) return false;
      if (applicant.year === "N/A" || applicant.semester === "N/A" || applicant.section === "N/A") return false;
      return true;
    });

    res.status(200).json(formattedApplicants);
  } catch (error) {
    console.error("Error in getAdmittedApplicants controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getStudentSections(req, res) {
  try {
    const sections = await Student.distinct("section", {
      section: { $exists: true, $ne: null },
    });

    const normalizedSections = sections
      .map(section => section?.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));

    res.status(200).json(normalizedSections);
  } catch (error) {
    console.error("Error in getStudentSections controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getStudentById(req, res) {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: "Student not found!" });
    res.json(student);
  } catch (error) {
    console.error("Error in getStudentById controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function getStudentBySection(req, res) {
  try {
    const student = await Student.findBySection(req.params.section);
    if (!student) return res.status(404).json({ message: "Student not found!" });
    res.json(student);
  } catch (error) {
    console.error("Error in getStudentBySection controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function createStudent(req, res) {
  try {
    const {
      student_number,
      first_name,
      last_name,
      name,
      section,
      semester,
      status,
      year,
      title,
      content,
    } = req.body;

    const student = new Student({
      student_number,
      first_name,
      last_name,
      name,
      section,
      semester,
      status,
      year,
      title,
      content,
    });

    const savedStudent = await student.save();
    res.status(201).json(savedStudent);
  } catch (error) {
    console.error("Error in createStudent controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function updateStudent(req, res) {
  try {
    const {
      student_number,
      first_name,
      last_name,
      name,
      section,
      semester,
      status,
      year,
      title,
      content,
    } = req.body;

    const updatedStudent = await Student.findByIdAndUpdate(
      req.params.id,
      {
        student_number,
        first_name,
        last_name,
        name,
        section,
        semester,
        status,
        year,
        title,
        content,
      },
      {
        new: true,
      }
    );

    if (!updatedStudent) return res.status(404).json({ message: "Student not found" });

    res.status(200).json(updatedStudent);
  } catch (error) {
    console.error("Error in updateStudent controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function enrollFromToBeAdmitted(req, res) {
  try {
    const { applicantID } = req.body;

    if (!applicantID) {
      return res.status(400).json({ message: "applicantID is required" });
    }

    // Build a flexible search query trying multiple field name/number formats
    const searchConditions = [
      { applicantID },
      { applicant_id: applicantID },
      { applicant_number: applicantID },
      { applicant_number: Number(applicantID) },
      { applicantId: applicantID },
      { applicantId: Number(applicantID) },
    ];

    // Try to match by _id as both string and ObjectId
    if (mongoose.Types.ObjectId.isValid(applicantID)) {
      searchConditions.push({ _id: new mongoose.Types.ObjectId(applicantID) });
    }

    // First, find the applicant without deleting — to check for duplicate student_number
    const AdmittedApplicants = getPreAdmissionModel("AdmittedApplicant", "admitted-applicants");

    let applicant = await AdmittedApplicants.findOne({
      $or: searchConditions,
    }).lean();

    let sourceDb = "admitted-applicants";

    if (!applicant) {
      // Fall back to to_be_admitted in pre-enrollment DB
      const ToBeAdmitted = getPreEnrollmentModel("ToBeAdmitted", "to_be_admitted");
      applicant = await ToBeAdmitted.findOne({
        $or: [
          { applicantID },
          { applicant_id: applicantID },
          { applicant_number: applicantID },
          { applicant_number: Number(applicantID) },
        ],
      }).lean();
      sourceDb = "to_be_admitted";

      if (!applicant) {
        return res.status(404).json({ message: "Applicant not found in database" });
      }
    }

    // Copy all attributes from the applicant, omitting _id and __v
    const { _id, __v, ...applicantData } = applicant;

    // Generate student_number by stripping "A-" from applicant_id
    const rawId = String(
      applicantData.applicantID ??
      applicantData.applicant_id ??
      applicantData.applicant_number ??
      applicantData.applicantId ??
      ""
    ).trim();
    const studentNumber = rawId.replace(/^A-?/i, "");

    // Check if student_number already exists in the database BEFORE deleting the applicant
    const existingStudent = await Student.findOne({ student_number: studentNumber }).lean();
    if (existingStudent) {
      return res.status(409).json({
        message: "Enrollment blocked: Student number already exists",
        blockReason: "student_exists",
        student_number: studentNumber,
      });
    }

    // Duplicate check passed — now delete the applicant from whichever source it came from
    if (sourceDb === "admitted-applicants") {
      await AdmittedApplicants.findOneAndDelete({
        $or: searchConditions,
      }).lean();
    } else {
      const ToBeAdmitted = getPreEnrollmentModel("ToBeAdmitted", "to_be_admitted");
      await ToBeAdmitted.findOneAndDelete({
        $or: [
          { applicantID },
          { applicant_id: applicantID },
          { applicant_number: applicantID },
          { applicant_number: Number(applicantID) },
        ],
      }).lean();
    }

    // Get existing sections for auto-sectioning
    const existingSections = await Section.find({}).lean();
    const sectionGroups = new Map();
    for (const section of existingSections) {
      const year = normalizeText(section.year);
      const semester = normalizeSemester(section.semester);
      const sectionName = normalizeSectionName(section.section);
      if (!year || !sectionName) {
        continue;
      }

      const key = `${year}::${semester}`;
      const group = sectionGroups.get(key) || [];
      group.push({
        year,
        semester,
        section: sectionName,
        regular: Number(section.regular ?? 0),
        irregular: Number(section.irregular ?? 0),
        regular_capacity: Number(section.regular_capacity ?? DEFAULT_REGULAR_CAPACITY),
        irregular_capacity: Number(section.irregular_capacity ?? DEFAULT_IRREGULAR_CAPACITY),
        total_capacity: Number(section.total_capacity ?? (DEFAULT_REGULAR_CAPACITY + DEFAULT_IRREGULAR_CAPACITY)),
      });
      sectionGroups.set(key, group);
    }

    // Create a temporary student object for section selection
    const tempStudent = {
      ...applicantData,
      year: 1,
      semester: "1st",
      status: "Block",
    };

    // Choose section using auto-sectioning logic
    const chosenSection = chooseSectionForStudent(sectionGroups, tempStudent);

    // Build the student object with all applicant attributes
    const now = new Date();
    const student = {
      ...applicantData,
      student_number: studentNumber,
      status: "Block",
      year: 1,
      semester: "1st",
      section: chosenSection.section,
      createdAt: now,
      updatedAt: now,
    };

    // Remove any applicant-specific fields that shouldn't be on the student
    delete student.applicantID;
    delete student.applicant_id;
    delete student.applicantId;
    delete student.applicant_number;

    // Insert the student
    await Student.create(student);

    // Update section counts
    if (isIrregularStatus(student.status)) {
      chosenSection.irregular = Number(chosenSection.irregular ?? 0) + 1;
    } else {
      chosenSection.regular = Number(chosenSection.regular ?? 0) + 1;
    }
    chosenSection.status = toStatus(chosenSection.regular, chosenSection.irregular, chosenSection.regular_capacity);

    // Update or create the section
    const sectionOps = {
      updateOne: {
        filter: {
          year: chosenSection.year,
          section: chosenSection.section,
          semester: chosenSection.semester,
        },
        update: {
          $set: {
            year: chosenSection.year,
            section: chosenSection.section,
            semester: chosenSection.semester,
            regular: chosenSection.regular,
            irregular: chosenSection.irregular,
            regular_capacity: chosenSection.regular_capacity,
            irregular_capacity: chosenSection.irregular_capacity,
            total_capacity: chosenSection.total_capacity,
            status: chosenSection.status,
          },
        },
        upsert: true,
      },
    };
    await Section.bulkWrite([sectionOps], { ordered: false });

    res.status(200).json({
      message: "Student enrolled successfully",
      student,
    });
  } catch (error) {
    console.error("Error in enrollFromToBeAdmitted controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * Helper: find an applicant by ID from admitted-applicants (fallback to to_be_admitted).
 * Returns { applicant, applicantData, studentNumber, sourceDb } or null if not found.
 */
async function findApplicantForEnrollment(applicantID) {
  const searchConditions = [
    { applicantID },
    { applicant_id: applicantID },
    { applicant_number: applicantID },
    { applicant_number: Number(applicantID) },
    { applicantId: applicantID },
    { applicantId: Number(applicantID) },
  ];

  if (mongoose.Types.ObjectId.isValid(applicantID)) {
    searchConditions.push({ _id: new mongoose.Types.ObjectId(applicantID) });
  }

  const AdmittedApplicants = getPreAdmissionModel("AdmittedApplicant", "admitted-applicants");
  let applicant = await AdmittedApplicants.findOne({ $or: searchConditions }).lean();
  let sourceDb = "admitted-applicants";

  if (!applicant) {
    const ToBeAdmitted = getPreEnrollmentModel("ToBeAdmitted", "to_be_admitted");
    applicant = await ToBeAdmitted.findOne({
      $or: [
        { applicantID },
        { applicant_id: applicantID },
        { applicant_number: applicantID },
        { applicant_number: Number(applicantID) },
      ],
    }).lean();
    sourceDb = "to_be_admitted";
  }

  if (!applicant) return null;

  const { _id, __v, ...applicantData } = applicant;
  const rawId = String(
    applicantData.applicantID ??
    applicantData.applicant_id ??
    applicantData.applicant_number ??
    applicantData.applicantId ??
    ""
  ).trim();
  const studentNumber = rawId.replace(/^A-?/i, "");

  return { applicant, applicantData, studentNumber, sourceDb };
}

/**
 * Build section groups map from existing section records.
 */
async function buildSectionGroups() {
  const existingSections = await Section.find({}).lean();
  const sectionGroups = new Map();
  for (const section of existingSections) {
    const year = normalizeText(section.year);
    const semester = normalizeSemester(section.semester);
    const sectionName = normalizeSectionName(section.section);
    if (!year || !sectionName) continue;

    const key = `${year}::${semester}`;
    const group = sectionGroups.get(key) || [];
    group.push({
      year,
      semester,
      section: sectionName,
      regular: Number(section.regular ?? 0),
      irregular: Number(section.irregular ?? 0),
      regular_capacity: Number(section.regular_capacity ?? DEFAULT_REGULAR_CAPACITY),
      irregular_capacity: Number(section.irregular_capacity ?? DEFAULT_IRREGULAR_CAPACITY),
      total_capacity: Number(section.total_capacity ?? (DEFAULT_REGULAR_CAPACITY + DEFAULT_IRREGULAR_CAPACITY)),
    });
    sectionGroups.set(key, group);
  }
  return sectionGroups;
}

export async function batchEnrollPreview(req, res) {
  try {
    const { applicantIDs } = req.body;

    if (!Array.isArray(applicantIDs) || applicantIDs.length === 0) {
      return res.status(400).json({ message: "applicantIDs array is required" });
    }

    // Build section groups (simulating current state)
    const sectionGroups = await buildSectionGroups();

    const preview = { placements: [], blocked: [], notFound: [] };

    for (const applicantID of applicantIDs) {
      const found = await findApplicantForEnrollment(applicantID);
      if (!found) {
        preview.notFound.push({ applicantID });
        continue;
      }

      const { applicantData, studentNumber } = found;

      // Check for duplicate student_number
      const existingStudent = await Student.findOne({ student_number: studentNumber }).lean();
      if (existingStudent) {
        preview.blocked.push({
          applicantID,
          applicant_name: `${String(applicantData.first_name ?? "").trim()} ${String(applicantData.last_name ?? "").trim()}`.trim() || "Unknown",
          student_number: studentNumber,
          reason: "student_exists",
        });
        continue;
      }

      // Determine section via auto-sectioning (simulate only — no deletion yet)
      const tempStudent = {
        ...applicantData,
        year: 1,
        semester: "1st",
        status: "Block",
      };
      const chosenSection = chooseSectionForStudent(sectionGroups, tempStudent);

      // Track the simulated count
      if (isIrregularStatus(tempStudent.status)) {
        chosenSection.irregular = Number(chosenSection.irregular ?? 0) + 1;
      } else {
        chosenSection.regular = Number(chosenSection.regular ?? 0) + 1;
      }

      preview.placements.push({
        applicantID,
        applicant_name: `${String(applicantData.first_name ?? "").trim()} ${String(applicantData.last_name ?? "").trim()}`.trim() || "Unknown",
        student_number: studentNumber,
        assigned_section: chosenSection.section,
        assigned_year: "1",
        assigned_semester: "1st",
      });
    }

    res.status(200).json(preview);
  } catch (error) {
    console.error("Error in batchEnrollPreview controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function batchEnrollFromToBeAdmitted(req, res) {
  try {
    const { applicantIDs } = req.body;

    if (!Array.isArray(applicantIDs) || applicantIDs.length === 0) {
      return res.status(400).json({ message: "applicantIDs array is required" });
    }

    // Build section groups from current state
    const sectionGroups = await buildSectionGroups();

    const results = { enrolled: [], blocked: [], notFound: [] };

    for (const applicantID of applicantIDs) {
      try {
        const found = await findApplicantForEnrollment(applicantID);
        if (!found) {
          results.notFound.push({ applicantID });
          continue;
        }

        const { applicantData, studentNumber, sourceDb } = found;

        // Check for duplicate student_number
        const existingStudent = await Student.findOne({ student_number: studentNumber }).lean();
        if (existingStudent) {
          results.blocked.push({
            applicantID,
            applicant_name: `${String(applicantData.first_name ?? "").trim()} ${String(applicantData.last_name ?? "").trim()}`.trim() || "Unknown",
            student_number: studentNumber,
            reason: "student_exists",
          });
          continue;
        }

        // Determine section via auto-sectioning (before deletion)
        const tempStudent = {
          ...applicantData,
          year: 1,
          semester: "1st",
          status: "Block",
        };
        const chosenSection = chooseSectionForStudent(sectionGroups, tempStudent);

        // Delete from source
        const searchConditions = [
          { applicantID },
          { applicant_id: applicantID },
          { applicant_number: applicantID },
          { applicant_number: Number(applicantID) },
          { applicantId: applicantID },
          { applicantId: Number(applicantID) },
        ];

        if (mongoose.Types.ObjectId.isValid(applicantID)) {
          searchConditions.push({ _id: new mongoose.Types.ObjectId(applicantID) });
        }

        let deleted = null;
        if (sourceDb === "admitted-applicants") {
          const AdmittedApplicants = getPreAdmissionModel("AdmittedApplicant", "admitted-applicants");
          deleted = await AdmittedApplicants.findOneAndDelete({ $or: searchConditions }).lean();
        } else {
          const ToBeAdmitted = getPreEnrollmentModel("ToBeAdmitted", "to_be_admitted");
          deleted = await ToBeAdmitted.findOneAndDelete({
            $or: [
              { applicantID },
              { applicant_id: applicantID },
              { applicant_number: applicantID },
              { applicant_number: Number(applicantID) },
            ],
          }).lean();
        }

        if (!deleted) {
          results.notFound.push({ applicantID });
          continue;
        }

        // Build and create the student with auto-assigned section
        const now = new Date();
        const student = {
          ...applicantData,
          student_number: studentNumber,
          status: "Block",
          year: 1,
          semester: "1st",
          section: chosenSection.section,
          createdAt: now,
          updatedAt: now,
        };

        delete student.applicantID;
        delete student.applicant_id;
        delete student.applicantId;
        delete student.applicant_number;

        await Student.create(student);

        // Update section counts
        if (isIrregularStatus(student.status)) {
          chosenSection.irregular = Number(chosenSection.irregular ?? 0) + 1;
        } else {
          chosenSection.regular = Number(chosenSection.regular ?? 0) + 1;
        }
        chosenSection.status = toStatus(chosenSection.regular, chosenSection.irregular, chosenSection.regular_capacity);

        // Upsert the section
        const sectionOps = {
          updateOne: {
            filter: {
              year: chosenSection.year,
              section: chosenSection.section,
              semester: chosenSection.semester,
            },
            update: {
              $set: {
                year: chosenSection.year,
                section: chosenSection.section,
                semester: chosenSection.semester,
                regular: chosenSection.regular,
                irregular: chosenSection.irregular,
                regular_capacity: chosenSection.regular_capacity,
                irregular_capacity: chosenSection.irregular_capacity,
                total_capacity: chosenSection.total_capacity,
                status: chosenSection.status,
              },
            },
            upsert: true,
          },
        };
        await Section.bulkWrite([sectionOps], { ordered: false });

        results.enrolled.push({
          applicantID,
          applicant_name: `${String(applicantData.first_name ?? "").trim()} ${String(applicantData.last_name ?? "").trim()}`.trim() || "Unknown",
          student_number: studentNumber,
          assigned_section: chosenSection.section,
        });
      } catch (err) {
        console.error(`[BatchEnroll] Error enrolling applicant ${applicantID}:`, err);
        results.blocked.push({
          applicantID,
          applicant_name: "Unknown",
          reason: "internal_error",
        });
      }
    }

    res.status(200).json({
      message: `Batch enrollment completed: ${results.enrolled.length} enrolled, ${results.blocked.length} blocked, ${results.notFound.length} not found`,
      ...results,
    });
  } catch (error) {
    console.error("Error in batchEnrollFromToBeAdmitted controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

export async function deleteStudent(req, res) {
  try {
    const deletedStudent = await Student.findByIdAndDelete(req.params.id);
    if (!deletedStudent) return res.status(404).json({ message: "Student not found" });
    res.status(200).json({ message: "Student deleted successfully!" });
  } catch (error) {
    console.error("Error in deleteStudent controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}

function normalizeImportedStudent(raw = {}) {
  const firstName = String(raw.first_name ?? raw.firstName ?? "").trim();
  const lastName = String(raw.last_name ?? raw.lastName ?? "").trim();
  const name = String(raw.name ?? `${firstName} ${lastName}`.trim()).trim();

  return {
    student_number: String(raw.student_number ?? raw.studentNumber ?? "").trim(),
    first_name: firstName,
    last_name: lastName,
    name,
    year: raw.year != null && raw.year !== "" ? String(raw.year).trim() : "",
    semester: normalizeSemester(raw.semester),
    status: normalizeStatus(raw.status),
  };
}

export async function importStudents(req, res) {
  try {
    const rows = Array.isArray(req.body?.students) ? req.body.students : [];
    const importType = String(req.body?.importType ?? "student").toLowerCase(); // "student" or "section"
    
    console.log(`[Import] Starting ${importType} import with ${rows.length} rows`);
    
    if (!rows.length) {
      return res.status(400).json({ message: "students array is required" });
    }

    const normalized = rows
      .map(normalizeImportedStudent)
      .filter((student) => student.student_number);

    if (!normalized.length) {
      return res.status(400).json({ message: "No valid student rows found" });
    }

    console.log(`[Import] Normalized to ${normalized.length} valid students`);
    console.log(`[Import] Student numbers to check:`, normalized.map((s) => s.student_number));

    const existingSections = await Section.find({}).lean();
    const sectionGroups = new Map();
    for (const section of existingSections) {
      const year = normalizeText(section.year);
      const semester = normalizeSemester(section.semester);
      const sectionName = normalizeSectionName(section.section);
      if (!year || !sectionName) {
        continue;
      }

      const key = `${year}::${semester}`;
      const group = sectionGroups.get(key) || [];
      group.push({
        year,
        semester,
        section: sectionName,
        regular: Number(section.regular ?? 0),
        irregular: Number(section.irregular ?? 0),
        regular_capacity: Number(section.regular_capacity ?? DEFAULT_REGULAR_CAPACITY),
        irregular_capacity: Number(section.irregular_capacity ?? DEFAULT_IRREGULAR_CAPACITY),
        total_capacity: Number(section.total_capacity ?? (DEFAULT_REGULAR_CAPACITY + DEFAULT_IRREGULAR_CAPACITY)),
      });
      sectionGroups.set(key, group);
    }

    // Get all existing students with these student numbers
    const existingStudents = await Student.find(
      { student_number: { $in: normalized.map((s) => String(s.student_number).trim()) } },
      { student_number: 1, first_name: 1, last_name: 1 }
    ).lean();

    console.log(`[Import] Found ${existingStudents.length} existing students in database`);
    console.log(`[Import] Existing student numbers:`, existingStudents.map((s) => s.student_number));

    // Create a set with normalized (string) student numbers for comparison
    const existingStudentNumbers = new Set(
      existingStudents.map((s) => String(s.student_number).trim())
    );

    // For "student" import type: block entire import if any student exists
    if (importType === "student") {
      const duplicates = normalized.filter((s) => 
        existingStudentNumbers.has(String(s.student_number).trim())
      );
      
      console.log(`[Import] Student import - found ${duplicates.length} duplicates`);
      
      if (duplicates.length > 0) {
        console.log(`[Import] Blocking student import due to duplicates`);
        return res.status(409).json({
          message: "Import Blocked: Student Number Already Exist",
          blockReason: "student_exists",
          duplicates: duplicates.map((s) => ({
            student_number: s.student_number,
            first_name: s.first_name,
            last_name: s.last_name,
          })),
        });
      }
    }

    const missingYearStudent = normalized.find((student) => !normalizeText(student.year));
    if (missingYearStudent) {
      return res.status(400).json({
        message: `Student ${missingYearStudent.student_number} is missing a year value`,
      });
    }

    const toImport = normalized
      .filter((s) => !existingStudentNumbers.has(String(s.student_number).trim()))
      .map((student) => {
        const chosenSection = chooseSectionForStudent(sectionGroups, student);
        if (isIrregularStatus(student.status)) {
          chosenSection.irregular = Number(chosenSection.irregular ?? 0) + 1;
        } else {
          chosenSection.regular = Number(chosenSection.regular ?? 0) + 1;
        }

        chosenSection.status = toStatus(chosenSection.regular, chosenSection.irregular, chosenSection.regular_capacity);

        return {
          ...student,
          section: chosenSection.section,
        };
      });

    const blocked = normalized.filter((s) =>
      existingStudentNumbers.has(String(s.student_number).trim())
    );

    console.log(`[Import] Section import - ${toImport.length} to import, ${blocked.length} blocked`);

    if (importType === "section" && blocked.length > 0 && toImport.length === 0) {
      console.log(`[Import] Blocking section import - all students exist`);
      return res.status(409).json({
        message: "Import Blocked: All students in this section already exist",
        blockReason: "all_students_exist",
        blocked: blocked.map((s) => ({
          student_number: s.student_number,
          first_name: s.first_name,
          last_name: s.last_name,
        })),
      });
    }

    const operations = toImport.map((student) => ({
      updateOne: {
        filter: { student_number: student.student_number },
        update: { $set: student },
        upsert: true,
      },
    }));

    let result = { upsertedCount: 0, modifiedCount: 0, matchedCount: 0 };
    if (operations.length > 0) {
      result = await Student.bulkWrite(operations, { ordered: false });
      console.log(`[Import] Bulk write result - upserted: ${result.upsertedCount}, modified: ${result.modifiedCount}`);
    }

    if (toImport.length > 0) {
      const sectionOps = [];
      for (const sections of sectionGroups.values()) {
        for (const section of sections) {
          sectionOps.push({
            updateOne: {
              filter: {
                year: section.year,
                section: section.section,
                semester: section.semester,
              },
              update: {
                $set: {
                  year: section.year,
                  section: section.section,
                  semester: section.semester,
                  regular: section.regular,
                  irregular: section.irregular,
                  regular_capacity: section.regular_capacity,
                  irregular_capacity: section.irregular_capacity,
                  total_capacity: section.total_capacity,
                  status: toStatus(section.regular, section.irregular, section.regular_capacity),
                },
              },
              upsert: true,
            },
          });
        }
      }

      if (sectionOps.length > 0) {
        await Section.bulkWrite(sectionOps, { ordered: false });
      }
    }

    res.status(200).json({
      message: "Students imported successfully",
      received: rows.length,
      imported: toImport.length,
      blocked: blocked.map((s) => ({
        student_number: s.student_number,
        first_name: s.first_name,
        last_name: s.last_name,
      })),
      upserted: result.upsertedCount ?? 0,
      modified: result.modifiedCount ?? 0,
      matched: result.matchedCount ?? 0,
    });
  } catch (error) {
    console.error("Error in importStudents controller", error);
    res.status(500).json({ message: "Internal server error" });
  }
}