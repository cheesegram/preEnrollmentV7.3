import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    year: { type: String, required: true, trim: true },
    section: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    regular: { type: Number, default: 0, min: 0 },
    irregular: { type: Number, default: 0, min: 0 },
    regular_capacity: { type: Number, default: 45, min: 0 },
    irregular_capacity: { type: Number, default: 5, min: 0 },
    total_capacity: { type: Number, default: 50, min: 0 },
    status: {
      type: String,
      enum: ["Available", "Full", "Overloaded"],
      default: "Available",
    },
  },
  { timestamps: true }
);

sectionSchema.index({ year: 1, section: 1, semester: 1 }, { unique: true });

const Section = mongoose.model("Section", sectionSchema);

export default Section;
