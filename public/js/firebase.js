import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCn3wV080rAa2sXUJNbK1HjTFDsqLzVO44",
    authDomain: "project-469-71975.firebaseapp.com",
    projectId: "project-469-71975",
    storageBucket: "project-469-71975.firebasestorage.app",
    messagingSenderId: "836415115682",
    appId: "1:836415115682:web:5d21ebdebcc981f3b522fb",
    measurementId: "G-TYRPZDXC52"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Force account picker every time
provider.setCustomParameters({ prompt: "select_account" });

const ALLOWED_DOMAIN = "gordoncollege.edu.ph";

// Sign in with Google — blocks non-gordoncollege emails
async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        const email = result.user.email;

        if (!email.endsWith("@" + ALLOWED_DOMAIN)) {
            await signOut(auth);
            return null; // login.html handles the error message
        }

        return result.user;
    } catch (error) {
        console.error("Sign in error:", error.message);
        return null;
    }
}

// Sign out and redirect to login
async function logOut() {
    await signOut(auth);
    window.location.href = "login.html";
}

// Save a verification result to Firestore
async function saveHistory(user, inputText, result) {
    try {
        await addDoc(collection(db, "history"), {
            userId: user.uid,
            userEmail: user.email,
            inputText: inputText,
            credibility: result.credibility || "Unverified",
            confidence: result.confidence || 0,
            claims: result.claims || "",
            explanation: result.explanation || "",
            supportingSources: result.supportingSources || [],
            contradictingSources: result.contradictingSources || [],
            createdAt: new Date()
        });
        console.log("History saved to Firebase.");
    } catch (error) {
        console.error("Failed to save history:", error.message);
    }
}

// Get history for logged-in user (newest first)
async function getHistory(user) {
    try {
        const q = query(
            collection(db, "history"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc")
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Failed to get history:", error.message);
        return [];
    }
}

// Update navbar: adds History link + user email + logout when logged in
function updateNavbar(user) {
    const navLinks = document.querySelector(".nav-links");
    if (!navLinks) return;

    const existing = document.getElementById("nav-auth");
    if (existing) existing.remove();

    const authDiv = document.createElement("div");
    authDiv.id = "nav-auth";
    authDiv.style.cssText = "display:flex;align-items:center;gap:1rem;";

    if (user) {
        authDiv.innerHTML = `
            <a href="history.html" class="nav-link">History</a>
            <span style="font-size:0.8rem;color:#6b7280;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${user.email}</span>
            <button onclick="window.logOut()" style="padding:0.35rem 0.85rem;background:#2563eb;color:white;border:none;border-radius:0.375rem;cursor:pointer;font-size:0.8rem;font-family:inherit;font-weight:500;">Logout</button>
        `;
    } else {
        authDiv.innerHTML = `
            <a href="login.html" class="nav-link" style="color:#2563eb;font-weight:500;">Login</a>
        `;
    }

    navLinks.appendChild(authDiv);
}

// Use on pages that require login — redirects guests to login.html
function requireAuth(callback) {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = "login.html";
        } else {
            updateNavbar(user);
            if (callback) callback(user);
        }
    });
}

// Use on pages that don't require login — just updates the navbar
function initNav() {
    onAuthStateChanged(auth, (user) => {
        updateNavbar(user);
    });
}

window.logOut = logOut;

export { auth, db, signInWithGoogle, logOut, saveHistory, getHistory, requireAuth, initNav };