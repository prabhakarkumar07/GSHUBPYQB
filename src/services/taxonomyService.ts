import { getAuthClient } from "../supabase";

/**
 * Service for taxonomy-related operations
 */
export class TaxonomyService {
  /**
   * Get all subjects, topics, exams, and app settings
   * @param token Optional Clerk token for RLS
   * @returns Promise with subjects, topics, exams, and settings
   */
  async getTaxonomyData(token?: string) {
    const supabase = getAuthClient(token);

    const [subjectsResult, topicsResult, examsResult, settingsResult] = await Promise.all([
      supabase.from("subjects").select("*").order("sort_order"),
      supabase.from("topics").select("*").order("sort_order"),
      supabase.from("exams").select("*").order("sort_order"),
      supabase.from("app_settings")
        .select("positive_marks, negative_marks, seconds_per_question, min_stats_attempts")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    return {
      subjects: subjectsResult.data || [],
      topics: topicsResult.data || [],
      exams: examsResult.data || [],
      settings: settingsResult.data || null
    };
  }
}

// Export a singleton instance
export const taxonomyService = new TaxonomyService();
