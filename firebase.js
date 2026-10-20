import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, deleteDoc, runTransaction, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, browserLocalPersistence, setPersistence, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

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
const auth = getAuth(app);

const DASHBOARD_AUTH_DOMAIN = 'dashboard.grupocassol.local';
let dashboardAuthResolved = false;
let dashboardAuthProfile = null;
let resolveDashboardAuth;
const dashboardAuthReady = new Promise(resolve => { resolveDashboardAuth = resolve; });

function normalizedDashboardUser(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function dashboardAuthEmail(username) {
  const normalized = normalizedDashboardUser(username);
  const authName = normalized === 'marilia' ? 'marilia2' : normalized;
  return `${authName}@${DASHBOARD_AUTH_DOMAIN}`;
}

async function profileFromFirebaseUser(user, forceRefresh = false) {
  if (!user) return null;
  if (forceRefresh) await user.getIdToken(true);
  const email = String(user.email || '').toLowerCase();
  if (!email.endsWith(`@${DASHBOARD_AUTH_DOMAIN}`)) return null;
  const authName = normalizedDashboardUser(email.split('@')[0]);
  const dashboardUser = authName === 'marilia2' ? 'marilia' : authName;
  if (!['gisella','milena','luiggi','marilia','bruna','vera'].includes(dashboardUser)) return null;
  return { user: dashboardUser, uid: user.uid, email: user.email || '' };
}

onAuthStateChanged(auth, async user => {
  try {
    dashboardAuthProfile = await profileFromFirebaseUser(user);
  } catch (error) {
    console.warn('Não foi possível restaurar a sessão do Dashboard:', error.message);
    dashboardAuthProfile = null;
  }
  dashboardAuthResolved = true;
  resolveDashboardAuth?.(dashboardAuthProfile);
  window.dispatchEvent(new CustomEvent('firebase-dashboard-auth-changed', { detail: dashboardAuthProfile }));
});

window.firebaseDashboardSession = async function() {
  if (!dashboardAuthResolved) await dashboardAuthReady;
  return dashboardAuthProfile;
};

window.firebaseDashboardLogin = async function(username, password) {
  await setPersistence(auth, browserLocalPersistence);
  const expectedUser = normalizedDashboardUser(username);
  const credential = await signInWithEmailAndPassword(auth, dashboardAuthEmail(expectedUser), password);
  const profile = await profileFromFirebaseUser(credential.user, true);
  if (!profile || profile.user !== expectedUser) {
    await signOut(auth);
    throw new Error('Esta conta não possui acesso ao Dashboard.');
  }
  dashboardAuthProfile = profile;
  return profile;
};

window.firebaseDashboardLogout = async function() {
  dashboardAuthProfile = null;
  await signOut(auth);
};

window.firebaseCreatePublicCalendarLink = async function(month, project) {
  const profile = await window.firebaseDashboardSession();
  if (!profile || !['gisella','milena','luiggi'].includes(profile.user)) throw new Error('Esta conta não pode criar links públicos.');
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(String(month || '')) || !/^[a-z0-9-]{1,80}$/.test(String(project || ''))) {
    throw new Error('Mês ou projeto inválido.');
  }
  const main = await getDoc(doc(db, 'dados', 'gc-conteudos'));
  const contents = main.exists() ? JSON.parse(main.data().value || '[]') : [];
  const visible = publicCalendarContents(contents, month, project);
  if (!visible.length) throw new Error('Este projeto não possui conteúdos no mês escolhido.');
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  await setDoc(doc(db, 'public_calendars', token), {
    value: JSON.stringify({ month, project, contents: visible }),
    updatedAt: Date.now(),
  });
  return { ok: true, token };
};

window._fbDb    = db;
window._fbReady = false;

