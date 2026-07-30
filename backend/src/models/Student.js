import mongoose from "mongoose";

// 1st step: You need to create a schema
// 2nd step: You would create a model based off of that schema

const studentSchema = new mongoose.Schema(
  {
    // basic identifying fields; adjust as needed for your application
    student_number: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      trim: true,
    },
    first_name: {
      type: String,
      trim: true,
    },
    last_name: {
      type: String,
      trim: true,
    },
    middle_name: {
      type: String,
      trim: true,
    },
    section: {
      type: String,
      trim: true,
    },
    semester: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      default: "Enrolled",
    },
    year: {
      type: Number,
      min: 1,
      max: 4,
    },
    // personal information fields
    birth_date: {
      type: String,
      trim: true,
    },
    contact_number: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
    },
    permanent_address: {
      type: String,
      trim: true,
    },
    present_address: {
      type: String,
      trim: true,
    },
    // family information fields
    father_name: {
      type: String,
      trim: true,
    },
    father_contact: {
      type: String,
      trim: true,
    },
    mother_name: {
      type: String,
      trim: true,
    },
    mother_contact: {
      type: String,
      trim: true,
    },
    // school information fields
    school_year: {
      type: String,
      trim: true,
    },
    course: {
      type: String,
      trim: true,
    },
    elementary_school: {
      type: String,
      trim: true,
    },
    elementary_address: {
      type: String,
      trim: true,
    },
    junior_high_school: {
      type: String,
      trim: true,
    },
    junior_high_address: {
      type: String,
      trim: true,
    },
    senior_high_school: {
      type: String,
      trim: true,
    },
    senior_high_address: {
      type: String,
      trim: true,
    },
    college_school: {
      type: String,
      trim: true,
    },
    college_address: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      trim: true,
    },
    // legacy fields still around (if used by other parts of the code)
    title: {
      type: String,
    },
    content: {
      type: String,
    },
  },
  { timestamps: true } // createdAt, updatedAt
);

const Student = mongoose.model("Student", studentSchema);

export default Student;