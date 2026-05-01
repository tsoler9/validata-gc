/**
 * mod-auth.js
 * ─────────────────────────────────────────────────────────
 * Drop this into any moderator page to protect it.
 *
 * Usage (in every protected moderator page):
 *
 *   <script type="module">
 *     import { requireMod } from "../js/mod-auth.js";
 *     requireMod((profile) => {
 *       // page init code — only runs if user is a verified moderator
 *       document.getElementById("modName").textContent = profile.name;
 *     });
 *   </script>
 */

import {
    auth,
    getModProfile,
    onAuthStateChanged
} from "../js/mod-firebase.js";

/**
 * requireMod(callback)
 *
 * - Shows a loading overlay while auth state resolves.
 * - If the user is not signed in → redirects to login.html.
 * - If the user is signed in but NOT a moderator → redirects to login.html.
 * - If the user is a verified, active moderator → hides overlay, calls callback(profile).
 */
function requireMod(callback) {
    // Inject loading overlay so page content doesn't flash
    const overlay = document.createElement("div");
    overlay.id = "mod-auth-overlay";
    overlay.style.cssText = `
        position: fixed; inset: 0;
        background: #0a0b0f;
        display: flex; align-items: center; justify-content: center;
        z-index: 9999;
        transition: opacity 0.3s ease;
    `;
    overlay.innerHTML = `
        <div style="text-align:center;">
            <div style="
                width: 2.5rem; height: 2.5rem;
                border: 3px solid #1e2030;
                border-top-color: #3b6ef8;
                border-radius: 50%;
                animation: modSpin 0.7s linear infinite;
                margin: 0 auto 1rem;
            "></div>
            <p style="font-family: 'DM Sans', sans-serif; font-size: 0.85rem; color: #4a5068;">
                Verifying access…
            </p>
        </div>
        <style>
            @keyframes modSpin { to { transform: rotate(360deg); } }
        </style>
    `;
    document.body.appendChild(overlay);

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const profile = await getModProfile(user);

        if (!profile || profile.status !== "active") {
            window.location.href = "login.html";
            return;
        }

        // Auth confirmed — populate shared nav elements if present
        _populateNav(profile);

        // Fade out overlay
        overlay.style.opacity = "0";
        setTimeout(() => overlay.remove(), 300);

        // Run page-specific init
        if (callback) callback(profile);
    });
}

/**
 * Populate shared nav elements across all moderator pages.
 * Looks for elements with data-mod-* attributes.
 */
function _populateNav(profile) {
    const nameEl   = document.querySelector("[data-mod-name]");
    const roleEl   = document.querySelector("[data-mod-role]");
    const emailEl  = document.querySelector("[data-mod-email]");
    const avatarEl = document.querySelector("[data-mod-avatar]");

    if (nameEl)   nameEl.textContent  = profile.name  || profile.email;
    if (roleEl)   roleEl.textContent  = _formatRole(profile.role);
    if (emailEl)  emailEl.textContent = profile.email;
    if (avatarEl) avatarEl.textContent = (profile.name || profile.email || "M")[0].toUpperCase();
}

function _formatRole(role) {
    const labels = {
        moderator: "Fact-Check Moderator",
        senior_moderator: "Senior Moderator",
        admin: "Administrator"
    };
    return labels[role] || "Moderator";
}

export { requireMod };