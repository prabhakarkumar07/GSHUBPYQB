import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getAuthClient } from "../supabase";

const router = Router();

const challengeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Too many challenge requests" },
});

// Create a new Challenge
router.post("/create", challengeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { subjectId } = req.body;
    
    // Fetch 10 random questions for this subject
    let query = supabase.from("questions").select("id").eq("is_dropped", false);
    if (subjectId) query = query.eq("subject_id", subjectId);
    
    // We fetch a bunch and shuffle since we don't have ORDER BY random() via rpc here
    const { data: qData, error: qError } = await query.limit(100);
    if (qError) throw qError;
    
    if (!qData || qData.length === 0) return res.status(400).json({ error: "Not enough questions" });
    
    const shuffled = qData.sort(() => 0.5 - Math.random());
    const selectedIds = shuffled.slice(0, 10).map((q) => q.id);

    const { data: user } = await supabase.auth.getUser();
    const creatorId = user.user?.id;
    if (!creatorId) return res.status(401).json({ error: "User not found" });

    const { data: challenge, error } = await supabase
      .from("challenges")
      .insert({
        creator_id: creatorId,
        question_ids: selectedIds,
        status: "pending"
      })
      .select("id")
      .single();

    if (error) throw error;
    res.json({ challengeId: challenge.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

// Get Challenge status and questions
router.get("/:id", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);
  
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: challenge, error } = await supabase
      .from("challenges")
      .select("*, creator:profiles!creator_id(full_name), opponent:profiles!opponent_id(full_name)")
      .eq("id", req.params.id)
      .single();

    if (error || !challenge) return res.status(404).json({ error: "Challenge not found" });

    // Fetch the actual questions
    const { data: questions } = await supabase
      .from("questions")
      .select("*")
      .in("id", challenge.question_ids);

    res.json({ challenge, questions: questions || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch challenge" });
  }
});

// Submit Challenge answers
router.post("/:id/submit", challengeLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);
  
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { score } = req.body;
    const { data: user } = await supabase.auth.getUser();
    const userId = user.user?.id;
    if (!userId) return res.status(401).json({ error: "User not found" });

    const { data: challenge, error: fetchErr } = await supabase
      .from("challenges")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (fetchErr || !challenge) return res.status(404).json({ error: "Challenge not found" });
    if (challenge.status === "completed") return res.status(400).json({ error: "Challenge already completed" });

    let updates: any = {};
    if (challenge.creator_id === userId) {
      updates.creator_score = score;
    } else {
      // Opponent submitting
      updates.opponent_id = userId;
      updates.opponent_score = score;
    }

    // Determine if both have submitted
    const cScore = updates.creator_score !== undefined ? updates.creator_score : challenge.creator_score;
    const oScore = updates.opponent_score !== undefined ? updates.opponent_score : challenge.opponent_score;

    if (cScore !== null && oScore !== null && cScore !== undefined && oScore !== undefined) {
      updates.status = "completed";
    } else {
      updates.status = "active";
    }

    const { error: updateErr } = await supabase
      .from("challenges")
      .update(updates)
      .eq("id", req.params.id);

    if (updateErr) throw updateErr;

    res.json({ success: true, status: updates.status });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit challenge" });
  }
});

export default router;
