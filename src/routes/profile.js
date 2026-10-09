"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_2 = require("@clerk/express");
const supabase_1 = require("../supabase");
const router = (0, express_1.Router)();
// This endpoint requires a valid Clerk JWT
router.post("/loadOrCreate", (0, express_2.requireAuth)(), async (req, res) => {
    const clerkUserId = req.auth.userId;
    const clerkToken = req.auth.getToken(); // This gets the active JWT
    const userPayload = req.body.user; // e.g. { id, full_name, email }
    if (!clerkUserId || !userPayload) {
        return res.status(400).json({ error: "Missing user context" });
    }
    // Use the authenticated Supabase client
    const supabase = (0, supabase_1.getAuthClient)(await clerkToken);
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
        if (insertError)
            throw insertError;
        res.json({ profile: inserted });
    }
    catch (error) {
        console.error("Profile API Error:", error);
        res.status(500).json({ error: "Failed to load/create profile" });
    }
});
exports.default = router;
//# sourceMappingURL=profile.js.map