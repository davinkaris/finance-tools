import { createClient } from "@supabase/supabase-js";
import { generateId } from "../../../lib/accounts";
import { applyCategoryRulesWithCount } from "../../../lib/categoryRules";
import { applyNotesRulesWithCount } from "../../../lib/notesRules";
import {
  buildExtractPrompt,
  isPdfEncrypted,
  isPdfProcessingFailure,
  pdfPasswordUnsupportedResponse,
} from "../../../lib/pdfPassword";
import {
  buildIncomeCategoryNames,
  inferJenisFromAmounts,
  processTransaction,
} from "../../../lib/transactionJenis";
import { buildTransactionRows } from "../../../lib/transactionsStore";
import { computeUploadDateRange } from "../../../lib/uploadHistory";
import {
  buildSpendingSummary,
  generateInsightsWithClaude,
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
  const parseAmount = (value) => {
    if (value === null || value === undefined) return 0
    const numeric = String(value).replace(/[^\d-]/g, "")
    if (!numeric) return 0
    const parsed = Number(numeric)
    return Number.isFinite(parsed) ? parsed : 0
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    const formData = await request.formData()
    const accessToken = formData.get("accessToken")
      ? String(formData.get("accessToken"))
      : null

    if (!accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!supabaseAdmin) {
      return Response.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi. Tambahkan ke .env.local dari Supabase Dashboard → Settings → API.",
        },
        { status: 500 },
      )
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (authError || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const file = formData.get("file")
    const accountId = formData.get("accountId")
      ? String(formData.get("accountId"))
      : null
    const pdfPasswordRaw = formData.get("pdfPassword")
    const pdfPassword =
      pdfPasswordRaw && String(pdfPasswordRaw).trim()
        ? String(pdfPasswordRaw).trim()
        : null

    if (!file || typeof file.arrayBuffer !== "function") {
      return Response.json({ error: "File tidak ditemukan." }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const encrypted = isPdfEncrypted(bytes)
    const base64Data = Buffer.from(bytes).toString("base64")
    const extractPrompt = buildExtractPrompt(pdfPassword)

    if (encrypted && pdfPassword) {
      console.log(
        "Encrypted PDF with password — sending to Claude with password hint (no server decrypt)",
      )
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64Data
              }
            },
            {
              type: "text",
              text: extractPrompt,
            }
          ]
        }]
      })
    })

    const completion = await response.json()
    console.log("API status:", response.status)

    if (!response.ok) {
      console.error("API error:", completion)
      const apiMessage = completion?.error?.message || "Claude API error"

      if (
        (pdfPassword || encrypted) &&
        isPdfProcessingFailure(apiMessage, response.status)
      ) {
        return pdfPasswordUnsupportedResponse()
      }

      return Response.json({ error: apiMessage }, { status: 502 })
    }

    const text = completion?.content?.find(i => i.type === "text")?.text ?? ""
    console.log("Claude response:", text)

    let transactions
    try {
      const clean = text.replace(/```json/g, "").replace(/```/g, "").trim()
      transactions = JSON.parse(clean)
      if (!Array.isArray(transactions)) {
        throw new Error("Invalid transactions format")
      }
    } catch (parseErr) {
      console.error("Parse error:", parseErr?.message)
      if (pdfPassword || encrypted) {
        return pdfPasswordUnsupportedResponse()
      }
      throw parseErr
    }

    console.log("Parsed transactions:", transactions.length)

    const transactionsWithJenis = transactions.map((t) => ({
      ...t,
      jenis: inferJenisFromAmounts(t.debit, t.kredit),
    }))

    const categorizationPrompt = `Kategorisasi setiap transaksi bank Indonesia.

CONTOH KATEGORISASI YANG BENAR:
Transaksi → Kategori

GAJI & PEMASUKAN:
- 'Payroll from [perusahaan]' → Gaji & Pemasukan
- 'SALARY [nama]' → Gaji & Pemasukan
- 'THR [nama]' → Gaji & Pemasukan
- 'Kredit dari [perusahaan]' nominal besar rutin → Gaji & Pemasukan
- 'Referral Bonus' → Gaji & Pemasukan
- 'Cashback' → Gaji & Pemasukan
- 'Interest' atau 'Bunga' → Gaji & Pemasukan
- 'Jagoan Adventure Cashback' → Gaji & Pemasukan

TRANSFER:
- 'Outgoing Transfer [nama orang]' → Transfer
- 'Transfer ke [nama]' → Transfer
- 'Kirim ke [nama]' → Transfer
- 'SWIFT Transfer' → Transfer

TAGIHAN & UTILITAS:
- 'PLN' atau 'Listrik' → Tagihan & Utilitas
- 'PDAM' atau 'Air' → Tagihan & Utilitas
- 'Telkom' atau 'Internet' → Tagihan & Utilitas
- 'Insurance' atau 'Asuransi' → Tagihan & Utilitas
- 'BPJS' → Tagihan & Utilitas
- 'Netflix' → Tagihan & Utilitas
- 'Spotify' → Tagihan & Utilitas
- 'Top Up' OVO/GoPay/Dana → Tagihan & Utilitas

MAKANAN & MINUMAN:
- 'GoFood' atau 'GrabFood' atau 'ShopeeFood' → Makanan & Minuman
- 'KFC', 'McD', 'McDonald' → Makanan & Minuman
- 'Indomaret', 'Alfamart' → Makanan & Minuman
- 'Kopi', 'Coffee', 'Cafe' → Makanan & Minuman
- 'Restaurant', 'Resto', 'Warung' → Makanan & Minuman

TRANSPORT:
- 'Grab' (bukan GrabFood) → Transport
- 'Gojek' (bukan GoFood) → Transport
- 'Parkir' → Transport
- 'Toll' atau 'Tol' → Transport
- 'BBM' atau 'Pertamina' atau 'Shell' → Transport
- 'KAI' atau 'Kereta' → Transport
- 'Transjakarta' → Transport

SHOPPING:
- 'Tokopedia' → Shopping
- 'Shopee' (bukan ShopeeFood) → Shopping
- 'Lazada' → Shopping
- 'Zalora' → Shopping
- 'IKEA' → Shopping
- 'Uniqlo', 'H&M', 'Zara' → Shopping

INVESTASI:
- 'Bibit' → Investasi
- 'Ajaib' → Investasi
- 'Stockbit' → Investasi
- 'Deposito' → Investasi
- 'Reksa Dana' → Investasi

KESEHATAN:
- 'Apotek' atau 'Pharmacy' → Kesehatan
- 'Rumah Sakit' atau 'Hospital' atau 'RS' → Kesehatan
- 'Klinik' atau 'Dokter' → Kesehatan
- 'Gym' atau 'Fitness' → Kesehatan

RULES PENTING:
- Tax on Interest → Lainnya
- Transaksi KREDIT dari perusahaan → Gaji & Pemasukan
- Transfer antar rekening sendiri yang bisa diidentifikasi → Transfer
- Kalau tidak yakin → Lainnya

Data transaksi:
${JSON.stringify(transactionsWithJenis)}

Return HANYA JSON array dengan tambahan field kategori:
[{"tanggal":"...","deskripsi":"...","debit":0,"kredit":0,"saldo":0,"jenis":"income|expense","kategori":"..."}]
Jangan return apapun selain JSON.`

    const categoryResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 8000,
        messages: [{
          role: "user",
          content: categorizationPrompt
        }]
      })
    })

    const categorizationCompletion = await categoryResponse.json()
    console.log("Categorization API status:", categoryResponse.status)

    if (!categoryResponse.ok) {
      console.error("Categorization API error:", categorizationCompletion)
      return Response.json(
        { error: categorizationCompletion?.error?.message || "Claude categorization error" },
        { status: 502 }
      )
    }

    const categorizationText =
      categorizationCompletion?.content?.find(i => i.type === "text")?.text ?? ""
    console.log("Claude categorization response:", categorizationText)

    const cleanCategorization = categorizationText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim()
    const categorizedTransactions = JSON.parse(cleanCategorization)
    const incomeNames = buildIncomeCategoryNames({}, [])
    const processedTransactions = categorizedTransactions.map((t) =>
      processTransaction(
        {
          ...t,
          jenis: t.jenis || inferJenisFromAmounts(t.debit, t.kredit),
        },
        incomeNames,
      ),
    )

    let categoryRules = []
    try {
      const rulesRaw = formData.get("categoryRules")
      if (rulesRaw) {
        const parsed = JSON.parse(String(rulesRaw))
        if (Array.isArray(parsed)) categoryRules = parsed
      }
    } catch {
      categoryRules = []
    }

    const { transactions: transactionsWithRules, appliedCount } =
      await applyCategoryRulesWithCount(processedTransactions, categoryRules)

    let notesRules = []
    try {
      const notesRulesRaw = formData.get("notesRules")
      if (notesRulesRaw) {
        const parsed = JSON.parse(String(notesRulesRaw))
        if (Array.isArray(parsed)) notesRules = parsed
      }
    } catch {
      notesRules = []
    }

    const { transactions: transactionsWithNotes, appliedCount: notesAppliedCount } =
      await applyNotesRulesWithCount(transactionsWithRules, notesRules)

    const summary = buildSpendingSummary(transactionsWithNotes)
    console.log("Summary for insights:", summary)

    let insights = []
    try {
      insights = await generateInsightsWithClaude(summary, apiKey)
    } catch (insightErr) {
      console.error("Insight generation failed:", insightErr.message)
    }

    const insightsSaved = await saveAiInsightsAdmin(
      supabaseAdmin,
      userId,
      insights,
    )
    if (!insightsSaved) {
      console.error("save ai insights to user_preferences failed")
    }

    const transactionsWithAccount = transactionsWithNotes.map((t) => ({
      ...t,
      accountId: accountId || null,
      matchedTransactionId: null,
      matchType: null,
    }))

    const transactionRows = buildTransactionRows(transactionsWithAccount, userId)

    const { error: upsertError } = await supabaseAdmin
      .from("transactions")
      .upsert(transactionRows, { onConflict: "id" })

    if (upsertError) {
      console.error("save transactions error:", upsertError.message)
      return Response.json(
        { error: "Gagal menyimpan transaksi ke database." },
        { status: 500 },
      )
    }

    const { dateRange, dateRangeStart, dateRangeEnd } =
      computeUploadDateRange(transactionsWithAccount)

    const { error: historyError } = await supabaseAdmin
      .from("upload_history")
      .insert({
        id: generateId(),
        user_id: userId,
        account_id: accountId,
        file_name: file.name || "statement.pdf",
        uploaded_at: new Date().toISOString(),
        transaction_count: transactionsWithAccount.length,
        date_range: dateRange,
        date_range_start: dateRangeStart,
        date_range_end: dateRangeEnd,
      })

    if (historyError) {
      console.error("save upload history error:", historyError.message)
    }

    return Response.json({
      transactions: transactionsWithAccount,
      insights,
      autoAppliedCount: appliedCount,
      autoAppliedNotesCount: notesAppliedCount,
    })

  } catch (err) {
    console.error("Caught error:", err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
