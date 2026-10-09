import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!; // We need this! I will tell the user to add it.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Creates a Supabase client that acts on behalf of the user using their Clerk JWT.
 * This preserves Row-Level Security (RLS) in the database.
 */
export const getAuthClient = (clerkToken?: string) => {
  if (!clerkToken) {
    return createClient(supabaseUrl, supabaseAnonKey);
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${clerkToken}`,
      },
    },
  });
};

/**
 * Creates a Supabase Admin client that bypasses RLS.
 * Use with extreme caution!
 */
export const getAdminClient = () => {
  return createClient(supabaseUrl, supabaseServiceKey);
};
