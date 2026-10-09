import { createClient } from "@supabase/supabase-js";
export const supabaseUrl = process.env.SUPABASE_URL!;
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Used for operations with Clerk JWTs (RLS applied)
export const getAuthClient = (clerkToken?: string) => {
  const options = clerkToken
    ? { global: { headers: { Authorization: "Bearer " + clerkToken } } }
    : {};
  return createClient(supabaseUrl, supabaseAnonKey, options);
};

// Used for admin operations bypassing RLS
export const getServiceClient = () => {
  return createClient(supabaseUrl, supabaseServiceKey);
};
