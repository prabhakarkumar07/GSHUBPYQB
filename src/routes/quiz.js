"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const supabase_1 = require("../supabase");
const router = (0, express_1.Router)();
// Strict rate limit for quiz submission (30 per minute per IP)
const submitLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: "Too many quiz submissions from this IP. Slow down." },
});
// Replaces rpc('build_quiz') and count_questions
router.post("/build", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const { subjectIds, topicIds, examIds, count, source, highPriorityOnly } = req.body;
        const { data, error } = await supabase.rpc("build_quiz", {
            p_subject_ids: subjectIds?.length ? subjectIds : null,
            p_topic_ids: topicIds?.length ? topicIds : null,
            p_exam_ids: examIds?.length ? examIds : null,
            p_count: count,
            p_source: source,
            p_high_priority_only: !!highPriorityOnly,
        });
        if (error)
            throw error;
        res.json({ ids: data || [] });
    }
    catch (error) {
        console.error("Quiz Build Error:", error);
        res.status(500).json({ error: "Failed to build quiz" });
    }
});
router.post("/count", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const { subjectIds, topicIds, examIds } = req.body;
        const { data, error } = await supabase.rpc("count_questions", {
            p_subject_ids: subjectIds?.length ? subjectIds : null,
            p_topic_ids: topicIds?.length ? topicIds : null,
            p_exam_ids: examIds?.length ? examIds : null,
        });
        if (error)
            throw error;
        res.json({ count: typeof data === "number" ? data : 0 });
    }
    catch (error) {
        console.error("Quiz Count Error:", error);
        res.status(500).json({ error: "Failed to count questions" });
    }
});
// Replaces inserting into quiz_attempts
router.post("/start", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { id, mode, source, questionIds, title, config } = req.body;
        const { data, error } = await supabase
            .from("quiz_attempts")
            .insert({ id, mode, source, question_ids: questionIds, title, config })
            .select("positive_marks, negative_marks, time_limit_sec")
            .single();
        if (error)
            throw error;
        res.json({ attempt: data });
    }
    catch (error) {
        console.error("Quiz Start Error:", error);
        res.status(500).json({ error: "Failed to start quiz" });
    }
});
// Fetch a single attempt
router.get("/:id", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const { data, error } = await supabase.from("quiz_attempts").select("*").eq("id", req.params.id).maybeSingle();
        if (error)
            throw error;
        res.json({ attempt: data });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch attempt" });
    }
});
// Sync progress during exam
router.post("/sync", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const { id, responses, currentIndex } = req.body;
        const { error } = await supabase.from("quiz_attempts").update({ responses, current_index: currentIndex }).eq("id", id);
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to sync" });
    }
});
// Submit final exam attempt
router.post("/submit", submitLimiter, async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const { attemptId, responses, timeTaken } = req.body;
        const { error } = await supabase.rpc("submit_attempt", { p_attempt: attemptId, p_responses: responses, p_time_taken: timeTaken });
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to submit attempt" });
    }
});
// Record practice answer (auto-evaluates and logs mistake)
router.post("/record-practice", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const { attemptId, questionId, selected } = req.body;
        const { data, error } = await supabase.rpc("record_practice_answer", { p_attempt: attemptId, p_question: questionId, p_selected: selected });
        if (error)
            throw error;
        res.json({ effect: data?.effect ?? null });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to record practice answer" });
    }
});
// Get global question stats (accuracy percentage)
router.post("/stats", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const { ids } = req.body;
        const { data, error } = await supabase.rpc("get_question_stats", { p_ids: ids });
        if (error)
            throw error;
        res.json({ stats: data || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});
// Fetch full result data (attempt, questions, stats, bookmarks)
router.get("/:id/result", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    try {
        const attemptId = req.params.id;
        const { data: attempt, error: attemptError } = await supabase.from("quiz_attempts").select("*").eq("id", attemptId).maybeSingle();
        if (attemptError)
            throw attemptError;
        if (!attempt || attempt.status !== "submitted")
            return res.status(404).json({ error: "Attempt not found or not submitted" });
        const qids = attempt.question_ids;
        // Fetch answers, questions, stats, bookmarks in parallel
        const [ansRes, qsRes, stRes, bmRes] = await Promise.all([
            supabase.from("attempt_answers").select("question_id, notebook_effect").eq("attempt_id", attemptId),
            supabase.from("questions").select("*, high_priority").in("id", qids),
            supabase.rpc("get_question_stats", { p_ids: qids }),
            token ? supabase.from("bookmarks").select("question_id").in("question_id", qids) : Promise.resolve({ data: [] }),
        ]);
        res.json({
            attempt,
            answers: ansRes.data || [],
            questions: qsRes.data || [],
            stats: stRes.data || [],
            bookmarks: bmRes.data || [],
        });
    }
    catch (error) {
        console.error("Fetch Result Error", error);
        res.status(500).json({ error: "Failed to fetch result" });
    }
});
// Flashcards - Fetch due questions
router.get("/flashcards", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { data: entries, error } = await supabase
            .from("mistakes")
            .select("question_id, interval, repetition, ease_factor")
            .lte("next_review_at", new Date().toISOString())
            .limit(20);
        if (error)
            throw error;
        if (!entries || entries.length === 0)
            return res.json({ flashcards: [] });
        const qIds = entries.map(e => e.question_id);
        const { data: questions } = await supabase.from("questions").select("*").in("id", qIds);
        const flashcards = questions?.map(q => ({
            ...q,
            sm2: entries.find(e => e.question_id === q.id)
        }));
        res.json({ flashcards: flashcards || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch flashcards" });
    }
});
// Flashcards - Process SM-2 Grade (quality: 0-5)
router.post("/flashcards/review", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { questionId, quality } = req.body; // quality: 0 (blackout) to 5 (perfect)
        // Fetch current SM2 values
        const { data: entry } = await supabase
            .from("mistakes")
            .select("interval, repetition, ease_factor")
            .eq("question_id", questionId)
            .single();
        if (!entry)
            return res.status(404).json({ error: "Entry not found" });
        let { interval, repetition, ease_factor } = entry;
        // SM-2 Algorithm logic
        if (quality >= 3) {
            if (repetition === 0)
                interval = 1;
            else if (repetition === 1)
                interval = 6;
            else
                interval = Math.round(interval * ease_factor);
            repetition += 1;
        }
        else {
            repetition = 0;
            interval = 1;
        }
        ease_factor = ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (ease_factor < 1.3)
            ease_factor = 1.3;
        const nextReviewAt = new Date();
        nextReviewAt.setDate(nextReviewAt.getDate() + interval);
        const { error } = await supabase
            .from("mistakes")
            .update({
            interval,
            repetition,
            ease_factor,
            next_review_at: nextReviewAt.toISOString()
        })
            .eq("question_id", questionId);
        if (error)
            throw error;
        res.json({ success: true, nextReviewAt });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to submit flashcard review" });
    }
});
exports.default = router;
//# sourceMappingURL=quiz.js.map