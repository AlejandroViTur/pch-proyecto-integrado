/* Interfaz del Simulador PCH: panel de parámetros, pestañas, tablas y gráficas. */
(function () {
  "use strict";

  // ======================= utilidades =======================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const formatos = {};
  const nf = (d) => (formatos[d] = formatos[d] || new Intl.NumberFormat("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const f = (v, d = 2) => (v == null || !isFinite(v) ? "—" : nf(d).format(v));
  const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${f(v * 100, d)} %`);
  const milM = (v, d = 1) => `${f(v / 1e9, d)}`; // miles de millones de COP
  const MCOP = (v, d = 0) => `${f(v / 1e6, d)}`; // millones de COP
  const signo = (v, d = 0, fn = (x) => f(x, d)) => (v > 0 ? "+" : "") + fn(v);
  const clsSigno = (v) => (v > 1e-9 ? "pos" : v < -1e-9 ? "neg" : "");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const C = { teal: "#0f9d92", azul: "#1f5f8b", ambar: "#f4a024", rojo: "#d64541", violeta: "#7b61c4", gris: "#5b7083", verde: "#23955a", oxido: "#b4531c", cielo: "#5bb8d6", tinta: "#10242c" };
  const COLOR_MAT = { GRP_FLOWTITE: C.teal, PE100_AGRU: C.azul, DI_PAM: C.violeta, PVC: C.ambar, STEEL_WELDED: C.gris };
  const COLOR_TURB = { Pelton: C.violeta, Francis: C.teal, Kaplan: C.azul, "Michell-Banki": C.ambar };
  const alfa = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  // ======================= estado =======================
  const E = {
    datos: null, cuaderno: null, base: null, p: null, r: null, vista: "resumen", graficas: {},
    trmEnLinea: null, trmEditada: false, opt: null, optFirma: null, temporizador: null,
  };

  // ======================= gráficas =======================
  function configurarChart() {
    Chart.defaults.font.family = "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = "#5a6e77";
    Chart.defaults.borderColor = "#e9eef0";
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation.duration = 350;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.tooltip.backgroundColor = "#08323f";
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.elements.point.radius = 0;
    Chart.defaults.elements.line.borderWidth = 2;
    Chart.defaults.scale.ticks.maxRotation = 0;
    Chart.defaults.scale.ticks.autoSkipPadding = 14;
    // Leyenda: las series de línea se muestran como una línea del color de la serie.
    const generar = Chart.defaults.plugins.legend.labels.generateLabels;
    Chart.defaults.plugins.legend.labels.generateLabels = (ch) => generar(ch).map((it) => {
      const ds = ch.data.datasets[it.datasetIndex] || {};
      const esLinea = (ds.type || ch.config.type) === "line" || ds.showLine;
      if (esLinea && !ds.fill) { it.pointStyle = "line"; it.lineWidth = 3; }
      if (esLinea || it.fillStyle === "rgba(0,0,0,0.1)") it.fillStyle = it.strokeStyle;
      return it;
    });
  }
  const ticks = (d = 0, suf = "") => ({ callback: (v) => f(v, d) + suf });
  function grafica(id, config) {
    const lienzo = document.getElementById(id);
    if (!lienzo) return;
    if (E.graficas[id]) E.graficas[id].destroy();
    E.graficas[id] = new Chart(lienzo, config);
  }
  function destruirGraficas(vista) {
    for (const [id, g] of Object.entries(E.graficas)) {
      if (!document.getElementById(id) || document.getElementById(id).closest(".vista").id === "v-" + vista) { g.destroy(); delete E.graficas[id]; }
    }
  }

  // ======================= componentes HTML =======================
  const kpi = (t, v, u, d, color) => `<div class="kpi" style="--c:${color || C.teal}"><div class="t">${t}</div><div class="v">${v}${u ? `<small>${u}</small>` : ""}</div>${d ? `<div class="d">${d}</div>` : ""}</div>`;
  const tarjeta = (titulo, sub, cuerpo, extra = "", clase = "") => `<div class="tarjeta ${clase}"><div class="tarjeta-cab"><div><h3>${titulo}</h3>${sub ? `<p class="sub">${sub}</p>` : ""}</div>${extra}</div>${cuerpo}</div>`;
  const lienzo = (id, clase = "") => `<div class="lienzo ${clase}"><canvas id="${id}"></canvas></div>`;
  const cabecera = (titulo, texto, extra = "") => `<div class="cab-vista"><div><h1>${titulo}</h1><p>${texto}</p></div>${extra}</div>`;
  const fichaHTML = (pares) => `<div class="ficha">${pares.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>`;

  const TABLAS = {};
  function tabla(id, columnas, filas, { claseFila, alto, csv = true, nombre } = {}) {
    TABLAS[id] = { columnas, filas, nombre: nombre || id };
    const th = columnas.map((c) => `<th class="${c.n ? "n" : ""}">${c.t}</th>`).join("");
    const tr = filas.map((r, i) => `<tr class="${claseFila ? claseFila(r, i) : ""}">${columnas.map((c) => `<td class="${c.n ? "n" : ""} ${c.cls ? c.cls(r) : ""}">${c.h ? c.h(r, i) : c.v(r, i)}</td>`).join("")}</tr>`).join("");
    const boton = csv ? `<button type="button" class="btn-csv" data-csv="${id}">⤓ CSV</button>` : "";
    return { html: `<div class="tabla-envoltura ${alto ? "tabla-alta" : ""}"><table class="t"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`, boton };
  }
  function descargarCSV(id) {
    const t = TABLAS[id]; if (!t) return;
    const limpiar = (s) => String(s).replace(/<[^>]+>/g, "").replace(/"/g, '""');
    const lineas = [t.columnas.map((c) => `"${limpiar(c.t)}"`).join(";")];
    t.filas.forEach((r, i) => lineas.push(t.columnas.map((c) => `"${limpiar(c.csv ? c.csv(r, i) : c.v(r, i))}"`).join(";")));
    const blob = new Blob(["\ufeff" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${t.nombre}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function metodologia(ecs) {
    return `<details class="metodologia"><summary>Ecuaciones y criterios de esta sección</summary><div class="ecuaciones">${ecs.map(([t, tex]) => `<div class="ecuacion"><span>${t}</span><div data-tex="${esc(tex)}"></div></div>`).join("")}</div></details>`;
  }
  function renderTex(raiz) {
    if (!window.katex) return;
    $$("[data-tex]", raiz).forEach((el) => { try { katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = el.dataset.tex; } });
  }
  function figurasCuaderno(prefijos, titulo) {
    const figs = (E.cuaderno.figuras || []).filter((g) => prefijos.some((p) => g.archivo.includes(p)));
    if (!figs.length) return "";
    const fecha = E.cuaderno.resumen.fecha_calculo;
    return `<div style="height:16px"></div>` + tarjeta(titulo, `Gráficas generadas por el cuaderno en la última ejecución automática en GitHub (${fecha}), con los requerimientos del caso base. Haga clic para ampliar.`,
      `<div class="figuras">${figs.map((g) => `<figure class="figura" data-img="figuras/${g.archivo}" data-cap="${esc(g.titulo)}"><img src="figuras/${g.archivo}" alt="${esc(g.titulo)}" loading="lazy"><figcaption>${esc(g.titulo)}</figcaption></figure>`).join("")}</div>`);
  }

  // ======================= parámetros =======================
  const CAMPOS = [
    { grupo: "Sitio e hidrología", ico: "≋", abierto: true, campos: [
      { k: "Q_diseno", t: "Caudal de diseño", u: "m³/s", min: 2, max: 60, paso: 0.5, rango: true, ayuda: "Caudal que turbina la central a plena carga." },
      { k: "Q_eco", t: "Caudal ecológico", u: "m³/s", min: 0, max: 30, paso: 0.5, ayuda: "Caudal que siempre queda en el río." },
      { k: "H_bruto", t: "Salto bruto", u: "m", min: 10, max: 600, paso: 1, rango: true },
      { k: "L", t: "Longitud de la tubería de presión", u: "m", min: 100, max: 6000, paso: 50, rango: true },
      { k: "cota_casa_maquinas", t: "Cota de la casa de máquinas", u: "m s. n. m.", min: 0, max: 4000, paso: 50 },
    ] },
    { grupo: "Tubería de presión", ico: "◎", abierto: true, campos: [
      { k: "material_id", t: "Material", tipo: "material" },
      { k: "D_tuberia", t: "Diámetro interno", tipo: "diametro" },
      { k: "V_max", t: "Velocidad máxima admisible", u: "m/s", min: 1, max: 8, paso: 0.1 },
      { k: "perdida_max", t: "Pérdida máxima admisible", u: "% de Hb", min: 1, max: 15, paso: 0.5, escala: 100 },
      { k: "T_cierre", t: "Tiempo de cierre de la válvula", u: "s", min: 1, max: 120, paso: 1, ayuda: "Para el cálculo del golpe de ariete." },
    ] },
    { grupo: "Accesorios del tramo", ico: "⊕", abierto: true, tipo: "accesorios" },
    { grupo: "Equipos y operación", ico: "⚙", campos: [
      { k: "eta_g", t: "Eficiencia del generador", u: "%", min: 80, max: 99.5, paso: 0.1, escala: 100 },
      { k: "eta_tr", t: "Eficiencia del transformador", u: "%", min: 90, max: 99.9, paso: 0.1, escala: 100 },
      { k: "disponibilidad", t: "Disponibilidad anual", u: "%", min: 70, max: 100, paso: 0.5, escala: 100 },
      { k: "perdidas_linea", t: "Pérdidas de la línea", u: "%", min: 0, max: 10, paso: 0.1, escala: 100 },
      { k: "autoconsumo", t: "Servicios auxiliares", u: "%", min: 0, max: 5, paso: 0.1, escala: 100 },
      { k: "n_unidades_max", t: "Unidades máximas de turbina", u: "", min: 1, max: 3, paso: 1 },
    ] },
    { grupo: "Mercado y evaluación económica", ico: "$", abierto: true, campos: [
      { k: "TRM", t: "TRM (tasa de cambio)", u: "COP/USD", min: 1000, max: 10000, paso: 0.01, ayuda: "Se toma en línea el día del cálculo (datos.gov.co); puede cambiarla." },
      { k: "frac_contrato", t: "Energía vendida en contrato", u: "%", min: 0, max: 100, paso: 5, escala: 100, rango: true },
      { k: "i_desc", t: "Tasa de descuento real", u: "%", min: 1, max: 30, paso: 0.5, escala: 100, rango: true },
      { k: "vida_util", t: "Vida útil (horizonte)", u: "años", min: 10, max: 50, paso: 1 },
      { k: "c_ref_usd_kw", t: "CAPEX de referencia UPME", u: "USD/kW", min: 800, max: 6000, paso: 10 },
      { k: "ley99", t: "Transferencias Ley 99", u: "% ventas", min: 0, max: 10, paso: 0.5, escala: 100 },
      { k: "tasa_renta", t: "Impuesto de renta (variante)", u: "%", min: 0, max: 50, paso: 1, escala: 100 },
    ] },
  ];
  const CLAVES = CAMPOS.flatMap((g) => (g.campos || []).map((c) => c.k)).concat(["accesorios_tramo"]);

  function materialesCatalogo() {
    const m = new Map();
    E.datos.catalogo.forEach((c) => { if (!m.has(c.id)) m.set(c.id, c.material); });
    return [...m.entries()];
  }
  function construirFormulario() {
    const form = $("#form-param");
    form.innerHTML = CAMPOS.map((g) => {
      const cuerpo = g.tipo === "accesorios"
        ? `<div class="acc-lista" id="acc-lista"></div><button type="button" class="btn-agregar" id="acc-agregar">+ Agregar accesorio</button><div class="acc-total"><span>K total del tramo</span><b id="acc-k">—</b></div>`
        : g.campos.map(campoHTML).join("");
      return `<details class="grupo" ${g.abierto ? "open" : ""}><summary><span class="ico">${g.ico}</span>${g.grupo}</summary><div class="grupo-cuerpo">${cuerpo}</div></details>`;
    }).join("");
    form.addEventListener("input", alEditar);
    form.addEventListener("change", alEditar);
    $("#acc-agregar").addEventListener("click", () => {
      const usados = new Set(Object.keys(E.p.accesorios_tramo));
      const libre = E.datos.accesorios.find((a) => !usados.has(a.id));
      if (libre) { E.p.accesorios_tramo = { ...E.p.accesorios_tramo, [libre.id]: 1 }; pintarAccesorios(); programarCalculo(); }
    });
    sincronizarFormulario();
  }
  function campoHTML(c) {
    if (c.tipo === "material") return `<div class="campo" data-k="${c.k}"><div class="campo-cab"><label for="p-${c.k}">${c.t}</label></div><select id="p-${c.k}" data-k="${c.k}">${materialesCatalogo().map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join("")}</select></div>`;
    if (c.tipo === "diametro") return `<div class="campo" data-k="${c.k}"><div class="campo-cab"><label for="p-${c.k}">${c.t}</label></div><select id="p-${c.k}" data-k="${c.k}"></select><div class="ayuda">✓ = cumple velocidad y pérdidas con el caudal de diseño.</div></div>`;
    return `<div class="campo" data-k="${c.k}"><div class="campo-cab"><label for="p-${c.k}">${c.t}</label></div>
      <div class="entrada-num"><input type="number" id="p-${c.k}" data-k="${c.k}" min="${c.min}" max="${c.max}" step="${c.paso}" inputmode="decimal"><span class="u">${c.u}</span></div>
      ${c.rango ? `<input type="range" data-k="${c.k}" data-rango="1" min="${c.min}" max="${c.max}" step="${c.paso}" aria-label="${c.t}">` : ""}
      ${c.ayuda ? `<div class="ayuda">${c.ayuda}</div>` : ""}</div>`;
  }
  const campoPorClave = Object.fromEntries(CAMPOS.flatMap((g) => g.campos || []).map((c) => [c.k, c]));
  function valorVisible(k) { const c = campoPorClave[k], v = E.p[k]; return c && c.escala ? +(v * c.escala).toFixed(6) : v; }
  function sincronizarFormulario() {
    for (const k of CLAVES) {
      if (k === "accesorios_tramo" || k === "D_tuberia") continue;
      $$(`[data-k="${k}"]`, $("#form-param")).forEach((el) => { if (el.tagName !== "DIV" && document.activeElement !== el) el.value = valorVisible(k); });
    }
    pintarDiametros();
    pintarAccesorios();
    marcarCambios();
  }
  function pintarDiametros() {
    const sel = $("#p-D_tuberia"); if (!sel) return;
    const factibles = new Set((E.r && E.r.tabla_tub ? E.r.tabla_tub : []).filter((t) => t.id === E.p.material_id && t.factible).map((t) => t.D));
    const Ds = E.datos.catalogo.filter((c) => c.id === E.p.material_id).map((c) => c.D).sort((a, b) => a - b);
    sel.innerHTML = `<option value="">Automático: menor diámetro que cumple</option>` + Ds.map((D) => `<option value="${D}">${f(D, 2)} m ${factibles.has(D) ? "✓" : ""}</option>`).join("");
    sel.value = E.p.D_tuberia == null ? "" : String(E.p.D_tuberia);
  }
  function pintarAccesorios() {
    const lista = $("#acc-lista"); if (!lista) return;
    const porCat = {};
    E.datos.accesorios.forEach((a) => (porCat[a.categoria] = porCat[a.categoria] || []).push(a));
    const opciones = (sel) => Object.entries(porCat).map(([cat, as]) => `<optgroup label="${esc(cat)}">${as.map((a) => `<option value="${a.id}" ${a.id === sel ? "selected" : ""}>${esc(a.accesorio)} · ${esc(a.detalle)}</option>`).join("")}</optgroup>`).join("");
    const acc = E.datos.accesorios.reduce((m, a) => ((m[a.id] = a), m), {});
    lista.innerHTML = Object.entries(E.p.accesorios_tramo).map(([id, n]) => `
      <div class="acc-fila" data-id="${id}">
        <select data-acc="tipo" aria-label="Tipo de accesorio">${opciones(id)}</select>
        <div class="cant"><button type="button" data-acc="menos" aria-label="Menos">−</button><input data-acc="n" value="${n}" inputmode="numeric" aria-label="Cantidad"><button type="button" data-acc="mas" aria-label="Más">+</button></div>
        <button type="button" class="acc-quitar" data-acc="quitar" aria-label="Quitar" title="Quitar">✕</button>
        <div class="k">K = ${f(acc[id].K, 3)} c/u · ${esc(acc[id].fuente.split(",")[0])}</div>
      </div>`).join("");
    const K = Object.entries(E.p.accesorios_tramo).reduce((s, [id, n]) => s + n * acc[id].K, 0);
    $("#acc-k").textContent = f(K, 3);
    lista.onclick = lista.oninput = lista.onchange = (ev) => {
      const fila = ev.target.closest(".acc-fila"); if (!fila) return;
      const id = fila.dataset.id, accion = ev.target.dataset.acc, a = { ...E.p.accesorios_tramo };
      ev.stopPropagation();
      if (ev.type === "click" && accion === "mas") a[id] = (a[id] || 0) + 1;
      else if (ev.type === "click" && accion === "menos") a[id] = Math.max(1, (a[id] || 1) - 1);
      else if (ev.type === "click" && accion === "quitar") delete a[id];
      else if (ev.type === "change" && accion === "tipo") {
        const nuevo = ev.target.value; const n = a[id]; const orden = Object.keys(a); const r = {};
        orden.forEach((k) => { if (k === id) r[nuevo] = (r[nuevo] || 0) + n; else if (k !== nuevo || id === nuevo) r[k] = (r[k] || 0) + a[k]; else r[k] = (r[k] || 0) + a[k]; });
        E.p.accesorios_tramo = r; pintarAccesorios(); programarCalculo(); return;
      } else if (ev.type === "input" && accion === "n") { const v = parseInt(ev.target.value, 10); if (!(v >= 1)) return; a[id] = Math.min(v, 99); E.p.accesorios_tramo = a; programarCalculo(); return; }
      else return;
      E.p.accesorios_tramo = a; pintarAccesorios(); programarCalculo();
    };
  }
  function alEditar(ev) {
    const el = ev.target, k = el.dataset.k;
    if (!k) return;
    if (k === "material_id") { E.p.material_id = el.value; E.p.D_tuberia = null; }
    else if (k === "D_tuberia") { E.p.D_tuberia = el.value === "" ? null : Number(el.value); }
    else {
      const c = campoPorClave[k], v = parseFloat(String(el.value).replace(",", "."));
      if (!isFinite(v)) return;
      E.p[k] = c.escala ? v / c.escala : v;
      if (k === "TRM") E.trmEditada = true;
      $$(`[data-k="${k}"]`).forEach((o) => { if (o !== el) o.value = valorVisible(k); });
    }
    programarCalculo();
  }
  function cambios() {
    return CLAVES.filter((k) => JSON.stringify(E.p[k]) !== JSON.stringify(E.base[k]));
  }
  function marcarCambios() {
    const c = new Set(cambios());
    $$(".campo[data-k]").forEach((el) => el.classList.toggle("cambiado", c.has(el.dataset.k)));
  }

  // ======================= cálculo =======================
  function programarCalculo() {
    clearTimeout(E.temporizador);
    $("#estado").textContent = "Calculando…"; $("#estado").hidden = false;
    E.temporizador = setTimeout(calcularYMostrar, 220);
  }
  function calcularYMostrar() {
    try { E.r = Motor.calcular(E.datos, E.p); }
    catch (err) { console.error(err); E.r = { error: "No se pudo calcular con estos valores: " + err.message, p: E.p }; }
    $("#estado").hidden = true;
    guardarEnEnlace();
    marcarCambios();
    pintarDiametros();
    pintarAvisos();
    pintarVista();
  }
  function pintarAvisos() {
    const r = E.r, cont = $("#avisos");
    const items = [];
    if (r.error) items.push(`<div class="aviso error"><b>⚠</b><div>${esc(r.error)}</div></div>`);
    (r.avisos || []).forEach((a) => items.push(`<div class="aviso"><b>!</b><div>${esc(a)}</div></div>`));
    cont.innerHTML = items.length ? `<div class="avisos">${items.join("")}</div>` : "";
  }

  // ======================= vistas =======================
  const VISTAS = {};
  function pintarVista() {
    const v = E.vista, sec = $("#v-" + v);
    destruirGraficas(v);
    if (E.r.error && !["datos", "optimizacion"].includes(v)) {
      sec.innerHTML = cabecera(titulos[v], "No hay un diseño factible con los requerimientos actuales.") + tarjeta("Ajuste los requerimientos iniciales", "", `<p>${esc(E.r.error)}</p><button class="btn" type="button" id="btn-reset2">Volver al caso base</button>`);
      $("#btn-reset2").onclick = restablecer;
      return;
    }
    VISTAS[v](sec);
    renderTex(sec);
  }
  const titulos = { resumen: "Resumen del proyecto", hidraulica: "Hidráulica y accesorios", tuberias: "Tuberías: opciones y costos", turbina: "Selección de la turbina", energia: "Producción de energía", economia: "Evaluación económica", optimizacion: "Optimización del diseño", datos: "Datos y fuentes" };

  function etiquetaEscenario() {
    const n = cambios().length;
    return n ? `<span class="etiqueta ambar">Escenario modificado · ${n} cambio${n > 1 ? "s" : ""}</span>` : `<span class="etiqueta">Caso base del proyecto</span>`;
  }

  // ---------- Resumen ----------
  VISTAS.resumen = (sec) => {
    const r = E.r, p = r.p, ind = r.ind, fi = r.ficha;
    const tecnicos = r.verificacion.slice(0, 6), economicos = r.verificacion.slice(6);
    const okTec = tecnicos.every((v) => v.cumple), okEco = economicos.every((v) => v.cumple);
    const fallan = r.verificacion.filter((v) => !v.cumple).map((v) => v.criterio.toLowerCase());
    const dict = okTec && okEco
      ? `<div class="dictamen ok"><div class="sello">✓</div><div><h2>El proyecto es viable técnica y económicamente</h2><p>${fi.turbina} × ${fi.n_unid} de ${f(fi.P_inst, 2)} MW · VAN ${milM(ind.VAN)} mil millones de COP · TIR ${pct(ind.TIR)} frente a una tasa de descuento de ${pct(p.i_desc, 0)}.</p></div></div>`
      : `<div class="dictamen no"><div class="sello">!</div><div><h2>${okTec ? "Técnicamente factible, pero no rentable" : "El diseño no cumple todos los criterios"}</h2><p>No cumple: ${esc(fallan.join("; "))}.</p></div></div>`;
    const precioMedio = r.I_base / r.E_base;
    sec.innerHTML = cabecera(titulos.resumen, `Diseño completo de la PCH con los requerimientos del panel. Q = ${f(p.Q_diseno, 1)} m³/s, H = ${f(p.H_bruto, 0)} m, L = ${f(p.L, 0)} m.`, etiquetaEscenario())
      + dict
      + `<div class="kpis">
        ${kpi("Potencia instalada", f(fi.P_inst, 2), "MW", `${fi.turbina} × ${fi.n_unid}`, C.teal)}
        ${kpi("Energía neta media", f(r.operacion.E_media / 1e6, 1), "GWh/año", `Factor de planta ${pct(r.operacion.FP, 0)}`, C.azul)}
        ${kpi("CAPEX", f(r.cx.total / 1e6, 1), "MUSD", `${milM(r.CAPEX)} mil M COP · ${f(r.cx.total / (fi.P_inst * 1000), 0)} USD/kW`, C.violeta)}
        ${kpi("VAN", milM(ind.VAN), "mil M COP", `al ${pct(p.i_desc, 0)} en ${p.vida_util} años`, ind.VAN > 0 ? C.verde : C.rojo)}
        ${kpi("TIR", pct(ind.TIR), "", `B/C = ${f(ind.BC, 2)}`, ind.TIR > p.i_desc ? C.verde : C.rojo)}
        ${kpi("Recuperación", f(ind.PB, 1), "años", `descontada: ${f(ind.PB_din, 1)} años`, C.ambar)}
        ${kpi("LCOE", f(ind.LCOE, 0), "COP/kWh", `precio medio de venta ${f(precioMedio, 0)}`, C.oxido)}
        ${kpi("CO₂ evitado", f(r.co2[0].anual, 0), "t/año", `P(VAN < 0) = ${pct(r.montecarlo.pPerdida)}`, C.cielo)}
      </div>`
      + `<div class="rejilla r-12">
        ${tarjeta("Diseño seleccionado", "Resultado del cálculo con los requerimientos actuales", fichaHTML([
          ["Caudal de diseño", `${f(p.Q_diseno, 1)} m³/s`], ["Salto neto", `${f(r.hd.Hn, 2)} m`],
          ["Tubería", `${Motor.nombreMaterial(E.datos, r.material).split(" ")[0]} D = ${f(r.D_sel, 2)} m`], ["Velocidad", `${f(r.hd.V, 2)} m/s`],
          ["Pérdidas", `${f(r.hd.perdida * 100, 2)} % de Hb`], ["Turbina", `${fi.turbina} × ${fi.n_unid}`],
          ["Velocidad de giro", `${f(fi.n_rpm, 0)} rpm`], ["Cierre mínimo", `${f(r.ariete.T_min, 0)} s`],
        ]))}
        ${tarjeta("Verificación de criterios", "Criterios de diseño y de rentabilidad", `<div class="lista-ver">${r.verificacion.map((v) => `<div><span class="s ${v.cumple ? "" : "no"}">${v.cumple ? "✓" : "✕"}</span><span>${esc(v.criterio)}</span><span class="r">${esc(v.resultado)}</span></div>`).join("")}</div>`)}
      </div>
      <div class="rejilla r2">
        ${tarjeta("Curva de duración de caudales", `El río supera Qd + Qeco el ${f(excedencia(r) * 100, 1)} % del tiempo`, lienzo("g-duracion"))}
        ${tarjeta("Recuperación de la inversión", `Flujo de caja acumulado, escenario base (${pct(p.frac_contrato, 0)} contrato)`, lienzo("g-recuperacion"))}
      </div>`;
    graficaDuracion("g-duracion");
    graficaRecuperacion("g-recuperacion");
  };
  function excedencia(r) { const q = r.p.Q_diseno + r.p.Q_eco; const Q = E.datos.rio.Q; return Q.filter((v) => v > q).length / Q.length; }
  function graficaDuracion(id) {
    const r = E.r, Q = [...E.datos.rio.Q].sort((a, b) => b - a), N = Q.length, pts = [];
    for (let k = 0; k < 400; k++) { const i = Math.round(k / 399 * (N - 1)); pts.push({ x: (i + 1) / (N + 1) * 100, y: Math.max(Q[i], 0.01) }); }
    const lineaH = (y, color, etiqueta, dash) => ({ label: etiqueta, data: [{ x: 0, y }, { x: 100, y }], borderColor: color, borderDash: dash, borderWidth: 1.6, fill: false });
    grafica(id, { type: "line", data: { datasets: [
      { label: "Caudal del río", data: pts, borderColor: C.azul, backgroundColor: alfa(C.azul, 0.12), fill: "origin" },
      lineaH(r.p.Q_diseno + r.p.Q_eco, C.ambar, `Qd + Qeco = ${f(r.p.Q_diseno + r.p.Q_eco, 1)} m³/s`, [6, 4]),
      lineaH(Math.max(r.p.Q_eco, 0.01), C.rojo, `Caudal ecológico = ${f(r.p.Q_eco, 1)} m³/s`, [2, 3]),
    ] }, options: { parsing: false, scales: { x: { type: "linear", min: 0, max: 100, title: { display: true, text: "Probabilidad de excedencia (%)" } }, y: { type: "logarithmic", title: { display: true, text: "Caudal (m³/s)" }, ticks: { callback: (v) => ([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].includes(v) ? f(v, 0) : "") } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 1)} m³/s` } } }, interaction: { mode: "nearest", intersect: false } } });
  }
  function graficaRecuperacion(id) {
    const r = E.r, ev = r.ev;
    const acum = ev.map((x) => x.amortizacion / 1e9), acD = r.ind.acum_desc.map((v) => v / 1e9);
    grafica(id, { data: { labels: ev.map((x) => x.anio), datasets: [
      { type: "bar", label: "Flujo acumulado", data: acum, backgroundColor: acum.map((v) => (v < 0 ? alfa(C.rojo, 0.75) : alfa(C.teal, 0.75))), borderRadius: 3, order: 2 },
      { type: "line", label: `Acumulado descontado al ${pct(r.p.i_desc, 0)}`, data: acD, borderColor: C.azul, pointRadius: 2, order: 1 },
    ] }, options: { scales: { x: { title: { display: true, text: "Año" }, grid: { display: false } }, y: { title: { display: true, text: "Miles de millones de COP" }, ticks: ticks(0) } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 1)} mil M COP` } } } } });
  }

  // ---------- Hidráulica ----------
  VISTAS.hidraulica = (sec) => {
    const r = E.r, h = r.hd, a = r.ariete, p = r.p;
    const inv = tabla("t-acc", [
      { t: "Accesorio", h: (x) => `${esc(x.accesorio)}${x.detalle ? `<div class="nota" style="margin:0;white-space:normal">${esc(x.detalle)}</div>` : ""}`, v: (x) => `${x.accesorio} ${x.detalle}`.trim(), cls: () => "envuelve" },
      { t: "Cant.", n: 1, v: (x) => x.cantidad }, { t: "K unit.", n: 1, v: (x) => f(x.K, 3) }, { t: "K total", n: 1, v: (x) => f(x.Ktot, 3) },
      { t: "h_m [m]", n: 1, v: (x) => f(x.hm, 3) }, { t: "% de h_m", n: 1, v: (x) => f(h.hm > 0 ? x.hm / h.hm * 100 : 0, 1) },
    ], [...r.desglose, { accesorio: "TOTAL", detalle: "", cantidad: r.desglose.reduce((s, x) => s + x.cantidad, 0), K: NaN, Ktot: r.K_total, hm: h.hm }],
    { claseFila: (x) => (x.accesorio === "TOTAL" ? "total" : ""), nombre: "accesorios_tramo" });
    sec.innerHTML = cabecera(titulos.hidraulica, `Cadena de Darcy–Weisbach con Swamee–Jain para ${Motor.nombreMaterial(E.datos, r.material)} D = ${f(r.D_sel, 2)} m y los accesorios del panel.`, etiquetaEscenario())
      + `<div class="kpis">
        ${kpi("Velocidad media", f(h.V, 2), "m/s", `límite ${f(p.V_max, 1)} m/s`, h.V <= p.V_max ? C.teal : C.rojo)}
        ${kpi("Reynolds", f(h.Re / 1e6, 2), "× 10⁶", "régimen turbulento", C.azul)}
        ${kpi("Factor de fricción", f(h.f, 5), "", "Swamee–Jain", C.violeta)}
        ${kpi("Pérdida por fricción", f(h.hf, 3), "m", "h_f", C.ambar)}
        ${kpi("Pérdidas menores", f(h.hm, 3), "m", `K total = ${f(r.K_total, 3)}`, C.oxido)}
        ${kpi("Pérdida total", f(h.hL, 2), "m", `${f(h.perdida * 100, 2)} % de Hb (máx. ${f(p.perdida_max * 100, 0)} %)`, h.perdida <= p.perdida_max ? C.verde : C.rojo)}
        ${kpi("Salto neto", f(h.Hn, 2), "m", `de ${f(p.H_bruto, 0)} m de salto bruto`, C.teal)}
        ${kpi("Potencia hidráulica", f(h.Ph, 2), "MW", "ρ g Q Hn", C.cielo)}
      </div>
      ${tarjeta("Pérdida de cada accesorio", "h_m,i = n_i K_i V²/2g con la velocidad de diseño. Cambie el tipo o la cantidad en el panel de la izquierda.", `<div class="rejilla r-12" style="margin:0">${lienzo("g-acc")}<div>${inv.html}</div></div>`, inv.boton)}
      <div style="height:16px"></div>
      <div class="rejilla r2">
        ${tarjeta("Curva del sistema", "Salto neto y potencia eléctrica en función del caudal", lienzo("g-sistema", "alto"))}
        ${tarjeta("Pérdidas frente al diámetro", `Todos los materiales del catálogo con Q = ${f(p.Q_diseno, 1)} m³/s`, lienzo("g-perd-d", "alto"))}
      </div>
      ${tarjeta("Golpe de ariete", `${esc(a.clase)} · espesor de pared ${f(a.e_mm, 0)} mm`, `<div class="rejilla r-12" style="margin:0">${fichaHTML([
          ["Celeridad de la onda", `${f(a.a, 0)} m/s`], ["Tiempo crítico 2L/a", `${f(a.Tc, 1)} s`],
          ["Δh Joukowsky", `${f(a.dh_jouk, 0)} m`], [`Δh con cierre de ${f(p.T_cierre, 0)} s`, `${f(a.dh_T, 0)} m · ${f(a.dh_T / p.H_bruto * 100, 0)} % Hb`],
          ["Cierre mínimo (Δh ≤ 30 % Hb)", `${f(a.T_min, 0)} s`], ["Presión de diseño", `${f(1.3 * p.H_bruto, 0)} m.c.a.`],
        ])}${lienzo("g-ariete")}</div>`)}`
      + metodologia([
        ["Velocidad y Reynolds", "V=\\frac{4Q}{\\pi D^2},\\qquad Re=\\frac{VD}{\\nu}"],
        ["Fricción (Swamee–Jain)", "f=\\frac{0.25}{\\left[\\log_{10}\\left(\\frac{\\varepsilon}{3.7D}+\\frac{5.74}{Re^{0.9}}\\right)\\right]^2}"],
        ["Pérdidas mayores y menores", "h_f=f\\frac{L}{D}\\frac{V^2}{2g},\\qquad h_m=\\sum_i n_iK_i\\frac{V^2}{2g}"],
        ["Salto neto y potencia", "H_n=H_b-h_f-h_m,\\qquad P=\\rho g Q H_n\\eta_t\\eta_g"],
        ["Codos y rejilla", "K_\\theta=K_{90}(r/D)\\,C_\\theta,\\qquad K_{rej}=k_t\\left(\\tfrac{t}{b}\\right)^{4/3}\\sin\\varphi"],
        ["Golpe de ariete", "a=\\sqrt{\\frac{K_w/\\rho}{1+\\frac{K_wD}{Ee}}},\\quad \\Delta h=\\frac{aV}{g},\\quad T_{min}=\\frac{2LV}{0.3gH_b}"],
      ]);
    // Accesorios
    const d = [...r.desglose].sort((x, y) => y.hm - x.hm);
    grafica("g-acc", { type: "bar", data: { labels: d.map((x) => `${x.accesorio} (${x.cantidad})`), datasets: [{ data: d.map((x) => x.hm), backgroundColor: d.map((_, i) => [C.teal, C.azul, C.ambar, C.violeta, C.oxido, C.gris, C.cielo, C.verde][i % 8]), borderRadius: 4 }] },
      options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `h_m = ${f(c.parsed.x, 3)} m` } } }, scales: { x: { title: { display: true, text: "h_m (m)" }, ticks: ticks(2) }, y: { grid: { display: false } } } } });
    // Curva del sistema
    const M = r.modelo, Qs = [], Hn = [], P = [];
    for (let k = 0; k <= 60; k++) { const q = Math.max(0.1, p.Q_diseno * 1.6 * k / 60); const hh = M.hidraulica(q, r.D_sel, r.eps_sel, r.K_total); Qs.push(q); Hn.push(hh.Hn); P.push(r.modelo.rho * r.modelo.g * q * Math.max(hh.Hn, 0) * r.ficha.eta_nom * p.eta_g / 1e6); }
    grafica("g-sistema", { type: "line", data: { datasets: [
      { label: "Salto neto (m)", data: Qs.map((q, i) => ({ x: q, y: Hn[i] })), borderColor: C.azul, yAxisID: "y" },
      { label: "Potencia (MW)", data: Qs.map((q, i) => ({ x: q, y: P[i] })), borderColor: C.ambar, yAxisID: "y1" },
    ] }, options: { interaction: { mode: "index", intersect: false }, scales: { x: { type: "linear", title: { display: true, text: "Caudal (m³/s)" }, ticks: ticks(0) }, y: { title: { display: true, text: "Salto neto (m)" }, ticks: ticks(0) }, y1: { position: "right", min: 0, grid: { display: false }, title: { display: true, text: "Potencia (MW)" } } },
      plugins: { tooltip: { callbacks: { title: (c) => `Q = ${f(c[0].parsed.x, 1)} m³/s`, label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 2)}` } } } }, plugins: [lineaVertical(p.Q_diseno, "Qd")] });
    // Ariete
    const Ts = [], dh = [];
    for (let k = 0; k <= 180; k++) { const T = 1 + k * 0.5; Ts.push(T); dh.push(T <= a.Tc ? a.dh_jouk : 2 * p.L * h.V / (M.g * T)); }
    grafica("g-ariete", { type: "line", data: { datasets: [
      { label: "Sobrepresión Δh", data: Ts.map((T, i) => ({ x: T, y: dh[i] })), borderColor: C.azul, fill: false },
      { label: "Límite 30 % Hb", data: [{ x: 1, y: 0.3 * p.H_bruto }, { x: 91, y: 0.3 * p.H_bruto }], borderColor: C.rojo, borderDash: [6, 4], borderWidth: 1.5 },
    ] }, options: { interaction: { mode: "nearest", axis: "x", intersect: false }, scales: { x: { type: "linear", min: 0, max: 90, title: { display: true, text: "Tiempo de cierre de la válvula (s)" } }, y: { min: 0, title: { display: true, text: "Δh (m.c.a.)" } } },
      plugins: { tooltip: { callbacks: { title: (c) => `Cierre en ${f(c[0].parsed.x, 1)} s`, label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 0)} m` } } } }, plugins: [lineaVertical(a.T_min, "T mín"), lineaVertical(a.Tc, "2L/a")] });
    // Pérdidas vs diámetro
    const porMat = {};
    r.tabla_tub.filter((t) => t.perdida < 0.3).forEach((t) => (porMat[t.id] = porMat[t.id] || []).push(t));
    const conjuntos = Object.entries(porMat).filter(([, filas]) => filas.length > 1).map(([id, filas]) => ({ label: Motor.nombreMaterial(E.datos, id), data: filas.filter((t) => t.perdida < 0.3).map((t) => ({ x: t.D, y: t.perdida * 100 })), borderColor: COLOR_MAT[id], backgroundColor: COLOR_MAT[id], pointRadius: 2, showLine: true }));
    const Dmin = Math.min(...r.tabla_tub.filter((t) => t.perdida < 0.3).map((t) => t.D));
    conjuntos.push({ label: `Límite ${f(p.perdida_max * 100, 0)} %`, data: [{ x: Dmin, y: p.perdida_max * 100 }, { x: 4.2, y: p.perdida_max * 100 }], borderColor: C.rojo, borderDash: [6, 4], borderWidth: 1.5, showLine: true });
    conjuntos.push({ label: "Seleccionada", data: [{ x: r.D_sel, y: h.perdida * 100 }], pointRadius: 7, pointStyle: "rectRot", backgroundColor: C.tinta, borderColor: "#fff", borderWidth: 2 });
    grafica("g-perd-d", { type: "scatter", data: { datasets: conjuntos }, options: { scales: { x: { title: { display: true, text: "Diámetro interno (m)" }, ticks: ticks(1) }, y: { title: { display: true, text: "Pérdida total (% de Hb)" }, ticks: ticks(0) } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: D = ${f(c.parsed.x, 2)} m → ${f(c.parsed.y, 2)} %` } } } } });
  };
  function lineaVertical(indice, texto) { // índice de categoría o valor del eje x lineal
    return { id: "lv" + texto, afterDatasetsDraw(ch) {
      if (indice == null || indice < 0) return;
      const x = ch.scales.x.getPixelForValue(indice), { top, bottom } = ch.chartArea, c = ch.ctx;
      if (x < ch.chartArea.left || x > ch.chartArea.right) return;
      c.save(); c.strokeStyle = "#8a9ba3"; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, top); c.lineTo(x, bottom); c.stroke();
      c.setLineDash([]); c.fillStyle = "#5a6e77"; c.font = "11px Inter, sans-serif"; c.fillText(texto, x + 4, top + 12); c.restore();
    } };
  }

  // ---------- Tuberías ----------
  VISTAS.tuberias = (sec) => {
    const r = E.r, ref = r.ref, b = r.barata, m = r.mejor, TRM = r.TRM;
    const sug = r.comp_mat.find((x) => x.factible);
    const t = tabla("t-cmp", [
      { t: "#", n: 1, v: (_, i) => i + 1 },
      { t: "Material", v: (x) => esc(x.nombre) }, { t: "D [m]", n: 1, v: (x) => f(x.D, 2) }, { t: "V [m/s]", n: 1, v: (x) => f(x.V, 2) },
      { t: "η cond. [%]", n: 1, v: (x) => f(x.eta_cond, 2) }, { t: "Costo tubería [M COP]", n: 1, v: (x) => MCOP(x.costoTub) },
      { t: "Δ costo [M COP]", n: 1, v: (x) => signo(x.dCosto / 1e6, 0), cls: (x) => clsSigno(-x.dCosto) },
      { t: "Δ costo [%]", n: 1, v: (x) => signo(x.dCostoPct, 1), cls: (x) => clsSigno(-x.dCosto) },
      { t: "VAN [mil M COP]", n: 1, v: (x) => milM(x.VAN, 2) }, { t: "Δ VAN [mil M]", n: 1, v: (x) => signo(x.dVAN / 1e9, 2), cls: (x) => clsSigno(x.dVAN) },
      { t: "TIR [%]", n: 1, v: (x) => f(x.TIR * 100, 2) },
      { t: "Nota", v: (x) => [x.seleccionada ? "◀ seleccionada" : "", x.barata ? "▼ más barata" : "", x.mejor ? "★ mayor VAN" : ""].filter(Boolean).join(" · ") },
      { t: "", h: (x) => (x.seleccionada ? "" : x.material === "STEEL_WELDED" ? `<span class="nota" title="El acero se fabrica a medida: no está en el catálogo comercial">a medida</span>` : `<button type="button" class="btn chico" data-usar="${x.material}|${x.D}">Usar</button>`), v: () => "" },
    ], r.cmp_tub, { claseFila: (x) => (x.seleccionada ? "marcada" : ""), alto: true, nombre: "comparativo_tuberias" });
    const tm = tabla("t-mat", [
      { t: "#", n: 1, v: (_, i) => i + 1 }, { t: "Material", v: (x) => esc(x.material) },
      { t: "D [m]", n: 1, v: (x) => (x.factible ? f(x.D, 2) : "—") },
      { t: "η cond. [%]", n: 1, v: (x) => (x.factible ? f(x.eta_cond, 2) : "—") }, { t: "Tubería [MUSD]", n: 1, v: (x) => (x.factible ? f(x.costoTubUsd / 1e6, 2) : "—") },
      { t: "VAN [mil M]", n: 1, v: (x) => (x.factible ? milM(x.VAN, 1) : "—") },
      { t: "Δh Joukowsky [m]", n: 1, v: (x) => (x.factible ? f(x.dh, 0) : esc(x.motivo)), csv: (x) => (x.factible ? f(x.dh, 0) : x.motivo) },
    ], r.comp_mat, { claseFila: (_, i) => (i === 0 ? "marcada" : ""), nombre: "comparativo_materiales" });
    sec.innerHTML = cabecera(titulos.tuberias, `${r.cmp_tub.length} tuberías cumplen V ≤ ${f(r.p.V_max, 1)} m/s y pérdidas ≤ ${f(r.p.perdida_max * 100, 0)} % de Hb con Q = ${f(r.p.Q_diseno, 1)} m³/s. Costos en pesos con la TRM de ${f(TRM, 2)} COP/USD.`, etiquetaEscenario())
      + `<div class="rejilla r3">
        ${tarjeta("Tubería seleccionada", esc(r.modo_sel), fichaHTML([["Material", esc(ref.nombre)], ["Diámetro", `${f(ref.D, 2)} m`], ["Costo tubería", `${MCOP(ref.costoTubUsd * TRM)} M COP`], ["VAN", `${milM(ref.VAN, 1)} mil M`]]))}
        ${tarjeta("▼ La más barata que cumple", b === ref ? "Es la seleccionada" : `Ahorra ${MCOP(-r.cmp_tub.find((x) => x.barata).dCosto)} M COP en tubería`, fichaHTML([["Material", esc(b.nombre)], ["Diámetro", `${f(b.D, 2)} m`], ["Costo tubería", `${MCOP(b.costoTubUsd * TRM)} M COP`], ["VAN", `${milM(b.VAN, 1)} mil M`]]))}
        ${tarjeta("★ Material sugerido (mayor VAN)", m === ref ? "Es la seleccionada" : `${signo((m.VAN - ref.VAN) / 1e9, 1)} mil M COP de VAN frente a la seleccionada`, fichaHTML([["Material", esc(m.nombre)], ["Diámetro", `${f(m.D, 2)} m`], ["Eficiencia conducción", `${f((1 - m.perdida) * 100, 2)} %`], ["VAN", `${milM(m.VAN, 1)} mil M`]]), m !== ref && m.material !== "STEEL_WELDED" ? `<button type="button" class="btn chico" data-usar="${m.material}|${m.D}">Usar</button>` : "")}
      </div>
      ${tarjeta("Diferencia de costo frente a la seleccionada", "Barras a la izquierda: tuberías más baratas que la seleccionada. El color indica el material.", `<div class="lienzo" style="height:${Math.max(320, r.cmp_tub.length * 19 + 70)}px"><canvas id="g-dcosto"></canvas></div>` + `<div class="leyenda-mini" style="margin-top:8px">${Object.entries(COLOR_MAT).map(([id, c]) => `<span><i style="background:${c}"></i>${esc(Motor.nombreMaterial(E.datos, id))}</span>`).join("")}</div>`)}
      <div style="height:16px"></div>
      ${tarjeta("Todas las tuberías que cumplen el diseño", "Ordenadas de la más barata a la más cara. «Usar» cambia la tubería del diseño y recalcula todo el proyecto.", t.html, t.boton)}
      <div style="height:16px"></div>
      <div class="rejilla r-12">
        ${tarjeta("Costo frente a eficiencia por material", "Cada punto es un diámetro que cumple; más a la izquierda y más arriba es mejor", lienzo("g-costo-ef", "alto"))}
        ${tarjeta("Comparativo de materiales", `Mejor diámetro de cada material (mayor VAN). Sugerido: ${esc(sug ? sug.material : "—")}`, tm.html, tm.boton)}
      </div>`
      + metodologia([
        ["Eficiencia de la conducción", "\\eta_{cond}=\\frac{H_n}{H_b}=1-\\frac{h_L}{H_b}"],
        ["Costo de la tubería", "C_{tub}=\\pi(D+e)\\,e\\,L\\cdot7.85\\cdot p_{acero}\\cdot2\\cdot f_{mat}"],
        ["Diferencia de costo", "\\Delta C_j=(C_{tub,j}-C_{tub,sel})\\cdot TRM"],
        ["Diferencia de VAN", "\\Delta VAN_j=VAN_j-VAN_{sel}"],
      ]);
    const filas = r.cmp_tub;
    grafica("g-dcosto", { type: "bar", data: { labels: filas.map((x) => `${x.nombre.split(" ")[0]} ${f(x.D, 2)} m${x.seleccionada ? " ◀" : ""}`), datasets: [{ data: filas.map((x) => x.dCosto / 1e6),
      backgroundColor: filas.map((x) => (x.seleccionada ? C.tinta : alfa(COLOR_MAT[x.material], 0.85))), borderRadius: 3 }] },
    options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const x = filas[c.dataIndex]; return [`Δ costo: ${signo(x.dCosto / 1e6, 0)} M COP (${signo(x.dCostoPct, 1)} %)`, `Δ VAN: ${signo(x.dVAN / 1e9, 2)} mil M COP`]; } } } },
      scales: { x: { title: { display: true, text: "Δ costo de la tubería (millones de COP)" }, ticks: ticks(0) }, y: { grid: { display: false }, ticks: { font: { size: 10.5 }, autoSkip: false } } } } });
    const ds = r.comp_mat.filter((x) => x.factible).map((x) => ({ label: x.material, data: x.curva.map((c) => ({ x: c.costoTubUsd * TRM / 1e6, y: (1 - c.perdida) * 100 })), borderColor: COLOR_MAT[x.id], backgroundColor: COLOR_MAT[x.id], showLine: true, pointRadius: 3 }));
    ds.push({ label: "Seleccionada", data: [{ x: ref.costoTubUsd * TRM / 1e6, y: (1 - ref.perdida) * 100 }], pointRadius: 8, pointStyle: "rectRot", backgroundColor: C.tinta, borderColor: "#fff", borderWidth: 2 });
    grafica("g-costo-ef", { type: "scatter", data: { datasets: ds }, options: { scales: { x: { title: { display: true, text: "Costo de la tubería (millones de COP)" }, ticks: ticks(0) }, y: { title: { display: true, text: "Eficiencia de la conducción (%)" }, ticks: ticks(1) } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${f(c.parsed.x, 0)} M COP · η = ${f(c.parsed.y, 2)} %` } } } } });
    $$("[data-usar]", sec).forEach((bt) => bt.addEventListener("click", () => {
      const [mat, D] = bt.dataset.usar.split("|");
      E.p.material_id = mat; E.p.D_tuberia = Number(D);
      sincronizarFormulario(); programarCalculo(); aviso(`Tubería cambiada a ${Motor.nombreMaterial(E.datos, mat)} D = ${f(Number(D), 2)} m`);
    }));
  };

  // ---------- Turbina ----------
  VISTAS.turbina = (sec) => {
    const r = E.r, fi = r.ficha, p = r.p;
    const tv = tabla("t-verif", [
      { t: "Tipo", v: (x) => x.tipo }, { t: "Unidades", n: 1, v: (x) => x.unidades }, { t: "Factible", v: (x) => (x.factible ? "✔" : "✘"), cls: (x) => (x.factible ? "pos" : "neg") },
      { t: "Velocidad [rpm]", n: 1, v: (x) => f(x.n_rpm, 0) }, { t: "Polos", n: 1, v: (x) => x.polos ?? "—" }, { t: "n_QE", n: 1, v: (x) => f(x.nQE, 3) },
      { t: "P por unidad [MW]", n: 1, v: (x) => f(x.P_unidad_kW / 1000, 2) }, { t: "Motivo", v: (x) => esc(x.motivo) },
    ], r.verif, { claseFila: (x) => (x.tipo === fi.turbina && x.unidades === fi.n_unid ? "marcada" : ""), nombre: "verificacion_turbinas" });
    const tc = tabla("t-cat", [{ t: "Fabricante", v: (x) => x.fabricante }, { t: "Tipo", v: (x) => x.tipo },
      ...Array.from({ length: p.n_unidades_max }, (_, k) => ({ t: `${k + 1} unidad${k ? "es" : ""}`, v: (x) => (x.aptas[k] ? "APTA" : "no"), cls: (x) => (x.aptas[k] ? "pos" : "") }))], r.catalogos, { nombre: "catalogos_fabricantes" });
    sec.innerHTML = cabecera(titulos.turbina, "Regla de ingeniería con la que se entrenó el modelo de Gradient Boosting del cuaderno, verificada con velocidad específica, velocidad síncrona y cavitación (Thoma).", etiquetaEscenario())
      + tarjeta(`Turbina ${fi.turbina} × ${fi.n_unid}`, `Ficha técnica con las correlaciones de De Siervo y De Leva (ESHA 2004)`, fichaHTML([
        ["Caudal por unidad", `${f(fi.Q_u, 2)} m³/s`], ["Potencia por unidad", `${f(fi.P_u, 2)} MW`], ["Potencia instalada", `${f(fi.P_inst, 2)} MW`],
        ["Velocidad de giro", `${f(fi.n_rpm, 0)} rpm`], ["Polos (60 Hz)", fi.polos], ["n_QE", f(fi.nq, 3)], ["n_s métrica", f(fi.ns, 0)],
        ["Diámetro de salida D3", `${f(fi.D3, 2)} m`], ["Diámetro de entrada D1", `${f(fi.D1, 2)} m`], ["Altura de aspiración Hs", `${f(fi.Hs, 1)} m`],
        ["Eficiencia nominal", pct(fi.eta_nom)], ["Catálogos que la cubren", fi.marcas.length ? esc(fi.marcas.join(", ")) : "consultar fabricante"],
      ]), "", "destacado")
      + `<div style="height:16px"></div><div class="rejilla r2">
        ${tarjeta("Carta de selección por fabricante", "Envolventes de catálogo (WEG, ANDRITZ, Flygt) y punto de diseño por unidad", lienzo("g-carta", "alto"))}
        ${tarjeta("Eficiencia a carga parcial", "Curvas típicas ESHA 2004; la central apaga la unidad bajo su mínimo técnico", lienzo("g-eta", "alto"))}
      </div>
      <div class="rejilla">
        ${tarjeta("Verificación física de cada tipo", `Salto neto ${f(r.hd.Hn, 2)} m y caudal de diseño ${f(p.Q_diseno, 1)} m³/s repartido en 1 a ${p.n_unidades_max} unidades`, tv.html, tv.boton)}
        ${tarjeta("Catálogos de fabricantes", "¿El punto por unidad cae dentro de la envolvente?", tc.html, tc.boton)}
      </div>`
      + figurasCuaderno(["matriz_de_confusion", "mapa_de_decision", "importancia_de_las_variables"], "Modelo de Gradient Boosting del cuaderno")
      + metodologia([
        ["Velocidad específica", "n_{QE}=\\frac{(n/60)\\sqrt{Q}}{(gH)^{3/4}},\\qquad n_s=\\frac{n\\sqrt{P_{kW}}}{H^{5/4}}"],
        ["Velocidad síncrona (60 Hz)", "n=\\frac{7200}{p}\\ \\text{rpm}"],
        ["Cavitación (Thoma)", "H_s=H_{atm}-H_v+\\frac{V_2^2}{2g}-\\sigma H,\\quad \\sigma=1.2715\\,n_{QE}^{1.41}+\\frac{V_2^2}{2gH}"],
        ["Rodete Francis", "D_3=84.5(0.31+2.488\\,n_{QE})\\frac{\\sqrt{H}}{n},\\qquad D_1=\\left(0.4+\\frac{0.095}{n_{QE}}\\right)D_3"],
      ]);
    const ds = Motor.ENVOLVENTES.map((env, i) => ({ label: `${env.fab} ${env.tipo}`, data: [...env.pts, env.pts[0]].map(([x, y]) => ({ x, y })), showLine: true, fill: true, borderColor: [C.violeta, C.teal, C.azul, C.ambar, C.oxido][i], backgroundColor: alfa([C.violeta, C.teal, C.azul, C.ambar, C.oxido][i], 0.08), borderWidth: 1.5, pointRadius: 0 }));
    ds.push({ label: `Punto de diseño (${fi.n_unid} unidad${fi.n_unid > 1 ? "es" : ""})`, data: [{ x: fi.Q_u, y: r.hd.Hn }], pointRadius: 9, pointStyle: "star", borderColor: C.rojo, backgroundColor: C.rojo, borderWidth: 3 });
    grafica("g-carta", { type: "scatter", data: { datasets: ds }, options: { scales: { x: { type: "logarithmic", min: 0.03, max: 300, title: { display: true, text: "Caudal por unidad (m³/s)" }, ticks: { callback: (v) => ([0.1, 1, 10, 100].includes(v) ? f(v, v < 1 ? 1 : 0) : "") } },
      y: { type: "logarithmic", min: 2, max: 1000, title: { display: true, text: "Salto neto (m)" }, ticks: { callback: (v) => ([2, 5, 10, 20, 50, 100, 200, 500, 1000].includes(v) ? f(v, 0) : "") } } },
    plugins: { tooltip: { filter: (c) => c.dataset.pointRadius > 0, callbacks: { label: (c) => `Q = ${f(c.parsed.x, 2)} m³/s · H = ${f(c.parsed.y, 1)} m` } } } } });
    const qq = []; for (let k = 0; k <= 100; k++) qq.push(k / 100);
    grafica("g-eta", { type: "line", data: { labels: qq.map((q) => f(q * 100, 0)), datasets: Object.keys(Motor.TURBINAS).map((t) => ({ label: t, data: qq.map((q) => { const e = r.modelo.etaTurbina(t, q); return e > 0 ? e * 100 : null; }), borderColor: COLOR_TURB[t], borderWidth: t === fi.turbina ? 3.2 : 1.6, spanGaps: false })) },
      options: { interaction: { mode: "index", intersect: false }, scales: { x: { title: { display: true, text: "Caudal relativo Q/Qn (%)" }, ticks: { maxTicksLimit: 11 } }, y: { min: 65, max: 97, title: { display: true, text: "Eficiencia (%)" } } },
        plugins: { tooltip: { callbacks: { title: (c) => `Q/Qn = ${c[0].label} %`, label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 1)} %` } } } } });
  };

  // ---------- Energía ----------
  VISTAS.energia = (sec) => {
    const r = E.r, o = r.operacion, p = r.p;
    const top = tabla("t-op", [{ t: "Indicador", v: (x) => x[0] }, { t: "Valor", n: 1, v: (x) => x[1] }], [
      ["Días analizados", f(o.dias, 0)], ["Días sin operación", f(o.sinOp, 0)], ["Días a carga parcial", f(o.parcial, 0)], ["Días a caudal de diseño", f(o.plena, 0)],
      ["Días generando", pct(o.generando)], ["Potencia media / máxima", `${f(o.Pmedia, 2)} / ${f(o.Pmax, 2)} MW`], ["Energía neta media anual", `${f(o.E_media / 1e6, 1)} GWh/año`],
      ["Energía firme (año más seco)", `${f(o.E_firme / 1e6, 1)} GWh/año`], ["Factor de planta", pct(o.FP)], ["Días con caudal remanente ≥ ecológico", pct(o.remOk)],
      ["Caudal remanente mínimo", `${f(o.remMin, 1)} m³/s`], ["Fracción del caudal medio derivada", pct(o.fracDerivada)],
    ], { nombre: "operacion" });
    sec.innerHTML = cabecera(titulos.energia, `Simulación día a día sobre ${f(o.dias, 0)} registros (${f(E.r.modelo.anios, 1)} años) con la curva de eficiencia a carga parcial de la turbina y la cadena eléctrica hasta la frontera comercial.`, etiquetaEscenario())
      + `<div class="kpis k3">
        ${kpi("Energía neta media", f(o.E_media / 1e6, 1), "GWh/año", "después de pérdidas y disponibilidad", C.teal)}
        ${kpi("Energía firme", f(o.E_firme / 1e6, 1), "GWh/año", "año hidrológico más seco", C.ambar)}
        ${kpi("Factor de planta", pct(o.FP), "", "energía bruta / (P · 8.760 h)", C.azul)}
        ${kpi("Días generando", pct(o.generando), "", `${f(o.plena, 0)} días a plena carga`, C.verde)}
        ${kpi("Potencia media", f(o.Pmedia, 2), "MW", `máxima ${f(o.Pmax, 2)} MW`, C.violeta)}
        ${kpi("Caudal derivado", pct(o.fracDerivada), "", "del caudal medio del río", C.cielo)}
      </div>`
      + tarjeta("Operación diaria simulada", "Primeros tres años: caudal del río, caudal turbinado y potencia en bornes", lienzo("g-diaria", "alto"))
      + `<div style="height:16px"></div><div class="rejilla r2">
        ${tarjeta("Energía neta por mes", "Media de los años simulados con el rango mínimo–máximo", lienzo("g-mes"))}
        ${tarjeta("Energía neta de cada año", "Años secos (10 % más bajo) en rojo", lienzo("g-anual"))}
      </div>
      <div class="rejilla r2">${tarjeta("Indicadores de operación", "", top.html, top.boton)}${tarjeta("Curva de duración de caudales", "Serie diaria del río", lienzo("g-duracion2"))}</div>`
      + metodologia([
        ["Caudal disponible", "Q_{disp}=\\max(Q_{río}-Q_{eco},0)"],
        ["Caudal turbinado", "Q_{turb}=\\min(Q_{disp},Q_d)\\ \\text{si}\\ Q/Q_n\\ge q_{min}"],
        ["Potencia en bornes", "P=\\rho g Q_{turb} H_n(Q_{turb})\\,\\eta_t\\!\\left(\\tfrac{Q_{turb}}{Q_d}\\right)\\eta_g"],
        ["Energía neta", "E=P\\,\\eta_{tr}(1-p_{lín})(1-a_{aux})\\,D\\cdot24\\,h"],
      ]);
    const d = r.sim.detalle, n = 3 * 365, ini = new Date(E.datos.rio.inicio + "T00:00:00");
    const etiquetas = Array.from({ length: n }, (_, i) => { const t = new Date(ini.getTime() + i * 864e5); return `${t.getDate()} ${MESES[t.getMonth()]} ${t.getFullYear()}`; });
    grafica("g-diaria", { type: "line", data: { labels: etiquetas, datasets: [
      { label: "Caudal del río (m³/s)", data: E.datos.rio.Q.slice(0, n), borderColor: alfa(C.azul, 0.5), backgroundColor: alfa(C.azul, 0.12), fill: "origin", borderWidth: 1, yAxisID: "y" },
      { label: "Caudal turbinado (m³/s)", data: Array.from(d.Qt.slice(0, n)), borderColor: C.teal, borderWidth: 1.6, yAxisID: "y" },
      { label: "Potencia (MW)", data: Array.from(d.P.slice(0, n)), borderColor: C.ambar, borderWidth: 1.3, yAxisID: "y1" },
    ] }, options: { interaction: { mode: "index", intersect: false }, scales: { x: { ticks: { maxTicksLimit: 12, maxRotation: 0 }, grid: { display: false } }, y: { min: 0, title: { display: true, text: "Caudal (m³/s)" } }, y1: { position: "right", grid: { display: false }, title: { display: true, text: "Potencia (MW)" }, min: 0 } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 2)}` } } } } });
    const mat = r.sim.E_mat;
    const mn = MESES.map((_, m) => Math.min(...mat.map((x) => x[m])) / 1e6), mx = MESES.map((_, m) => Math.max(...mat.map((x) => x[m])) / 1e6);
    grafica("g-mes", { data: { labels: MESES, datasets: [
      { type: "bar", label: "Media", data: r.E_med_mes.map((v) => v / 1e6), backgroundColor: alfa(C.teal, 0.85), borderRadius: 4, order: 2 },
      { type: "line", label: "Mínimo", data: mn, borderColor: C.rojo, borderDash: [4, 3], pointRadius: 2, order: 1 },
      { type: "line", label: "Máximo", data: mx, borderColor: C.azul, borderDash: [4, 3], pointRadius: 2, order: 1 },
    ] }, options: { scales: { y: { title: { display: true, text: "GWh" }, ticks: ticks(1) }, x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 2)} GWh` } } } } });
    const ea = r.E_anual.map((v) => v / 1e6), p10 = Motor.cuantil(ea, 0.1), med = Motor.media(ea);
    grafica("g-anual", { data: { labels: ea.map((_, i) => i + 1), datasets: [
      { type: "bar", label: "Energía anual", data: ea, backgroundColor: ea.map((v) => (v < p10 ? alfa(C.rojo, 0.85) : alfa(C.verde, 0.8))), borderRadius: 3, order: 2 },
      { type: "line", label: `Media ${f(med, 1)} GWh`, data: ea.map(() => med), borderColor: C.tinta, borderDash: [5, 4], borderWidth: 1.3, order: 1 },
    ] }, options: { scales: { x: { title: { display: true, text: "Año hidrológico simulado" }, grid: { display: false } }, y: { title: { display: true, text: "GWh" }, ticks: ticks(0) } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 1)} GWh` } } } } });
    graficaDuracion("g-duracion2");
  };

  // ---------- Economía ----------
  VISTAS.economia = (sec) => {
    const r = E.r, p = r.p, ind = r.ind, cx = r.cx, TRM = r.TRM;
    const tcx = tabla("t-capex", [{ t: "Componente", v: (x) => x[0] }, { t: "USD", n: 1, v: (x) => f(x[1], 0) }, { t: "Millones de COP", n: 1, v: (x) => MCOP(x[1] * TRM) }, { t: "% del CAPEX", n: 1, v: (x) => f(x[1] / cx.total * 100, 1) }], [
      ["C_eq · equipos electromecánicos y transmisión", cx.C_eq], ["   de ellos: tubería de presión (calculada)", cx.tuberia], ["C_ob · obras civiles", cx.C_ob], ["C_ing · estudios y diseños", cx.C_ing], ["CAPEX total", cx.total],
    ], { claseFila: (x) => (x[0] === "CAPEX total" ? "total" : ""), nombre: "capex" });
    const topex = tabla("t-opex", [{ t: "Concepto", v: (x) => x[0] }, { t: "Millones de COP/año", n: 1, v: (x) => MCOP(x[1]) }], [
      [`Operación (${pct(p.f_cop, 0)} del CAPEX)`, p.f_cop * r.CAPEX], [`Mantenimiento (${pct(p.f_mant, 0)} del CAPEX)`, p.f_mant * r.CAPEX], [`Administración (${pct(p.f_adm, 2)} del CAPEX)`, p.f_adm * r.CAPEX],
      ["Total OPEX", r.OPEX], [`Transferencias Ley 99 (${pct(p.ley99, 0)} de las ventas${r.ficha.P_inst > 10 ? "" : ", no aplica < 10 MW"})`, r.transf], ["Egresos anuales", r.OPEX + r.transf], ["Depreciación (línea recta)", r.CAPEX / p.vida_util],
    ], { claseFila: (x) => (x[0].startsWith("Total") || x[0].startsWith("Egresos") ? "total" : ""), nombre: "opex" });
    const tesc = tabla("t-esc", [{ t: "Escenario", v: (x) => x.nombre }, { t: "Energía [GWh]", n: 1, v: (x) => f(x.E / 1e6, 1) }, { t: "Precio [COP/kWh]", n: 1, v: (x) => f(x.precio, 1) },
      { t: "Ingreso [mil M/año]", n: 1, v: (x) => milM(x.I, 1) }, { t: "VAN [mil M]", n: 1, v: (x) => milM(x.ind.VAN, 1), cls: (x) => clsSigno(x.ind.VAN) }, { t: "TIR [%]", n: 1, v: (x) => f(x.ind.TIR * 100, 1) },
      { t: "B/C", n: 1, v: (x) => f(x.ind.BC, 2) }, { t: "PB [años]", n: 1, v: (x) => f(x.ind.PB, 1) }, { t: "LCOE", n: 1, v: (x) => f(x.ind.LCOE, 0) }], r.escenarios, { claseFila: (x) => (x.nombre.includes("Base") ? "marcada" : ""), nombre: "escenarios" });
    const tev = tabla("t-ev", [{ t: "Año", n: 1, v: (x) => x.anio }, { t: "Energía [MWh]", n: 1, v: (x) => f(x.energia_MWh, 0) }, { t: "Venta", n: 1, v: (x) => MCOP(x.venta) }, { t: "Egresos", n: 1, v: (x) => MCOP(x.egresos) },
      { t: "Depreciación", n: 1, v: (x) => MCOP(x.depreciacion) }, { t: "Utilidades", n: 1, v: (x) => MCOP(x.utilidades) }, { t: "Inversión", n: 1, v: (x) => MCOP(x.inversion) },
      { t: "Flujo de caja", n: 1, v: (x) => MCOP(x.flujo), cls: (x) => clsSigno(x.flujo) }, { t: "Amortización", n: 1, v: (x) => MCOP(x.amortizacion), cls: (x) => clsSigno(x.amortizacion) }], r.ev, { alto: true, nombre: "evaluacion_economica" });
    const timp = tabla("t-imp", [{ t: "Indicador", v: (x) => x[0] }, { t: "Clase 14 (sin impuestos)", n: 1, v: (x) => x[1] }, { t: `Después de renta ${pct(p.tasa_renta, 0)}`, n: 1, v: (x) => x[2] }], [
      ["VAN [mil M COP]", milM(ind.VAN, 1), milM(r.indImp.VAN, 1)], ["TIR", pct(ind.TIR), pct(r.indImp.TIR)], ["Recuperación estática [años]", f(ind.PB, 1), f(r.indImp.PB, 1)], ["Recuperación descontada [años]", f(ind.PB_din, 1), f(r.indImp.PB_din, 1)],
    ], { nombre: "despues_de_impuestos" });
    sec.innerHTML = cabecera(titulos.economia, `Metodología de la clase 14: pesos constantes de ${p.anio_base}, recursos propios, valor residual cero. TRM ${f(TRM, 2)} COP/USD; escenario base con ${pct(p.frac_contrato, 0)} de la energía en contrato.`, etiquetaEscenario())
      + `<div class="kpis">
        ${kpi("CAPEX", milM(r.CAPEX, 1), "mil M COP", `${f(cx.total / 1e6, 1)} MUSD`, C.violeta)}
        ${kpi("Ingreso anual", milM(r.I_base, 1), "mil M COP", `${f(r.I_base / r.E_base, 0)} COP/kWh`, C.teal)}
        ${kpi("Egresos anuales", milM(r.OPEX + r.transf, 1), "mil M COP", "OPEX + Ley 99", C.ambar)}
        ${kpi("VAN", milM(ind.VAN, 1), "mil M COP", `C_T = ${milM(ind.C_T, 1)} mil M`, ind.VAN > 0 ? C.verde : C.rojo)}
        ${kpi("TIR", pct(ind.TIR), "", `i = ${pct(p.i_desc, 0)}`, ind.TIR > p.i_desc ? C.verde : C.rojo)}
        ${kpi("Beneficio / costo", f(ind.BC, 2), "", "VA beneficios / VA costos", ind.BC > 1 ? C.verde : C.rojo)}
        ${kpi("LCOE", f(ind.LCOE, 0), "COP/kWh", `anualidad ${milM(ind.A, 1)} mil M`, C.oxido)}
        ${kpi("P(VAN < 0)", pct(r.montecarlo.pPerdida), "", "3.000 simulaciones", C.cielo)}
      </div>
      <div class="rejilla r-12">${tarjeta("Composición del CAPEX", "Distribución UPME con la tubería calculada", lienzo("g-capex", "bajo"))}${tarjeta("CAPEX = C_eq + C_ob + C_ing", `${f(cx.total / (r.ficha.P_inst * 1000), 0)} USD/kW instalado`, tcx.html, tcx.boton)}</div>
      <div class="rejilla r2">${tarjeta("Cronograma de inversión", "Tres periodos de construcción (millones de COP)", lienzo("g-crono") + `<div class="leyenda-mini" style="margin-top:8px"><span><i style="background:${C.violeta}"></i>Ingeniería</span><span><i style="background:${C.ambar}"></i>Obras civiles</span><span><i style="background:${C.teal}"></i>Equipos</span></div>`)}${tarjeta("Costos operativos anuales", "", topex.html, topex.boton)}</div>
      ${tarjeta("Escenarios de comercialización", "Precios oficiales de XM en pesos constantes; hidrología media, seca (P10) o húmeda (P90)", tesc.html + `<div style="margin-top:14px">${lienzo("g-ingreso")}</div>`, tesc.boton)}
      <div style="height:16px"></div>
      <div class="rejilla r2">${tarjeta("Recuperación de la inversión", `Estática ${f(ind.PB, 1)} años · descontada ${f(ind.PB_din, 1)} años`, lienzo("g-recuperacion2"))}${tarjeta("VAN en función de la tasa de descuento", `La TIR es la tasa donde el VAN se hace cero: ${pct(ind.TIR)}`, lienzo("g-van-i"))}</div>
      <div class="rejilla r2">${tarjeta("Sensibilidad del VAN (±20 %)", "Cada variable se mueve sola; las demás quedan en el caso base", lienzo("g-tornado"))}${tarjeta("Riesgo: simulación de Monte Carlo", `P5 = ${milM(r.montecarlo.p5, 1)} · mediana = ${milM(r.montecarlo.p50, 1)} · P95 = ${milM(r.montecarlo.p95, 1)} mil M COP`, lienzo("g-mc"))}</div>
      ${tarjeta("Tabla de evaluación económica", "Millones de COP constantes, años 0 a n", tev.html, tev.boton)}
      <div style="height:16px"></div>
      ${tarjeta("Variante para un inversionista privado", "Impuesto de renta sobre la utilidad (la depreciación reduce la base gravable)", timp.html, timp.boton)}`
      + metodologia([
        ["Flujo de caja y VAN", "FC_t=I_t-OPEX_t,\\qquad VAN=-CAPEX+\\sum_{t=1}^{n}\\frac{FC_t}{(1+i)^t}"],
        ["TIR", "0=-CAPEX+\\sum_{t=1}^{n}\\frac{FC_t}{(1+TIR)^t}"],
        ["Beneficio/costo", "\\frac{B}{C}=\\frac{VA(\\text{beneficios})}{CAPEX+VA(\\text{egresos})}"],
        ["LCOE", "LCOE=\\frac{CAPEX\\frac{i(1+i)^n}{(1+i)^n-1}+C_{op}}{E_a}"],
        ["CAPEX", "CAPEX=C_{eq}+C_{ob}+C_{ing}"],
        ["Ingreso", "I_a=\\sum_{m=1}^{12}E_mP_m"],
      ]);
    grafica("g-capex", { type: "doughnut", data: { labels: ["Equipos y transmisión", "Tubería de presión", "Obras civiles", "Estudios y diseños"], datasets: [{ data: [cx.C_eq - cx.tuberia, cx.tuberia, cx.C_ob, cx.C_ing], backgroundColor: [C.teal, C.azul, C.ambar, C.violeta], borderWidth: 2, borderColor: "#fff" }] },
      options: { cutout: "62%", plugins: { legend: { position: "right" }, tooltip: { callbacks: { label: (c) => `${c.label}: ${f(c.parsed / 1e6, 2)} MUSD (${f(c.parsed / cx.total * 100, 1)} %)` } } } } });
    const coloresComp = { C_ing: C.violeta, C_ob: C.ambar, C_eq: C.teal };
    grafica("g-crono", { type: "bar", data: { labels: ["Periodo 1", "Periodo 2", "Periodo 3"], datasets: r.crono.map((a) => ({ label: a.actividad, data: a.periodos, backgroundColor: alfa(coloresComp[a.componente], 0.35 + 0.08 * (r.crono.indexOf(a) % 5)), borderColor: "#fff", borderWidth: 1 })) },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: ticks(0), title: { display: true, text: "Millones de COP" } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 0)} M COP` } } } } });
    grafica("g-ingreso", { type: "bar", data: { labels: MESES, datasets: r.escenarios.map((e, i) => ({ label: e.nombre, data: e.precioMes.map((pp, m) => pp * e.energiaMes[m] / 1e9), backgroundColor: [C.ambar, C.azul, C.rojo, C.teal, C.verde][i], borderRadius: 2 })) },
      options: { scales: { y: { title: { display: true, text: "Miles de millones de COP" }, ticks: ticks(1) }, x: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 2)} mil M` } } } } });
    graficaRecuperacion("g-recuperacion2");
    grafica("g-van-i", { type: "line", data: { labels: r.curvaVAN.map(([i]) => f(i * 100, 1)), datasets: [{ label: "VAN", data: r.curvaVAN.map(([, v]) => v / 1e9), borderColor: C.azul, fill: { target: { value: 0 }, above: alfa(C.teal, 0.12), below: alfa(C.rojo, 0.12) } }] },
      options: { scales: { x: { title: { display: true, text: "Tasa de descuento (%)" }, ticks: { maxTicksLimit: 8 } }, y: { title: { display: true, text: "VAN (miles de millones de COP)" }, ticks: ticks(0) } }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => `i = ${c[0].label} %`, label: (c) => `VAN = ${f(c.parsed.y, 1)} mil M COP` } } } },
      plugins: [lineaVertical(Math.round(p.i_desc / 0.005), `i = ${pct(p.i_desc, 0)}`)] });
    const tor = r.tornado, v0 = r.van0 / 1e9;
    grafica("g-tornado", { type: "bar", data: { labels: tor.map((x) => x.variable), datasets: [
      { label: "Variable −20 %", data: tor.map((x) => [v0, x.menos / 1e9]), backgroundColor: alfa(C.rojo, 0.8), borderRadius: 3 },
      { label: "Variable +20 %", data: tor.map((x) => [v0, x.mas / 1e9]), backgroundColor: alfa(C.teal, 0.8), borderRadius: 3 },
    ] }, options: { indexAxis: "y", scales: { x: { title: { display: true, text: "VAN (miles de millones de COP)" }, ticks: ticks(0) }, y: { stacked: true, grid: { display: false } } },
      plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: VAN = ${f(c.raw[1], 1)} mil M` } } } } });
    const vals = r.montecarlo.van.map((v) => v / 1e9), lo = vals[0], hi = vals[vals.length - 1], nb = 40, w = (hi - lo) / nb || 1;
    const cuentas = new Array(nb).fill(0); vals.forEach((v) => cuentas[Math.min(nb - 1, Math.floor((v - lo) / w))]++);
    grafica("g-mc", { type: "bar", data: { labels: cuentas.map((_, k) => f(lo + (k + 0.5) * w, 0)), datasets: [{ label: "Simulaciones", data: cuentas, backgroundColor: cuentas.map((_, k) => (lo + (k + 0.5) * w < 0 ? alfa(C.rojo, 0.8) : alfa(C.azul, 0.75))), barPercentage: 1, categoryPercentage: 1 }] },
      options: { scales: { x: { title: { display: true, text: "VAN (miles de millones de COP)" }, ticks: { maxTicksLimit: 8 }, grid: { display: false } }, y: { title: { display: true, text: "Simulaciones" } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => `VAN ≈ ${c[0].label} mil M`, label: (c) => `${c.parsed.y} simulaciones` } } } } });
  };

  // ---------- Optimización ----------
  function firmaParametros() { const { D_tuberia, material_id, Q_diseno, ...resto } = E.p; return JSON.stringify(resto); }
  VISTAS.optimizacion = (sec) => {
    const r = E.r, o = E.opt, vigente = o && E.optFirma === firmaParametros();
    let cuerpo = "";
    if (o && !o.vacio) {
      const b = o.mejor, act = o.actual, tr = o.trad;
      const tcomp = tabla("t-optc", [{ t: "Método", v: (x) => x[0] }, { t: "Q_d [m³/s]", n: 1, v: (x) => f(x[1].Q_d, 1) }, { t: "Tubería", v: (x) => `${esc(Motor.nombreMaterial(E.datos, x[1].material).split(" ")[0])} D = ${f(x[1].D, 2)} m` },
        { t: "Unidades", n: 1, v: (x) => x[1].unidades }, { t: "P [MW]", n: 1, v: (x) => f(x[1].P_MW, 2) }, { t: "E [GWh/año]", n: 1, v: (x) => f(x[1].E_GWh, 1) }, { t: "CAPEX [MUSD]", n: 1, v: (x) => f(x[1].CAPEX_MUSD, 1) },
        { t: "VAN [mil M]", n: 1, v: (x) => milM(x[1].VAN, 1) }, { t: "TIR [%]", n: 1, v: (x) => f(x[1].TIR * 100, 1) }, { t: "Brecha vs óptimo", n: 1, v: (x) => `${f((x[1].VAN / b.VAN - 1) * 100, 1)} %` }, { t: "< 20 MW", v: (x) => (x[1].P_MW < 20 ? "✔" : "✘") }],
      [["Tradicional (Q30 + Fahlbusch)", tr], ["Diseño actual del panel", act], ["Óptimo exhaustivo (física + finanzas)", b]], { claseFila: (x) => (x[1] === b ? "marcada" : ""), nombre: "optimizacion" });
      const ttop = tabla("t-optt", [{ t: "#", n: 1, v: (_, i) => i + 1 }, { t: "Q_d", n: 1, v: (x) => f(x.Q_d, 1) }, { t: "Material", v: (x) => esc(Motor.nombreMaterial(E.datos, x.material)) }, { t: "D [m]", n: 1, v: (x) => f(x.D, 2) },
        { t: "Unidades", n: 1, v: (x) => x.unidades }, { t: "P [MW]", n: 1, v: (x) => f(x.P_MW, 2) }, { t: "VAN [mil M]", n: 1, v: (x) => milM(x.VAN, 2) }, { t: "TIR [%]", n: 1, v: (x) => f(x.TIR * 100, 1) }], o.top, { nombre: "mejores_configuraciones" });
      cuerpo = `${vigente ? "" : `<div class="aviso">Los requerimientos cambiaron después de esta búsqueda; vuelva a ejecutarla para actualizar el óptimo.</div><div style="height:12px"></div>`}
        ${tarjeta("Diseño de mayor VAN", `${f(o.n, 0)} configuraciones factibles evaluadas en ${f(o.ms / 1000, 1)} s`, fichaHTML([["Caudal de diseño", `${f(b.Q_d, 1)} m³/s`], ["Tubería", `${esc(Motor.nombreMaterial(E.datos, b.material))} D = ${f(b.D, 2)} m`], ["Unidades", b.unidades], ["Potencia", `${f(b.P_MW, 2)} MW`], ["Energía", `${f(b.E_GWh, 1)} GWh/año`], ["VAN", `${milM(b.VAN, 1)} mil M COP`], ["TIR", pct(b.TIR)], ["Mejora frente al diseño actual", `${signo((b.VAN - act.VAN) / 1e9, 1)} mil M COP`]]),
          `<button type="button" class="btn ambar" id="btn-aplicar-opt">Aplicar este diseño</button>`, "destacado")}
        <div style="height:16px"></div>
        ${tarjeta("Comparación de métodos", "El método tradicional usa el caudal excedido el 30 % del tiempo y el diámetro económico de Fahlbusch", tcomp.html, tcomp.boton)}
        <div style="height:16px"></div>
        ${tarjeta("VAN frente al caudal de diseño", "Mejor configuración de cada caudal con 1 y 2 unidades", lienzo("g-opt", "alto"))}
        <div style="height:16px"></div>
        ${tarjeta("Las 10 mejores configuraciones", "", ttop.html, ttop.boton)}<div style="height:16px"></div>`;
    } else if (o && o.vacio) {
      cuerpo = `<div class="aviso">Ninguna configuración de la malla cumple las restricciones con los requerimientos actuales.</div>`;
    }
    sec.innerHTML = cabecera(titulos.optimizacion, "Busca el caudal de diseño (18 a 50 m³/s), el material, el diámetro y el número de unidades que maximizan el VAN del escenario base, respetando V ≤ V_max, pérdidas ≤ límite, turbina Francis factible y P < 20 MW.", etiquetaEscenario())
      + tarjeta("Búsqueda exhaustiva con física y finanzas", "Cada configuración se simula día a día y se evalúa con la metodología de la clase 14 (el cuaderno usa además un modelo de ML para preseleccionar).",
        `<button type="button" class="btn" id="btn-optimizar">${o ? "Volver a buscar" : "Buscar el diseño de mayor VAN"}</button><div class="progreso" id="opt-prog" hidden><div></div></div><div class="nota" id="opt-txt"></div>`)
      + `<div style="height:16px"></div>` + cuerpo
      + figurasCuaderno(["prediccion_del_ml", "van_vs_caudal"], "Optimización con ML en el cuaderno");
    $("#btn-optimizar").onclick = optimizar;
    if (o && !o.vacio) {
      $("#btn-aplicar-opt").onclick = () => { E.p.Q_diseno = o.mejor.Q_d; E.p.material_id = o.mejor.material; E.p.D_tuberia = o.mejor.D; E.p.n_unidades_max = Math.max(E.p.n_unidades_max, o.mejor.unidades); sincronizarFormulario(); programarCalculo(); aviso("Diseño óptimo aplicado al panel de parámetros"); };
      const series = [1, 2].map((n) => { const m = {}; o.todas.filter((x) => x.unidades === n).forEach((x) => { if (!m[x.Q_d] || x.VAN > m[x.Q_d].VAN) m[x.Q_d] = x; }); return Object.values(m).sort((a, b) => a.Q_d - b.Q_d); });
      grafica("g-opt", { type: "scatter", data: { datasets: [
        { label: "1 unidad", data: series[0].map((x) => ({ x: x.Q_d, y: x.VAN / 1e9 })), borderColor: C.teal, backgroundColor: C.teal, showLine: true, pointRadius: 3 },
        { label: "2 unidades", data: series[1].map((x) => ({ x: x.Q_d, y: x.VAN / 1e9 })), borderColor: C.azul, backgroundColor: C.azul, showLine: true, pointRadius: 3 },
        { label: "Óptimo", data: [{ x: o.mejor.Q_d, y: o.mejor.VAN / 1e9 }], pointRadius: 10, pointStyle: "star", borderColor: C.ambar, backgroundColor: C.ambar, borderWidth: 3 },
        { label: "Diseño actual", data: [{ x: o.actual.Q_d, y: o.actual.VAN / 1e9 }], pointRadius: 7, pointStyle: "rectRot", backgroundColor: C.tinta, borderColor: "#fff", borderWidth: 2 },
      ] }, options: { scales: { x: { title: { display: true, text: "Caudal de diseño (m³/s)" } }, y: { title: { display: true, text: "VAN (miles de millones de COP)" }, ticks: ticks(0) } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: Q = ${f(c.parsed.x, 1)} m³/s · VAN ${f(c.parsed.y, 1)} mil M` } } } } });
    }
  };
  function optimizar() {
    const r = E.r; if (r.error) { aviso("Primero ajuste los parámetros: el diseño actual no es factible."); return; }
    const boton = $("#btn-optimizar"), barra = $("#opt-prog"), txt = $("#opt-txt");
    boton.disabled = true; barra.hidden = false;
    const cand = Motor.candidatosOptimizacion(E.datos, r), todas = [], t0 = performance.now();
    let i = 0;
    txt.textContent = `${cand.length} configuraciones pasan el filtro físico; evaluando…`;
    function lote() {
      const fin = Math.min(i + 25, cand.length);
      for (; i < fin; i++) todas.push(r.evaluarConfig(...cand[i], "Francis"));
      barra.firstElementChild.style.width = `${(i / Math.max(cand.length, 1)) * 100}%`;
      txt.textContent = `Evaluadas ${i} de ${cand.length} configuraciones…`;
      if (i < cand.length) { setTimeout(lote, 0); return; }
      if (!todas.length) { E.opt = { vacio: true }; E.optFirma = firmaParametros(); pintarVista(); return; }
      const mejor = todas.reduce((a, b) => (b.VAN > a.VAN ? b : a));
      const actual = r.evaluarConfig(r.p.Q_diseno, r.D_sel, r.eps_sel, r.material, r.ficha.n_unid, r.ficha.turbina);
      // Método tradicional: caudal disponible excedido el 30 % del tiempo y diámetro de Fahlbusch.
      const disp = E.datos.rio.Q.map((q) => Math.max(q - r.p.Q_eco, 0));
      const Qt = Math.round(Motor.cuantil(disp, 0.70) * 10) / 10, Pt = r.modelo.g * Qt * r.p.H_bruto * 0.85;
      const Df = 0.52 * Math.pow(r.p.H_bruto, -0.17) * Math.pow(Pt / r.p.H_bruto, 0.43);
      const grp = E.datos.catalogo.filter((c) => c.id === "GRP_FLOWTITE").sort((a, b) => a.D - b.D), dt = grp.find((c) => c.D >= Df) || grp[grp.length - 1];
      const trad = r.evaluarConfig(Qt, dt.D, dt.eps, "GRP_FLOWTITE", 1, "Francis");
      E.opt = { mejor, actual, trad, todas, n: todas.length, ms: performance.now() - t0, top: [...todas].sort((a, b) => b.VAN - a.VAN).slice(0, 10) };
      E.optFirma = firmaParametros();
      pintarVista();
    }
    setTimeout(lote, 30);
  }

  // ---------- Datos y fuentes ----------
  VISTAS.datos = (sec) => {
    const d = E.datos, trm = E.trmEnLinea;
    const tmeta = tabla("t-meta", [{ t: "Tabla", v: (x) => `<code>${esc(x.tabla)}</code>`, csv: (x) => x.tabla }, { t: "Filas", n: 1, v: (x) => f(x.filas, 0) }, { t: "Descripción", v: (x) => esc(x.descripcion) }, { t: "Archivo fuente", v: (x) => esc(x.archivo_fuente) }], d.metadatos, { nombre: "metadatos_base_datos" });
    const repo = E.repo;
    const enlaces = repo ? `<div class="acciones-tabla" style="flex-wrap:wrap;margin-top:12px"><a class="btn chico" href="${repo}/raw/main/base_datos/pch_proyecto.sqlite">⤓ Base SQLite</a><a class="btn chico" href="${repo}/raw/main/base_datos/pch_proyecto.sql">⤓ Script SQL</a><a class="btn chico" href="${repo}/tree/main/data">Archivos fuente</a><a class="btn chico" href="${repo}/blob/main/notebooks/PCH_Proyecto_Integrado.ipynb">Cuaderno de cálculo</a></div>` : "";
    const ttrm = trm && trm.historial ? tabla("t-trm", [{ t: "Vigente desde", v: (x) => x.vigenciadesde.slice(0, 10) }, { t: "Vigente hasta", v: (x) => x.vigenciahasta.slice(0, 10) }, { t: "TRM [COP/USD]", n: 1, v: (x) => f(Number(x.valor), 2) }], trm.historial, { nombre: "trm" }) : null;
    const tacc = tabla("t-acc-cat", [{ t: "ID", v: (x) => `<code>${x.id}</code>`, csv: (x) => x.id }, { t: "Categoría", v: (x) => esc(x.categoria) }, { t: "Accesorio", v: (x) => esc(x.accesorio) }, { t: "Detalle", v: (x) => esc(x.detalle) }, { t: "Método", v: (x) => x.metodo }, { t: "K", n: 1, v: (x) => f(x.K, 3) }, { t: "Fuente", v: (x) => esc(x.fuente) }], d.accesorios, { alto: true, nombre: "accesorios" });
    const tcat = tabla("t-cat-tub", [{ t: "Material", v: (x) => esc(x.material) }, { t: "Fabricante", v: (x) => esc(x.fabricante) }, { t: "Serie", v: (x) => esc(x.serie) }, { t: "DN [mm]", n: 1, v: (x) => f(x.DN, 0) }, { t: "D hidráulico [m]", n: 1, v: (x) => f(x.D, 2) }, { t: "ε [mm]", n: 1, v: (x) => f(x.eps, 4) }], d.catalogo, { alto: true, nombre: "catalogo_tuberias" });
    sec.innerHTML = cabecera(titulos.datos, `Todos los datos de entrada vienen de la base de datos SQL del proyecto (actualizada ${esc(d.generado)}).`)
      + `<div class="rejilla r-12">
        ${tarjeta("Tasa de cambio (TRM)", trm ? `En línea: ${esc(trm.fuente)}` : `Del último cálculo automático (${esc(d.trm.fecha)}): ${esc(d.trm.fuente)}`,
          `<div class="kpis" style="grid-template-columns:1fr;margin-bottom:10px">${kpi("TRM del día", f(trm ? trm.valor : d.trm.valor, 2), "COP/USD", trm ? "Superintendencia Financiera vía datos.gov.co" : "sin conexión con datos.gov.co desde este navegador", C.verde)}</div>${ttrm ? ttrm.html : ""}`, ttrm ? ttrm.boton : "")}
        ${tarjeta("Base de datos SQL", "SQLite con una tabla por archivo fuente, una vista de catálogo y un diccionario de datos", tmeta.html + enlaces, tmeta.boton)}
      </div>
      <div class="rejilla r2">
        ${tarjeta("Precios del mercado (XM)", `Pesos constantes de ${E.p.anio_base}, deflactados con el IPC del DANE`, lienzo("g-xm"))}
        ${tarjeta("Serie de caudales del río", `${f(d.rio.Q.length, 0)} días: media móvil de 30 días`, lienzo("g-serie"))}
      </div>
      ${tarjeta("Catálogo de accesorios", `${d.accesorios.length} tipos en ${new Set(d.accesorios.map((a) => a.categoria)).size} categorías`, `<input class="buscador" id="busca-acc" placeholder="Buscar accesorio…" style="margin-bottom:10px">` + tacc.html, tacc.boton)}
      <div style="height:16px"></div>
      ${tarjeta("Catálogo de tuberías", `${d.catalogo.length} diámetros comerciales disponibles`, `<select class="buscador" id="filtro-mat" style="margin-bottom:10px"><option value="">Todos los materiales</option>${materialesCatalogo().map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join("")}</select>` + tcat.html, tcat.boton)}
      <div style="height:16px"></div>
      ${tarjeta("Referencias", "", `<ul class="nota" style="font-size:.86rem;color:var(--suave);line-height:1.7;margin:0;padding-left:18px">
        <li>ESHA (2004). <i>Guide on How to Develop a Small Hydropower Plant</i>. European Small Hydropower Association.</li>
        <li>Idelchik, I. E. <i>Handbook of Hydraulic Resistance</i>, 3.ª ed.; Crane Co. <i>Flow of Fluids</i> TP-410.</li>
        <li>XM S.A. E.S.P. Informes mensuales de variables del mercado (precio de bolsa y contratos).</li>
        <li>UPME. Plan de Expansión de Referencia Generación–Transmisión 2025–2039; Factores de emisión del SIN 2024.</li>
        <li>Superintendencia Financiera de Colombia. TRM histórica, datos abiertos (datos.gov.co, recurso 32sa-8pi3).</li>
        <li>Catálogos WEG/HISA, ANDRITZ, Xylem Flygt, Amiblu Flowtite, AGRU, Saint-Gobain PAM.</li></ul>`)}`;
    const filtrar = (inp, id, campo) => inp.addEventListener("input", () => { const q = inp.value.toLowerCase(); $$(`#${id}`)[0].closest(".tarjeta").querySelectorAll("tbody tr").forEach((tr, i) => { tr.hidden = q && !campo(i).toLowerCase().includes(q); }); });
    filtrar($("#busca-acc"), "busca-acc", (i) => Object.values(d.accesorios[i]).join(" "));
    $("#filtro-mat").addEventListener("change", (ev) => { const v = ev.target.value; ev.target.closest(".tarjeta").querySelectorAll("tbody tr").forEach((tr, i) => { tr.hidden = v && d.catalogo[i].id !== v; }); });
    const series = [["bolsa", "Bolsa", C.ambar], ["SICEP", "SICEP", C.teal], ["contrato_regulado", "Contrato regulado", C.azul], ["contrato_no_regulado", "Contrato no regulado", C.violeta]];
    const meses = [...new Set(series.flatMap(([k]) => d.precios[k].map((x) => x.mes)))].sort();
    grafica("g-xm", { type: "line", data: { labels: meses, datasets: series.map(([k, n, c]) => { const m = Object.fromEntries(d.precios[k].map((x) => [x.mes, x.valor])); return { label: n, data: meses.map((x) => m[x] ?? null), borderColor: c, backgroundColor: c, pointRadius: k === "bolsa" ? 2.5 : 0, spanGaps: true }; }) },
      options: { interaction: { mode: "index", intersect: false }, scales: { y: { title: { display: true, text: "COP/kWh constantes" }, ticks: ticks(0) }, x: { ticks: { maxTicksLimit: 10 } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${f(c.parsed.y, 1)} COP/kWh` } } } } });
    const Q = d.rio.Q, mm = [], et = [], ini = new Date(d.rio.inicio + "T00:00:00");
    for (let i = 0; i + 30 <= Q.length; i += 15) { mm.push(Motor.media(Q.slice(i, i + 30))); const t = new Date(ini.getTime() + (i + 15) * 864e5); et.push(`${MESES[t.getMonth()]} ${t.getFullYear()}`); }
    grafica("g-serie", { type: "line", data: { labels: et, datasets: [{ label: "Caudal medio 30 días", data: mm, borderColor: C.azul, backgroundColor: alfa(C.azul, 0.1), fill: "origin", borderWidth: 1.4 }] },
      options: { scales: { y: { title: { display: true, text: "m³/s" } }, x: { ticks: { maxTicksLimit: 9, maxRotation: 0 } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${f(c.parsed.y, 1)} m³/s` } } } } });
  };

  // ======================= TRM en línea =======================
  async function trmEnLinea() {
    const hoy = new Date(), iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const url = "https://www.datos.gov.co/resource/32sa-8pi3.json?" + new URLSearchParams({ $where: `vigenciadesde <= '${iso}T00:00:00'`, $order: "vigenciadesde DESC", $limit: "10" });
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(resp.status);
      const filas = await resp.json();
      const v = Number(filas[0].valor);
      if (!(v > 0)) throw new Error("sin dato");
      E.trmEnLinea = { valor: v, historial: filas, fuente: `vigente del ${filas[0].vigenciadesde.slice(0, 10)} al ${filas[0].vigenciahasta.slice(0, 10)}` };
      E.base.TRM = v;
      if (!E.trmEditada && !E.desdeEnlace.has("TRM")) { E.p.TRM = v; sincronizarFormulario(); programarCalculo(); }
      pintarChipTRM();
      if (E.vista === "datos") pintarVista();
    } catch (e) { pintarChipTRM(); }
  }
  function pintarChipTRM() {
    const chip = $("#chip-trm"), t = E.trmEnLinea;
    $("#trm-valor").textContent = f(t ? t.valor : E.datos.trm.valor, 2);
    chip.classList.toggle("en-linea", !!t);
    chip.title = t ? `TRM en línea (Superintendencia Financiera, datos.gov.co), ${t.fuente}` : `TRM del último cálculo automático (${E.datos.trm.fecha}); no se pudo consultar en línea`;
  }

  // ======================= enlace para compartir =======================
  function guardarEnEnlace() {
    const c = cambios().filter((k) => k !== "TRM" || E.trmEditada);
    const obj = Object.fromEntries(c.map((k) => [k, E.p[k]]));
    const hash = c.length ? "#p=" + encodeURIComponent(JSON.stringify(obj)) : "";
    history.replaceState(null, "", location.pathname + location.search + hash + (E.vista !== "resumen" ? (hash ? "&" : "#") + "v=" + E.vista : ""));
  }
  function leerEnlace() {
    const h = location.hash.slice(1), out = { p: {}, v: null };
    h.split("&").forEach((par) => { const [k, ...v] = par.split("="); const val = v.join("="); if (k === "p") { try { out.p = JSON.parse(decodeURIComponent(val)); } catch (e) { /* enlace dañado */ } } if (k === "v") out.v = val; });
    return out;
  }
  function aviso(texto) { const t = $("#toast"); t.textContent = texto; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => (t.hidden = true), 2600); }

  // ======================= navegación =======================
  function irA(v) {
    if (!VISTAS[v]) v = "resumen";
    E.vista = v;
    $$(".pestanas button").forEach((b) => b.classList.toggle("activa", b.dataset.tab === v));
    $$(".vista").forEach((s) => (s.hidden = s.id !== "v-" + v));
    pintarVista(); guardarEnEnlace();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  function restablecer() {
    E.p = JSON.parse(JSON.stringify(E.base)); E.trmEditada = false; E.desdeEnlace = new Set();
    sincronizarFormulario(); programarCalculo(); aviso("Valores del proyecto restablecidos");
  }

  // ======================= inicio =======================
  async function iniciar() {
    configurarChart();
    try {
      const [d, c] = await Promise.all([fetch("datos/datos.json").then((x) => x.json()), fetch("datos/resultados.json").then((x) => x.json())]);
      E.datos = d; E.cuaderno = c;
    } catch (e) {
      $("#contenido").innerHTML = `<div class="aviso error">No se pudieron cargar los datos del proyecto (${esc(e.message)}).</div>`; return;
    }
    E.repo = E.datos.repo || null;
    if (E.repo) $("#enlace-repo").href = E.repo; else $("#enlace-repo").hidden = true;
    const p = E.datos.parametros;
    E.base = { ...p, TRM: E.datos.trm.valor, accesorios_tramo: { ...p.accesorios_tramo } };
    const enlace = leerEnlace();
    E.desdeEnlace = new Set(Object.keys(enlace.p));
    E.p = { ...JSON.parse(JSON.stringify(E.base)), ...enlace.p };
    if (enlace.p.TRM) E.trmEditada = true;
    construirFormulario();
    pintarChipTRM();
    E.r = Motor.calcular(E.datos, E.p);
    pintarDiametros(); pintarAvisos();
    $("#pie").innerHTML = `<span>Simulador PCH · motor de cálculo con las mismas ecuaciones del cuaderno del proyecto.</span><span>Datos actualizados ${esc(E.datos.generado)} · TRM de respaldo ${f(E.datos.trm.valor, 2)} (${esc(E.datos.trm.fecha)})</span>`;
    $$(".pestanas button").forEach((b) => b.addEventListener("click", () => irA(b.dataset.tab)));
    irA(enlace.v || "resumen");
    if (E.desdeEnlace.size) aviso("Escenario cargado desde el enlace compartido");
    // Eventos globales
    $("#btn-restablecer").onclick = restablecer;
    $("#abrir-param").onclick = $("#fab-param").onclick = () => document.body.classList.add("param-abierto");
    $("#cerrar-param").onclick = $("#velo").onclick = () => document.body.classList.remove("param-abierto");
    $("#btn-compartir").onclick = async () => { guardarEnEnlace(); try { await navigator.clipboard.writeText(location.href); aviso("Enlace copiado: abre la app con estos mismos parámetros"); } catch (e) { aviso("Copie la dirección del navegador para compartir este escenario"); } };
    document.addEventListener("click", (ev) => {
      const csv = ev.target.closest("[data-csv]"); if (csv) descargarCSV(csv.dataset.csv);
      const fig = ev.target.closest("[data-img]");
      if (fig) { const dlg = $("#visor"); $("img", dlg).src = fig.dataset.img; $("p", dlg).textContent = fig.dataset.cap; dlg.showModal(); }
    });
    $("#visor .cerrar").onclick = () => $("#visor").close();
    $("#visor").addEventListener("click", (ev) => { if (ev.target.id === "visor") $("#visor").close(); });
    trmEnLinea();
  }
  document.addEventListener("DOMContentLoaded", iniciar);
})();
