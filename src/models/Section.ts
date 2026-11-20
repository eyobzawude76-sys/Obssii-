import mongoose from "mongoose";

const SectionSchema = new mongoose.Schema({
  grade: { type: mongoose.Schema.Types.ObjectId, ref: "Grade", required: true },
  name: { type: String, required: true, trim: true, uppercase: true },
  createdAt: { type: Date, default: Date.now },
});
SectionSchema.index({ grade: 1, name: 1 }, { unique: true });

export default mongoose.models.Section ||
  mongoose.model("Section", SectionSchema);
