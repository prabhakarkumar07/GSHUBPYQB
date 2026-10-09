/**
 * Creates a Supabase client that acts on behalf of the user using their Clerk JWT.
 * This preserves Row-Level Security (RLS) in the database.
 */
export declare const getAuthClient: (clerkToken?: string) => import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
/**
 * Creates a Supabase Admin client that bypasses RLS.
 * Use with extreme caution!
 */
export declare const getAdminClient: () => import("@supabase/supabase-js").SupabaseClient<any, "public", "public", any, any>;
//# sourceMappingURL=supabase.d.ts.map