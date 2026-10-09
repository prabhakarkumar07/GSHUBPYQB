"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../supabase");
const router = (0, express_1.Router)();
// Dashboard - Fetch recent attempts
router.get("/dashboard", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const [{ data }, m, b] = await Promise.all([
            supabase.from("quiz_attempts").select("id, started_at, mode, source, score, status, title, current_index, responses, question_ids").order("started_at", { ascending: false }).limit(100),
            supabase.from("notebook_entries").select("question_id", { count: "exact", head: true }),
            supabase.from("bookmarks").select("question_id", { count: "exact", head: true }),
        ]);
        res.json({ attempts: data || [], mistakesCount: m.count || 0, bookmarksCount: b.count || 0 });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch dashboard" });
    }
});
// Analytics - Fetch subject-wise mastery
router.get("/analytics", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { data: answers, error } = await supabase
            .from("attempt_answers")
            .select(`
        is_correct,
        questions ( subject_id )
      `);
        if (error)
            throw error;
        // Aggregate by subject_id
        const stats = {};
        for (const ans of (answers || [])) {
            const qs = ans.questions;
            const subjectId = Array.isArray(qs) ? qs[0]?.subject_id : qs?.subject_id;
            if (subjectId) {
                if (!stats[subjectId])
                    stats[subjectId] = { total: 0, correct: 0 };
                stats[subjectId].total += 1;
                if (ans.is_correct)
                    stats[subjectId].correct += 1;
            }
        }
        const formatted = Object.entries(stats).map(([subject_id, { total, correct }]) => ({
            subject_id: parseInt(subject_id, 10),
            total,
            correct,
            accuracy: Math.round((correct / total) * 100),
        }));
        res.json({ analytics: formatted });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch analytics" });
    }
});
// Notebook - Fetch mistakes
router.get("/notebook", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { data: mk, error } = await supabase.from("notebook_entries").select("question_id, effect");
        if (error)
            throw error;
        if (!mk || mk.length === 0)
            return res.json({ questions: [], entries: [] });
        const { data: qs } = await supabase.from("questions").select("*, high_priority").in("id", mk.map((x) => x.question_id));
        res.json({ questions: qs || [], entries: mk || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch notebook" });
    }
});
// Notebook - Delete mistake
router.delete("/notebook/:questionId", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        // Note: The frontend previously called DELETE on 'mistakes' table but schema shows 'notebook_entries'.
        // RLS handles user matching.
        const { error } = await supabase.from("notebook_entries").delete().eq("question_id", req.params.questionId);
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to delete mistake" });
    }
});
// Bookmarks - Fetch bookmarks
router.get("/bookmarks", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { data: bm, error } = await supabase.from("bookmarks").select("question_id");
        if (error)
            throw error;
        if (!bm || bm.length === 0)
            return res.json({ questions: [] });
        const { data: qs } = await supabase.from("questions").select("*, high_priority").in("id", bm.map((x) => x.question_id));
        res.json({ questions: qs || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch bookmarks" });
    }
});
// Bookmarks - Toggle bookmark
router.post("/bookmarks/toggle", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { questionId, isBookmarked } = req.body;
        if (isBookmarked) {
            const { error } = await supabase.from("bookmarks").delete().eq("question_id", questionId);
            if (error)
                throw error;
        }
        else {
            const { error } = await supabase.from("bookmarks").insert({ question_id: questionId });
            if (error)
                throw error;
        }
        res.json({ success: true, bookmarked: !isBookmarked });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to toggle bookmark" });
    }
});
// Heatmap - Fetch accuracy
router.get("/heatmap", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { data, error } = await supabase.rpc("get_my_accuracy");
        if (error)
            throw error;
        res.json({ rows: data || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch heatmap" });
    }
});
// Gamification - Fetch Leaderboard
router.get("/leaderboard", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("id, full_name, total_score, quizzes_taken, correct_answers, total_answers")
            .order("total_score", { ascending: false, nullsFirst: false })
            .limit(50);
        if (error)
            throw error;
        res.json({ leaderboard: data || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
});
// Gamification - Fetch User Badges
router.get("/badges", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { data, error } = await supabase.from("user_badges").select("badge_id, earned_at");
        if (error)
            throw error;
        res.json({ badges: data || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch badges" });
    }
});
exports.default = router;
//# sourceMappingURL=user.js.map