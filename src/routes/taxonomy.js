"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../supabase");
const router = (0, express_1.Router)();
router.get("/", async (req, res) => {
    // We can pass the auth token if we want to enforce RLS, but taxonomy is usually public.
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const [s, t, e, st] = await Promise.all([
            supabase.from("subjects").select("*").order("sort_order"),
            supabase.from("topics").select("*").order("sort_order"),
            supabase.from("exams").select("*").order("sort_order"),
            supabase.from("app_settings").select("positive_marks, negative_marks, seconds_per_question, min_stats_attempts").eq("id", 1).maybeSingle(),
        ]);
        if (s.error)
            throw s.error;
        if (t.error)
            throw t.error;
        if (e.error)
            throw e.error;
        if (st.error)
            throw st.error;
        res.json({
            subjects: s.data || [],
            topics: t.data || [],
            exams: e.data || [],
            settings: st.data || null,
        });
    }
    catch (error) {
        console.error("Taxonomy API Error:", error);
        res.status(500).json({ error: "Failed to fetch taxonomy" });
    }
});
exports.default = router;
//# sourceMappingURL=taxonomy.js.map