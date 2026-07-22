import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, runTransaction, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCuifhZ4I3_doR6N_2xdqMe3zUDMgjeeR0",
  authDomain: "grupo-cassol-2.firebaseapp.com",
  projectId: "grupo-cassol-2",
  storageBucket: "grupo-cassol-2.firebasestorage.app",
  messagingSenderId: "265678011446",
  appId: "1:265678011446:web:3e1e7737d1e6fd5fb26c97"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

window._fbDb    = db;
window._fbReady = false;

/* ── SAVE ── */
const saveQueues = new Map();

async function saveSafely(key, val) {
  const ref = doc(db, 'dados', key);
  const knownTs = Number(localStorage.getItem('_fbts_' + key) || 0);
  let conflict = null;

  try {
    const ts = await runTransaction(db, async transaction => {
      const current = await transaction.get(ref);
      const cloudTs = current.exists() ? Number(current.data().ts || 0) : 0;

      if (current.exists() && (knownTs === 0 || cloudTs > knownTs)) {
        conflict = { cloudTs };
        const error = new Error('O dado foi alterado por outra pessoa antes desta gravação.');
        error.code = 'stale-write';
        throw error;
      }

      const nextTs = Date.now();
      transaction.set(ref, { value: JSON.stringify(val), ts: nextTs });
      return nextTs;
    });

    localStorage.setItem('_fbts_' + key, ts.toString());
    return ts;
  } catch (e) {
    if (e?.code === 'stale-write') {
      console.warn('fbSave bloqueou uma gravação desatualizada:', key, conflict);
      setTimeout(() => window.location.reload(), 80);
    }
    console.warn('fbSave ERRO:', key, e.code, e.message);
    return false;
  }
}

window.fbSave = function(key, val) {
  const previous = saveQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(() => saveSafely(key, val));
  saveQueues.set(key, next);

  next.finally(() => {
    if (saveQueues.get(key) === next) saveQueues.delete(key);
  });

  return next;
};

/* ── GET ── */
window.fbGet = async function(key) {
  try {
    const snap = await getDoc(doc(db, 'dados', key));
    if (snap.exists()) return { value: JSON.parse(snap.data().value), ts: snap.data().ts || 0 };
    return null;
  } catch(e) { return null; }
};

/* ── LOAD ALL ── */
window.fbLoadAll = async function() {
  const KEYS = [
    'gc-events','gc-livros','gc-conteudos','gc-projetos',
    'gc-mentees','gc-mentees-marco0','gc-kanban','gc-steira',
    'gc-colab-ordem','gc-links','gc-gisella-checks','gc-links-empresa',
    'gc-fixed-gisella','gc-fixed-milena','gc-fixed-luiggi',
    'gc-fixed-checks-gisella','gc-fixed-checks-milena','gc-fixed-checks-luiggi',
    'gc-notas-gisella','gc-notas-milena','gc-notas-luiggi',
  ];
  const results = {};
  await Promise.all(KEYS.map(async key => {
    const res = await window.fbGet(key);
    if (res !== null) results[key] = res; // { value, ts }
  }));
  return results;
};

/* ── REAL-TIME LISTENER ── */
// Uses onSnapshot so every device sees changes immediately when another collaborator
// checks/unchecks a task. The timestamp guard prevents echoing this device's own saves.
window.fbListen = function(key, callback) {
  try {
    return onSnapshot(
      doc(db, 'dados', key),
      (snap) => {
        if (!snap.exists()) return;
        try {
          const data    = snap.data();
          const cloudTs = data.ts || 0;
          // Skip if this device was the last writer for this key
          const localTs = parseInt(localStorage.getItem('_fbts_' + key) || '0');
          if (cloudTs > 0 && cloudTs <= localTs) return;
          const val = JSON.parse(data.value);
          callback(val);
        } catch(e) {}
      },
      (err) => { console.warn('fbListen error:', key, err.message); }
    );
  } catch(e) { return null; }
};

window._fbReady = true;
window.dispatchEvent(new Event('firebase-ready'));
