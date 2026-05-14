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
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": "https://www.google.com/"
                },
                signal: AbortSignal.timeout(10000)
            });
            const html = await r.text();
            const $ = cheerio.load(html);
            $("script,style,nav,footer,header,aside,.ad,.advertisement,.sidebar").remove();

            let extracted = "";
            const selectors = ["article","main",".article-body",".post-content",".entry-content","#content",".content"];
            for (const sel of selectors) {
                const found = $(sel).text().trim();
                if (found.length > 200) { extracted = found; break; }
            }
            if (!extracted) extracted = $("body").text().trim();
            text = extracted.replace(/\s+/g, " ").trim().substring(0, 3000);
        } catch {
            return res.json({
                credibility: "Unverified",
                confidence: 0,
                claims: "URL fetch failed",
                explanation: "This website blocks automated access. Please copy and paste the article text directly into the text box instead.",
                supportingSources: [],
                contradictingSources: [],
                detectedLanguage: "English"
            });
        }
    }

    if (!text?.trim()) return res.status(400).json({ error: "No input" });

    // ── Detect language ───────────────────────────────────
    const tagalogWords = ["ang","ng","na","sa","at","ay","mga","ko","mo","siya","kami","namin","nila","ako","ikaw","sila","nito","niya","pero","kung","para","dahil","kaya","hindi","oo","wala","mayroon","dito","doon","bakit","paano","sino","ano","kailan","walang","may","ito","iyon","iyan","kapag","kahit","lamang","lang","din","rin","po","opo","nga","raw","daw","yung","yun","talaga","pala","mula","hanggang","tayo","natin","nating","nilang","namin","kanila","kanyang","kanya","niya","ayon","umano","sinabi","araw","taon","bansa","gobyerno","pera","tao","lugar","tiempo"];
    const bisayaWords  = ["ang","sa","nga","ug","ni","si","ako","ikaw","siya","kami","kamo","sila","kini","kana","kato","diri","didto","dapit","ngano","kinsa","unsa","kanus-a","asa","unsaon","wala","aduna","may","apan","pero","tungod","kay","para","bisan","lamang","lang","usab","sad","man","bitaw","gyud","jud","kaayo","dili","oo","mao","ingon","ayon","sulod","gawas","tawo","lugar","nasod","gobyerno","kwarta","adlaw","tuig","balaod","tinuod","bakak","balita","sugid","estorya","ingon","nabasa","nahibal","nasayod"];

    const textLower = text.toLowerCase();
    const tagalogCount = tagalogWords.filter(w => textLower.includes(` ${w} `) || textLower.startsWith(`${w} `)).length;
    const bisayaCount  = bisayaWords.filter(w =>  textLower.includes(` ${w} `) || textLower.startsWith(`${w} `)).length;

    let detectedLang = "English";
    let langNote = "";
    if (bisayaCount > tagalogCount && bisayaCount >= 3) {
        detectedLang = "Bisaya/Cebuano"; langNote = "Bisaya/Cebuano";
    } else if (tagalogCount >= 3) {
        detectedLang = "Filipino/Tagalog"; langNote = "Filipino/Tagalog";
    }

    // ── Detect if content is academic/research ────────────
    const academicKeywords = [
        "abstract","methodology","hypothesis","thesis","dissertation","research","study","findings",
        "conclusion","literature review","statistical","p-value","sample size","respondents",
        "quantitative","qualitative","peer-reviewed","journal","doi","citation","bibliography",
        "et al","ibid","op cit","null hypothesis","correlation","regression","survey","experiment",
        "data analysis","theoretical framework","conceptual framework","review of related literature",
        "pananaliksik","pag-aaral","metodolohiya","resulta","kongklusyon","natuklasan"
    ];
    const isAcademic = academicKeywords.some(kw => textLower.includes(kw));

    // ── Build system prompt ───────────────────────────────
    const currentYear = new Date().getFullYear();

    const englishPrompt = `You are an expert academic fact-checker and information verification specialist for a Philippine university platform (Validata GC, Gordon College). Your verdicts are authoritative, evidence-based, and final — they do not require external human review to be valid.

Analyze the submitted text thoroughly and return ONLY a valid JSON object with no markdown fences, no preamble, no extra text.

${isAcademic ? `IMPORTANT: This appears to be academic or research content. Your explanation MUST include APA 7th edition formatted citations for any sources, studies, or claims you reference. Format citations as: Author, A. A., & Author, B. B. (Year). Title of work. Source/Journal Name, Volume(Issue), pages. https://doi.org/xxxxx — or use (Author, Year) in-text style within the explanation.` : ""}

