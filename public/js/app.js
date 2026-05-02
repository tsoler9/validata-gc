// ==========================
// STEP 1: INPUT PAGE
// ==========================
function startVerification() {
    const newsText = document.getElementById('newsText').value;
    const url = document.getElementById('url').value;

    if (newsText.trim() || url.trim()) {

        localStorage.removeItem("aiResult");

        // ✅ FIX: always reset isFromHistory on a fresh verification
        localStorage.setItem("isFromHistory", "false");

        localStorage.setItem("inputData", newsText || "");
        localStorage.setItem("inputUrl", url || "");

        console.log("Input saved:", newsText || url);

        window.location.href = "loading.html";

    } else {
        alert("Please enter some text or URL.");
    }
}

// ==========================
// STEP 2: LOADING PAGE (AI CALL HERE)
// ==========================
async function runAI() {
    const text = localStorage.getItem("inputData") || "";
    const url = localStorage.getItem("inputUrl") || "";

    if (!text.trim() && !url.trim()) {
        alert("No input found.");
        window.location.href = "input.html";
        return;
    }

    try {
        console.log("Sending to backend:", text || url);

        const response = await fetch("/api/verify", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text, url })
        });

        const data = await response.json();

        console.log("AI RESULT:", data);

        if (!response.ok) {
            throw new Error("Server error");
        }

        localStorage.setItem("aiResult", JSON.stringify(data));
        // ✅ FIX: explicitly mark as NOT from history before going to result
        localStorage.setItem("isFromHistory", "false");

        window.location.href = "result.html";

    } catch (error) {
        console.error("AI ERROR:", error);
        alert("Something went wrong. Please try again.");
        localStorage.setItem("isFromHistory", "false");
        window.location.href = "result.html";
    }
}
