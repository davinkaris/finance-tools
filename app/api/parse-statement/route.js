import { applyCategoryRulesWithCount } from "../../../lib/categoryRules";
import { applyNotesRulesWithCount } from "../../../lib/notesRules";
import {
  buildIncomeCategoryNames,
  inferJenisFromAmounts,
  processTransaction,
} from "../../../lib/transactionJenis";

export async function POST(request) {
  const parseAmount = (value) => {
    if (value === null || value === undefined) return 0
    const numeric = String(value).replace(/[^\d-]/g, "")
    if (!numeric) return 0
    const parsed = Number(numeric)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const INCOME_CATEGORIES = new Set(["Gaji & Pemasukan", "Investasi"])

  const BULAN_LABEL = {
    "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
    "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
    "09": "September", "10": "Oktober", "11": "November", "12": "Desember",
  }

  const buildSummary = (transactions) => {
    const pengeluaranPerKategori = {}
    let totalPemasukan = 0
    let totalPengeluaran = 0
    const dates = []

    for (const t of transactions) {
      const kategori = t.kategori || "Lainnya"
      const debit = parseAmount(t.debit)
      const kredit = parseAmount(t.kredit)

      if (INCOME_CATEGORIES.has(kategori)) {
        totalPemasukan += kredit
      } else {
        totalPengeluaran += debit
        if (debit > 0) {
          pengeluaranPerKategori[kategori] = (pengeluaranPerKategori[kategori] || 0) + debit
        }
      }

      const [day, month, year] = String(t.tanggal || "").split("/")
      if (day && month && year) {
        dates.push(new Date(Number(year), Number(month) - 1, Number(day)))
      }
    }

    dates.sort((a, b) => a - b)
    let periode = "Tidak diketahui"
    if (dates.length > 0) {
      const formatDate = (d) =>
        `${BULAN_LABEL[String(d.getMonth() + 1).padStart(2, "0")]} ${d.getFullYear()}`
      const first = formatDate(dates[0])
      const last = formatDate(dates[dates.length - 1])
      periode = first === last ? first : `${first} - ${last}`
    }

    return {
      pengeluaranPerKategori,
      totalPemasukan,
      totalPengeluaran,
      periode,
    }
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    const formData = await request.formData()
    const file = formData.get("file")
    const accountId = formData.get("accountId")
      ? String(formData.get("accountId"))
      : null
    const bytes = await file.arrayBuffer()
    const base64Data = Buffer.from(bytes).toString("base64")

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
              text: "Extract semua transaksi yang ada, maksimal 50 transaksi dari bank statement ini. Return HANYA JSON array dengan format: [{\"tanggal\":\"DD/MM/YYYY\",\"deskripsi\":\"...\",\"debit\":0,\"kredit\":0,\"saldo\":0}]. Jangan return apapun selain JSON murni."
            }
          ]
        }]
      })
    })

    const completion = await response.json()
    console.log("API status:", response.status)

    if (!response.ok) {
      console.error("API error:", completion)
      return Response.json(
        { error: completion?.error?.message || "Claude API error" }, 
        { status: 502 }
      )
    }

    const text = completion?.content?.find(i => i.type === "text")?.text ?? ""
    console.log("Claude response:", text)

    const clean = text.replace(/```json/g,"").replace(/```/g,"").trim()
    const transactions = JSON.parse(clean)
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
      applyCategoryRulesWithCount(processedTransactions, categoryRules)

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
      applyNotesRulesWithCount(transactionsWithRules, notesRules)

    const summary = buildSummary(transactionsWithNotes)
    console.log("Summary for insights:", summary)

    const insightPrompt = `Kamu adalah financial advisor Indonesia yang 
friendly dan tidak menghakimi.

Berdasarkan data spending berikut:
${JSON.stringify(summary, null, 2)}

Berikan TEPAT 3 insights dalam Bahasa Indonesia.
Format response HANYA JSON array dengan tepat 3 string:
["insight 1", "insight 2", "insight 3"]
Jangan return apapun selain JSON murni.`

    let insights = []

    try {
      const insightResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: insightPrompt
          }]
        })
      })

      const insightCompletion = await insightResponse.json()
      console.log("Insight API status:", insightResponse.status)

      if (insightResponse.ok) {
        const insightText =
          insightCompletion?.content?.find(i => i.type === "text")?.text ?? ""
        console.log("Claude insight response:", insightText)
        const cleanInsights = insightText.replace(/```json/g, "").replace(/```/g, "").trim()
        const parsed = JSON.parse(cleanInsights)
        if (Array.isArray(parsed)) {
          insights = parsed.slice(0, 3)
        }
      } else {
        console.error("Insight API error:", insightCompletion)
      }
    } catch (insightErr) {
      console.error("Insight generation failed:", insightErr.message)
    }

    const transactionsWithAccount = transactionsWithNotes.map((t) => ({
      ...t,
      accountId: accountId || null,
      matchedTransactionId: null,
      matchType: null,
    }))

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
