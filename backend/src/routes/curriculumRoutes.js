import express from "express";
import {
  getCurriculumByYear,
  getCurriculumById,
  upsertCurriculum,
  upsertCurriculumById,
  getAllCurricula,
} from "../controllers/curriculumController.js";

const router = express.Router();

router.get("/", getAllCurricula);
router.get("/doc/:id", getCurriculumById);
router.post("/doc/:id", upsertCurriculumById);
router.get("/:year", getCurriculumByYear);
router.post("/", upsertCurriculum);

export default router;
