import { getAuthClient, getServiceClient } from "../supabase";

/**
 * Service for profile-related operations
 */
export class ProfileService {
  /**
   * Get current profile for authenticated user
   * @param clerkToken Clerk JWT token (may not be needed if we have auth)
   * @param auth Auth object from Clerk middleware
   * @returns Promise with profile data or null if not found
   */
  async getProfile(clerkToken: string, auth: any) {
    if (!clerkToken) return null;

    // Extract user ID from auth object with safety checks
    let userId: string | null = null;
    if (auth) {
      // Try auth.uid() as a function
      if (typeof auth.uid === 'function') {
        try {
          userId = auth.uid();
        } catch (err) {
          console.error("Error calling auth.uid():", err);
        }
      }
      // Try auth.uid as a property
      else if (auth.uid && typeof auth.uid === 'string') {
        userId = auth.uid;
      }
      // Try other common properties
      else if (auth.userId && typeof auth.userId === 'string') {
        userId = auth.userId;
      }
      else if (auth.sub && typeof auth.sub === 'string') {
        userId = auth.sub;
      }
      else if (auth.id && typeof auth.id === 'string') {
        userId = auth.id;
      }
      // Try auth.claims.sub as a property path (JWT sub claim)
      else if (auth.claims && typeof auth.claims === 'object' && auth.claims.sub && typeof auth.claims.sub === 'string') {
        userId = auth.claims.sub;
      }
    }

    if (userId === null || userId === undefined || userId === "") {
      return null;
    }

    const supabase = getAuthClient(clerkToken); // Use auth client for Row Level Security
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, preferred_lang, subscription_tier")
      .eq("id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return data || null;
  }

  /**
   * Load or create profile for authenticated user
   * @param clerkToken Clerk JWT token (used for Row Level Security)
   * @param auth Auth object from Clerk middleware
   * @returns Promise with profile data
   */
  async loadOrCreateProfile(clerkToken: string, auth: any) {
    if (!clerkToken) {
      throw new Error("Unable to retrieve user information");
    }

    // Extract user ID from auth object with safety checks
    let userId: string | null = null;
    if (auth) {
      // Try auth.uid() as a function
      if (typeof auth.uid === 'function') {
        try {
          userId = auth.uid();
        } catch (err) {
          console.error("Error calling auth.uid():", err);
        }
      }
      // Try auth.uid as a property
      else if (auth.uid && typeof auth.uid === 'string') {
        userId = auth.uid;
      }
      // Try other common properties
      else if (auth.userId && typeof auth.userId === 'string') {
        userId = auth.userId;
      }
      else if (auth.sub && typeof auth.sub === 'string') {
        userId = auth.sub;
      }
      else if (auth.id && typeof auth.id === 'string') {
        userId = auth.id;
      }
      // Try auth.claims.sub as a property path (JWT sub claim)
      else if (auth.claims && typeof auth.claims === 'object' && auth.claims.sub && typeof auth.claims.sub === 'string') {
        userId = auth.claims.sub;
      }
    }

    if (userId === null || userId === undefined || userId === "") {
      throw new Error("Missing user id");
    }

    const supabase = getAuthClient(clerkToken); // Use auth client for Row Level Security

    // 1. Try to fetch existing profile using userId
    const { data: existingData, error: fetchError } = await supabase
      .from("profiles")
      .select("id, full_name, role, preferred_lang, subscription_tier")
      .eq("id", userId)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      throw fetchError;
    }

    // If profile exists, return it
    if (existingData) {
      return existingData;
    }

    // 2. Profile doesn't exist, create it
    // We don't have user payload here, so we'll use defaults
    // The route handler can pass additional info if needed
    const { data: insertedData, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: userId,
        full_name: "Student", // Default value
        role: "student",
        preferred_lang: "en",
      })
      .select("id, full_name, role, preferred_lang, subscription_tier")
      .single();

    if (insertError) {
      throw insertError;
    }

    return insertedData;
  }
}

// Export a singleton instance
export const profileService = new ProfileService();
