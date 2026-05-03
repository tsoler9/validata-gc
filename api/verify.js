import fetch from "node-fetch";
import * as cheerio from "cheerio";

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).end();

    let { text, url } = req.body;

    // ── URL fetching ──────────────────────────────────────
    if (url?.trim()) {
        try {
            const r = await fetch(url.trim(), {
                headers: { "User-Agent": "Mozilla/5.0" },
                signal: AbortSignal.timeout(10000)
            });
            const html = await r.text();
            const $ = cheerio.load(html);
            $("script,style,nav,footer,header,aside").remove();
            text = $("body").text().replace(/\s+/g, " ").trim().substring(0, 3000);
        } catch {
            return res.json({
                credibility: "Unverified",
                confidence: 0,
                claims: "URL fetch failed",
                explanation: "Hindi ma-access ang URL. I-paste na lang ang text ng artikulo.",
                supportingSources: [],
                contradictingSources: []
            });
        }
    }

    if (!text?.trim()) return res.status(400).json({ error: "No input" });

    // ── Detect language ───────────────────────────────────
    const tagalogWords = ["ang","ng","na","sa","at","ay","mga","ko","mo","siya","kami","namin","nila","ako","ikaw","sila","nito","niya","pero","kung","para","dahil","kaya","hindi","oo","wala","mayroon","dito","doon","bakit","paano","sino","ano","kailan","walang","may","ito","iyon","iyan","kapag","kahit","lamang","lang","din","rin","po","opo","nga","raw","daw","yung","yun","talaga","pala","mula","hanggang","tayo","natin","nating","nilang","namin","kanila","kanyang","kanya","niya","ayon","umano","sinabi","araw","taon","bansa","gobyerno","pera","tao","lugar","tiempo"];

    const bisayaWords = ["ang","sa","nga","ug","ni","si","ako","ikaw","siya","kami","kamo","sila","kini","kana","kato","diri","didto","dapit","ngano","kinsa","unsa","kanus-a","asa","unsaon","wala","aduna","may","apan","pero","tungod","kay","para","bisan","lamang","lang","usab","sad","man","bitaw","gyud","jud","kaayo","dili","oo","mao","ingon","ayon","sulod","gawas","tawo","lugar","nasod","gobyerno","kwarta","adlaw","tuig","balaod","tinuod","bakak","balita","sugid","estorya","ingon","nabasa","nahibal","nasayod"];

    const textLower = text.toLowerCase();
    const tagalogCount = tagalogWords.filter(w => textLower.includes(` ${w} `) || textLower.startsWith(`${w} `)).length;
    const bisayaCount  = bisayaWords.filter(w => textLower.includes(` ${w} `) || textLower.startsWith(`${w} `)).length;

    let detectedLang = "English";
    let langNote = "";

    if (bisayaCount > tagalogCount && bisayaCount >= 3) {
        detectedLang = "Bisaya/Cebuano";
        langNote = "Bisaya/Cebuano";
    } else if (tagalogCount >= 3) {
        detectedLang = "Filipino/Tagalog";
        langNote = "Filipino/Tagalog";
    }

    // ── Build system prompt based on language ─────────────
    const systemPrompt = detectedLang === "English"
        ? `You are an expert fact-checker for a Philippine academic platform. Analyze the given text and return JSON ONLY with no markdown fences, no extra text.

Return this exact structure:
{"credibility":"True|False|Mixed|Unverified","confidence":<number 0-100>,"claims":"<brief summary of main claims>","explanation":"<clear explanation of your verdict>","supportingSources":["<url>"],"contradictingSources":["<url>"]}

Rules:
- confidence must be a real calculated number (not fixed)
- supportingSources and contradictingSources must be real, working URLs or empty arrays
- explanation must be clear and academic in tone
- Focus on Philippine context when relevant`

        : `Ikaw ay isang eksperto sa fact-checking para sa isang academic platform sa Pilipinas. Suriin ang tekstong ibinigay at ibalik ang JSON ONLY, walang markdown, walang dagdag na teksto.

Suportahan ang ${langNote} na wika. Unawain ang nilalaman kahit may halong Tagalog, Bisaya, o English (code-switching).

Ibalik ang eksaktong istruktura na ito:
{"credibility":"True|False|Mixed|Unverified","confidence":<numero 0-100>,"claims":"<maikling buod ng mga claim>","explanation":"<malinaw na paliwanag ng iyong verdict — maaaring sa Filipino o English>","supportingSources":["<url>"],"contradictingSources":["<url>"]}

Mga Panuntunan:
- Ang confidence ay dapat isang tunay na numerong kalkulado (hindi fixed)
- Ang supportingSources at contradictingSources ay dapat tunay na URL o empty arrays
- Ang explanation ay dapat malinaw at pang-akademikong tono
- Suriin ang kontekstong Pilipino kung relevant
- Kung Bisaya ang teksto, maaaring sagutin sa Filipino o English
- Unawain ang mga salitang Bisaya, Tagalog, at English na magkasamang ginagamit`;

    // ── Call Groq API ─────────────────────────────────────
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                max_tokens: 1000,
                messages: [
                    {
                        role: "system",
                        content: systemPrompt
                    },
                    {
                        role: "user",
                        content: `Suriin/Analyze this text:\n\n${text}`
                    }
                ]
            })
        });

        const data = await response.json();
        const raw  = data.choices?.[0]?.message?.content || "";

        try {
            const cleaned = raw.replace(/```json|```/g, "").trim();
            const parsed  = JSON.parse(cleaned);

            // Add detected language to response for debugging
            parsed.detectedLanguage = detectedLang;

            return res.json(parsed);
        } catch {
            return res.json({
                credibility: "Unverified",
                confidence: 0,
                claims: "Parse error",
                explanation: raw,
                detectedLanguage: detectedLang,
                supportingSources: [],
                contradictingSources: []
            });
        }

    } catch (err) {
        return res.json({
            credibility: "Unverified",
            confidence: 0,
            claims: "Server error",
            explanation: "Nagkaroon ng error sa pag-verify. Subukan muli.",
            detectedLanguage: detectedLang,
            supportingSources: [],
            contradictingSources: []
        });
    }
}
