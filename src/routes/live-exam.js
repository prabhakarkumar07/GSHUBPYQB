"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../supabase");
const router = (0, express_1.Router)();
// Get upcoming and active live exams
router.get("/", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        // Only return exams that haven't ended yet
        const { data: exams, error } = await supabase
            .from("live_exams")
            .select("id, title, description, duration_minutes, start_time, end_time")
            .eq("is_published", true)
            .gt("end_time", new Date().toISOString())
            .order("start_time", { ascending: true });
        if (error)
            throw error;
        // Fetch user's registrations to see which ones they've registered for
        // Extract auth from request (set by Clerk middleware)
        // @ts-ignore - auth property is added by Clerk middleware
        const auth = req.auth;
        let userId = null;
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
        }
        let registrations = [];
        if (userId) {
            const { data: regData } = await supabase
                .from("live_exam_registrations")
                .select("live_exam_id, started_at, submitted_at, score")
                .eq("user_id", userId);
            registrations = regData || [];
        }
        const result = exams?.map(exam => {
            const reg = registrations.find(r => r.live_exam_id === exam.id);
            return {
                ...exam,
                is_registered: !!reg,
                status: reg?.submitted_at ? "completed" : reg?.started_at ? "in_progress" : "registered",
                score: reg?.score
            };
        });
        res.json({ exams: result || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch live exams" });
    }
});
// Register for an exam
router.post("/:id/register", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        // Extract auth from request (set by Clerk middleware)
        // @ts-ignore - auth property is added by Clerk middleware
        const auth = req.auth;
        let userId = null;
        if (auth && typeof auth.uid === 'function') {
            try {
                userId = auth.uid();
            } catch (err) {
                console.error("Error calling auth.uid():", err);
                // Continue with userId as null
            }
        }
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { error } = await supabase
            .from("live_exam_registrations")
            .insert({ live_exam_id: req.params.id, user_id: userId });
        if (error && error.code !== "23505")
            throw error; // ignore unique constraint if already registered
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to register" });
    }
});
// Start Exam & Fetch questions
router.get("/:id/start", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        // Extract auth from request (set by Clerk middleware)
        // @ts-ignore - auth property is added by Clerk middleware
        const auth = req.auth;
        let userId = null;
        if (auth && typeof auth.uid === 'function') {
            try {
                userId = auth.uid();
            } catch (err) {
                console.error("Error calling auth.uid():", err);
                // Continue with userId as null
            }
        }
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        // Check if exam is active
        const { data: exam, error: examErr } = await supabase
            .from("live_exams")
            .select("*")
            .eq("id", req.params.id)
            .single();
        if (examErr || !exam)
            return res.status(404).json({ error: "Exam not found" });
        const now = new Date();
        if (now < new Date(exam.start_time))
            return res.status(403).json({ error: "Exam has not started yet" });
        if (now > new Date(exam.end_time))
            return res.status(403).json({ error: "Exam has ended" });
        // Mark as started
        const { data: reg, error: regErr } = await supabase
            .from("live_exam_registrations")
            .update({ started_at: new Date().toISOString() })
            .eq("live_exam_id", req.params.id)
            .eq("user_id", userId)
            .is("started_at", null)
            .select("*")
            .single();
        // Fetch questions
        const { data: questions } = await supabase
            .from("questions")
            .select("*")
            .in("id", exam.question_ids);
        res.json({ exam, questions: questions || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to start exam" });
    }
});
// Submit Exam
router.post("/:id/submit", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { score } = req.body;
        // Extract auth from request (set by Clerk middleware)
        // @ts-ignore - auth property is added by Clerk middleware
        const auth = req.auth;
        let userId = null;
        if (auth && typeof auth.uid === 'function') {
            try {
                userId = auth.uid();
            } catch (err) {
                console.error("Error calling auth.uid():", err);
                // Continue with userId as null
            }
        }
        if (!userId)
            return res.status(401).json({ error: "Unauthorized" });
        const { error } = await supabase
            .from("live_exam_registrations")
            .update({ submitted_at: new Date().toISOString(), score })
            .eq("live_exam_id", req.params.id)
            .eq("user_id", userId)
            .is("submitted_at", null);
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to submit exam" });
    }
});
exports.default = router;
//# sourceMappingURL=live-exam.js.map