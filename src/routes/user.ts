import { Router } from "express";
import { getAuthClient } from "../supabase";

const router = Router();

// Dashboard - Fetch recent attempts
router.get("/dashboard", async (req: any, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    // ----------------------------------------------------------------------
    // CLERK ↔ SUPABASE SYNC
    // Since Clerk handles Auth, the user doesn't auto-exist in public.profiles.
    // The very first time they load the dashboard, we insert them safely.
    // ----------------------------------------------------------------------
    if (req.auth?.userId) {
      // We use ON CONFLICT DO NOTHING to avoid errors if they already exist
      await supabase.from("profiles").upsert({ id: req.auth.userId }, { onConflict: "id", ignoreDuplicates: true });
    }

    const [{ data }, m, b] = await Promise.all([
      supabase.from("quiz_attempts").select("id, started_at, mode, source, score, status, title, current_index, responses, question_ids").order("started_at", { ascending: false }).limit(100),
      supabase.from("mistakes").select("question_id", { count: "exact", head: true }),
      supabase.from("bookmarks").select("question_id", { count: "exact", head: true }),
    ]);
      
    res.json({ attempts: data || [], mistakesCount: m.count || 0, bookmarksCount: b.count || 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch dashboard" });
  }
});

// Analytics - Fetch subject-wise mastery
router.get("/analytics", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: answers, error } = await supabase
      .from("attempt_answers")
      .select(`
        is_correct,
        questions ( subject_id )
      `);

    // Gracefully handle if table doesn't exist yet
    if (error) {
      console.warn("analytics: attempt_answers not available:", error.message);
      return res.json({ analytics: [] });
    }

    // Aggregate by subject_id
    const stats: Record<string, { total: number; correct: number }> = {};
    for (const ans of (answers || [])) {
      const qs: any = ans.questions;
      const subjectId = Array.isArray(qs) ? qs[0]?.subject_id : qs?.subject_id;
      if (subjectId) {
        if (!stats[subjectId]) stats[subjectId] = { total: 0, correct: 0 };
        stats[subjectId].total += 1;
        if (ans.is_correct) stats[subjectId].correct += 1;
      }
    }

    const formatted = Object.entries(stats).map(([subject_id, { total, correct }]) => ({
      subject_id: parseInt(subject_id, 10),
      total,
      correct,
      accuracy: Math.round((correct / total) * 100),
    }));

    res.json({ analytics: formatted });
  } catch (error) {
    console.error("analytics error:", error);
    res.json({ analytics: [] }); // Fail gracefully, don't break dashboard
  }
});

// Notebook - Fetch mistakes
router.get("/notebook", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: mk, error } = await supabase.from("mistakes").select("question_id, times_missed, last_missed_at");
    if (error) throw error;
    
    if (!mk || mk.length === 0) return res.json({ questions: [], entries: [] });
    
    const { data: qs } = await supabase.from("questions").select("*, high_priority").in("id", mk.map((x) => x.question_id));
    res.json({ questions: qs || [], entries: mk || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch notebook" });
  }
});

// Notebook - Delete mistake
router.delete("/notebook/:questionId", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);
  
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    // Note: The frontend previously called DELETE on 'mistakes' table but schema shows 'notebook_entries'.
    // RLS handles user matching.
    const { error } = await supabase.from("mistakes").delete().eq("question_id", req.params.questionId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete mistake" });
  }
});

// Bookmarks - Fetch bookmarks
router.get("/bookmarks", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: bm, error } = await supabase.from("bookmarks").select("question_id");
    if (error) throw error;
    
    if (!bm || bm.length === 0) return res.json({ questions: [] });
    
    const { data: qs } = await supabase.from("questions").select("*, high_priority").in("id", bm.map((x) => x.question_id));
    res.json({ questions: qs || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

// Bookmarks - Toggle bookmark
router.post("/bookmarks/toggle", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { questionId, isBookmarked } = req.body;
    
    if (isBookmarked) {
      const { error } = await supabase.from("bookmarks").delete().eq("question_id", questionId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("bookmarks").insert({ question_id: questionId });
      if (error) throw error;
    }
    
    res.json({ success: true, bookmarked: !isBookmarked });
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle bookmark" });
  }
});

// Heatmap - Fetch accuracy
router.get("/heatmap", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data, error } = await supabase.rpc("get_my_accuracy");
    if (error) throw error;
    res.json({ rows: data || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch heatmap" });
  }
});

// Gamification - Fetch Leaderboard
router.get("/leaderboard", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, total_score, quizzes_taken, correct_answers, total_answers")
      .order("total_score", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) throw error;
    res.json({ leaderboard: data || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Gamification - Fetch User Badges
router.get("/badges", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  const supabase = getAuthClient(token);

  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data, error } = await supabase.from("user_badges").select("badge_id, earned_at");
    if (error) {
      console.warn("badges: user_badges not available:", error.message);
      return res.json({ badges: [] });
    }
    res.json({ badges: data || [] });
  } catch (error) {
    res.json({ badges: [] }); // Fail gracefully
  }
});

export default router;
