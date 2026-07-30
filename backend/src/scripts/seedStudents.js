import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import Student from '../models/Student.js';

// load env from backend folder file; run this script from the backend folder
dotenv.config({ path: path.resolve(process.cwd(), '-DESKTOP-2T3MSLV.env') });

const sampleStudents = [
  { student_number: '2023001', name: 'Alice Smith', year: 1, section: 'A', status: 'Enrolled' },
  { student_number: '2023002', name: 'Bob Jones', year: 2, section: 'B', status: 'Enrolled' },
  { student_number: '2023003', name: 'Carlos Ruiz', year: 3, section: 'C', status: 'Irregular' },
  { student_number: '2023004', name: 'Diana King', year: 4, section: 'D', status: 'Enrolled' },
  { student_number: '2023005', name: 'Eve Lin', year: 1, section: 'B', status: 'Enrolled' },
];

async function seed() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set. Ensure you run this from the backend folder where -DESKTOP-2T3MSLV.env exists.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // remove any sample students with same student_number to avoid duplicates
    const numbers = sampleStudents.map(s => s.student_number);
    await Student.deleteMany({ student_number: { $in: numbers } });

    const created = await Student.insertMany(sampleStudents);
    console.log('Inserted', created.length, 'sample students');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed', err);
    process.exit(1);
  }
}

seed();
