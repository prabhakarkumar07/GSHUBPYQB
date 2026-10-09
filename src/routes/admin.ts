import { Router } from "express";
import { getAuthClient, getServiceClient } from "../supabase";

const router = Router();

// Middleware to enforce admin role via Supabase
// (Since we pass the Clerk JWT to Supabase, we can check if the profile is admin)
const checkAdmin = async (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;
  
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  
  const supabase = getAuthClient(token);
  // Ideally, RLS policies enforce admin-only access on the DB side.
  req.supabase = supabase;
  next();
};

router.use(checkAdmin);

// Analytics
router.get("/analytics", async (req: any, res) => {
  try {
    const { data, error } = await req.supabase.rpc("admin_analytics");
    if (error) throw error;
    res.json({ analytics: data });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
});

// Feedback
router.get("/feedback", async (req: any, res) => {
  try {
    const { data, error } = await req.supabase.from("feedback").select("*").limit(300);
    if (error) throw error;
    res.json({ feedback: data || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

router.delete("/feedback/:id", async (req: any, res) => {
  try {
    const { error } = await req.supabase.from("feedback").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete feedback" });
  }
});

// Settings
router.put("/settings", async (req: any, res) => {
  try {
    const { error } = await req.supabase.from("app_settings").update({ ...req.body, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// Taxonomy (Subjects/Topics/Exams)
router.post("/taxonomy/:type", async (req: any, res) => {
  try {
    const { error } = await req.supabase.from(req.params.type).insert(req.body);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to create taxonomy item" });
  }
});

router.put("/taxonomy/:type/:id", async (req: any, res) => {
  try {
    const { error } = await req.supabase.from(req.params.type).update(req.body).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update taxonomy item" });
  }
});

router.delete("/taxonomy/:type/:id", async (req: any, res) => {
  try {
    const { error } = await req.supabase.from(req.params.type).delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete taxonomy item" });
  }
});

// Questions List
router.post("/questions/search", async (req: any, res) => {
  try {
    const { page, perPage, subject, topic, search } = req.body;
    let query = req.supabase.from("questions").select("*", { count: "exact" }).range(page * perPage, page * perPage + perPage - 1);
    
    if (subject) query = query.eq("subject_id", subject);
    if (topic) query = query.eq("topic_id", topic);
    if (search) query = query.or(`question_en.ilike.%${search}%,question_hi.ilike.%${search}%`);
    
    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ questions: data || [], count: count || 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch questions" });
  }
});

router.get("/questions/:id", async (req: any, res) => {
  try {
    const { data, error } = await req.supabase.from("questions").select("*").eq("id", req.params.id).single();
    if (error) throw error;
    res.json({ question: data });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch question" });
  }
});

router.post("/questions", async (req: any, res) => {
  try {
    const { error } = await req.supabase.from("questions").insert(req.body);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save question" });
  }
});

router.put("/questions/:id", async (req: any, res) => {
  try {
    const { error } = await req.supabase.from("questions").update(req.body).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update question" });
  }
});

router.delete("/questions/:id", async (req: any, res) => {
  try {
    const { error } = await req.supabase.from("questions").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete question" });
  }
});

router.post("/questions/upload", async (req: any, res) => {
  try {
    const { rows } = req.body;
    const { data, error } = await req.supabase.from("questions").insert(rows).select("id");
    if (error) throw error;
    res.json({ count: data?.length || 0 });
  } catch (error) {
    res.status(500).json({ error: "Failed to bulk upload" });
  }
});

// Create a Live Exam
router.post("/live-exams", async (req: any, res) => {
  try {
    const { title, description, duration_minutes, start_time, end_time, question_ids, is_published } = req.body;
    
    // We expect question_ids to be provided, or we can fetch randomly
    const { data, error } = await req.supabase
      .from("live_exams")
      .insert({
        title,
        description,
        duration_minutes,
        start_time,
        end_time,
        question_ids,
        is_published
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, exam: data });
  } catch (error) {
    res.status(500).json({ error: "Failed to create live exam" });
  }
});


// Users Management
router.get("/users", async (req: any, res: any) => {
  try {
    const { data, error } = await getServiceClient().from("profiles").select("*").limit(500);
    if (error) throw error;
    res.json({ users: data || [] });
  } catch (error) {
    console.error("Fetch Users Error:", error); res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.patch("/users/:id", async (req: any, res: any) => {
  try {
    const { role, subscription_tier } = req.body;
    const updates: any = {};
    if (role) updates.role = role;
    if (subscription_tier) updates.subscription_tier = subscription_tier;
    
    const { error } = await getServiceClient().from("profiles").update(updates).eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update user" });
  }
});

export default router;
