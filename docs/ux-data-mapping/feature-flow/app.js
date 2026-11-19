/* Motor de la página: matriz de acceso, pestañas por rol, casos de uso y recorrido por pantallas.
   Los datos están en roles.js, storyboard.js y casos/*.js. */
(function () {
  var FF = window.FF;
  var SHOTS = "screenshots/";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function sl(r) { return r.replace(/_/g, "-"); }
  var ARROW = '<svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="6" x2="90" y2="6" stroke="currentColor" stroke-width="2"/><path d="M88,1 L100,6 L88,11 z" fill="currentColor"/></svg>';
  var state = { role: FF.order[0], mode: "casos", uc: null };

  /* ---------- matriz ---------- */
  function matrix() {
    var h = "<thead><tr><th>Vista</th>" + FF.order.map(function (r) { return "<th>" + FF.roles[r].label + "</th>"; }).join("") + "</tr></thead><tbody>";
    Object.keys(FF.views).forEach(function (v) {
      h += "<tr><td>" + FF.views[v][0] + " <code>" + FF.views[v][1] + "</code></td>" + FF.order.map(function (r) {
        var ro = FF.roles[r];
        if (ro.nav.indexOf(v) < 0) return "<td></td>";
        return ro.land === v ? '<td class="home" aria-label="aterrizaje">●</td>' : '<td class="y" aria-label="acceso">●</td>';
      }).join("") + "</tr>";
    });
    $("#matrix").innerHTML = h + "</tbody>";
  }

  /* ---------- lightbox ---------- */
  function zoom(img, label) { $("#lbi").src = SHOTS + img + ".png"; $("#lbi").alt = label; $("#lbt").textContent = label; $("#lb").classList.add("open"); $("#lbx").focus(); }
  function bindZoom(root) { root.querySelectorAll("[data-img]").forEach(function (b) { b.onclick = function () { zoom(b.dataset.img, b.dataset.l); }; }); }

  /* ---------- caso de uso ---------- */
  function failHtml(f) {
    return '<div class="fail"><div class="ft">Si ' + esc(f.when) + "</div>" +
      (f.see ? "<p><b>Ves</b><q>" + esc(f.see) + "</q></p>" : "") +
      (f.what ? "<p><b>Pasa</b>" + esc(f.what) + "</p>" : "") +
      (f.fix ? "<p><b>Haz</b>" + esc(f.fix) + "</p>" : "") + "</div>";
  }
  function stepHtml(s, i) {
    var shot = s.shot
      ? '<button class="shot" type="button" data-img="' + s.shot + '" data-l="' + esc(s.t) + '" aria-label="Ampliar ' + esc(s.t) + '"><img src="' + SHOTS + s.shot + '.png" alt="' + esc(s.t) + '" loading="lazy"></button>'
      : '<div class="noshot">Sin captura de esta pantalla</div>';
    var h = '<div class="col"><div class="box step">' + shot +
      '<h3><span class="idx">' + (i + 1) + "</span>" + esc(s.t) + "</h3>" + (s.r ? "<code>" + esc(s.r) + "</code>" : "") +
      '<p class="do"><b>Tú</b>' + esc(s["do"]) + "</p>" +
      (s.sys ? '<p class="sys"><b>ARIA</b>' + esc(s.sys) + "</p>" : "") + "</div>";
    if (s.fail && s.fail.length) h += '<div class="branches">' + s.fail.map(failHtml).join("") + "</div>";
    return h + "</div>";
  }
  function ucHtml(c) {
    var nFail = c.steps.reduce(function (n, s) { return n + (s.fail ? s.fail.length : 0); }, 0);
    var actors = (c.actors || []).map(function (a) { return '<span class="chip' + (a.role === state.role ? " me" : "") + '">' + esc(FF.roles[a.role].label) + " · " + esc(a.as) + "</span>"; }).join("");
    var h = '<article class="uc"><div class="box uc-head"><h2>' + esc(c.title) + "</h2><p class=\"lead\">" + esc(c.goal) + "</p>" +
      '<div class="chips">' + actors + "</div>" +
      '<div class="cols2"><div><div class="lbl">Antes de empezar</div><ul class="t">' + c.pre.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul></div>";
    if (c.states) {
      h += '<div><div class="lbl">Estados del objeto</div><div class="states">' + c.states.map(function (st, i) {
        return (i ? '<span class="arrow">→</span>' : "") + st.map(function (x) { var k = x[1] || ""; return '<span class="st ' + k + '">' + esc(x[0]) + "</span>"; }).join('<span class="arrow">/</span>');
      }).join("") + "</div></div>";
    }
    h += "</div></div>";
    h += '<div class="lbl" style="margin:4px 0 0">Camino feliz y, debajo de cada paso, lo que puede fallar (' + c.steps.length + " pasos · " + nFail + " fallos)</div>";
    h += '<div class="flow" tabindex="0" aria-label="Flujo del caso de uso">';
    c.steps.forEach(function (s, i) { if (i) h += '<div class="edge">' + ARROW + "<span>" + esc(s.edge || "") + "</span></div>"; h += stepHtml(s, i); });
    h += "</div>";
    if (c.result) h += '<div class="result"><div class="lbl">Resultado</div>' + esc(c.result) + "</div>";
    if (c.confirm && c.confirm.length) h += '<div class="confirm"><div class="lbl">Por confirmar con el equipo</div><ul class="t">' + c.confirm.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    if (c.src && c.src.length) h += '<div class="box src"><div class="lbl">De dónde sale esto en el código</div>' + c.src.map(function (x) { return "<code>" + esc(x) + "</code>"; }).join("") + "</div>";
    return h + "</article>";
  }

  /* ---------- recorrido por pantallas ---------- */
  function sbHtml(role) {
    var steps = FF.sbFlows[role];
    var h = '<p class="note">Las pantallas que visita el rol, en el orden del menú. Para saber qué hacer en cada una y qué pasa si falla, ve a «Casos de uso».</p><div class="sb" tabindex="0" aria-label="Recorrido por pantallas">';
    steps.forEach(function (s, i) {
      var n = {}; var base = FF.sbNodes[s[0]]; var k;
      for (k in base) n[k] = base[k]; if (s[2]) for (k in s[2]) n[k] = s[2][k];
      if (i) h += '<div class="edge">' + ARROW + "<span>" + esc(s[1]) + "</span></div>";
      h += '<div class="col"><div class="box step"><button class="shot" type="button" data-img="' + n.img + '" data-l="' + esc(n.t) + '"><img src="' + SHOTS + n.img + '.png" alt="' + esc(n.t) + '" loading="lazy"></button><h3><span class="idx">' + (i + 1) + "</span>" + esc(n.t) + "</h3><code>" + esc(n.r) + '</code><p class="do">' + esc(n.d) + "</p>";
      if (n.tabs && n.tabs.length) h += '<div class="lbl">Pestañas</div><div class="thumbs">' + n.tabs.map(function (t) { return '<button class="thumb" type="button" data-img="' + t.img + '" data-l="' + esc(n.t + " · " + t.label) + '"><img src="' + SHOTS + t.img + '.png" alt="" loading="lazy"><span>' + esc(t.label) + "</span></button>"; }).join("") + "</div>";
      h += "</div></div>";
    });
    return h + "</div>";
  }

  /* ---------- rol ---------- */
  function hashOf() { return "#" + sl(state.role) + (state.mode === "pantallas" ? "--pantallas" : state.uc ? "--" + state.uc : ""); }
  function render() {
    var r = FF.roles[state.role];
    Array.prototype.forEach.call($("#tabs").children, function (b) { b.setAttribute("aria-selected", String(b.dataset.role === state.role)); });
    var ids = r.cases.filter(function (id) { return FF.cases[id]; });
    if (!state.uc || ids.indexOf(state.uc) < 0) state.uc = ids[0];
    var nav = r.nav.map(function (v) { return FF.views[v][0]; }).join(" · ");
    var h = '<div class="rolehead"><h2>' + r.label + '</h2><span class="pill">Aterriza en ' + FF.views[r.land][1] + '</span><p class="lead">' + esc(r.sum) + '</p><p class="note" style="margin:0"><b>Menú:</b> ' + esc(nav) + "</p></div>";
    h += '<div class="modes" role="tablist"><button type="button" role="tab" data-mode="casos" aria-selected="' + (state.mode === "casos") + '">Casos de uso</button><button type="button" role="tab" data-mode="pantallas" aria-selected="' + (state.mode === "pantallas") + '">Recorrido por pantallas</button></div>';
    if (state.mode === "pantallas") h += sbHtml(state.role);
    else {
      h += '<div class="cases">' + ids.map(function (id) {
        var c = FF.cases[id]; var nf = c.steps.reduce(function (n, s) { return n + (s.fail ? s.fail.length : 0); }, 0);
        return '<button type="button" class="case" data-uc="' + id + '" aria-pressed="' + (id === state.uc) + '"><b>' + esc(c.title) + "</b><span>" + esc(c.short) + "</span><small>" + c.steps.length + " pasos · " + nf + " fallos</small></button>";
      }).join("") + "</div>" + ucHtml(FF.cases[state.uc]);
    }
    var root = $("#role"); root.innerHTML = h;
    bindZoom(root);
    root.querySelectorAll("[data-mode]").forEach(function (b) { b.onclick = function () { state.mode = b.dataset.mode; update(); }; });
    root.querySelectorAll("[data-uc]").forEach(function (b) { b.onclick = function () { state.uc = b.dataset.uc; update(); }; });
  }
  function update() { render(); try { history.replaceState(null, "", hashOf()); } catch (e) { /* file:// */ } }
  function fromHash() {
    var p = location.hash.slice(1).split("--");
    var role = FF.order.filter(function (r) { return sl(r) === p[0]; })[0];
    if (role) state.role = role;
    state.mode = p[1] === "pantallas" ? "pantallas" : "casos";
    state.uc = p[1] && p[1] !== "pantallas" ? p[1] : null;
  }

  function init() {
    matrix();
    FF.order.forEach(function (r) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.textContent = FF.roles[r].label; b.dataset.role = r;
      b.onclick = function () { state.role = r; state.uc = null; update(); };
      $("#tabs").appendChild(b);
    });
    $("#lbx").onclick = function () { $("#lb").classList.remove("open"); };
    $("#lb").onclick = function (e) { if (e.target === $("#lb")) $("#lb").classList.remove("open"); };
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") $("#lb").classList.remove("open"); });
    window.addEventListener("hashchange", function () { fromHash(); render(); });
    fromHash(); render();
  }
  init();
})();
