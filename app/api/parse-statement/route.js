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

    const categorizationPrompt = `Kategorisasi setiap transaksi dengan rules berikut:

GAJI & PEMASUKAN: transaksi yang mengandung kata 
Payroll, Salary, Gaji, THR, Bonus, Income, 
Transfer Masuk dari perusahaan, atau kredit besar 
yang rutin setiap bulan

TRANSFER: transfer antar rekening pribadi, 
top up e-wallet (OVO, GoPay, Dana, ShopeePay), 
transfer ke nama orang

MAKANAN & MINUMAN: restoran, kafe, GoFood, 
GrabFood, ShopeeFood, warung, supermarket

TRANSPORT: Grab, Gojek, Taxi, Parkir, BBM, 
Pertamina, toll

TAGIHAN & UTILITAS: listrik, air, PLN, PDAM, 
internet, telepon, asuransi, cicilan

SHOPPING: marketplace, Tokopedia, Shopee, 
Lazada, retail, fashion

INVESTASI: reksa dana, saham, deposito, 
Bibit, Ajaib, bank transfer ke investasi

HIBURAN: Netflix, Spotify, game, bioskop

KESEHATAN: apotek, rumah sakit, klinik, 
dokter, gym, fitness

LAINNYA: semua yang tidak masuk kategori di atas

Penting: Payroll dan transfer masuk dari 
perusahaan SELALU masuk Gaji & Pemasukan, 
bukan Transfer.

Data transaksi:
${JSON.stringify(transactions)}

Return HANYA JSON array dengan tambahan field kategori:
[{"tanggal":"...","deskripsi":"...","debit":0,
"kredit":0,"saldo":0,"kategori":"..."}]
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

    const summary = buildSummary(categorizedTransactions)
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

    return Response.json({ transactions: categorizedTransactions, insights })

  } catch (err) {
    console.error("Caught error:", err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
