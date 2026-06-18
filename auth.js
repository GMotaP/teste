/* =========================================================
   auth.js  ·  PAY4CHARGE
   Configuração das APIs + JSONP + controle de sessão (login).
   ATENÇÃO: login feito no navegador é apenas um "porteiro" visual.
   Não é segurança real — ver observações no chat.
   IMPORTANTE: as 3 APIs precisam suportar JSONP (parâmetro ?callback=)
   no doGet do Apps Script, senão o carregamento não funciona no GitHub Pages.
   ========================================================= */

// ---------- URLs das APIs (/exec) ----------
const DATA_API     = "https://script.google.com/macros/s/AKfycbxnJZOW5-9gXt15dLk--2qtQrMcT2o2LDDxJcV7dvMiPQ_5T9rA0tKmIqOPRHW5KoZn/exec";
const USERS_API    = "https://script.google.com/macros/s/AKfycbwg2xo4RT0L1r7xZv1-Na7lI9ebwJ87trhPjnuhbgKYWvEAGEpyZqPc3CTkvp9-quKm/exec";
const CHARGERS_API = "https://script.google.com/macros/s/AKfycbzITFgn69S8--T6O-kqSxV7CvUg7Tr_x_s9aUqJOCYCAI812yj00NECRLcIUFun6oH4Tw/exec";

const SESSION_KEY = "p4c_user_email";

// ---------- JSONP (contorna CORS do Apps Script) ----------
function loadJSONP(url, timeoutMs = 25000){
  return new Promise((resolve, reject) => {
    const cb = "p4c_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
    const s = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Tempo esgotado ao chamar a API (JSONP)."));
    }, timeoutMs);
    function cleanup(){
      clearTimeout(timer);
      delete window[cb];
      if (s.parentNode) s.parentNode.removeChild(s);
    }
    window[cb] = (data) => { cleanup(); resolve(data); };
    s.onerror = () => { cleanup(); reject(new Error("Falha ao carregar o script da API (JSONP).")); };
    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
    document.head.appendChild(s);
  });
}

// ---------- utilidades ----------
function asArray(data){
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}
function normEmail(e){ return String(e || "").trim().toLowerCase(); }

// ---------- sessão ----------
function getUserEmail(){ return sessionStorage.getItem(SESSION_KEY); }
function setUserEmail(email){ sessionStorage.setItem(SESSION_KEY, String(email).trim()); }
function logout(){
  sessionStorage.removeItem(SESSION_KEY);
  location.href = "login.html";
}

// ---------- autenticação ----------
// Confere e-mail + senha na API de usuários. Retorna true/false.
async function validateLogin(email, senha){
  const users = asArray(await loadJSONP(USERS_API));
  const e = normEmail(email);
  return users.some(u =>
    normEmail(u.email_user) === e && String(u.senha) === String(senha)
  );
}

// Retorna a lista de carregadores (charge_id) liberados para um e-mail.
async function allowedChargers(email){
  const rows = asArray(await loadJSONP(CHARGERS_API));
  const e = normEmail(email);
  return rows
    .filter(r => normEmail(r.email_user) === e)
    .map(r => String(r.charge_id || "").trim())
    .filter(Boolean);
}
