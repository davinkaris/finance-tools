import { createClient } from "@supabase/supabase-js";
import {
  buildSpendingSummary,
  generateInsightsWithClaude,
  mapTransactionRowForInsights,
  saveAiInsightsAdmin,
} from "../../../lib/aiInsights";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    if (!supabaseAdmin) {
      return Response.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi. Tambahkan ke .env.local dari Supabase Dashboard → Settings → API.",
        },
        { status: 500 },
      );
    }

    let accessToken = null;

    try {
      const body = await request.json();
      accessToken = body?.accessToken ? String(body.accessToken) : null;
    } catch {
      accessToken = null;
    }

    if (!accessToken) {
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        accessToken = authHeader.slice(7);
      }
    }

    if (!accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: rows, error: txError } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("user_id", user.id);

    if (txError) {
      console.error("fetch transactions error:", txError.message);
      return Response.json(
        { error: "Gagal mengambil transaksi." },
        { status: 500 },
      );
    }

    const transactions = (rows || []).map(mapTransactionRowForInsights);

    if (transactions.length === 0) {
      await saveAiInsightsAdmin(supabaseAdmin, user.id, []);
      return Response.json({ insights: [] });
    }

    const summary = buildSpendingSummary(transactions);
    const insights = await generateInsightsWithClaude(summary, apiKey);

    const saved = await saveAiInsightsAdmin(supabaseAdmin, user.id, insights);

    if (!saved) {
      return Response.json(
        { error: "Gagal menyimpan AI Insight." },
        { status: 500 },
      );
    }

    return Response.json({ insights });
  } catch (err) {
    console.error("generate-insights error:", err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
