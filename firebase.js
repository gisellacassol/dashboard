import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

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
window.fbSave = async function(key, val) {
  try {
    const ts = Date.now();
    await setDoc(doc(db, 'dados', key), { value: JSON.stringify(val), ts });
    // Store timestamp AFTER confirmed write so echo-prevention works
    localStorage.setItem('_fbts_' + key, ts.toString());
    return ts;
  } catch(e) {
    console.warn('fbSave ERRO:', key, e.code, e.message);
    return false;
  }
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
