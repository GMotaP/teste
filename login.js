/* login.js · PAY4CHARGE — valida e-mail/senha e leva ao dashboard */

// Se já estiver logado nesta sessão, vai direto pro painel.
if (getUserEmail()) location.replace("index.html");

const form = document.getElementById("login-form");
const err  = document.getElementById("login-err");
const btn  = document.getElementById("btn");

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  err.style.display = "none";

  const email = document.getElementById("email").value;
  const senha = document.getElementById("senha").value;

  btn.disabled = true;
  btn.textContent = "Entrando…";

  try {
    const ok = await validateLogin(email, senha);
    if (ok) {
      setUserEmail(email);
      location.replace("index.html");
    } else {
      showErr("E-mail ou senha incorretos.");
    }
  } catch (e) {
    showErr("Não consegui validar agora: " + e.message +
      " — confira se a API de usuários tem suporte a JSONP (callback).");
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});

function showErr(msg){
  err.textContent = msg;
  err.style.display = "block";
}
