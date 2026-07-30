import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import Student from '../models/Student.js';

// load env from backend folder file; run this script from the backend folder
dotenv.config({ path: path.resolve(process.cwd(), '-DESKTOP-2T3MSLV.env') });

const sampleStudents = [
  { studentNumber: '2023001', firstName: 'Alice', lastName: 'Smith', year: '1', section: 'A', status: 'Enrolled', semester: '1st' },
  { studentNumber: '2023002', firstName: 'Bob', lastName: 'Jones', year: '2', section: 'B', status: 'Enrolled', semester: '1st' },
  { studentNumber: '2023003', firstName: 'Carlos', lastName: 'Ruiz', year: '3', section: 'C', status: 'Irregular', semester: '1st' },
  { studentNumber: '2023004', firstName: 'Diana', lastName: 'King', year: '4', section: 'D', status: 'Enrolled', semester: '1st' },
  { studentNumber: '2023005', firstName: 'Eve', lastName: 'Lin', year: '1', section: 'B', status: 'Enrolled', semester: '1st' },
];

async function seed() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set. Ensure you run this from the backend folder where -DESKTOP-2T3MSLV.env exists.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // remove any sample students with same studentNumber to avoid duplicates
    const numbers = sampleStudents.map(s => s.studentNumber);
    await Student.deleteMany({ studentNumber: { $in: numbers } });

    const created = await Student.insertMany(sampleStudents);
    console.log('Inserted', created.length, 'sample students');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed', err);
    process.exit(1);
  }
}

seed();