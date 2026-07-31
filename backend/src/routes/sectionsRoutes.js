import express from "express";
import {
  createSection,
  deleteSectionById,
  getAllSections,
  getSectionsMeta,
  syncSectionsFromStudents,
  updateAllSectionsCapacity,
  updateSectionById,
} from "../controllers/sectionsController.js";

const router = express.Router();

router.post("/sync", syncSectionsFromStudents);
router.post("/", createSection);
router.get("/meta", getSectionsMeta);
router.get("/", getAllSections);
router.patch("/:id", updateSectionById);
router.delete("/:id", deleteSectionById);
router.patch("/capacity/all", updateAllSectionsCapacity);

export default router;
