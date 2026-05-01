import { initializeApp }   from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import {
    getAuth, signInWithEmailAndPassword,
    signOut, onAuthStateChanged, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
    getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
    collection, getDocs, query, where, orderBy, limit,
    serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey:            "AIzaSyCn3wV080rAa2sXUJNbK1HjTFDsqLzVO44",
    authDomain:        "project-469-71975.firebaseapp.com",
    projectId:         "project-469-71975",
    storageBucket:     "project-469-71975.firebasestorage.app",
    messagingSenderId: "836415115682",
    appId:             "1:836415115682:web:5d21ebdebcc981f3b522fb"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── AUTH ────────────────────────────────────────────────

async function adminSignIn(email, password) {
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        const user   = result.user;

        const snap = await getDoc(doc(db, "admins", user.uid));
        if (!snap.exists() || snap.data().status !== "active") {
            await signOut(auth);
            return { error: "Access denied. Your account is not registered as a system administrator." };
        }

        return { user, ...snap.data() };
    } catch (err) {
        const msgs = {
            "auth/user-not-found":     "No account found with that email.",
            "auth/wrong-password":     "Incorrect password.",
            "auth/invalid-email":      "Invalid email address.",
            "auth/too-many-requests":  "Too many attempts. Try again later.",
            "auth/invalid-credential": "Incorrect email or password."
        };
        return { error: msgs[err.code] || "Login failed. Please try again." };
    }
}

async function adminSignOut() {
    await signOut(auth);
    window.location.href = "login.html";
}

async function getAdminProfile(user) {
    try {
        const snap = await getDoc(doc(db, "admins", user.uid));
        if (!snap.exists()) return null;
        return { uid: user.uid, email: user.email, ...snap.data() };
    } catch { return null; }
}

// ── RBAC — USER MANAGEMENT ──────────────────────────────

async function getAllUsers() {
    try {
        const [studSnap, modSnap, admSnap] = await Promise.all([
            getDocs(query(collection(db, "history"), orderBy("createdAt","desc"), limit(200))),
            getDocs(collection(db, "moderators")),
            getDocs(collection(db, "admins"))
        ]);

        // Unique students from history
        const studentMap = {};
        studSnap.docs.forEach(d => {
            const data = d.data();
            if (data.userId && !studentMap[data.userId]) {
                studentMap[data.userId] = {
                    uid: data.userId,
                    email: data.userEmail || "guest",
                    role: "student",
                    status: "active",
                    lastActive: data.createdAt
                };
            }
        });

        const moderators = modSnap.docs.map(d => ({
            uid: d.id, ...d.data(), role: d.data().role || "moderator"
        }));

        const admins = admSnap.docs.map(d => ({
            uid: d.id, ...d.data(), role: "admin"
        }));

        return {
            students:   Object.values(studentMap),
            moderators,
            admins
        };
    } catch (err) {
        console.error("getAllUsers:", err.message);
        return { students: [], moderators: [], admins: [] };
    }
}

async function createModerator(email, password, name) {
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "moderators", cred.user.uid), {
            name, email, role: "moderator", status: "active",
            createdAt: serverTimestamp()
        });
        return { uid: cred.user.uid };
    } catch (err) {
        return { error: err.message };
    }
}

async function updateUserStatus(collection_name, uid, status) {
    try {
        await updateDoc(doc(db, collection_name, uid), { status });
        return { success: true };
    } catch (err) { return { error: err.message }; }
}

async function updateUserRole(uid, newRole) {
    try {
        // Move between collections based on role
        const fromCol = newRole === "moderator" ? "admins" : "moderators";
        const toCol   = newRole === "moderator" ? "moderators" : "admins";
        const snap    = await getDoc(doc(db, fromCol, uid));
        if (snap.exists()) {
            await setDoc(doc(db, toCol, uid), { ...snap.data(), role: newRole });
            await deleteDoc(doc(db, fromCol, uid));
        }
        return { success: true };
    } catch (err) { return { error: err.message }; }
}

// ── AUDIT TRAIL ─────────────────────────────────────────

async function getAuditLogs(filters = {}) {
    try {
        const constraints = [orderBy("timestamp", "desc"), limit(200)];
        const q = query(collection(db, "modActivity"), ...constraints);
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("getAuditLogs:", err.message);
        return [];
    }
}

async function getHistoryLogs() {
    try {
        const q = query(collection(db, "history"), orderBy("createdAt","desc"), limit(200));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
        console.error("getHistoryLogs:", err.message);
        return [];
    }
}

// ── AI CONFIG ───────────────────────────────────────────

async function getAiConfig() {
    try {
        const snap = await getDoc(doc(db, "systemConfig", "aiConfig"));
        if (snap.exists()) return snap.data();
        // Return defaults if not set
        return {
            confidenceThreshold:  70,
            falseScoreThreshold:  30,
            mixedScoreThreshold:  60,
            trueScoreThreshold:   80,
            maxTextLength:        3000,
            enableUrlFetching:    true,
            enableSourceCiting:   true,
            groqModel:            "llama-3.1-8b-instant",
            maxTokens:            1000,
            systemPromptMode:     "strict",
            updatedAt:            null
        };
    } catch { return {}; }
}

async function saveAiConfig(config, adminUid) {
    try {
        await setDoc(doc(db, "systemConfig", "aiConfig"), {
            ...config, updatedBy: adminUid, updatedAt: serverTimestamp()
        });
        await addDoc(collection(db, "adminActivity"), {
            adminUid, action: "ai_config_updated",
            details: config, timestamp: serverTimestamp()
        });
        return { success: true };
    } catch (err) { return { error: err.message }; }
}

// ── BACKUP / SECURITY ───────────────────────────────────

async function getSystemStats() {
    try {
        const [histSnap, modSnap, srcSnap, tagSnap, qcSnap, auditSnap] = await Promise.all([
            getDocs(collection(db, "history")),
            getDocs(collection(db, "moderators")),
            getDocs(collection(db, "trustedSources")),
            getDocs(collection(db, "misinfoTags")),
            getDocs(collection(db, "qcReports")),
            getDocs(collection(db, "modActivity"))
        ]);
        return {
            totalClaims:    histSnap.size,
            totalModerators: modSnap.size,
            totalSources:   srcSnap.size,
            totalTags:      tagSnap.size,
            totalQcReports: qcSnap.size,
            totalAuditLogs: auditSnap.size
        };
    } catch { return {}; }
}

async function exportCollection(colName) {
    try {
        const snap = await getDocs(collection(db, colName));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) { return []; }
}

async function logAdminActivity(adminUid, action, details) {
    try {
        await addDoc(collection(db, "adminActivity"), {
            adminUid, action, details, timestamp: serverTimestamp()
        });
    } catch {}
}

export {
    auth, db,
    adminSignIn, adminSignOut, getAdminProfile, onAuthStateChanged,
    getAllUsers, createModerator, updateUserStatus, updateUserRole,
    getAuditLogs, getHistoryLogs,
    getAiConfig, saveAiConfig,
    getSystemStats, exportCollection,
    logAdminActivity,
    serverTimestamp, collection, addDoc, doc, setDoc, getDoc, updateDoc, deleteDoc
};