Return this exact JSON structure:
{
  "credibility": "True" | "False" | "Mixed" | "Unverified",
  "confidence": <integer 0-100, calculated from evidence strength — NOT a fixed value>,
  "claims": "<concise 1-2 sentence summary of the main claims in the submitted text>",
  "explanation": "<authoritative, detailed explanation of your verdict. State your finding directly and confidently. ${isAcademic ? "Include APA 7th edition in-text citations and a References section at the end of the explanation." : "Reference specific facts, known evidence, or logical inconsistencies that support your verdict."} Do NOT hedge with phrases like 'this may need further review' or 'a moderator should verify' — your analysis IS the verification.>",
  "supportingSources": ["<real, working URL that supports the credibility verdict>"],
  "contradictingSources": ["<real, working URL that contradicts the submitted claim>"]
}

Confidence scoring guide:
- 90-100: Clear, well-documented facts with strong evidence
- 70-89: Mostly accurate with minor unverifiable details
- 50-69: Mixed — some claims accurate, some questionable
- 30-49: Mostly unverified or lacking credible sources
- 0-29: Demonstrably false or highly misleading

Focus on Philippine context, laws, and institutions when relevant.
Only include URLs that you are confident are real and accessible.`;

    const filipinoPrompt = `Ikaw ay isang dalubhasang fact-checker at information verification specialist para sa isang unibersidad sa Pilipinas (Validata GC, Gordon College). Ang iyong mga verdict ay awtoritatibo, nakabatay sa ebidensya, at pinal — hindi na kailangan ng karagdagang human review para maging valid.

Suriin nang mabuti ang isinumiteng teksto at ibalik LAMANG ang isang valid na JSON object. Walang markdown fences, walang preamble, walang dagdag na teksto.

Sinusuportahan ang ${langNote} na wika kasama ang Taglish at Bislish (code-switching).

${isAcademic ? `MAHALAGA: Mukhang academic o research content ito. Ang iyong explanation ay DAPAT maglaman ng APA 7th edition formatted citations para sa anumang sources, pag-aaral, o claims na iyong binabanggit. Format: Author, A. A. (Taon). Pamagat ng gawa. Pangalan ng Journal, Volume(Issue), pahina. https://doi.org/xxxxx` : ""}

Ibalik ang eksaktong JSON structure na ito:
{
  "credibility": "True" | "False" | "Mixed" | "Unverified",
  "confidence": <integer 0-100, kalkulahin mula sa lakas ng ebidensya — HINDI fixed value>,
  "claims": "<maigsi na 1-2 pangungusap na buod ng mga pangunahing claim sa isinumiteng teksto>",
  "explanation": "<awtoritatibo at detalyadong paliwanag ng iyong verdict sa Filipino o English. Sabihin nang direkta at may kumpiyansa ang iyong natuklasan. ${isAcademic ? "Isama ang APA 7th edition in-text citations at References section sa dulo." : "I-reference ang mga tiyak na katotohanan, kilalang ebidensya, o lohikal na pagkakamali na sumusuporta sa iyong verdict."} HUWAG gumamit ng mga pariralang tulad ng 'kailangan pang i-review ng moderator' — ang iyong pagsusuri AY ang verification.>",
  "supportingSources": ["<tunay at gumaganang URL na sumusuporta sa verdict>"],
  "contradictingSources": ["<tunay at gumaganang URL na sumasalungat sa claim>"]
}

Gabay sa confidence scoring:
- 90-100: Malinaw at dokumentadong katotohanan na may matibay na ebidensya
- 70-89: Kadalasang tama na may ilang hindi ma-verify na detalye
- 50-69: Mixed — ilang claim ay tama, ilang claim ay kaduda-duda
- 30-49: Kadalasang hindi ma-verify o kulang sa mapagkakatiwalaang sources
- 0-29: Halatang mali o lubos na mapanlinlang

Bigyang-pansin ang kontekstong Pilipino, mga batas, at institusyon kung relevant.`;

    const systemPrompt = detectedLang === "English" ? englishPrompt : filipinoPrompt;

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
                max_tokens: 1500,
                temperature: 0.3,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user",   content: `Suriin/Analyze this text:\n\n${text}` }
                ]
            })
        });

        const data = await response.json();
        const raw  = data.choices?.[0]?.message?.content || "";

        try {
            const cleaned = raw.replace(/```json|```/g, "").trim();
            const parsed  = JSON.parse(cleaned);
            parsed.detectedLanguage = detectedLang;
            parsed.isAcademic       = isAcademic;
            return res.json(parsed);
        } catch {
            return res.json({
                credibility: "Unverified",
                confidence: 0,
                claims: "Parse error",
                explanation: raw,
                detectedLanguage: detectedLang,
                isAcademic,
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
            isAcademic,
            supportingSources: [],
            contradictingSources: []
        });
    }
}
