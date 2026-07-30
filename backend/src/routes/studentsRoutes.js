import express from "express";
import {
  batchEnrollFromToBeAdmitted,
  batchEnrollPreview,
  createStudent,
  deleteStudent,
  enrollFromToBeAdmitted,
  getAllStudents,
  getPendingApplicants,
  getToBeAdmittedApplicants,
  getAdmittedApplicants,
  getStudentById,
  getStudentSections,
  getStudentBySection,
  importStudents,
  updateStudent,
} from "../controllers/studentsController.js";

const router = express.Router();

router.get("/", getAllStudents);
router.get("/pending", getPendingApplicants);
router.get("/pre-enrollment/to_be_admitted", getToBeAdmittedApplicants);
router.get("/pre-admission/admitted-applicants", getAdmittedApplicants);
router.get("/sections", getStudentSections);
router.get("/section/:section", getStudentBySection);
router.post("/enroll-from-to-be-admitted", enrollFromToBeAdmitted);
router.post("/batch-enroll-preview", batchEnrollPreview);
router.post("/batch-enroll", batchEnrollFromToBeAdmitted);
router.post("/import", importStudents);
router.get("/:id", getStudentById);
router.post("/", createStudent);
router.put("/:id", updateStudent);
router.delete("/:id", deleteStudent);

export default router;
