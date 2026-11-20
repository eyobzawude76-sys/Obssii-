import mongoose from "mongoose";

const TeacherAssignmentSchema = new mongoose.Schema({
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  grade: { type: mongoose.Schema.Types.ObjectId, ref: "Grade", required: true },
  section: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Section",
    required: true,
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subject",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});
TeacherAssignmentSchema.index(
  { teacher: 1, grade: 1, section: 1, subject: 1 },
  { unique: true },
);

export default mongoose.models.TeacherAssignment ||
  mongoose.model("TeacherAssignment", TeacherAssignmentSchema);
