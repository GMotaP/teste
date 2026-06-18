/* app.js · PAY4CHARGE
   Requer auth.js (DATA_API, loadJSONP, asArray, getUserEmail, logout, allowedChargers).
   Sem sessão -> redireciona para login.html (nada é exibido).
   Tema dos gráficos: escuro verde. */

// ---------- helpers ----------
const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DOW   = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];        // getDay() 0..6
const DOW_ORDER = {1:0,2:1,3:2,4:3,5:4,6:5,0:6};                   // ordena Seg..Dom
const ALL = "__todos__";

// paleta dos gráficos
const CL = {
  pago:"#43b25f", nosso:"#e0a83b", dif:"#7ed99a",
  final:"#43b25f", inicial:"#6e8c7c",
  line:"#43b25f",
  pie:["#2e9e4d","#7ccf92","#bfe6c9","#1f6b34","#5fc47a","#9bb4a5","#3ddc7a"]
};
// tema escuro dos eixos/legendas
const CT = { tick:"#8aa89a", grid:"rgba(140,190,160,.09)", border:"#0f2418", legend:"#a9c2b4" };

function num(v){
  if(v===null||v===undefined) return null;
  let s = String(v).trim();
  if(s==="") return null;
  s = s.replace(/\./g,"").replace(",",".");   // pt-BR: 1.234,56 -> 1234.56
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
const pad = n => String(n).padStart(2,"0");

function parseDate(s){                          // "17/06/2026"
  if(!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(!m) return null;
  const dd=+m[1], mm=+m[2], yy=+m[3];
  return {
    y:yy, m:mm, dd:dd,
    dt:new Date(yy, mm-1, dd),
    key:`${yy}-${pad(mm)}`,
    dayKey:`${yy}-${pad(mm)}-${pad(dd)}`,
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
let dimGraf = "mensal";                           // dimensão temporal dos gráficos

// ---------- mapeamento da API ----------
function mapRaw(data){
  return data.map(r=>{
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
}

// ---------- load ----------
async function load(){
  const email = getUserEmail();
  // Gate: sem login, não mostra nada.
  if(!email){ location.replace("login.html"); return; }

  document.getElementById("user-email").textContent = email;
  document.getElementById("btn-logout").addEventListener("click", logout);
  const statusEl = document.getElementById("status");

  try{
    const allowed = await allowedChargers(email);
    const allowSet = new Set(allowed.map(c => String(c).trim().toUpperCase()));

    let data = asArray(await loadJSONP(DATA_API));
    if(!data.length) throw new Error("Resposta da API de dados não é uma lista.");

    RAW = mapRaw(data);
    if(allowSet.size) RAW = RAW.filter(r => allowSet.has(String(r.carregador).trim().toUpperCase()));

    if(!RAW.length){
      statusEl.innerHTML =
        '<div class="err"><b>Nenhum dado para este usuário.</b><br>'+
        'O e-mail <b>'+email+'</b> não tem carregadores associados (ou ainda não há sessões para eles).</div>';
      return;
    }
    finishRender(statusEl);
  }catch(e){
    statusEl.innerHTML = '<div class="err"><b>Não consegui carregar os dados.</b><br>'+e.message+
      '<br><br>As 3 APIs (dados, usuários, carregadores) precisam de JSONP: '+
      '<code>doGet(e)</code> devolvendo <code>callback(json)</code> com <code>MimeType.JAVASCRIPT</code>, '+
      'implantação "Qualquer pessoa" e nova implantação após editar.</div>';
  }
}

function finishRender(statusEl){
  // Mostra o painel ANTES de desenhar os gráficos, senão o Chart.js
  // inicializa os canvas com tamanho 0 (container oculto).
  statusEl.style.display = "none";
  document.getElementById("dash").style.display = "block";
  buildFilters();
  setupControls();
  render();
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
  // Datas: define limites pelo intervalo dos dados; valor vazio = período todo.
  const dayKeys=[...new Set(RAW.map(r=>r.d.dayKey))].sort();
  const de=document.getElementById("f-de"), ate=document.getElementById("f-ate");
  de.min=ate.min=dayKeys[0];
  de.max=ate.max=dayKeys[dayKeys.length-1];
  ["f-carregador","f-local","f-tipo","f-pgto","f-de","f-ate"].forEach(id=>
    document.getElementById(id).addEventListener("change",render));
}

function applyFilters(){
  const fc=val("f-carregador"),fl=val("f-local"),ft=val("f-tipo"),fp=val("f-pgto");
  const de=val("f-de"),ate=val("f-ate");   // "YYYY-MM-DD" ou ""
  return RAW.filter(r=>{
    if(fc!==ALL && r.carregador!==fc) return false;
    if(fl!==ALL && r.local!==fl) return false;
    if(ft!==ALL && r.tipo!==ft) return false;
    if(fp!==ALL && r.pgto!==fp) return false;
    if(de && r.d.dayKey<de) return false;
    if(ate && r.d.dayKey>ate) return false;
    return true;
  });
}

// ---------- controles (toggles + métricas + dimensão) ----------
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
  document.getElementById("f-dim").addEventListener("change",e=>{dimGraf=e.target.value;render();});
}

// ---------- bucketização temporal ----------
function isoMonday(dt){
  const x=new Date(dt.getFullYear(),dt.getMonth(),dt.getDate());
  const off=(x.getDay()+6)%7;          // 0=Seg ... 6=Dom
  x.setDate(x.getDate()-off);
  return x;
}
function bucketOf(d, dim){
  const y=d.y, m=d.m, dd=d.dd, dt=d.dt, wd=dt.getDay();
  switch(dim){
    case "diaMes":
      return {key:pad(dd), label:String(dd), sort:dd};
    case "diaSemana":
      return {key:String(wd), label:DOW[wd], sort:DOW_ORDER[wd]};
    case "trimestre": {
      const q=Math.ceil(m/3);
      return {key:`${y}-${q}`, label:`${q}T/${String(y).slice(2)}`, sort:y*10+q};
    }
    case "semanal": {
      const mon=isoMonday(dt);
      return {key:`${mon.getFullYear()}-${pad(mon.getMonth()+1)}-${pad(mon.getDate())}`,
              label:`${pad(mon.getDate())}/${pad(mon.getMonth()+1)}`, sort:mon.getTime()};
    }
    case "anual":
      return {key:String(y), label:String(y), sort:y};
    case "mensal":
    default:
      return {key:d.key, label:d.label, sort:y*100+m};
  }
}
function bucketize(rows, dim){
  const map={};
  rows.forEach(r=>{
    const b=bucketOf(r.d, dim);
    if(!map[b.key]) map[b.key]={key:b.key,label:b.label,sort:b.sort,
      valor:0,nosso:0,consumo:0,sessoes:0,temp:0,potSum:0,potN:0,
      days:new Set(),batN:0,batFin:0,batIni:0};
    const o=map[b.key];
    o.sessoes++;
    o.days.add(r.d.dayKey);
    if(r.valor!=null)o.valor+=r.valor;
    if(r.nosso!=null)o.nosso+=r.nosso;
    if(r.consumo!=null)o.consumo+=r.consumo;
    if(r.temp!=null)o.temp+=r.temp;
    if(r.pot!=null){o.potSum+=r.pot;o.potN++;}
    if(r.pIni!=null&&r.pFim!=null){o.batN++;o.batFin+=r.pFim;o.batIni+=r.pIni;}
  });
  return Object.values(map).sort((a,b)=>a.sort-b.sort);
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
  const M=bucketize(rows, dimGraf);
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

  /* ===== Gráficos ===== */
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
    modeCon==="media" ? "Consumo médio por sessão (kWh)" : "Soma de consumo (kWh)";
  lineChart("c-con", labels, [{label:"Consumo", data:conData, color:CL.line}]);

  // Sessões — total/média (por dia)
  const sesData = modeSes==="media"
    ? M.map(m=>{const d=m.days.size; return d? m.sessoes/d : 0;})
    : M.map(m=>m.sessoes);
  document.getElementById("sub-ses").textContent =
    modeSes==="media" ? "Média de sessões por dia" : "Quantidade de sessões";
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
      g.addColorStop(0,"rgba(67,178,95,.22)");g.addColorStop(1,"rgba(67,178,95,0)");
      bg=g;
    }
    return {label:d.label,data:d.data,borderColor:d.color,backgroundColor:bg,
      borderWidth:1.8,fill:single,tension:.25,pointRadius:0,
      pointBackgroundColor:d.color,pointHoverRadius:4,pointHoverBorderColor:"#0a1a11"};
  });
  const money=!!opts.money;
  charts[id]=new Chart(ctx,{
    type:"line",
    data:{labels,datasets:ds},
    options:{responsive:true,maintainAspectRatio:false,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{display:!!opts.legend,position:"bottom",
          labels:{boxWidth:10,boxHeight:10,usePointStyle:true,pointStyle:"circle",
            font:{size:11,family:"Manrope"},color:CT.legend,padding:14}},
        tooltip:{backgroundColor:"#0c2016",borderColor:"rgba(120,200,150,.2)",borderWidth:1,
          titleColor:"#ecf6ef",bodyColor:"#cfe0d6",padding:10,cornerRadius:8,
          callbacks:{label:c=>c.dataset.label+": "+
          (money?brl(c.parsed.y):c.parsed.y.toLocaleString("pt-BR",{maximumFractionDigits:2}))}}},
      scales:{
        x:{grid:{display:false},border:{display:false},
           ticks:{color:CT.tick,maxRotation:0,autoSkip:true,maxTicksLimit:10,font:{size:10}}},
        y:{grid:{color:CT.grid},border:{display:false},
           ticks:{color:CT.tick,font:{size:10},
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
    data:{labels:agg.labels,datasets:[{data:agg.values,backgroundColor:CL.pie,
      borderColor:CT.border,borderWidth:3,hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:"60%",
      plugins:{
        legend:{position:"right",labels:{boxWidth:11,boxHeight:11,usePointStyle:true,
          pointStyle:"circle",font:{size:12,family:"Manrope"},color:CT.legend,padding:12}},
        tooltip:{backgroundColor:"#0c2016",borderColor:"rgba(120,200,150,.2)",borderWidth:1,
          titleColor:"#ecf6ef",bodyColor:"#cfe0d6",padding:10,cornerRadius:8,
          callbacks:{label:c=>{
          const v=c.parsed; const pct=total? (v/total*100):0;
          const txt = isMoney? brl(v) : (isKwh? numf(v,2)+" kWh" : numf(v)+" sessões");
          return c.label+": "+txt+" ("+numf(pct,1)+"%)";
        }}}}}
  });
}

load();
