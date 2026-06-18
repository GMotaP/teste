/* app.js · PAY4CHARGE
   Requer auth.js (DATA_API, loadJSONP, asArray, getUserEmail, logout, allowedChargers). */

// ---------- helpers ----------
const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const ALL = "__todos__";

// paleta
const CL = {
  pago:"#2e9e4d", nosso:"#e0a83b", dif:"#1f6b34",
  final:"#2e9e4d", inicial:"#9bb4a5",
  line:"#2e9e4d",
  pie:["#2e9e4d","#7ccf92","#bfe6c9","#1f6b34","#cfe9d6","#5fc47a","#9bb4a5"]
};

function num(v){
  if(v===null||v===undefined) return null;
  let s = String(v).trim();
  if(s==="") return null;
  s = s.replace(/\./g,"").replace(",",".");   // pt-BR: 1.234,56 -> 1234.56
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function parseDate(s){                          // "17/06/2026"
  if(!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(!m) return null;
  const dd=+m[1], mm=+m[2], yy=+m[3];
  return {
    y:yy, m:mm,
    key:`${yy}-${String(mm).padStart(2,"0")}`,
    dayKey:`${yy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`,
    label:`${MESES[mm-1]}/${String(yy).slice(2)}`
  };
}
const brl  = n => "R$ "+ (n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const numf = (n,d=0) => (n||0).toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
const val  = id => document.getElementById(id).value;
const isCartao = p => String(p||"").toLowerCase().includes("cart");
const isPix    = p => String(p||"").toLowerCase().includes("pix");

// ---------- state ----------
let RAW = [];
let charts = {};
let modeCon = "total", modeSes = "total";        // toggle por gráfico
let metricTipo = "sessoes", metricPgto = "sessoes"; // métrica das pizzas

// ---------- load ----------
async function load(){
  const email = getUserEmail();
  if(!email){ location.replace("login.html"); return; }
  document.getElementById("user-email").textContent = email;
  document.getElementById("btn-logout").addEventListener("click", logout);

  try{
    const allowed = await allowedChargers(email);
    const allowSet = new Set(allowed.map(c => String(c).trim().toUpperCase()));

    let data = asArray(await loadJSONP(DATA_API));
    if(!data.length) throw new Error("Resposta da API de dados não é uma lista.");

    RAW = data.map(r=>{
      const d = parseDate(r.data);
      return {
        d,
        carregador: r.carregador||"—",
        local: r.origem||"—",
        tipo: r.tipo||"—",
        pgto: r.pagamento_type||"—",
        dia: r.dia_semana||"—",
        valor: num(r.valor_pago),
        nosso: num(r.valor_nosso),
        consumo: num(r.consumo),
        temp: num(r.temp_conect),
        pot: num(r.pot_max),
        pIni: num(r.porcent_inicial),
        pFim: num(r.porcent_final)
      };
    }).filter(r=>r.d);

    RAW = RAW.filter(r => allowSet.has(String(r.carregador).trim().toUpperCase()));

    if(!RAW.length){
      document.getElementById("status").innerHTML =
        '<div class="err"><b>Nenhum dado para este usuário.</b><br>'+
        'O e-mail <b>'+email+'</b> não tem carregadores associados (ou ainda não há sessões para eles).</div>';
      return;
    }

    buildFilters();
    setupControls();
    render();
    document.getElementById("status").style.display="none";
    document.getElementById("dash").style.display="block";
  }catch(e){
    const msg = '<b>Não consegui carregar os dados.</b><br>'+e.message+
      '<br><br>As 3 APIs (dados, usuários, carregadores) precisam de JSONP: '+
      '<code>doGet(e)</code> devolvendo <code>callback(json)</code> com <code>MimeType.JAVASCRIPT</code>, '+
      'implantação "Qualquer pessoa" e nova implantação após editar.';
    document.getElementById("status").innerHTML = '<div class="err">'+msg+'</div>';
  }
}

// ---------- filtros ----------
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

// ---------- controles (toggles + métricas das pizzas) ----------
function setupControls(){
  document.querySelectorAll(".seg").forEach(seg=>{
    const group = seg.dataset.group;
    seg.querySelectorAll(".seg-btn").forEach(btn=>{
      btn.addEventListener("click",()=>{
        seg.querySelectorAll(".seg-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        const mode = btn.dataset.mode;
        if(group==="con") modeCon=mode;
        if(group==="ses") modeSes=mode;
        render();
      });
    });
  });
  document.getElementById("m-tipo").addEventListener("change",e=>{metricTipo=e.target.value;render();});
  document.getElementById("m-pgto").addEventListener("change",e=>{metricPgto=e.target.value;render();});
}

// ---------- agregação mensal ----------
function monthly(rows){
  const map={};
  rows.forEach(r=>{
    const k=r.d.key;
    if(!map[k]) map[k]={key:k,label:r.d.label,valor:0,nosso:0,consumo:0,sessoes:0,temp:0,
                        potSum:0,potN:0, days:new Set(),
                        batN:0,batFin:0,batIni:0};
    const o=map[k];
    o.sessoes++;
    o.days.add(r.d.dayKey);
    if(r.valor!=null)o.valor+=r.valor;
    if(r.nosso!=null)o.nosso+=r.nosso;
    if(r.consumo!=null)o.consumo+=r.consumo;
    if(r.temp!=null)o.temp+=r.temp;
    if(r.pot!=null){o.potSum+=r.pot;o.potN++;}
    if(r.pIni!=null&&r.pFim!=null){o.batN++;o.batFin+=r.pFim;o.batIni+=r.pIni;}
  });
  return Object.values(map).sort((a,b)=>a.key<b.key?-1:1);
}

// ---------- agregação categórica (pizzas / destaques) ----------
function metricValue(r, metric){
  if(metric==="faturamento") return r.valor||0;
  if(metric==="consumo")     return r.consumo||0;
  return 1; // sessoes
}
function aggBy(rows, key, metric){
  const map={};
  rows.forEach(r=>{ const k=r[key]||"—"; map[k]=(map[k]||0)+metricValue(r,metric); });
  const entries=Object.entries(map).sort((a,b)=>b[1]-a[1]);
  return { labels:entries.map(e=>e[0]), values:entries.map(e=>e[1]) };
}
function countBy(rows, key){
  const map={};
  rows.forEach(r=>{ const k=r[key]||"—"; map[k]=(map[k]||0)+1; });
  return Object.entries(map).sort((a,b)=>b[1]-a[1]); // desc
}

// ---------- render ----------
function render(){
  const rows=applyFilters();
  const M=monthly(rows);
  const labels=M.map(m=>m.label);

  /* ===== KPIs ===== */
  const totFat=sum(rows,"valor"), totNosso=sum(rows,"nosso"), totCon=sum(rows,"consumo"),
        totSes=rows.length;
  const liquido=totFat-totNosso;
  const cart=rows.filter(r=>isCartao(r.pgto)); const pix=rows.filter(r=>isPix(r.pgto));
  const liqCart=sum(cart,"valor")-sum(cart,"nosso");
  const liqPix =sum(pix,"valor") -sum(pix,"nosso");

  kpi("kpis-fin",[
    ["Faturamento total",brl(totFat),"soma de valor pago"],
    ["Líquido",brl(liquido),"valor pago − valor nosso",true],
    ["Impostos e taxas",brl(totNosso),"soma de valor nosso"],
    ["Líquido cartão",brl(liqCart),"somente pagamento cartão",true],
    ["Líquido pix",brl(liqPix),"somente pagamento pix",true]
  ]);

  const conMed = totSes? totCon/totSes : 0;
  const tkt    = totSes? totFat/totSes : 0;
  const potVals= rows.map(r=>r.pot).filter(v=>v!=null);
  const potMed = potVals.length? potVals.reduce((a,b)=>a+b,0)/potVals.length : 0;
  const curtas = rows.filter(r=>r.temp!=null && r.temp<15).length;
  const curtasPct = totSes? (curtas/totSes*100) : 0;

  kpi("kpis-op",[
    ["Consumo total",numf(totCon,2)+" kWh","soma de consumo"],
    ["Consumo médio",numf(conMed,2)+" kWh","por sessão",true],
    ["Sessões",numf(totSes),"nº de carregamentos"],
    ["Ticket médio",brl(tkt),"faturamento ÷ sessões",true],
    ["Potência média",numf(potMed,0)+" W","média de pot_max",true],
    ["Sessões curtas",numf(curtas)+" ("+numf(curtasPct,1)+"%)","< 15 min de conexão"]
  ]);

  const locC=countBy(rows,"local"), diaC=countBy(rows,"dia");
  const maxLoc=locC[0], minLoc=locC[locC.length-1];
  const maxDia=diaC[0], minDia=diaC[diaC.length-1];
  kpi("kpis-dest",[
    ["Eletroposto maior uso", maxLoc?maxLoc[0]:"—", maxLoc?numf(maxLoc[1])+" sessões":""],
    ["Eletroposto menor uso", minLoc?minLoc[0]:"—", minLoc?numf(minLoc[1])+" sessões":"",true],
    ["Dia de maior uso", maxDia?maxDia[0]:"—", maxDia?numf(maxDia[1])+" sessões":""],
    ["Dia de menor uso", minDia?minDia[0]:"—", minDia?numf(minDia[1])+" sessões":"",true]
  ]);

  /* ===== Pizzas ===== */
  pie("p-tipo", aggBy(rows,"tipo",metricTipo), metricTipo);
  pie("p-pgto", aggBy(rows,"pgto",metricPgto), metricPgto);

  /* ===== Gráficos mensais ===== */
  // Faturamento — 3 linhas
  lineChart("c-fat", labels, [
    {label:"Valor pago",  data:M.map(m=>m.valor),          color:CL.pago},
    {label:"Valor nosso", data:M.map(m=>m.nosso),          color:CL.nosso},
    {label:"Líquido (dif.)", data:M.map(m=>m.valor-m.nosso), color:CL.dif}
  ], {legend:true, money:true});

  // Consumo — total/média
  const conData = modeCon==="media"
    ? M.map(m=>m.sessoes? m.consumo/m.sessoes : 0)
    : M.map(m=>m.consumo);
  document.getElementById("sub-con").textContent =
    modeCon==="media" ? "Consumo médio por sessão por mês (kWh)" : "Soma de consumo por mês (kWh)";
  lineChart("c-con", labels, [{label:"Consumo", data:conData, color:CL.line}]);

  // Sessões — total/média (por dia)
  const sesData = modeSes==="media"
    ? M.map(m=>{const d=m.days.size; return d? m.sessoes/d : 0;})
    : M.map(m=>m.sessoes);
  document.getElementById("sub-ses").textContent =
    modeSes==="media" ? "Média de sessões por dia (no mês)" : "Quantidade de sessões por mês";
  lineChart("c-ses", labels, [{label:"Sessões", data:sesData, color:CL.line}]);

  // Ticket médio
  lineChart("c-tkt", labels, [{label:"Ticket médio",
    data:M.map(m=>m.sessoes? m.valor/m.sessoes : 0), color:CL.line}], {money:true});

  // Potência média
  lineChart("c-pot", labels, [{label:"Potência média",
    data:M.map(m=>m.potN? m.potSum/m.potN : 0), color:CL.line}]);

  // Bateria — 3 linhas
  lineChart("c-bat", labels, [
    {label:"% final",   data:M.map(m=>m.batN? m.batFin/m.batN : 0),               color:CL.final},
    {label:"% inicial", data:M.map(m=>m.batN? m.batIni/m.batN : 0),               color:CL.inicial},
    {label:"Diferença", data:M.map(m=>m.batN? (m.batFin-m.batIni)/m.batN : 0),    color:CL.nosso}
  ], {legend:true});
}

function sum(rows,k){return rows.reduce((a,r)=>a+(r[k]||0),0);}

function kpi(containerId,items){
  document.getElementById(containerId).innerHTML = items.map(([label,value,sub,alt])=>
    `<div class="kpi${alt?' alt':''}"><div class="k-label">${label}</div>
     <div class="k-value">${value}</div><div class="k-sub">${sub||""}</div></div>`).join("");
}

// ---------- charts ----------
function lineChart(id, labels, datasets, opts={}){
  const ctx=document.getElementById(id);
  if(charts[id]) charts[id].destroy();
  const single = datasets.length===1;
  const ds = datasets.map(d=>{
    let bg=d.color;
    if(single){
      const g=ctx.getContext("2d").createLinearGradient(0,0,0,230);
      g.addColorStop(0,"rgba(67,178,95,.30)");g.addColorStop(1,"rgba(67,178,95,0)");
      bg=g;
    }
    return {label:d.label,data:d.data,borderColor:d.color,backgroundColor:bg,
      borderWidth:2.4,fill:single,tension:.35,pointRadius:2,pointBackgroundColor:d.color,pointHoverRadius:5};
  });
  const money=!!opts.money;
  charts[id]=new Chart(ctx,{
    type:"line",
    data:{labels,datasets:ds},
    options:{responsive:true,maintainAspectRatio:false,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{display:!!opts.legend,position:"bottom",labels:{boxWidth:12,boxHeight:12,font:{size:11},color:"#6b7d72"}},
        tooltip:{callbacks:{label:c=>c.dataset.label+": "+
          (money?brl(c.parsed.y):c.parsed.y.toLocaleString("pt-BR",{maximumFractionDigits:2}))}}},
      scales:{
        x:{grid:{display:false},ticks:{color:"#6b7d72",maxRotation:0,autoSkip:true,maxTicksLimit:8}},
        y:{grid:{color:"#eef2ef"},ticks:{color:"#6b7d72",
           callback:v=>v.toLocaleString("pt-BR",{maximumFractionDigits:0})}}}}
  });
}

function pie(id, agg, metric){
  const ctx=document.getElementById(id);
  if(charts[id]) charts[id].destroy();
  const isMoney = metric==="faturamento";
  const isKwh   = metric==="consumo";
  const total = agg.values.reduce((a,b)=>a+b,0);
  charts[id]=new Chart(ctx,{
    type:"doughnut",
    data:{labels:agg.labels,datasets:[{data:agg.values,backgroundColor:CL.pie,borderColor:"#fff",borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:"55%",
      plugins:{
        legend:{position:"right",labels:{boxWidth:12,boxHeight:12,font:{size:12},color:"#3a4a40"}},
        tooltip:{callbacks:{label:c=>{
          const v=c.parsed; const pct=total? (v/total*100):0;
          const txt = isMoney? brl(v) : (isKwh? numf(v,2)+" kWh" : numf(v)+" sessões");
          return c.label+": "+txt+" ("+numf(pct,1)+"%)";
        }}}}}
  });
}

load();
