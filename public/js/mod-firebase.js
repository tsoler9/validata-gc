import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

// ── Same Firebase project as student app ──
const firebaseConfig = {
    apiKey: "AIzaSyCn3wV080rAa2sXUJNbK1HjTFDsqLzVO44",
    authDomain: "project-469-71975.firebaseapp.com",
    projectId: "project-469-71975",
    storageBucket: "project-469-71975.firebasestorage.app",
    messagingSenderId: "836415115682",
    appId: "1:836415115682:web:5d21ebdebcc981f3b522fb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── AUTH ──────────────────────────────────────────────────

/**
 * Sign in a moderator with email + password.
 * Returns { user, role } if successful and user has moderator/admin role.
 * Returns { error } if credentials are wrong or role is not allowed.
 */
async function modSignIn(email, password) {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user   = result.user;

        // Check Firestore for moderator role
        const roleDoc = await getDoc(doc(db, "moderators", user.uid));

        if (!roleDoc.exists()) {
            await signOut(auth);
            return { error: "Access denied. Your account is not registered as a moderator." };
        }

        const data = roleDoc.data();

        if (data.status !== "active") {
            await signOut(auth);
            return { error: "Your moderator account has been deactivated. Contact the administrator." };
        }

        return { user, role: data.role, name: data.name };

    } catch (err) {
        // Firebase auth error codes
        const msgs = {
            "auth/user-not-found":   "No account found with that email.",
            "auth/wrong-password":   "Incorrect password. Please try again.",
            "auth/invalid-email":    "Please enter a valid email address.",
            "auth/too-many-requests":"Too many failed attempts. Try again later.",
            "auth/invalid-credential": "Incorrect email or password."
        };
        return { error: msgs[err.code] || "Login failed. Please try again." };
    }
}

/** Sign out the current moderator and redirect to login. */
async function modSignOut() {
    await signOut(auth);
    window.location.href = "login.html";
}

/**
 * Get the currently signed-in moderator's profile from Firestore.
 * Returns null if not signed in or not a moderator.
 */
async function getModProfile(user) {
    try {
        const snap = await getDoc(doc(db, "moderators", user.uid));
        if (!snap.exists()) return null;
        return { uid: user.uid, email: user.email, ...snap.data() };
    } catch {
        return null;
    }
}

// ── CLAIMS (reads from student "history" collection) ─────

/**
 * Get all student fact-check submissions, newest first.
 * Moderators review these and approve/reject the AI verdicts.
 */
async function getClaims(filters = {}) {
    try {
        let q = collection(db, "history");

        const constraints = [orderBy("createdAt", "desc")];

        if (filters.status && filters.status !== "all") {
            constraints.push(where("moderatorStatus", "==", filters.status));
        }

        q = query(collection(db, "history"), ...constraints);
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("getClaims error:", err.message);
        return [];
    }
}

/**
 * Update a claim's moderation status.
 * status: "approved" | "rejected" | "escalated"
 */
async function updateClaimStatus(claimId, status, moderatorNote, moderatorUid) {
    try {
        await updateDoc(doc(db, "history", claimId), {
            moderatorStatus:  status,
            moderatorNote:    moderatorNote || "",
            moderatedBy:      moderatorUid,
            moderatedAt:      serverTimestamp()
        });
        return { success: true };
    } catch (err) {
        return { error: err.message };
    }
}

// ── SOURCES ───────────────────────────────────────────────

/** Get all trusted sources. */
async function getSources() {
    try {
        const snap = await getDocs(collection(db, "trustedSources"));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("getSources error:", err.message);
        return [];
    }
}

/** Add a new trusted source. */
async function addSource(sourceData, moderatorUid) {
    try {
        const ref = await addDoc(collection(db, "trustedSources"), {
            ...sourceData,
            addedBy:   moderatorUid,
            active:    true,
            createdAt: serverTimestamp()
        });
        return { id: ref.id };
    } catch (err) {
        return { error: err.message };
    }
}

/** Toggle a source active/inactive. */
async function toggleSource(sourceId, active) {
    try {
        await updateDoc(doc(db, "trustedSources", sourceId), { active });
        return { success: true };
    } catch (err) {
        return { error: err.message };
    }
}

/** Delete a source permanently. */
async function deleteSource(sourceId) {
    try {
        await deleteDoc(doc(db, "trustedSources", sourceId));
        return { success: true };
    } catch (err) {
        return { error: err.message };
    }
}

// ── MISINFO TAGS ──────────────────────────────────────────

/** Get all misinformation tags. */
async function getTags() {
    try {
        const snap = await getDocs(collection(db, "misinfoTags"));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("getTags error:", err.message);
        return [];
    }
}

/** Add a new misinfo tag. */
async function addTag(label, moderatorUid) {
    try {
        const ref = await addDoc(collection(db, "misinfoTags"), {
            label,
            count:     0,
            flagged:   false,
            addedBy:   moderatorUid,
            createdAt: serverTimestamp()
        });
        return { id: ref.id };
    } catch (err) {
        return { error: err.message };
    }
}

/** Toggle a tag's flagged state. */
async function toggleTagFlag(tagId, flagged) {
    try {
        await updateDoc(doc(db, "misinfoTags", tagId), { flagged });
        return { success: true };
    } catch (err) {
        return { error: err.message };
    }
}

// ── ACTIVITY LOG ──────────────────────────────────────────

/** Log a moderator action to Firestore for audit trail. */
async function logActivity(moderatorUid, action, details) {
    try {
        await addDoc(collection(db, "modActivity"), {
            moderatorUid,
            action,
            details,
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.warn("logActivity failed:", err.message);
    }
}

export {
    auth, db,
    modSignIn, modSignOut, getModProfile,
    getClaims, updateClaimStatus,
    getSources, addSource, toggleSource, deleteSource,
    getTags, addTag, toggleTagFlag,
    logActivity,
    onAuthStateChanged
};
