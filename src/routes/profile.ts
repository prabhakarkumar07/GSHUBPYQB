import { Router } from "express";
import { profileController } from "../controllers/profileController";

const router = Router();

// GET current profile
router.get("/", profileController.getProfile.bind(profileController));

// POST load or create profile
router.post("/loadOrCreate", profileController.loadOrCreateProfile.bind(profileController));

export default router;
