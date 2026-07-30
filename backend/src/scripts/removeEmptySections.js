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

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing in environment variables');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const [sections, students] = await Promise.all([
      Section.find({}).lean(),
      Student.find({}, { year: 1, section: 1, semester: 1 }).lean(),
    ]);

    const studentCountBySection = new Map();
    for (const student of students) {
      const year = normalizeText(student.year);
      const section = normalizeText(student.section).toUpperCase();
      const semester = normalizeSemester(student.semester);
      if (!year || !section) continue;

      const key = `${year}::${section}::${semester}`;
      studentCountBySection.set(key, (studentCountBySection.get(key) || 0) + 1);
    }

    const emptySectionIds = sections
      .filter((section) => {
        const year = normalizeText(section.year);
        const sectionName = normalizeText(section.section).toUpperCase();
        const semester = normalizeSemester(section.semester);
        if (!year || !sectionName) return false;

        const key = `${year}::${sectionName}::${semester}`;
        return (studentCountBySection.get(key) || 0) === 0;
      })
      .map((section) => section._id);

    if (!emptySectionIds.length) {
      console.log('No empty sections found');
      process.exit(0);
    }

    const result = await Section.deleteMany({ _id: { $in: emptySectionIds } });
    console.log(`Removed ${result.deletedCount ?? 0} empty sections`);
    process.exit(0);
  } catch (error) {
    console.error('Remove empty sections failed', error);
    process.exit(1);
  }
}

main();