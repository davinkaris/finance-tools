const INCOME_CATEGORIES = new Set(["Gaji & Pemasukan", "Investasi"]);

const BULAN_LABEL = {
  "01": "Januari",
  "02": "Februari",
  "03": "Maret",
  "04": "April",
  "05": "Mei",
  "06": "Juni",
  "07": "Juli",
  "08": "Agustus",
  "09": "September",
  "10": "Oktober",
  "11": "November",
  "12": "Desember",
};

export function parseInsightAmount(value) {
  if (value === null || value === undefined) return 0;
  const numeric = String(value).replace(/[^\d-]/g, "");
  if (!numeric) return 0;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildSpendingSummary(transactions) {
  const pengeluaranPerKategori = {};
  let totalPemasukan = 0;
  let totalPengeluaran = 0;
  const dates = [];

  for (const t of transactions) {
    const kategori = t.kategori || "Lainnya";
    const debit = parseInsightAmount(t.debit);
    const kredit = parseInsightAmount(t.kredit);

    if (INCOME_CATEGORIES.has(kategori)) {
      totalPemasukan += kredit;
    } else {
      totalPengeluaran += debit;
      if (debit > 0) {
        pengeluaranPerKategori[kategori] =
          (pengeluaranPerKategori[kategori] || 0) + debit;
      }
    }

    const [day, month, year] = String(t.tanggal || "").split("/");
    if (day && month && year) {
      dates.push(new Date(Number(year), Number(month) - 1, Number(day)));
    }
  }

  dates.sort((a, b) => a - b);
  let periode = "Tidak diketahui";
  if (dates.length > 0) {
    const formatDate = (d) =>
      `${BULAN_LABEL[String(d.getMonth() + 1).padStart(2, "0")]} ${d.getFullYear()}`;
    const first = formatDate(dates[0]);
    const last = formatDate(dates[dates.length - 1]);
    periode = first === last ? first : `${first} - ${last}`;
  }

  return {
    pengeluaranPerKategori,
    totalPemasukan,
    totalPengeluaran,
    periode,
  };
}

export async function generateInsightsWithClaude(summary, apiKey) {
  const insightPrompt = `Kamu adalah financial advisor Indonesia yang 
friendly dan tidak menghakimi.

Berdasarkan data spending berikut:
${JSON.stringify(summary, null, 2)}

Berikan TEPAT 3 insights dalam Bahasa Indonesia.
Format response HANYA JSON array dengan tepat 3 string:
["insight 1", "insight 2", "insight 3"]
Jangan return apapun selain JSON murni.`;

  const insightResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: insightPrompt,
        },
      ],
    }),
  });

  const insightCompletion = await insightResponse.json();

  if (!insightResponse.ok) {
    console.error("Insight API error:", insightCompletion);
    return [];
  }

  const insightText =
    insightCompletion?.content?.find((i) => i.type === "text")?.text ?? "";
  const cleanInsights = insightText
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleanInsights);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 3);
    }
  } catch (parseError) {
    console.error("Insight parse error:", parseError.message);
  }

  return [];
}

export async function saveAiInsightsAdmin(supabaseAdmin, userId, insights) {
  const { error } = await supabaseAdmin.from("user_preferences").upsert(
    {
      user_id: userId,
      ai_insights: Array.isArray(insights) ? insights : [],
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("save ai insights error:", error.message);
    return false;
  }

  return true;
}

export function mapTransactionRowForInsights(row) {
  return {
    tanggal: row.tanggal,
    deskripsi: row.deskripsi,
    debit: row.debit,
    kredit: row.kredit,
    kategori: row.kategori,
    jenis: row.jenis,
    matchType: row.match_type,
  };
}
