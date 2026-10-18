import { Router } from "express";
import { taxonomyController } from "../controllers/taxonomyController";

const router = Router();

// GET /api/taxonomy - Get all subjects, topics, exams, and app settings
router.get("/", taxonomyController.getTaxonomy.bind(taxonomyController));

export default router;
