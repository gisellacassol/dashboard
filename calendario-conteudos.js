const PUBLIC_CALENDAR_ENDPOINT = 'https://firestore.googleapis.com/v1/projects/grupo-cassol-2/databases/(default)/documents/public_calendars';
const FIREBASE_API_KEY = 'AIzaSyCuifhZ4I3_doR6N_2xdqMe3zUDMgjeeR0';
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function text(tag, className, value) { const el=document.createElement(tag); if(className) el.className=className; el.textContent=String(value||''); return el; }
function formatDate(value) { if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))) return ''; const [y,m,d]=value.split('-'); return `${d}/${m}/${y}`; }
function addField(container,label,value) { const field=text('div','field',''); field.append(text('div','label',label),text('div','value',value||'Não informado')); container.append(field); }

function openDetail(content) {
  document.getElementById('detail-title').textContent=content.nome||'Conteúdo';
  document.getElementById('detail-subtitle').textContent='Informações da postagem';
  const fields=document.getElementById('detail-fields'); fields.replaceChildren();
  addField(fields,'Data de postagem',formatDate(content.dataPost)); addField(fields,'Horário',content.hora);
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
async function loadCalendar(){const token=new URLSearchParams(location.search).get('token')||'';if(!/^[a-f0-9]{64}$/.test(token)){renderError('Este link é inválido, antigo ou está incompleto. Solicite um novo link do calendário.');return;}try{const url=new URL(`${PUBLIC_CALENDAR_ENDPOINT}/${token}`);url.searchParams.set('key',FIREBASE_API_KEY);const response=await fetch(url);const document=await response.json().catch(()=>({}));if(!response.ok)throw new Error(response.status===404?'Calendário não encontrado.':'Não foi possível consultar o calendário.');const result=JSON.parse(document?.fields?.value?.stringValue||'{}');if(!result.month||!Array.isArray(result.contents))throw new Error('Calendário não encontrado.');renderCalendar(result.month,result.contents);}catch(error){renderError(error.message||'Não foi possível carregar o calendário agora.');}}
document.getElementById('detail-close').addEventListener('click',closeDetail);document.getElementById('detail-overlay').addEventListener('click',event=>{if(event.target===event.currentTarget)closeDetail();});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDetail();});loadCalendar();
