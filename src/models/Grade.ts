import mongoose from "mongoose";

const GradeSchema = new mongoose.Schema({
  level: { type: Number, required: true, enum: [11, 12], unique: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Grade || mongoose.model("Grade", GradeSchema);
