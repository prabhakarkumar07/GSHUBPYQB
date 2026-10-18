"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const supabase_1 = require("../supabase");
const router = (0, express_1.Router)();
const challengeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: "Too many challenge requests" },
});
// Create a new Challenge
router.post("/create", challengeLimiter, async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { subjectId } = req.body;
        // Fetch 10 random questions for this subject
        let query = supabase.from("questions").select("id").eq("is_dropped", false);
        if (subjectId)
            query = query.eq("subject_id", subjectId);
        // We fetch a bunch and shuffle since we don't have ORDER BY random() via rpc here
        const { data: qData, error: qError } = await query.limit(100);
        if (qError)
            throw qError;
        if (!qData || qData.length === 0)
            return res.status(400).json({ error: "Not enough questions" });
        const shuffled = qData.sort(() => 0.5 - Math.random());
        const selectedIds = shuffled.slice(0, 10).map((q) => q.id);
        // Extract auth from request (set by Clerk middleware)
        // @ts-ignore - auth property is added by Clerk middleware
        const auth = req.auth;
        let creatorId = null;
        if (auth && typeof auth.uid === 'function') {
            try {
                creatorId = auth.uid();
            } catch (err) {
                console.error("Error calling auth.uid():", err);
                // Continue with creatorId as null
            }
        }
        if (!creatorId)
            return res.status(401).json({ error: "User not found" });
        const { data: challenge, error } = await supabase
            .from("challenges")
            .insert({
            creator_id: creatorId,
            question_ids: selectedIds,
            status: "pending"
        })
            .select("id")
            .single();
        if (error)
            throw error;
        res.json({ challengeId: challenge.id });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to create challenge" });
    }
});
// Get Challenge status and questions
router.get("/:id", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
    const supabase = (0, supabase_1.getAuthClient)(token);
    if (!token)
        return res.status(401).json({ error: "Unauthorized" });
    try {
        const { data: challenge, error } = await supabase
            .from("challenges")
            .select("*, creator:profiles!creator_id(full_name), opponent:profiles!opponent_id(full_name)")
            .eq("id", req.params.id)
            .single();
        if (error || !challenge)
            return res.status(404).json({ error: "Challenge not found" });
        // Fetch the actual questions
        const { data: questions } = await supabase
            .from("questions")
            .select("*")
            .in("id", challenge.question_ids);
        res.json({ challenge, questions: questions || [] });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to fetch challenge" });
    }
});
// Submit Challenge answers
router.post("/:id/submit", challengeLimiter, async (req, res) => {
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
        if (!userId)
            return res.status(401).json({ error: "User not found" });
        const { data: challenge, error: fetchErr } = await supabase
            .from("challenges")
            .select("*")
            .eq("id", req.params.id)
            .single();
        if (fetchErr || !challenge)
            return res.status(404).json({ error: "Challenge not found" });
        if (challenge.status === "completed")
            return res.status(400).json({ error: "Challenge already completed" });
        let updates = {};
        if (challenge.creator_id === userId) {
            updates.creator_score = score;
        }
        else {
            // Opponent submitting
            updates.opponent_id = userId;
            updates.opponent_score = score;
        }
        // Determine if both have submitted
        const cScore = updates.creator_score !== undefined ? updates.creator_score : challenge.creator_score;
        const oScore = updates.opponent_score !== undefined ? updates.opponent_score : challenge.opponent_score;
        if (cScore !== null && oScore !== null && cScore !== undefined && oScore !== undefined) {
            updates.status = "completed";
        }
        else {
            updates.status = "active";
        }
        const { error: updateErr } = await supabase
            .from("challenges")
            .update(updates)
            .eq("id", req.params.id);
        if (updateErr)
            throw updateErr;
        res.json({ success: true, status: updates.status });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to submit challenge" });
    }
});
exports.default = router;
//# sourceMappingURL=challenge.js.map