const BRUNA_DIRECT_FIREBASE_KEYS = new Set(['gc-notas-bruna']);
const BRUNA_RESTRICTED_FIREBASE_KEYS = new Set(['gc-events', 'gc-conteudos', 'gc-livros', 'gc-recurring-tasks', 'gc-site-products']);
function currentFirebaseUser() {
  return dashboardAuthProfile?.user || String(localStorage.getItem('gc-session-user') || '').toLowerCase();
}
function firebaseKeyAllowed(key) {
  return currentFirebaseUser() !== 'bruna' || BRUNA_DIRECT_FIREBASE_KEYS.has(key) || BRUNA_RESTRICTED_FIREBASE_KEYS.has(key);
}
function usesRestrictedDashboardTransport(key) {
  return currentFirebaseUser() === 'bruna' && BRUNA_RESTRICTED_FIREBASE_KEYS.has(key);
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function belongsToEditoraCassol(item) {
  return Boolean(item && typeof item === 'object' && String(item.empresa || '').split(',').map(normalize).includes('editora'));
}

function isBookArtStage(stage) {
  return Boolean(stage && typeof stage === 'object' && normalize(stage.nome) === 'criar arte para o site');
}

function isBrunaBookArtStage(stage) {
  return isBookArtStage(stage) && normalize(stage.executar || stage.resp) === 'bruna';
}

function restrictBookForBruna(item) {
  if (!belongsToEditoraCassol(item)) return null;
  const stages = Array.isArray(item.etapas) ? item.etapas.filter(isBookArtStage) : [];
  if (item.catalogOnly === true) {
    return {
      id:item.id, titulo:item.titulo, empresa:item.empresa, catalogOnly:true,
      info:item.info && typeof item.info === 'object' ? item.info : {},
      links:item.links && typeof item.links === 'object' ? item.links : {}, etapas:[],
    };
  }
  if (!stages.length) return null;
  return {
    id:item.id, titulo:item.titulo, empresa:item.empresa,
    info:item.info && typeof item.info === 'object' ? item.info : {},
    links:item.links && typeof item.links === 'object' ? item.links : {},
    etapas:stages.map(stage => ({...stage})),
  };
}

function restrictForBruna(key, items) {
  const list = Array.isArray(items) ? items : [];
  return key === 'gc-livros' ? list.map(restrictBookForBruna).filter(Boolean) : list.filter(belongsToEditoraCassol);
}

function mergeBrunaIntoMain(key, mainItems, restrictedItems) {
  const main = Array.isArray(mainItems) ? mainItems : [];
  const incoming = Array.isArray(restrictedItems) ? restrictedItems : [];
  if (key !== 'gc-livros') return [...main.filter(item => !belongsToEditoraCassol(item)), ...incoming];
  const incomingById = new Map(incoming.map(item => [String(item.id), item]));
  const merged = main.map(item => {
    const update = incomingById.get(String(item.id));
    if (!update) return item;
    if (item.catalogOnly === true && update.catalogOnly === true) return {...update, id:item.id, empresa:item.empresa};
    const incomingStage = Array.isArray(update.etapas) ? update.etapas.find(isBrunaBookArtStage) : null;
    if (!incomingStage || !Array.isArray(item.etapas)) return item;
    return {...item, etapas:item.etapas.map(stage => isBookArtStage(stage) ? {
      ...stage, feito:Boolean(incomingStage.feito), prazo:String(incomingStage.prazo || ''),
      link:String(incomingStage.link || ''), resp:'Bruna',
    } : stage)};
  });
  const existingIds = new Set(main.map(item => String(item.id)));
  incoming.forEach(item => { if (!existingIds.has(String(item.id)) && item.catalogOnly === true) merged.push(item); });
  return merged;
}

function restrictedRef(key) {
  return doc(db, 'dados_restritos', `bruna__${key}`);
}

function parseStoredDocument(snapshot) {
  if (!snapshot.exists()) return { value:[], ts:0, brunaTs:0 };
  try {
    const value = JSON.parse(snapshot.data().value || '[]');
    return { value:Array.isArray(value) ? value : [], ts:Number(snapshot.data().ts || 0), brunaTs:Number(snapshot.data().brunaTs || 0) };
  } catch (_) { return { value:[], ts:Number(snapshot.data().ts || 0), brunaTs:Number(snapshot.data().brunaTs || 0) }; }
}

async function reconcileBrunaMirror(key) {
  if (!BRUNA_RESTRICTED_FIREBASE_KEYS.has(key) || currentFirebaseUser() === 'bruna') return null;
  const mainRef = doc(db, 'dados', key);
  const mirrorRef = restrictedRef(key);
  return runTransaction(db, async transaction => {
    const [mainSnap, mirrorSnap] = await Promise.all([transaction.get(mainRef), transaction.get(mirrorRef)]);
    const main = parseStoredDocument(mainSnap);
    const mirror = parseStoredDocument(mirrorSnap);
    if (!mirrorSnap.exists() || mirror.ts <= main.brunaTs) return mainSnap.exists() ? main : null;
    const value = mergeBrunaIntoMain(key, main.value, mirror.value);
    const ts = Math.max(Date.now(), main.ts + 1);
    transaction.set(mainRef, { value:JSON.stringify(value), ts, brunaTs:mirror.ts }, { merge:true });
    return { value, ts, brunaTs:mirror.ts };
  });
}

function publicCalendarContents(contents, month, project) {
  return (Array.isArray(contents) ? contents : [])
    .filter(item => String(item.dataPost || '').startsWith(`${month}-`) && String(item.projetoConteudo || '') === String(project || ''))
    .map(item => ({
      nome:String(item.nome || 'Conteúdo'),
      empresa:String(item.empresa || '').split(',').map(normalize).find(value => ['editora','leia','gisella'].includes(value)) || 'editora',
      dataPost:/^\d{4}-\d{2}-\d{2}$/.test(String(item.dataPost || '')) ? String(item.dataPost) : '',
      hora:/^([01]\d|2[0-3]):[0-5]\d$/.test(String(item.hora || '')) ? String(item.hora) : '',
    }));
}

function publicBookPayload(item) {
  const labels = {editora:'Editora Cassol',leia:'Léia Cassol',gisella:'GC Estratégias'};
  const info = item.info && typeof item.info === 'object' ? item.info : {};
  const links = item.links && typeof item.links === 'object' ? item.links : {};
  const safeLink = (label, value) => { try { const url=new URL(String(value||'').trim()); return ['http:','https:'].includes(url.protocol)?{label,url:url.href}:null; } catch(_){ return null; } };
  return {
    titulo:String(item.titulo || 'Livro'),
    empresaLabel:String(item.empresa || '').split(',').map(value => labels[normalize(value)] || '').filter(Boolean).join(' · '),
    info:{
      autor:String(info.autor||''), ilustrador:String(info.ilustrador||''), publico:String(info.publico||''), faixa:String(info.faixa||''),
      paginas:String(info.paginas||''), tiragem:String(info.tiragem||''), valor:String(info.valor||''), precoCusto:String(info.precoCusto||''),
      precoVenda:String(info.precoVenda||info.valor||''), isbn:String(info.isbn||''), formato:String(info.formato||''), colecao:String(info.colecao||''),
      editora:String(info.editora||''), ano:String(info.ano||''), lancamento:/^\d{4}-\d{2}-\d{2}$/.test(String(info.lancamento||''))?String(info.lancamento):'',
      assuntos:String(info.assuntos||''), sinopse:String(info.sinopse||''), descricaoSite:String(info.descricaoSite||''), observacao:String(info.observacao||''),
    },
    links:[safeLink('Texto finalizado',links.textoFinalizado),safeLink('Arquivos abertos',links.arquivosAbertos),safeLink('Arquivos fechados',links.arquivosFechados),safeLink('Página no site',links.paginaSite)].filter(Boolean),
    etapas:(Array.isArray(item.etapas)?item.etapas:[]).map(stage=>({nome:String(stage?.nome||'Etapa'),feito:Boolean(stage?.feito),prazo:/^\d{4}-\d{2}-\d{2}$/.test(String(stage?.prazo||''))?String(stage.prazo):'',executar:String(stage?.executar||''),resp:String(stage?.resp||''),offsetDays:typeof stage?.offsetDays==='number'?stage.offsetDays:null})),
  };
}

async function syncPublicBooks(items) {
  if (!['gisella','milena','luiggi'].includes(currentFirebaseUser())) return;
  await Promise.all((Array.isArray(items)?items:[]).filter(item => item.publicShareToken).map(item => item.publicShareEnabled === true
    ? setDoc(doc(db,'public_books',String(item.publicShareToken)),{value:JSON.stringify(publicBookPayload(item)),updatedAt:Date.now()})
    : deleteDoc(doc(db,'public_books',String(item.publicShareToken)))));
}

async function syncPublicCalendars(contents) {
  if (!['gisella','milena','luiggi'].includes(currentFirebaseUser())) return;
  const snapshots = await getDocs(collection(db,'public_calendars'));
  await Promise.all(snapshots.docs.map(item => {
    try {
      const previous=JSON.parse(item.data().value||'{}');
      const value={month:previous.month,project:previous.project,contents:publicCalendarContents(contents,previous.month,previous.project)};
      return setDoc(item.ref,{value:JSON.stringify(value),updatedAt:Date.now()},{merge:true});
    } catch(_){ return Promise.resolve(); }
  }));
}

/* ── SAVE ── */
const saveQueues = new Map();

async function saveSafely(key, val) {
  // Perfis restritos podem disparar migrações locais de áreas ocultas durante
  // a inicialização. Ignora essas tentativas sem tratá-las como falha de rede.
  if (!firebaseKeyAllowed(key)) return true;
  const knownTs = Number(localStorage.getItem('_fbts_' + key) || 0);
  let conflict = null;

  try {
    if (usesRestrictedDashboardTransport(key)) {
      if (key === 'gc-livros' && !val.every(item => item.catalogOnly === true
        ? Array.isArray(item.etapas) && item.etapas.length === 0
        : Array.isArray(item.etapas) && item.etapas.length > 0 && item.etapas.every(isBrunaBookArtStage))) {
        throw new Error('A conta Bruna só pode cadastrar livros no banco ou alterar a etapa Criar arte para o site.');
      }
      if (!val.every(belongsToEditoraCassol)) throw new Error('A conta Bruna só pode salvar itens da Editora Cassol.');
      const ts = await runTransaction(db, async transaction => {
        const ref = restrictedRef(key);
        const current = parseStoredDocument(await transaction.get(ref));
        if (current.ts > 0 && (knownTs === 0 || current.ts > knownTs)) {
          const error = new Error('Os dados foram atualizados por outra pessoa antes desta gravação.');
          error.code = 'stale-write';
          throw error;
        }
        const nextTs = Date.now();
        transaction.set(ref, {value:JSON.stringify(val),ts:nextTs},{merge:true});
        return nextTs;
      });
      localStorage.setItem('_fbts_' + key, String(ts));
      return ts;
    }

    const ref = doc(db, 'dados', key);
    const ts = await runTransaction(db, async transaction => {
      const current = await transaction.get(ref);
      const cloudTs = current.exists() ? Number(current.data().ts || 0) : 0;
      let mirror = null;
      if (BRUNA_RESTRICTED_FIREBASE_KEYS.has(key)) mirror = await transaction.get(restrictedRef(key));

      if (current.exists() && (knownTs === 0 || cloudTs > knownTs)) {
        conflict = { cloudTs };
        const error = new Error('O dado foi alterado por outra pessoa antes desta gravação.');
        error.code = 'stale-write';
        throw error;
      }
      const mirrorTs = mirror?.exists() ? Number(mirror.data().ts || 0) : 0;
      const mergedBrunaTs = current.exists() ? Number(current.data().brunaTs || 0) : 0;
      if (mirrorTs > mergedBrunaTs) {
        const error = new Error('A Bruna atualizou estes dados. Recarregue antes de salvar.');
        error.code = 'stale-write';
        throw error;
      }

      const nextTs = Date.now();
      transaction.set(ref, { value: JSON.stringify(val), ts: nextTs, ...(BRUNA_RESTRICTED_FIREBASE_KEYS.has(key) ? {brunaTs:nextTs} : {}) }, {merge:true});
      if (BRUNA_RESTRICTED_FIREBASE_KEYS.has(key)) {
        transaction.set(restrictedRef(key), {value:JSON.stringify(restrictForBruna(key,val)),ts:nextTs},{merge:true});
      }
      return nextTs;
    });

    localStorage.setItem('_fbts_' + key, ts.toString());
    if (key === 'gc-livros') syncPublicBooks(val).catch(error => console.warn('Não foi possível atualizar os links públicos dos livros:',error.message));
    if (key === 'gc-conteudos') syncPublicCalendars(val).catch(error => console.warn('Não foi possível atualizar os calendários públicos:',error.message));
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
  if (!firebaseKeyAllowed(key)) return null;
  try {
    if (usesRestrictedDashboardTransport(key)) {
      const snapshot = parseStoredDocument(await getDoc(restrictedRef(key)));
      return { value:snapshot.value, ts:snapshot.ts };
    }
    if (BRUNA_RESTRICTED_FIREBASE_KEYS.has(key)) {
      const reconciled = await reconcileBrunaMirror(key);
      if (reconciled) return {value:reconciled.value,ts:reconciled.ts};
    }
    const snap = await getDoc(doc(db, 'dados', key));
    if (snap.exists()) return { value: JSON.parse(snap.data().value), ts: snap.data().ts || 0 };
    return null;
  } catch(e) { return null; }
};

/* ── LOAD ALL ── */
window.fbLoadAll = async function() {
  const KEYS = [
    'gc-events','gc-livros','gc-conteudos','gc-projetos',
    'gc-mentees','gc-mentees-marco0','gc-kanban','gc-steira','gc-site-products',
    'gc-colab-ordem','gc-links','gc-gisella-checks','gc-links-empresa',
    'gc-fixed-gisella','gc-fixed-milena','gc-fixed-luiggi',
    'gc-fixed-checks-gisella','gc-fixed-checks-milena','gc-fixed-checks-luiggi',
    'gc-notas-gisella','gc-notas-milena','gc-notas-luiggi','gc-notas-marilia','gc-notas-bruna','gc-recurring-tasks','gc-ajustes',
  ].filter(firebaseKeyAllowed);
  const results = {};
  await Promise.all(KEYS.map(async key => {
    const res = await window.fbGet(key);
    if (res !== null) results[key] = res; // { value, ts }
  }));
  return results;
};

/* ── REAL-TIME LISTENER ── */
// Usa onSnapshot para que todos os aparelhos recebam cada alteração. O timestamp
// confirmado passa a ser a base da próxima gravação local; assim uma aba antiga
// não consegue sobrescrever um check recebido da nuvem.
window.fbListen = function(key, callback) {
  if (!firebaseKeyAllowed(key)) return null;
  if (usesRestrictedDashboardTransport(key)) {
    return onSnapshot(
      restrictedRef(key),
      snap => {
        if (!snap.exists()) return;
        try {
          const result = parseStoredDocument(snap);
          const cloudTs = result.ts;
        const localTs = Number(localStorage.getItem('_fbts_' + key) || 0);
        if (cloudTs > localTs) {
          localStorage.setItem('_fbts_' + key, String(cloudTs));
            callback(result.value);
        }
        } catch(error){ console.warn('fbListen restrito:',key,error.message); }
      },
      err => console.warn('fbListen restrito:',key,err.message),
    );
  }
  try {
    const unsubscribeMain = onSnapshot(
      doc(db, 'dados', key),
      (snap) => {
        if (!firebaseKeyAllowed(key)) return;
        if (!snap.exists()) return;
        try {
          const data    = snap.data();
          const cloudTs = data.ts || 0;
          // Skip if this device was the last writer for this key
          const localTs = parseInt(localStorage.getItem('_fbts_' + key) || '0');
          if (cloudTs > 0 && cloudTs <= localTs) return;
          const val = JSON.parse(data.value);
          if (cloudTs > 0) localStorage.setItem('_fbts_' + key, String(cloudTs));
          callback(val);
        } catch(e) {}
      },
      (err) => { console.warn('fbListen error:', key, err.message); }
    );
    if (!BRUNA_RESTRICTED_FIREBASE_KEYS.has(key)) return unsubscribeMain;
    const unsubscribeMirror = onSnapshot(restrictedRef(key), snap => {
      if (!snap.exists()) return;
      const mirrorTs = Number(snap.data().ts || 0);
      const mainTs = Number(localStorage.getItem('_fb_bruna_ts_' + key) || 0);
      if (mirrorTs <= mainTs) return;
      localStorage.setItem('_fb_bruna_ts_' + key,String(mirrorTs));
      reconcileBrunaMirror(key).catch(error => console.warn('Não foi possível reconciliar a atualização da Bruna:',error.message));
    });
    return () => { unsubscribeMain(); unsubscribeMirror(); };
  } catch(e) { return null; }
};

window.firebasePublishPublicBook = async function(book) {
  if (!book?.publicShareToken || book.publicShareEnabled !== true) throw new Error('O compartilhamento deste livro não está ativo.');
  await setDoc(doc(db,'public_books',String(book.publicShareToken)),{value:JSON.stringify(publicBookPayload(book)),updatedAt:Date.now()});
  return true;
};

window._fbReady = true;
window.dispatchEvent(new Event('firebase-ready'));
