const PUBLIC_BOOK_ENDPOINT = 'https://piwsavppaabjygaolldb.supabase.co/functions/v1/sync-cassol-dashboard';

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
  return new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'UTC' })
    .format(new Date(`${value}T12:00:00Z`));
}

function formatOffset(value) {
  if (typeof value !== 'number') return '';
  if (value === 0) return 'No dia do lançamento';
  const amount = Math.abs(value);
  return value < 0 ? `${amount} ${amount === 1 ? 'dia' : 'dias'} antes` : `${amount} ${amount === 1 ? 'dia' : 'dias'} depois`;
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function technicalField(label, value, wide = false) {
  if (!value) return null;
  const field = textElement('div', `technical-field${wide ? ' wide' : ''}`, '');
  field.append(textElement('div', 'technical-label', label), textElement('div', 'technical-value', value));
  return field;
}

function renderTechnicalSheet(book) {
  const grid = document.getElementById('technical-grid');
  grid.replaceChildren();
  const links = Array.isArray(book.links) ? book.links : [];
  if (links.length) {
    const linksWrap = textElement('div', 'book-links', '');
    links.forEach(item => {
      const anchor = textElement('a', 'book-link', `${item.label} ↗`);
      anchor.href = item.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      linksWrap.append(anchor);
    });
    grid.append(linksWrap);
  }
  const info = book.info || {};
  [
    ['Autor', info.autor], ['Ilustrador', info.ilustrador], ['Público-alvo', info.publico],
    ['Faixa etária', info.faixa], ['Nº de páginas', info.paginas], ['Tiragem', info.tiragem],
    ['Valor', info.valor], ['ISBN', info.isbn], ['Formato', info.formato], ['Coleção', info.colecao],
    ['Editora responsável', info.editora], ['Ano', info.ano], ['Data de lançamento', formatDate(info.lancamento)],
  ].forEach(([label, value]) => { const field = technicalField(label, value); if (field) grid.append(field); });
  [['Assuntos', info.assuntos], ['Sinopse', info.sinopse]].forEach(([label, value]) => { const field = technicalField(label, value, true); if (field) grid.append(field); });
  if (!grid.children.length) grid.append(textElement('div', 'message', 'A ficha técnica ainda não possui informações.'));
}

function openTechnicalSheet() { document.getElementById('technical-overlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeTechnicalSheet() { document.getElementById('technical-overlay').classList.remove('open'); document.body.style.overflow = ''; }

function renderBook(book) {
  const card = document.getElementById('book-card');
  card.replaceChildren();
  const stages = Array.isArray(book.etapas) ? book.etapas : [];
  const completed = stages.filter(stage => stage.feito).length;
  const percent = stages.length ? Math.round(completed / stages.length * 100) : 0;

  card.append(textElement('h1', '', book.titulo || 'Livro'), textElement('div', 'subtitle', book.empresaLabel || 'Acompanhamento das etapas editoriais'));
  const technicalButton = textElement('button', 'technical-button', 'Ver ficha técnica e arquivos');
  technicalButton.type = 'button';
  technicalButton.addEventListener('click', openTechnicalSheet);
  card.append(technicalButton);
  renderTechnicalSheet(book);
  const meta = document.createElement('div');
  meta.className = 'progress-meta';
  meta.append(textElement('span', '', 'Progresso'), textElement('span', '', `${completed} de ${stages.length} etapas · ${percent}%`));
  const progress = document.createElement('div');
  progress.className = 'progress';
  const fill = document.createElement('div');
  fill.style.width = `${percent}%`;
  progress.append(fill);
  card.append(meta, progress);

  const list = document.createElement('div');
  list.className = 'stages';
  stages.forEach(stage => {
    const row = document.createElement('div');
    row.className = `stage${stage.feito ? ' done' : ''}`;
    row.append(textElement('div', 'mark', stage.feito ? '✓' : ''));
    const content = document.createElement('div');
    content.append(textElement('div', 'name', stage.nome || 'Etapa'));
    const details = [stage.executar ? `Executar: ${stage.executar}` : '', stage.resp ? `Responsável: ${stage.resp}` : '', formatOffset(stage.offsetDays), stage.prazo ? `Prazo: ${formatDate(stage.prazo)}` : ''].filter(Boolean).join(' · ');
    if (details) content.append(textElement('div', 'details', details));
    row.append(content, textElement('div', 'status', stage.feito ? 'Concluída' : 'Em andamento'));
    list.append(row);
  });
  if (!stages.length) list.append(textElement('div', 'message', 'Nenhuma etapa disponível.'));
  card.append(list);
}

function renderError(message) {
  const card = document.getElementById('book-card');
  card.replaceChildren(textElement('div', 'message', message));
}

async function loadBook() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    renderError('Este link é inválido ou está incompleto.');
    return;
  }
  try {
    const response = await fetch(PUBLIC_BOOK_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ operation:'public_book_view', token }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.book) throw new Error(result.error || 'Livro não encontrado.');
    document.title = `${result.book.titulo || 'Livro'} · Grupo Cassol`;
    renderBook(result.book);
  } catch (error) {
    renderError(error.message || 'Não foi possível carregar este livro agora.');
  }
}

loadBook();
document.getElementById('technical-close').addEventListener('click', closeTechnicalSheet);
document.getElementById('technical-overlay').addEventListener('click', event => { if (event.target === event.currentTarget) closeTechnicalSheet(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeTechnicalSheet(); });
