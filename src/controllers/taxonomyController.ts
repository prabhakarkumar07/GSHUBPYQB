import { Request, Response } from "express";
import { taxonomyService } from "../services/taxonomyService";

/**
 * Controller for taxonomy-related operations
 * Thin layer that handles HTTP concerns and delegates to service
 */
export class TaxonomyController {
  /**
   * GET /api/taxonomy
   * Get all subjects, topics, exams, and app settings
   */
  async getTaxonomy(req: Request, res: Response) {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
      
      // Get taxonomy data from service
      const result = await taxonomyService.getTaxonomyData(token);
      
      // Return response (same format as original)
      res.json({
        subjects: result.subjects,
        topics: result.topics,
        exams: result.exams,
        settings: result.settings
      });
    } catch (error) {
      console.error("Error in taxonomy controller:", error);
      res.status(500).json({ error: "Failed to fetch taxonomy" });
    }
  }
}

// Export a singleton instance
export const taxonomyController = new TaxonomyController();
