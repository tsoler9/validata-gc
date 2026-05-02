import fetch from "node-fetch";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.method !== "POST") return res.status(405).end();

    let { text, url } = req.body;

    if (url?.trim()) {
        try {
            const r = await fetch(url.trim(), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
            const html = await r.text();
            const $ = cheerio.load(html);
            $("script,style,nav,footer,header").remove();
            text = $("body").text().replace(/\s+/g," ").trim().substring(0,3000);
        } catch {
            return res.json({ credibility:"Unverified", confidence:0, claims:"URL fetch failed", explanation:"Could not fetch URL. Paste text directly instead.", supportingSources:[], contradictingSources:[] });
        }
    }

    if (!text?.trim()) return res.status(400).json({ error:"No input" });

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${process.env.GROQ_API_KEY}` },
        body: JSON.stringify({
            model:"llama-3.1-8b-instant",
            messages:[{ role:"user", content:`Analyze this and return JSON ONLY with no markdown:\n{"credibility":"True|False|Mixed|Unverified","confidence":0-100,"claims":"short claims","explanation":"short explanation","supportingSources":["url"],"contradictingSources":["url"]}\n\nText: ${text}` }]
        })
    });

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    try {
        res.json(JSON.parse(raw.replace(/```json|```/g,"").trim()));
    } catch {
        res.json({ credibility:"Unverified", confidence:0, claims:"Parse error", explanation:raw, supportingSources:[], contradictingSources:[] });
    }
}