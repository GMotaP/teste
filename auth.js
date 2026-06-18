/* =========================================================
   auth.js  ·  PAY4CHARGE
   Configuração das APIs + JSONP + controle de sessão (login).
   ATENÇÃO: login feito no navegador é apenas um "porteiro" visual.
   Não é segurança real — ver observações no chat.
   IMPORTANTE: as 3 APIs precisam suportar JSONP (parâmetro ?callback=)
   no doGet do Apps Script E estar implantadas como "Qualquer pessoa"
   (anônimo), senão Safari/iPhone (sem login Google) não carrega.
   ========================================================= */

// ---------- URLs das APIs (/exec) ----------
const DATA_API     = "https://script.google.com/macros/s/AKfycbxnJZOW5-9gXt15dLk--2qtQrMcT2o2LDDxJcV7dvMiPQ_5T9rA0tKmIqOPRHW5KoZn/exec";
const USERS_API    = "https://script.google.com/macros/s/AKfycbwg2xo4RT0L1r7xZv1-Na7lI9ebwJ87trhPjnuhbgKYWvEAGEpyZqPc3CTkvp9-quKm/exec";
const CHARGERS_API = "https://script.google.com/macros/s/AKfycbzITFgn69S8--T6O-kqSxV7CvUg7Tr_x_s9aUqJOCYCAI812yj00NECRLcIUFun6oH4Tw/exec";

const SESSION_KEY = "p4c_user_email";

// ---------- JSONP (contorna CORS do Apps Script) ----------
// Robusto p/ mobile/Safari: async, quebra de cache e 1 retry automático.
function loadJSONP(url, timeoutMs = 20000, retries = 1){
  return new Promise((resolve, reject) => {
    let settled = false;
    const cb = "p4c_cb_" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
    const s = document.createElement("script");

    const timer = setTimeout(() => fail(new Error("Tempo esgotado ao chamar a API (JSONP).")), timeoutMs);

    function cleanup(){
      clearTimeout(timer);
      try { delete window[cb]; } catch(_) { window[cb] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
    }
    function done(data){
      if (settled) return; settled = true;
      cleanup(); resolve(data);
    }
    function fail(err){
      if (settled) return; settled = true;
      cleanup();
      if (retries > 0) {
        // tenta de novo (rede móvel instável / carga do Apps Script)
        loadJSONP(url, timeoutMs, retries - 1).then(resolve, reject);
      } else {
        reject(err);
      }
    }

    window[cb] = done;
    s.onerror = () => fail(new Error("Falha ao carregar o script da API (JSONP)."));
    s.async = true;
    // &_= : quebra o cache agressivo do Safari para a tag <script>
    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb + "&_=" + Date.now();
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
function getUserEmail(){
  try { return sessionStorage.getItem(SESSION_KEY); }
  catch(_) { return null; }   // Safari private mode pode bloquear storage
}
function setUserEmail(email){
  try { sessionStorage.setItem(SESSION_KEY, String(email).trim()); } catch(_) {}
}
function logout(){
  try { sessionStorage.removeItem(SESSION_KEY); } catch(_) {}
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
