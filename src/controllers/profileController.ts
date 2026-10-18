import { Request, Response } from "express";
import { profileService } from "../services/profileService";

/**
 * Controller for profile-related operations
 * Thin layer that handles HTTP concerns and delegates to service
 */
export class ProfileController {
  /**
   * GET /api/profile
   * Get current profile for authenticated user
   */
  async getProfile(req: Request, res: Response) {
    try {
      const authHeader = req.headers.authorization;
      const clerkToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
      
      if (!clerkToken) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Extract auth from request (set by Clerk middleware)
      // @ts-ignore - auth property is added by Clerk middleware
      const auth = req.auth;
      
      const profile = await profileService.getProfile(clerkToken, auth);

      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      res.json({ profile });
    } catch (error) {
      console.error("Error in profile controller:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * POST /api/profile/loadOrCreate
   * Load or create profile for authenticated user
   */
  async loadOrCreateProfile(req: Request, res: Response) {
    try {
      const authHeader = req.headers.authorization;
      const clerkToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

      if (!clerkToken) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Extract auth from request (set by Clerk middleware)
      // @ts-ignore - auth property is added by Clerk middleware
      const auth = req.auth;

      const profile = await profileService.loadOrCreateProfile(clerkToken, auth);
      res.json({ profile });
    } catch (error) {
      console.error("Error in profile loadOrCreate controller:", error);
      if (error instanceof Error && error.message === "Missing user id") {
        return res.status(401).json({ error: "Missing user id" });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

// Export a singleton instance
export const profileController = new ProfileController();
