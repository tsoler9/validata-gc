import { auth, getAdminProfile, onAuthStateChanged } from "../js/admin-firebase.js";

function requireAdmin(callback) {
    const overlay = document.createElement("div");
    overlay.id = "admin-auth-overlay";
    overlay.style.cssText = `
        position:fixed;inset:0;background:#070809;
        display:flex;align-items:center;justify-content:center;
        z-index:9999;transition:opacity 0.3s ease;
    `;
    overlay.innerHTML = `
        <div style="text-align:center;">
            <div style="
                width:2.5rem;height:2.5rem;
                border:3px solid #1c2028;border-top-color:#6366f1;
                border-radius:50%;animation:adminSpin 0.7s linear infinite;
                margin:0 auto 1rem;
            "></div>
            <p style="font-family:'Space Grotesk',sans-serif;font-size:0.825rem;color:#454960;">
                Verifying administrator access…
            </p>
        </div>
        <style>@keyframes adminSpin{to{transform:rotate(360deg);}}</style>`;
    document.body.appendChild(overlay);

    onAuthStateChanged(auth, async (user) => {
        if (!user) { window.location.href = "login.html"; return; }

        const profile = await getAdminProfile(user);
        if (!profile || profile.status !== "active") {
            window.location.href = "login.html"; return;
        }

        _populateNav(profile);
        overlay.style.opacity = "0";
        setTimeout(() => overlay.remove(), 300);
        if (callback) callback(profile);
    });
}

function _populateNav(profile) {
    const nameEl   = document.querySelector("[data-admin-name]");
    const roleEl   = document.querySelector("[data-admin-role]");
    const avatarEl = document.querySelector("[data-admin-avatar]");
    if (nameEl)   nameEl.textContent   = profile.name  || profile.email;
    if (roleEl)   roleEl.textContent   = "System Administrator";
    if (avatarEl) avatarEl.textContent = (profile.name || profile.email || "A")[0].toUpperCase();
}

export { requireAdmin };