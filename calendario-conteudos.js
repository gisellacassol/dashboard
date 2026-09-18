const PUBLIC_CALENDAR_ENDPOINT = 'https://piwsavppaabjygaolldb.supabase.co/functions/v1/sync-cassol-dashboard';
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const COMPANY_LABELS = {editora:'Editora Cassol',leia:'Léia Cassol',gisella:'GC Estratégias'};
const NETWORK_LABELS = {instagram:'Instagram',facebook:'Facebook',linkedin:'LinkedIn',youtube:'YouTube',tiktok:'TikTok',email:'E-mail',site:'Site'};
const FORMAT_LABELS = {reel:'Reel',carrossel:'Carrossel',card:'Card',story:'Story',emailmkt:'E-mail marketing',site:'Site'};

function text(tag, className, value) { const el=document.createElement(tag); if(className) el.className=className; el.textContent=String(value||''); return el; }
function formatDate(value) { if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))) return ''; const [y,m,d]=value.split('-'); return `${d}/${m}/${y}`; }
function safeUrl(value) { try { const url=new URL(String(value||'')); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch(_) { return ''; } }
function addField(container,label,value,wide=false,link=false) { if(!value) return; const field=text('div',`field${wide?' wide':''}`,''); field.append(text('div','label',label)); const val=text('div','value',''); if(link){const a=text('a','', 'Abrir link');a.href=value;a.target='_blank';a.rel='noopener noreferrer';val.append(a);}else val.textContent=value; field.append(val); container.append(field); }

function openDetail(content) {
  document.getElementById('detail-title').textContent=content.nome||'Conteúdo';
  document.getElementById('detail-subtitle').textContent=[COMPANY_LABELS[content.empresa]||content.empresa,NETWORK_LABELS[content.rede]||content.rede,FORMAT_LABELS[content.tipo]||content.tipo].filter(Boolean).join(' · ');
  const fields=document.getElementById('detail-fields'); fields.replaceChildren();
  addField(fields,'Data de postagem',formatDate(content.dataPost)); addField(fields,'Horário',content.hora);
  addField(fields,'Data de produção',formatDate(content.dataProd)); addField(fields,'Responsável',content.responsavel);
  addField(fields,'Projeto',content.projeto); addField(fields,'Status',content.statusLabel);
  addField(fields,'Copy',content.copy,true); addField(fields,'Legenda',content.legenda,true); addField(fields,'Observação',content.observacao,true);
  (content.links||[]).forEach((link,index)=>addField(fields,index?'Link da arte':'Link',safeUrl(link),true,true));
  document.getElementById('detail-overlay').classList.add('open'); document.body.style.overflow='hidden';
}
function closeDetail(){document.getElementById('detail-overlay').classList.remove('open');document.body.style.overflow='';}

function renderCalendar(month,contents) {
  const [year,monthNumber]=month.split('-').map(Number); document.getElementById('month-title').textContent=`${MONTHS[monthNumber-1]} de ${year}`;
  document.title=`${MONTHS[monthNumber-1]} de ${year} · Calendário editorial`;
  const calendar=document.getElementById('calendar'); calendar.replaceChildren();
  const week=text('div','week',''); WEEKDAYS.forEach(day=>week.append(text('div','',day))); calendar.append(week);
  const grid=text('div','grid',''); const firstDay=new Date(year,monthNumber-1,1).getDay(); const dayCount=new Date(year,monthNumber,0).getDate();
  for(let i=0;i<firstDay;i++) grid.append(text('div','day empty',''));
  for(let day=1;day<=dayCount;day++){
    const date=`${month}-${String(day).padStart(2,'0')}`; const cell=text('div','day',''); cell.append(text('div','num',day));
    contents.filter(item=>item.dataPost===date).forEach(item=>{const button=text('button',`item ${item.empresa||'editora'}`,`${item.hora?item.hora+' · ':''}${item.nome||'Conteúdo'}`);button.type='button';button.addEventListener('click',()=>openDetail(item));cell.append(button);}); grid.append(cell);
  }
  const remainder=(firstDay+dayCount)%7; if(remainder) for(let i=remainder;i<7;i++) grid.append(text('div','day empty',''));
  calendar.append(grid);
}
function renderError(message){document.getElementById('calendar').replaceChildren(text('div','message',message));}
async function loadCalendar(){const token=new URLSearchParams(location.search).get('token')||'';if(!/^\d{4}-\d{2}\.[a-f0-9]{64}$/.test(token)){renderError('Este link é inválido ou está incompleto.');return;}try{const response=await fetch(PUBLIC_CALENDAR_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'public_content_calendar_view',token})});const result=await response.json().catch(()=>({}));if(!response.ok||!result.month||!Array.isArray(result.contents))throw new Error(result.error||'Calendário não encontrado.');renderCalendar(result.month,result.contents);}catch(error){renderError(error.message||'Não foi possível carregar o calendário agora.');}}
document.getElementById('detail-close').addEventListener('click',closeDetail);document.getElementById('detail-overlay').addEventListener('click',event=>{if(event.target===event.currentTarget)closeDetail();});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDetail();});loadCalendar();
