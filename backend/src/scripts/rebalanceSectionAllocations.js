import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'node:dns/promises';
import Student from '../models/Student.js';
import Section from '../models/Section.js';

dotenv.config();
dns.setServers(['1.1.1.1', '1.0.0.1']);

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeSemester(value) {
  const semester = normalizeText(value);
  return semester || 'N/A';
}

function normalizeStatus(value) {
  return normalizeText(value).toLowerCase();
}

function sectionSort(left, right) {
  const leftCreatedAt = new Date(left?.createdAt ?? 0).getTime();
  const rightCreatedAt = new Date(right?.createdAt ?? 0).getTime();

  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return normalizeText(left?.section).localeCompare(normalizeText(right?.section), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function studentSort(left, right) {
  const leftCreatedAt = new Date(left?.createdAt ?? 0).getTime();
  const rightCreatedAt = new Date(right?.createdAt ?? 0).getTime();

  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return String(left?.student_number ?? '').localeCompare(String(right?.student_number ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function toStatus(regular, regularCapacity) {
  const regularCount = Number(regular || 0);
  const capacity = Number(regularCapacity || 0);
  if (regularCount < capacity) return 'Available';
  if (regularCount === capacity) return 'Full';
  return 'Overloaded';
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing in environment variables');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const sections = await Section.find({}).lean();
    const students = await Student.find({}).lean();

    const sectionsByGroup = new Map();
    for (const section of sections) {
      const year = normalizeText(section.year);
      const semester = normalizeSemester(section.semester);
      const sectionName = normalizeText(section.section).toUpperCase();
      if (!year || !sectionName) continue;

      const key = `${year}::${semester}`;
      const group = sectionsByGroup.get(key) || [];
      group.push(section);
      sectionsByGroup.set(key, group);
    }

    const studentsByGroup = new Map();
    for (const student of students) {
      const year = normalizeText(student.year);
      const semester = normalizeSemester(student.semester);
      const sectionName = normalizeText(student.section).toUpperCase();
      if (!year || !sectionName) continue;

      const key = `${year}::${semester}`;
      const group = studentsByGroup.get(key) || [];
      group.push(student);
      studentsByGroup.set(key, group);
    }

    const studentOps = [];
    const sectionOps = [];

    for (const [groupKey, groupSections] of sectionsByGroup.entries()) {
      const orderedSections = [...groupSections].sort(sectionSort);
      if (!orderedSections.length) continue;

      const groupStudents = (studentsByGroup.get(groupKey) || []).sort(studentSort);
      const regularStudents = groupStudents.filter((student) => {
        const status = normalizeStatus(student.status);
        return status === 'enrolled' || status === 'regular';
      });
      const irregularStudents = groupStudents.filter((student) => normalizeStatus(student.status) === 'irregular');

      const assignedBySection = new Map(
        orderedSections.map((section) => [String(section.section).toUpperCase(), { regular: [], irregular: [] }])
      );

      const assignBucket = (bucketStudents, bucketKey) => {
        let sectionIndex = 0;
        for (const student of bucketStudents) {
          while (sectionIndex < orderedSections.length) {
            const section = orderedSections[sectionIndex];
            const sectionName = String(section.section).toUpperCase();
            const capacityKey = bucketKey === 'regular' ? 'regular_capacity' : 'irregular_capacity';
            const currentCount = assignedBySection.get(sectionName)[bucketKey].length;
            const capacity = Number(section[capacityKey] ?? 0);

            if (currentCount < capacity) {
              assignedBySection.get(sectionName)[bucketKey].push(student);
              break;
            }

            sectionIndex += 1;
          }

          if (sectionIndex >= orderedSections.length) {
            const fallbackSection = orderedSections[orderedSections.length - 1];
            const fallbackName = String(fallbackSection.section).toUpperCase();
            assignedBySection.get(fallbackName)[bucketKey].push(student);
          }
        }
      };

      assignBucket(regularStudents, 'regular');
      assignBucket(irregularStudents, 'irregular');

      for (const section of orderedSections) {
        const sectionName = String(section.section).toUpperCase();
        const assigned = assignedBySection.get(sectionName) || { regular: [], irregular: [] };
        const regularCapacity = Number(section.regular_capacity ?? 45);
        const irregularCapacity = Number(section.irregular_capacity ?? 5);

        sectionOps.push({
          updateOne: {
            filter: { _id: section._id },
            update: {
              $set: {
                regular: assigned.regular.length,
                irregular: assigned.irregular.length,
                regular_capacity: regularCapacity,
                irregular_capacity: irregularCapacity,
                total_capacity: Number(section.total_capacity ?? (regularCapacity + irregularCapacity)),
                status: toStatus(assigned.regular.length, regularCapacity),
              },
            },
          },
        });

        for (const student of assigned.regular) {
          if (normalizeText(student.section).toUpperCase() !== sectionName) {
            studentOps.push({
              updateOne: {
                filter: { _id: student._id },
                update: { $set: { section: section.section } },
              },
            });
          }
        }

        for (const student of assigned.irregular) {
          if (normalizeText(student.section).toUpperCase() !== sectionName) {
            studentOps.push({
              updateOne: {
                filter: { _id: student._id },
                update: { $set: { section: section.section } },
              },
            });
          }
        }
      }
    }

    if (studentOps.length) {
      await Student.bulkWrite(studentOps, { ordered: false });
    }

    if (sectionOps.length) {
      await Section.bulkWrite(sectionOps, { ordered: false });
    }

    console.log(`Rebalanced ${studentOps.length} student updates across ${sectionOps.length} section updates`);
    process.exit(0);
  } catch (error) {
    console.error('Rebalance section allocations failed', error);
    process.exit(1);
  }
}

main();