const API = "https://script.google.com/macros/s/AKfycbxnJZOW5-9gXt15dLk--2qtQrMcT2o2LDDxJcV7dvMiPQ_5T9rA0tKmIqOPRHW5KoZn/exec";

// ---------- helpers ----------
const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const ALL = "__todos__";

function num(v){
  if(v===null||v===undefined) return null;
  let s = String(v).trim();
  if(s==="") return null;
  s = s.replace(/\./g,"").replace(",",".");   // pt-BR: 1.234,56 -> 1234.56
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function parseDate(s){                          // "17/06/2026" -> {y,m,key,label}
  if(!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(!m) return null;
  const yy=+m[3], mm=+m[2];
  return {y:yy,m:mm,key:`${yy}-${String(mm).padStart(2,"0")}`,label:`${MESES[mm-1]}/${String(yy).slice(2)}`};
}
const brl = n => "R$ "+ (n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const numf = (n,d=0) => (n||0).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
const val = id => document.getElementById(id).value;

// ---------- state ----------
let RAW = [];
let charts = {};

// ---------- load ----------
async function load(){
  try{
    const res = await fetch(API,{redirect:"follow"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    let data = await res.json();
    if(!Array.isArray(data) && Array.isArray(data.data)) data = data.data; // tolera {data:[...]}
    if(!Array.isArray(data)) throw new Error("Resposta da API não é uma lista.");
    RAW = data.map(r=>{
      const d = parseDate(r.data);
      return {
        d,
        carregador: r.carregador||"—",
        local: r.origem||"—",
        tipo: r.tipo||"—",
        pgto: r.pagamento_type||"—",
        valor: num(r.valor_pago),
        liquido: num(r.valor_nosso),
        consumo: num(r.consumo),
        temp: num(r.temp_conect),
        pot: num(r.pot_max),
        pIni: num(r.porcent_inicial),
        pFim: num(r.porcent_final)
      };
    }).filter(r=>r.d);                          // descarta linhas sem data válida
    if(!RAW.length) throw new Error("Nenhum registro com data válida retornado.");
    buildFilters();
    render();
    document.getElementById("status").style.display="none";
    document.getElementById("dash").style.display="block";
  }catch(e){
    const isFile = location.protocol === "file:";
    const msg = isFile
      ? '<b>Você abriu o arquivo direto do disco (file://).</b><br>'+
        'O navegador bloqueia chamadas de rede nesse modo. Sirva os arquivos por HTTP:<br>'+
        '<br>• <b>Windows:</b> dê dois cliques no arquivo <b>serve.bat</b> (na mesma pasta) '+
        'e o dashboard abrirá em http://localhost:8000<br>'+
        '• ou rode na pasta: <code>python -m http.server 8000</code> e acesse '+
        '<code>http://localhost:8000/index.html</code>'
      : '<b>Não consegui carregar os dados.</b><br>'+e.message+
        '<br><br>Pode ser CORS na API. Nesse caso, ative o JSONP no seu Apps Script '+
        '(veja o passo a passo que enviei) ou hospede em GitHub Pages / Vercel.';
    document.getElementById("status").innerHTML = '<div class="err">'+msg+'</div>';
  }
}

// ---------- filters ----------
function fillSelect(id,values,withAll=true){
  const sel=document.getElementById(id);
  const opts = withAll ? [`<option value="${ALL}">Todos</option>`] : [];
  values.forEach(v=>opts.push(`<option value="${v}">${v}</option>`));
  sel.innerHTML=opts.join("");
}
function uniq(key){return [...new Set(RAW.map(r=>r[key]).filter(Boolean))].sort();}

function buildFilters(){
  fillSelect("f-carregador",uniq("carregador"));
  fillSelect("f-local",uniq("local"));
  fillSelect("f-tipo",uniq("tipo"));
  fillSelect("f-pgto",uniq("pgto"));
  const months=[...new Set(RAW.map(r=>r.d.key))].sort();
  const monthOpts=months.map(k=>{const[y,m]=k.split("-");return `<option value="${k}">${MESES[+m-1]}/${y}</option>`;});
  document.getElementById("f-de").innerHTML=monthOpts.join("");
  document.getElementById("f-ate").innerHTML=monthOpts.join("");
  document.getElementById("f-de").value=months[0];
  document.getElementById("f-ate").value=months[months.length-1];
  ["f-carregador","f-local","f-tipo","f-pgto","f-de","f-ate"].forEach(id=>
    document.getElementById(id).addEventListener("change",render));
}

function applyFilters(){
  const fc=val("f-carregador"),fl=val("f-local"),ft=val("f-tipo"),fp=val("f-pgto");
  const de=val("f-de"),ate=val("f-ate");
  return RAW.filter(r=>{
    if(fc!==ALL && r.carregador!==fc) return false;
    if(fl!==ALL && r.local!==fl) return false;
    if(ft!==ALL && r.tipo!==ft) return false;
    if(fp!==ALL && r.pgto!==fp) return false;
    if(de && r.d.key<de) return false;
    if(ate && r.d.key>ate) return false;
    return true;
  });
}

// ---------- aggregation ----------
function monthly(rows){
  const map={};
  rows.forEach(r=>{
    const k=r.d.key;
    if(!map[k]) map[k]={key:k,label:r.d.label,valor:0,liquido:0,consumo:0,temp:0,sessoes:0,
                        potSum:0,potN:0,batSum:0,batN:0};
    const o=map[k];
    o.sessoes++;
    if(r.valor!=null)o.valor+=r.valor;
    if(r.liquido!=null)o.liquido+=r.liquido;
    if(r.consumo!=null)o.consumo+=r.consumo;
    if(r.temp!=null)o.temp+=r.temp;
    if(r.pot!=null){o.potSum+=r.pot;o.potN++;}
    if(r.pIni!=null&&r.pFim!=null){o.batSum+=(r.pFim-r.pIni);o.batN++;}
  });
  return Object.values(map).sort((a,b)=>a.key<b.key?-1:1);
}

// ---------- render ----------
function render(){
  const rows=applyFilters();
  const M=monthly(rows);
  const labels=M.map(m=>m.label);

  // KPIs gerais
  const totFat=sum(rows,"valor"), totCon=sum(rows,"consumo"), totSes=rows.length,
        totTmp=sum(rows,"temp"), totLiq=sum(rows,"liquido");
  kpi("kpis-gerais",[
    ["Faturamento",brl(totFat),"soma de valor_pago"],
    ["Consumo",numf(totCon,2)+" kWh","soma de consumo"],
    ["Sessões",numf(totSes),"nº de carregamentos"],
    ["Líquido",brl(totLiq),"soma de valor_nosso"]
  ]);

  // KPIs médias
  const tkt = totSes? totFat/totSes : 0;
  const conMed = totSes? totCon/totSes : 0;
  const tmpMed = totSes? totTmp/totSes : 0;
  const potVals = rows.map(r=>r.pot).filter(v=>v!=null);
  const potMed = potVals.length? potVals.reduce((a,b)=>a+b,0)/potVals.length : 0;
  kpi("kpis-medias",[
    ["Ticket médio",brl(tkt),"por sessão",true],
    ["Consumo médio",numf(conMed,2)+" kWh","por sessão",true],
    ["Tempo médio",numf(tmpMed,1)+" min","por sessão",true],
    ["Potência média",numf(potMed,0)+" W","média de pot_max",true]
  ]);

  // charts
  line("c-fat",labels,M.map(m=>m.valor),"Faturamento (R$)");
  line("c-con",labels,M.map(m=>m.consumo),"Consumo (kWh)");
  line("c-tkt",labels,M.map(m=>m.sessoes?m.valor/m.sessoes:0),"Ticket médio (R$)");
  line("c-ses",labels,M.map(m=>m.sessoes),"Sessões");
  line("c-tmp",labels,M.map(m=>m.temp),"Tempo (min)");
  line("c-pot",labels,M.map(m=>m.potN?m.potSum/m.potN:0),"Potência (W)");
  line("c-bat",labels,M.map(m=>m.batN?m.batSum/m.batN:0),"% carregado");
}

function sum(rows,k){return rows.reduce((a,r)=>a+(r[k]||0),0);}

function kpi(containerId,items){
  document.getElementById(containerId).innerHTML = items.map(([label,value,sub,alt])=>
    `<div class="kpi${alt?' alt':''}"><div class="k-label">${label}</div>
     <div class="k-value">${value}</div><div class="k-sub">${sub||""}</div></div>`).join("");
}

function line(id,labels,data,label){
  const ctx=document.getElementById(id);
  if(charts[id]) charts[id].destroy();
  const g=ctx.getContext("2d").createLinearGradient(0,0,0,230);
  g.addColorStop(0,"rgba(67,178,95,.30)");g.addColorStop(1,"rgba(67,178,95,0)");
  charts[id]=new Chart(ctx,{
    type:"line",
    data:{labels,datasets:[{label,data,borderColor:"#2e9e4d",backgroundColor:g,
      borderWidth:2.5,fill:true,tension:.35,pointRadius:2.5,pointBackgroundColor:"#2e9e4d",
      pointHoverRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{callbacks:{label:c=>label+": "+c.parsed.y.toLocaleString("pt-BR",{maximumFractionDigits:2})}}},
      scales:{
        x:{grid:{display:false},ticks:{color:"#6b7d72",maxRotation:0,autoSkip:true,maxTicksLimit:8}},
        y:{grid:{color:"#eef2ef"},ticks:{color:"#6b7d72",
           callback:v=>v.toLocaleString("pt-BR",{maximumFractionDigits:0})}}}}
  });
}

load();
