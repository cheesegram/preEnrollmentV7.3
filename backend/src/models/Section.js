import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    year: { type: String, required: true, trim: true },
    section: { type: String, required: true, trim: true },
    semester: { type: String, required: true, trim: true },
    blockCount: { type: Number, default: 0, min: 0 },
    irregularCount: { type: Number, default: 0, min: 0 },
    blockCapacity: { type: Number, default: 45, min: 0 },
    irregularCapacity: { type: Number, default: 5, min: 0 },
    totalCapacity: { type: Number, default: 50, min: 0 },
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