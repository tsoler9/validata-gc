import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();

app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

async function fetchArticleText(url) {
    try {
        // AbortController for timeout (works with node-fetch v3)
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            signal: controller.signal,
           headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache",
            "Referer": "https://www.google.com/"
        }
        });

        clearTimeout(timeout);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        $("script, style, nav, footer, header, aside, .ad, .advertisement, .sidebar").remove();

        let text = "";
        const selectors = ["article", "main", ".article-body", ".post-content", ".entry-content", "#content", ".content"];

        for (const selector of selectors) {
            const found = $(selector).text().trim();
            if (found.length > 200) {
                text = found;
                break;
            }
        }

        if (!text) text = $("body").text().trim();

        text = text.replace(/\s+/g, " ").trim();
        return text.substring(0, 3000);

    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("URL request timed out after 10 seconds.");
        }
        throw new Error("Could not fetch URL: " + error.message);
    }
}

app.post("/verify", async (req, res) => {
    console.log("REQUEST HIT");
    console.log("BODY:", req.body);

    let { text, url } = req.body;

    if (url && url.trim()) {
        try {
            console.log("Fetching URL:", url);
            text = await fetchArticleText(url.trim());
            console.log("Extracted text length:", text.length);
            console.log("Preview:", text.substring(0, 200));
        } catch (error) {
        console.error("URL fetch error:", error.message);
        return res.json({
            credibility: "Unverified",
            confidence: 0,
            claims: "URL fetch failed",
            explanation: "This website blocks automated access. Please copy and paste the article text directly into the text box instead.",
            supportingSources: [],
            contradictingSources: []
        });
    }
    }

    if (!text || !text.trim()) {
        return res.status(400).json({ error: "No text or URL provided" });
    }

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "user",
                        content: `Analyze this content and return JSON ONLY with no markdown fences. The confidence field must be a real number from 0 to 100 reflecting how confident you are in your credibility assessment — do NOT use a fixed value, calculate it based on the evidence:
{
  "credibility": "True | False | Unverified | Mixed",
  "confidence": number from 0 to 100,
  "claims": "short identified claims",
  "explanation": "short explanation",
  "supportingSources": ["url1"],
  "contradictingSources": ["url1"]
}

Text: ${text}`
                    }
                ]
            })
        });

        const data = await response.json();
        console.log("GROQ RAW:", JSON.stringify(data, null, 2));

        const raw = data.choices?.[0]?.message?.content;

        if (!raw) {
            return res.json({
                credibility: "Cannot verify",
                confidence: 0,
                claims: "No response",
                explanation: "None.",
                supportingSources: [],
                contradictingSources: []
            });
        }

        const cleaned = raw
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch (e) {
            console.error("JSON PARSE ERROR:", e.message);
            return res.json({
                credibility: "Cannot verify",
                confidence: 0,
                claims: "Parsing failed",
                explanation: cleaned,
                supportingSources: [],
                contradictingSources: []
            });
        }

        res.json(parsed);

    } catch (error) {
        console.error("SERVER ERROR:", error.message);
        res.json({
            credibility: "Cannot verify",
            confidence: 0,
            claims: "Error occurred",
            explanation: "Groq API call failed: " + error.message,
            supportingSources: [],
            contradictingSources: []
        });
    }
});

process.on("uncaughtException", (err) => {
    console.error("CRASH:", err.message);
});

process.on("unhandledRejection", (err) => {
    console.error("UNHANDLED:", err.message);
});

app.listen(3000, () => {
    console.log("Server running at http://127.0.0.1:3000");
    console.log("Groq API key loaded:", process.env.GROQ_API_KEY ? "YES ✓" : "NO ✗ — check your .env file");
});
