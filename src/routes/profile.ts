import { Router } from "express";
import { getAuthClient } from "../supabase";

const router = Router();

// GET current profile
router.get("/", async (req: any, res) => {
  const authHeader = req.headers.authorization;
  const clerkToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  if (!clerkToken) return res.status(401).json({ error: "Unauthorized" });

  const supabase = getAuthClient(clerkToken);
  try {
    const { data: user } = await supabase.auth.getUser();
    const clerkUserId = req.auth?.userId || user?.user?.id;
    
    // We can also just decode the token since we trust it
    const tokenParts = clerkToken.split(".");
    let sub = clerkUserId;
    if (!sub && tokenParts.length === 3) {
      const payload = JSON.parse(Buffer.from(tokenParts[1], "base64").toString());
      sub = payload.sub;
    }

    if (!sub) return res.status(401).json({ error: "Missing user id" });

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, preferred_lang, subscription_tier")
      .eq("id", sub)
      .maybeSingle();

    if (error) throw error;
    res.json({ profile: data || { role: "student" } });
  } catch (error) {
    console.error("GET Profile Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// This endpoint uses the Supabase JWT template token
router.post("/loadOrCreate", async (req: any, res) => {
  const authHeader = req.headers.authorization;
  const clerkToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
  const userPayload = req.body.user;

  // Since we pass the custom Supabase template JWT, clerkMiddleware might not populate req.auth
  const clerkUserId = req.auth?.userId || userPayload?.id;

  if (!clerkToken || !clerkUserId || !userPayload) {
    return res.status(401).json({ error: "Unauthorized or missing user context" });
  }

  // Use the authenticated Supabase client
  const supabase = getAuthClient(await clerkToken);

  try {
    // 1. Try to fetch existing profile
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, preferred_lang, subscription_tier")
      .eq("id", clerkUserId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (data) {
      return res.json({ profile: data });
    }

    // 2. Profile doesn't exist, create it
    const newProfile = {
      id: clerkUserId,
      full_name: userPayload.name || userPayload.email?.split("@")[0] || "Student",
      role: "student",
      preferred_lang: "en",
    };

    const { data: inserted, error: insertError } = await supabase
      .from("profiles")
      .insert(newProfile)
      .select("id, full_name, role, preferred_lang, subscription_tier")
      .single();

    if (insertError) throw insertError;

    res.json({ profile: inserted });
  } catch (error) {
    console.error("Profile API Error:", error);
    res.status(500).json({ error: "Failed to load/create profile" });
  }
});

export default router;
