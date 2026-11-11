/* Motor de cálculo de la PCH.
 * Reproduce las ecuaciones del cuaderno notebooks/PCH_Proyecto_Integrado.ipynb (secciones 5 a 15) para que la app
 * recalcule el proyecto completo en el navegador cuando el usuario cambia los requerimientos iniciales.
 */
(function (raiz) {
  "use strict";

  // ---------- utilidades numéricas ----------
  function interp(x, xs, ys) { // np.interp: lineal y con valores extremos fuera del rango.
    if (x <= xs[0]) return ys[0];
    const n = xs.length;
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 1;
    while (xs[i] < x) i++;
    const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return ys[i - 1] + t * (ys[i] - ys[i - 1]);
  }
  const _nf = {};
  const fx = (v, d) => (_nf[d] = _nf[d] || new Intl.NumberFormat("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d })).format(v);
  const suma = (a) => a.reduce((s, v) => s + v, 0);
  const media = (a) => (a.length ? suma(a) / a.length : NaN);
  function cuantil(a, q) { // pandas.quantile (interpolación lineal).
    const s = [...a].sort((x, y) => x - y);
    const pos = (s.length - 1) * q, i = Math.floor(pos), f = pos - i;
    return i + 1 < s.length ? s[i] + f * (s[i + 1] - s[i]) : s[i];
  }
  const mediana = (a) => cuantil(a, 0.5);
  function argsort(a) { return a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((p) => p[1]); }
  function rng(semilla) { // Generador reproducible (mulberry32).
    let s = semilla >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function raizBiseccion(fn, a, b) { // Raíz de fn en [a, b] (equivale a brentq cuando hay cambio de signo).
    let fa = fn(a), fb = fn(b);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return NaN;
    for (let k = 0; k < 200; k++) {
      const m = (a + b) / 2, fm = fn(m);
      if (Math.abs(b - a) < 1e-12) return m;
      if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    return (a + b) / 2;
  }

  // ---------- constantes del cuaderno ----------
  const TURBINAS = {
    Pelton: { H: [50, 1300], q_min: 0.10, ns: [5, 70], nqe: [0.005, 0.0612], q_rel: [0.10, 0.20, 0.40, 0.60, 0.80, 1.00], eta: [0.80, 0.87, 0.90, 0.91, 0.91, 0.90] },
    Francis: { H: [10, 400], q_min: 0.40, ns: [50, 400], nqe: [0.05, 0.33], q_rel: [0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00], eta: [0.78, 0.84, 0.88, 0.91, 0.93, 0.94, 0.92] },
    Kaplan: { H: [2, 40], q_min: 0.20, ns: [300, 1100], nqe: [0.19, 1.55], q_rel: [0.20, 0.40, 0.60, 0.80, 1.00], eta: [0.82, 0.90, 0.92, 0.93, 0.92] },
    "Michell-Banki": { H: [2, 200], q_min: 0.15, ns: [20, 200], nqe: [0.01, 0.12], P_max_kW: 3000, q_rel: [0.15, 0.20, 0.40, 0.60, 0.80, 1.00], eta: [0.70, 0.77, 0.80, 0.81, 0.81, 0.79] },
  };
  const POLOS = []; for (let p = 4; p < 82; p += 2) POLOS.push(p);
  const N_SINC = POLOS.map((p) => 7200 / p);
  const HS_MIN = -6.0;
  const ENVOLVENTES = [
    { fab: "WEG", tipo: "Pelton", pmax: 30000, pts: [[0.30, 100], [0.30, 301], [0.405, 399], [1.55, 502], [6.08, 552], [12.3, 280], [1.02, 100]] },
    { fab: "WEG", tipo: "Francis", pmax: 50000, pts: [[0.504, 151], [1.55, 250], [23.3, 250], [46.4, 121.5], [27.4, 8.0], [4.07, 8.0], [0.504, 66.4]] },
    { fab: "WEG", tipo: "Kaplan", pmax: 30000, pts: [[3.09, 17.8], [8.95, 34.7], [99.3, 34.7], [218, 15.2], [71.3, 3.97], [14.1, 3.97]] },
    { fab: "ANDRITZ", tipo: "Bomba como turbina", pmax: 2000, pts: [[0.03, 10], [0.10, 55], [1.0, 80], [2.5, 80], [2.5, 5], [0.33, 3], [0.13, 3]] },
    { fab: "Flygt", tipo: "Semi-Kaplan", pmax: 2800, pts: [[0.7, 5], [0.7, 10], [1.0, 17], [2.2, 20], [2.8, 20], [4.0, 17], [8.0, 10], [28, 10], [45, 6.5], [45, 4], [35, 2.5], [6, 2.5], [1.0, 3.5]] },
  ];
  const E_GPA = { GRP_FLOWTITE: 15, PE100_AGRU: 1.1, DI_PAM: 170, PVC: 3.0, STEEL_WELDED: 206 };
  const COSTO_REL = { STEEL_WELDED: 1.0, GRP_FLOWTITE: 0.85, PE100_AGRU: 1.0, DI_PAM: 1.10, PVC: 0.60 };
  const UPME = { obras: 0.325, equipos: 0.551, transmision: 0.010, estudios: 0.009, disenos: 0.106 };
  const F_TUB_REF = 0.12;
  const ACERO = { sigma_adm: 137.0, E_j: 0.90, e_corr: 2.0, precio: 1650.0 };
  const FE_CO2 = [
    ["Margen combinado, 1.er periodo (adoptado)", 0.607],
    ["Margen combinado, 2.º y 3.er periodo", 0.554],
    ["Factor de inventario (cota inferior)", 0.220],
  ];
  const CRONO = [
    ["Planificación (estudios y diseños)", "C_ing", 1.00, [0.70, 0.20, 0.10]],
    ["Adquisición de tierras", "C_ob", 0.05, [1.00, 0.00, 0.00]],
    ["Trabajos de excavación", "C_ob", 0.35, [0.50, 0.50, 0.00]],
    ["Construcciones", "C_ob", 0.60, [0.20, 0.50, 0.30]],
    ["Adquisición de equipo electromecánico y accesorios", "C_eq", 0.85, [0.10, 0.50, 0.40]],
    ["Transporte de equipos incluyendo seguro", "C_eq", 0.05, [0.00, 0.50, 0.50]],
    ["Montaje y puesta en marcha", "C_eq", 0.07, [0.00, 0.00, 1.00]],
    ["Aranceles, impuestos, gravámenes, derechos y otros", "C_eq", 0.03, [0.10, 0.50, 0.40]],
  ];

  // ---------- modelo ----------
  function crearModelo(datos, p) {
    const g = p.g, rho = p.rho, nu = p.nu;
    const accesoriosPorId = Object.fromEntries(datos.accesorios.map((a) => [a.id, a]));
    const K_bif = accesoriosPorId.BIF_Y_SIMETRICA ? accesoriosPorId.BIF_Y_SIMETRICA.K : 0;

    function friccion(Re, eps_m, D) { // Swamee–Jain (turbulento) o Hagen–Poiseuille (laminar).
      if (Re <= 0) return 0;
      if (Re < 2300) return 64 / Re;
      return 0.25 / Math.pow(Math.log10(eps_m / (3.7 * D) + 5.74 / Math.pow(Re, 0.9)), 2);
    }
    function hidraulica(Q, D, eps_mm, K) {
      const A = Math.PI * D * D / 4, V = Q / A, Re = V * D / nu, f = friccion(Re, eps_mm / 1000, D);
      const cv = V * V / (2 * g), hf = f * (p.L / D) * cv, hm = K * cv, hL = hf + hm, Hn = p.H_bruto - hL;
      const Ph = rho * g * Q * Hn / 1e6;
      return { A, V, Re, f, hf, hm, hL, Hn, Ph, Pe: Ph * p.eta_t * p.eta_g, perdida: hL / p.H_bruto };
    }
    function etaTurbina(tipo, q) { const t = TURBINAS[tipo]; return q < t.q_min ? 0 : interp(q, t.q_rel, t.eta); }
    function alturaAspiracion(nq, H, V2 = 2.0) {
      const sigma = 1.2715 * Math.pow(nq, 1.41) + V2 * V2 / (2 * g * H);
      const h_atm = 101325 * Math.pow(1 - 2.25577e-5 * p.cota_casa_maquinas, 5.25588) / (rho * g);
      return h_atm - 0.2388 + V2 * V2 / (2 * g) - sigma * H;
    }
    function factibilidad(tipo, H, Qu) {
      const t = TURBINAS[tipo];
      const P_kW = rho * g * Qu * H * Math.max(...t.eta) * p.eta_g / 1000;
      let i = -1, nsI = NaN, nqI = NaN;
      for (let k = 0; k < N_SINC.length; k++) {
        const n = N_SINC[k];
        const ns = n * Math.sqrt(P_kW) / Math.pow(H, 1.25);
        const nq = (n / 60) * Math.sqrt(Qu) / Math.pow(g * H, 0.75);
        let ok = ns >= t.ns[0] && ns <= t.ns[1] && nq >= t.nqe[0] && nq <= t.nqe[1] && n >= 200;
        if (ok && (tipo === "Francis" || tipo === "Kaplan")) ok = alturaAspiracion(nq, H) >= HS_MIN;
        if (ok) { i = k; nsI = ns; nqI = nq; break; }
      }
      const motivos = [];
      if (!(t.H[0] <= H && H <= t.H[1])) motivos.push(`salto fuera de ${t.H[0]}–${t.H[1]} m`);
      if (i < 0) motivos.push("sin velocidad síncrona que cumpla n_s, n_QE y Hs");
      if (t.P_max_kW && P_kW > t.P_max_kW) motivos.push(`P por unidad > ${t.P_max_kW} kW`);
      return { tipo, factible: motivos.length === 0, motivo: motivos.join("; ") || "OK", P_unidad_kW: P_kW,
        n_rpm: i >= 0 ? N_SINC[i] : NaN, polos: i >= 0 ? POLOS[i] : null, nQE: nqI, ns: nsI };
    }
    function dentroEnvolvente(env, Q, H) { // Punto en polígono en coordenadas (log Q, log H).
      const x = Math.log10(Q), y = Math.log10(H), pts = env.pts.map(([a, b]) => [Math.log10(a), Math.log10(b)]);
      let dentro = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
      }
      return dentro;
    }
    function despacho(Qdisp, Qd, n_u, tipo) {
      const Q = Math.min(Qdisp, Qd), Qu = Qd / n_u, qmin = TURBINAS[tipo].q_min;
      let k = Math.min(Math.max(Math.ceil(Q / Qu - 1e-9), 0), n_u);
      for (let r = 0; r < n_u; r++) if (k > 1 && Q / Math.max(k, 1) < qmin * Qu) k -= 1;
      const q_rel = k > 0 ? Q / Math.max(k, 1) / Qu : 0;
      const eta = etaTurbina(tipo, Math.min(q_rel, 1.0));
      return [eta > 0 ? Math.min(Q, k * Qu) : 0, eta];
    }
    const Qrio = datos.rio.Q, mes = datos.rio.mes, N = Qrio.length;
    const anios = N / 365, n_a = Math.floor(anios);
    function simular(Qd, D, eps, K, n_u, tipo, detalle = false) {
      const fElec = p.eta_tr * (1 - p.perdidas_linea) * (1 - p.autoconsumo) * p.disponibilidad * 24 * 1000;
      let E_neta_tot = 0, E_bruta_tot = 0;
      const E_mat = Array.from({ length: n_a }, () => new Array(12).fill(0));
      const d = detalle ? { Qt: new Float64Array(N), P: new Float64Array(N), Hn: new Float64Array(N), E: new Float64Array(N) } : null;
      for (let i = 0; i < N; i++) {
        const [Qt, eta] = despacho(Math.max(Qrio[i] - p.Q_eco, 0), Qd, n_u, tipo);
        let P = 0, Hn = p.H_bruto;
        if (Qt > 0) { const h = hidraulica(Qt, D, eps, K); Hn = h.Hn; P = rho * g * Qt * Math.max(Hn, 0) * eta * p.eta_g / 1e6; }
        const En = P * fElec;
        E_neta_tot += En; E_bruta_tot += P * 24 * 1000;
        if (i < n_a * 365) E_mat[Math.floor(i / 365)][mes[i] - 1] += En;
        if (d) { d.Qt[i] = Qt; d.P[i] = P; d.Hn[i] = Hn; d.E[i] = En; }
      }
      return { E_media: E_neta_tot / anios, E_bruta_media: E_bruta_tot / anios, E_mat, detalle: d };
    }
    function espesorMm(m, D) {
      const p_m = p.H_bruto * 1.3;
      if (m === "PE100_AGRU") return D * 1000 / ((p_m <= 100 ? 17 : p_m <= 160 ? 11 : 7.4) - 2);
      if (m === "GRP_FLOWTITE") return D * 1000 / 90;
      if (m === "DI_PAM") return 9 * (0.5 + D);
      if (m === "STEEL_WELDED") return Math.max(rho * g * p_m / 1e6 * D * 1000 / (2 * ACERO.sigma_adm * ACERO.E_j) + ACERO.e_corr, (D * 1000 + 508) / 400);
      return D * 1000 / 24;
    }
    function claseTuberia(m) {
      const p_m = p.H_bruto * 1.3;
      if (m === "PE100_AGRU") { const sdr = p_m <= 100 ? 17 : p_m <= 160 ? 11 : 7.4; return `PE100 SDR ${sdr}`; }
      if (m === "GRP_FLOWTITE") return "GRP PN10 SN5000 (e ≈ D/90)";
      if (m === "DI_PAM") return "Fundición dúctil K9";
      if (m === "STEEL_WELDED") return "Acero soldado (Barlow + corrosión)";
      return "PVC SDR 26";
    }
    function celeridad(m, D) { const e = espesorMm(m, D); return Math.sqrt((2.2e9 / rho) / (1 + 2.2e9 * D / (E_GPA[m] * 1e9 * e / 1000))); }
    function costoTuberiaUsd(D, m) {
      const e = Math.max(rho * g * p.H_bruto * 1.3 / 1e6 * D * 1000 / (2 * ACERO.sigma_adm * ACERO.E_j) + ACERO.e_corr, (D * 1000 + 508) / 400) / 1000;
      const masa_t = Math.PI * (D + e) * e * p.L * 7.85;
      return masa_t * ACERO.precio * 2.0 * (COSTO_REL[m] ?? 1.0);
    }
    function capexUsd(P_MW, D, m, n_u) {
      const base = P_MW * 1000 * p.c_ref_usd_kw, c_tub = costoTuberiaUsd(D, m), f_u = { 1: 1.0, 2: 1.15, 3: 1.25 }[n_u];
      const C_eq = base * (UPME.equipos + UPME.transmision - F_TUB_REF) * f_u + c_tub;
      const C_ob = base * UPME.obras, C_ing = base * (UPME.estudios + UPME.disenos);
      return { base, C_eq, C_ob, C_ing, tuberia: c_tub, total: C_eq + C_ob + C_ing };
    }
    function tablaEvaluacion(E_a, I_a, capex, egresos, n = p.vida_util) {
      const filas = [];
      let acum = 0;
      for (let t = 0; t <= n; t++) {
        const op = t >= 1;
        const f = { anio: t, energia_MWh: op ? E_a / 1000 : 0, venta: op ? I_a : 0, egresos: op ? egresos : 0,
          depreciacion: op ? capex / n : 0, inversion: t === 0 ? capex : 0 };
        f.utilidades = f.venta - f.egresos - f.depreciacion;
        f.flujo = f.venta - f.egresos - f.inversion;
        acum += f.flujo; f.amortizacion = acum;
        filas.push(f);
      }
      return filas;
    }
    function indicadores(ev, i = p.i_desc, flujoKey = "flujo") {
      const fc = ev.map((f) => f[flujoKey]), t = ev.map((f) => f.anio), n = t[t.length - 1];
      const fd = t.map((x) => Math.pow(1 + i, -x));
      const van = suma(fc.map((v, k) => v * fd[k]));
      const tir = raizBiseccion((r) => suma(fc.map((v, k) => v * Math.pow(1 + r, -t[k]))), -0.9, 3.0);
      const capex = suma(ev.map((f) => f.inversion)), egr = ev.map((f) => f.egresos);
      const va_ben = suma(ev.map((f, k) => f.venta * fd[k])), va_cos = capex + suma(egr.map((v, k) => v * fd[k]));
      const fc_op = fc.slice(1);
      const acum = []; fc.reduce((s, v, k) => { acum.push(s + v * fd[k]); return s + v * fd[k]; }, 0);
      const k = acum.findIndex((v) => v >= 0);
      const pb_din = k > 0 ? k - 1 + -acum[k - 1] / (acum[k] - acum[k - 1]) : NaN;
      const crf = i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1);
      const A = capex * crf + media(egr.slice(1));
      return { VAN: van, TIR: tir, BC: va_ben / va_cos, PB: capex / media(fc_op), PB_din: pb_din, C_T: va_cos, A,
        LCOE: A / (media(ev.slice(1).map((f) => f.energia_MWh)) * 1000), acum_desc: acum };
    }
    return { g, rho, nu, K_bif, accesoriosPorId, hidraulica, friccion, etaTurbina, alturaAspiracion, factibilidad,
      dentroEnvolvente, despacho, simular, espesorMm, claseTuberia, celeridad, costoTuberiaUsd, capexUsd, tablaEvaluacion,
      indicadores, anios, n_a, N };
  }

  // ---------- mercado ----------
  function mercado(datos, p) {
    const bolsa = datos.precios.bolsa, sicep = datos.precios.SICEP;
    const bolsaV = bolsa.map((r) => r.valor);
    const porMes = Array.from({ length: 12 }, () => []);
    bolsa.forEach((r) => porMes[Number(r.mes.slice(5, 7)) - 1].push(r.valor));
    const medGlobal = mediana(bolsaV);
    const perfil = porMes.map((a) => (a.length ? mediana(a) : medGlobal));
    const precio_contrato = media(sicep.slice(-12).map((r) => r.valor));
    const ventanas = [];
    for (let j = 0; j + 12 <= bolsa.length; j++) {
      const w = bolsa.slice(j, j + 12), fila = new Array(12).fill(NaN);
      for (let m = 0; m < 12; m++) { const v = w.filter((r) => Number(r.mes.slice(5, 7)) === m + 1).map((r) => r.valor); fila[m] = media(v); }
      ventanas.push(fila);
    }
    return { perfil, precio_contrato, p10: cuantil(bolsaV, 0.10), p75: cuantil(bolsaV, 0.75), ventanas, bolsaV };
  }

  // ---------- cálculo completo del proyecto ----------
  function calcular(datos, entrada) {
    const p = Object.assign({}, datos.parametros, entrada);
    const avisos = [];
    const M = crearModelo(datos, p);
    const TRM = p.TRM;

    // 5. Accesorios
    const inventario = Object.entries(p.accesorios_tramo).filter(([, n]) => n > 0).map(([id, n]) => {
      const a = M.accesoriosPorId[id];
      return { id, categoria: a.categoria, accesorio: a.accesorio, detalle: a.detalle, cantidad: n, K: a.K, Ktot: n * a.K, fuente: a.fuente };
    });
    const K_total = suma(inventario.map((a) => a.Ktot));

    // 6. Tuberías al caudal de diseño
    const tabla_tub = datos.catalogo.map((c) => {
      const h = M.hidraulica(p.Q_diseno, c.D, c.eps, K_total);
      const cumpleV = h.V >= p.V_min && h.V <= p.V_max, cumple6 = h.perdida <= p.perdida_max;
      return { id: c.id, material: c.material, D: c.D, eps: c.eps, ...h, cumpleV, cumple6, factible: cumpleV && cumple6 };
    }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.D - b.D));
    const opciones = tabla_tub.filter((r) => r.factible);
    if (!opciones.length) {
      return { error: `Ninguna tubería del catálogo cumple V ≤ ${p.V_max} m/s y pérdidas ≤ ${fx(p.perdida_max * 100, 0)} % de Hb con Q = ${p.Q_diseno} m³/s. Reduzca el caudal, aumente el salto o acorte la conducción.`, p, tabla_tub, inventario, K_total };
    }
    let material = p.material_id;
    let res_mat = tabla_tub.filter((r) => r.id === material), cumplen = res_mat.filter((r) => r.factible);
    let sel, modo_sel;
    if (!cumplen.length) {
      avisos.push(`Ningún diámetro de ${nombreMaterial(datos, material)} cumple el diseño; se usa la tubería que cumple más barata del catálogo.`);
      const masBarata = [...opciones].sort((a, b) => M.costoTuberiaUsd(a.D, a.id) - M.costoTuberiaUsd(b.D, b.id))[0];
      material = masBarata.id; res_mat = tabla_tub.filter((r) => r.id === material); cumplen = res_mat.filter((r) => r.factible);
      sel = masBarata; modo_sel = "automática (el material elegido no cumple)";
    } else if (p.D_tuberia == null) {
      sel = cumplen[0]; modo_sel = "automática: menor diámetro que cumple";
    } else {
      const cand = res_mat.reduce((b, r) => (Math.abs(r.D - p.D_tuberia) < Math.abs(b.D - p.D_tuberia) ? r : b));
      if (cand.factible) { sel = cand; modo_sel = "elegida por el diseñador"; }
      else {
        avisos.push(`${nombreMaterial(datos, material)} D = ${fx(cand.D, 2)} m no cumple el diseño (V = ${fx(cand.V, 2)} m/s, pérdidas = ${fx(cand.perdida * 100, 2)} %); se usa el menor diámetro que cumple.`);
        sel = cumplen[0]; modo_sel = "automática (la elegida no cumplía el diseño)";
      }
    }
    const D_sel = sel.D, eps_sel = sel.eps;
    const hd = M.hidraulica(p.Q_diseno, D_sel, eps_sel, K_total);
    const desglose = inventario.map((a) => ({ ...a, hm: a.Ktot * hd.V * hd.V / (2 * M.g) }));

    // 7. Golpe de ariete
    const e_mm = M.espesorMm(material, D_sel), a = M.celeridad(material, D_sel), Tc = 2 * p.L / a;
    const dh_jouk = a * hd.V / M.g;
    const dh_T = p.T_cierre <= Tc ? dh_jouk : 2 * p.L * hd.V / (M.g * p.T_cierre);
    const T_min = 2 * p.L * hd.V / (M.g * 0.30 * p.H_bruto);
    const ariete = { clase: M.claseTuberia(material), e_mm, a, Tc, dh_jouk, dh_T, T_min };

    // 8. Turbina: regla de ingeniería que etiqueta el modelo de ML + verificación física
    const H_neto = hd.Hn;
    const verif = [];
    let turbina = null, n_unid = null;
    for (let k = 1; k <= p.n_unidades_max && !turbina; k++) {
      const fact = Object.keys(TURBINAS).filter((t) => M.factibilidad(t, H_neto, p.Q_diseno / k).factible);
      if (fact.length) {
        const P_tot = M.rho * M.g * p.Q_diseno * H_neto * 0.90 * p.eta_g / 1000;
        turbina = fact.includes("Michell-Banki") && P_tot < 1000 ? "Michell-Banki" : fact.reduce((b, t) => (Math.max(...TURBINAS[t].eta) > Math.max(...TURBINAS[b].eta) ? t : b));
        n_unid = k;
      }
    }
    for (const t of Object.keys(TURBINAS)) for (let k = 1; k <= p.n_unidades_max; k++) {
      const fz = M.factibilidad(t, H_neto, p.Q_diseno / k);
      verif.push({ tipo: t, unidades: k, ...fz });
    }
    if (!turbina) return { error: `Ningún tipo de turbina es físicamente factible con H neto = ${fx(H_neto, 1)} m y Q = ${p.Q_diseno} m³/s con ${p.n_unidades_max} unidades o menos.`, p, tabla_tub, inventario, K_total, hd };
    const Q_u = p.Q_diseno / n_unid, fz = M.factibilidad(turbina, H_neto, Q_u);
    const nq = fz.nQE, n_rpm = fz.n_rpm;
    const D3 = 84.5 * (0.31 + 2.488 * nq) * Math.sqrt(H_neto) / n_rpm;
    const D1 = (0.4 + 0.095 / nq) * D3;
    const Hs = M.alturaAspiracion(nq, H_neto);
    const eta_nom = M.etaTurbina(turbina, 1.0);
    const P_inst = M.rho * M.g * p.Q_diseno * H_neto * eta_nom * p.eta_g / 1e6;
    const catalogos = ENVOLVENTES.map((env) => {
      const filas = [];
      for (let k = 1; k <= p.n_unidades_max; k++) {
        const P_u = M.rho * M.g * p.Q_diseno / k * H_neto * 0.90 * p.eta_g / 1000;
        filas.push(M.dentroEnvolvente(env, p.Q_diseno / k, H_neto) && P_u <= env.pmax);
      }
      return { fabricante: env.fab, tipo: env.tipo, aptas: filas };
    });
    const ficha = { turbina, n_unid, Q_u, P_u: fz.P_unidad_kW / 1000, n_rpm, polos: fz.polos, nq, ns: fz.ns, D3, D1, Hs, eta_nom, P_inst,
      marcas: catalogos.filter((c) => c.aptas[n_unid - 1]).map((c) => `${c.fabricante} ${c.tipo}`) };

    // 9. Energía
    const sim = M.simular(p.Q_diseno, D_sel, eps_sel, K_total, n_unid, turbina, true);
    const E_media = sim.E_media, FP = sim.E_bruta_media / (P_inst * 8760 * 1000);
    const d = sim.detalle;
    let sinOp = 0, parcial = 0, plena = 0, remOk = 0, remMin = Infinity, sumQt = 0, sumQr = 0, Pmax = 0, sumP = 0;
    for (let i = 0; i < M.N; i++) {
      const Qt = d.Qt[i];
      if (Qt === 0) sinOp++; else if (Qt < p.Q_diseno - 1e-6) parcial++; else plena++;
      const rem = datos.rio.Q[i] - Qt; if (rem >= p.Q_eco - 1e-9) remOk++; remMin = Math.min(remMin, rem);
      sumQt += Qt; sumQr += datos.rio.Q[i]; Pmax = Math.max(Pmax, d.P[i]); sumP += d.P[i];
    }
    const E_anual = sim.E_mat.map((f) => suma(f));
    const E_med_mes = Array.from({ length: 12 }, (_, m) => media(sim.E_mat.map((f) => f[m])));
    const E_std_mes = Array.from({ length: 12 }, (_, m) => { const v = sim.E_mat.map((f) => f[m]), mu = media(v); return Math.sqrt(media(v.map((x) => (x - mu) ** 2))); });
    const operacion = { dias: M.N, sinOp, parcial, plena, generando: (M.N - sinOp) / M.N, Pmedia: sumP / M.N, Pmax, E_media, E_firme: Math.min(...E_anual),
      FP, remOk: remOk / M.N, remMin, fracDerivada: sumQt / sumQr };

    // 10. Mercado
    const mk = mercado(datos, p);
    const sortE = argsort(E_anual);
    const i_seco = sortE[Math.max(Math.floor(0.1 * M.n_a) - 1, 0)], i_hum = sortE[Math.ceil(0.9 * M.n_a) - 1];
    const precioBase = mk.perfil.map((v) => p.frac_contrato * mk.precio_contrato + (1 - p.frac_contrato) * v);
    const ESC = [
      ["1. Venta en bolsa", mk.perfil, E_med_mes],
      ["2. Contrato bilateral", new Array(12).fill(mk.precio_contrato), E_med_mes],
      ["3. Conservador", new Array(12).fill(mk.p10), sim.E_mat[i_seco]],
      ["4. Base", precioBase, E_med_mes],
      ["5. Optimista", new Array(12).fill(mk.p75), sim.E_mat[i_hum]],
    ];

    // 11. CAPEX y OPEX
    const cx = M.capexUsd(P_inst, D_sel, material, n_unid);
    const CAPEX = cx.total * TRM;
    const crono = CRONO.map(([act, comp, f, rep]) => ({ actividad: act, componente: comp, periodos: rep.map((r) => cx[comp] * f * r * TRM / 1e6) }));
    const f_opex = p.f_cop + p.f_mant + p.f_adm;
    const OPEX = f_opex * CAPEX;
    const E_base = suma(E_med_mes);
    const I_base = suma(precioBase.map((v, m) => v * E_med_mes[m]));
    const transf = P_inst > 10 ? p.ley99 * I_base : 0;

    // 12. Evaluación económica
    const ev = M.tablaEvaluacion(E_base, I_base, CAPEX, OPEX + transf);
    const ind = M.indicadores(ev);
    const escenarios = ESC.map(([nombre, precio, energia]) => {
      const E = suma(energia), I = suma(precio.map((v, m) => v * energia[m]));
      const egr = OPEX + (P_inst > 10 ? p.ley99 * I : 0);
      return { nombre, E, precio: I / E, I, precioMes: precio, energiaMes: energia, ind: M.indicadores(M.tablaEvaluacion(E, I, CAPEX, egr)) };
    });
    const vanCon = (fp = 1, fe = 1, fc = 1, fo = 1, i = p.i_desc) => {
      const I = I_base * fp * fe, egr = OPEX * fo * fc + (P_inst > 10 ? p.ley99 * I : 0);
      return M.indicadores(M.tablaEvaluacion(E_base * fe, I, CAPEX * fc, egr), i).VAN;
    };
    const van0 = vanCon();
    const tornado = [
      ["Precio de venta", vanCon(0.8), vanCon(1.2)],
      ["Energía generada", vanCon(1, 0.8), vanCon(1, 1.2)],
      ["CAPEX", vanCon(1, 1, 0.8), vanCon(1, 1, 1.2)],
      ["OPEX", vanCon(1, 1, 1, 0.8), vanCon(1, 1, 1, 1.2)],
      ["Tasa de descuento", vanCon(1, 1, 1, 1, p.i_desc * 0.8), vanCon(1, 1, 1, 1, p.i_desc * 1.2)],
    ].map(([v, b, a]) => ({ variable: v, menos: b, mas: a, rango: Math.abs(a - b) })).sort((x, y) => y.rango - x.rango);
    const curvaVAN = []; for (let k = 0; k <= 60; k++) { const r = k * 0.005; curvaVAN.push([r, M.indicadores(ev, r).VAN]); }
    // Monte Carlo
    const azar = rng(p.semilla || 42), n_sim = 3000, vanMC = new Float64Array(n_sim);
    const fdMC = Array.from({ length: p.vida_util }, (_, t) => Math.pow(1 + p.i_desc, -(t + 1)));
    for (let s = 0; s < n_sim; s++) {
      let v = -CAPEX;
      for (let t = 0; t < p.vida_util; t++) {
        const h = sim.E_mat[Math.floor(azar() * M.n_a)], w = mk.ventanas[Math.floor(azar() * mk.ventanas.length)];
        let I = 0; for (let m = 0; m < 12; m++) I += h[m] * (p.frac_contrato * mk.precio_contrato + (1 - p.frac_contrato) * w[m]);
        v += (I - OPEX - (P_inst > 10 ? p.ley99 * I : 0)) * fdMC[t];
      }
      vanMC[s] = v;
    }
    const mcOrd = Array.from(vanMC).sort((x, y) => x - y);
    const montecarlo = { van: mcOrd, pPerdida: mcOrd.filter((v) => v < 0).length / n_sim, p5: cuantil(mcOrd, 0.05), p50: cuantil(mcOrd, 0.5), p95: cuantil(mcOrd, 0.95) };
    // Después de impuestos
    const evImp = ev.map((f) => { const imp = Math.max(f.utilidades, 0) * p.tasa_renta; return { ...f, impuesto: imp, flujo_imp: f.flujo - imp }; });
    const indImp = M.indicadores(evImp, p.i_desc, "flujo_imp");

    // 14.1 y 14.2 Comparativo de materiales y de todas las tuberías que cumplen
    function evaluarConfig(Qd, D, eps, mat, n_u, tipo) {
      const K = K_total + (n_u > 1 ? M.K_bif : 0), h = M.hidraulica(Qd, D, eps, K);
      const P = M.rho * M.g * Qd * h.Hn * M.etaTurbina(tipo, 1.0) * p.eta_g / 1e6;
      const s = M.simular(Qd, D, eps, K, n_u, tipo);
      const E_m = Array.from({ length: 12 }, (_, m) => media(s.E_mat.map((f) => f[m])));
      const I = suma(E_m.map((e, m) => e * precioBase[m]));
      const capex = M.capexUsd(P, D, mat, n_u).total * TRM;
      const egr = f_opex * capex + (P > 10 ? p.ley99 * I : 0);
      const r = M.indicadores(M.tablaEvaluacion(suma(E_m), I, capex, egr));
      return { Q_d: Qd, material: mat, D, eps, unidades: n_u, V: h.V, perdida: h.perdida, P_MW: P, E_GWh: suma(E_m) / 1e6,
        CAPEX_MUSD: capex / TRM / 1e6, VAN: r.VAN, TIR: r.TIR, costoTubUsd: M.costoTuberiaUsd(D, mat) };
    }
    const D_mat = {}, eps_mat = {};
    for (const c of datos.catalogo) { (D_mat[c.id] = D_mat[c.id] || []).push(c.D); eps_mat[c.id] = eps_mat[c.id] ?? c.eps; }
    Object.values(D_mat).forEach((a) => a.sort((x, y) => x - y));
    D_mat.STEEL_WELDED = []; for (let k = 0; k <= 30; k++) D_mat.STEEL_WELDED.push(Math.round((1.0 + 0.1 * k) * 100) / 100);
    eps_mat.STEEL_WELDED = datos.eps_acero;
    const comp_mat = [], todas = [];
    for (const [m, Ds] of Object.entries(D_mat)) {
      const K = K_total + (n_unid > 1 ? M.K_bif : 0);
      const ok = Ds.filter((D) => { const h = M.hidraulica(p.Q_diseno, D, eps_mat[m], K); return h.V >= p.V_min && h.V <= p.V_max && h.perdida <= p.perdida_max; });
      if (!ok.length) {
        const Vmax = p.Q_diseno / (Math.PI * Math.max(...Ds) ** 2 / 4);
        comp_mat.push({ id: m, material: nombreMaterial(datos, m), factible: false, motivo: `diámetro máximo ${fx(Math.max(...Ds), 2)} m → V = ${fx(Vmax, 1)} m/s > ${p.V_max} m/s` });
        continue;
      }
      const evs = ok.map((D) => evaluarConfig(p.Q_diseno, D, eps_mat[m], m, n_unid, turbina));
      evs.forEach((r) => todas.push({ ...r, nombre: nombreMaterial(datos, m) }));
      const b = evs.reduce((x, y) => (y.VAN > x.VAN ? y : x));
      const a_m = M.celeridad(m, b.D);
      comp_mat.push({ ...b, id: m, material: nombreMaterial(datos, m), factible: true, eta_cond: (1 - b.perdida) * 100, a: a_m, dh: a_m * b.V / M.g, curva: evs });
    }
    comp_mat.sort((x, y) => (y.factible ? y.VAN : -Infinity) - (x.factible ? x.VAN : -Infinity));
    let ref = todas.find((r) => r.material === material && Math.abs(r.D - D_sel) < 1e-9);
    if (!ref) { ref = { ...evaluarConfig(p.Q_diseno, D_sel, eps_sel, material, n_unid, turbina), nombre: nombreMaterial(datos, material) }; todas.push(ref); }
    const barata = todas.reduce((x, y) => (y.costoTubUsd < x.costoTubUsd ? y : x));
    const mejor = todas.reduce((x, y) => (y.VAN > x.VAN ? y : x));
    const cmp_tub = todas.map((r) => ({ ...r, seleccionada: r === ref, barata: r === barata, mejor: r === mejor,
      costoTub: r.costoTubUsd * TRM, dCosto: (r.costoTubUsd - ref.costoTubUsd) * TRM, dCostoPct: (r.costoTubUsd / ref.costoTubUsd - 1) * 100,
      capex: r.CAPEX_MUSD * 1e6 * TRM, dCapex: (r.CAPEX_MUSD - ref.CAPEX_MUSD) * 1e6 * TRM, dVAN: r.VAN - ref.VAN, eta_cond: (1 - r.perdida) * 100 }))
      .sort((x, y) => x.costoTub - y.costoTub);

    // 15. Ambiente
    const co2 = FE_CO2.map(([n, f]) => ({ factor: n, fe: f, anual: E_media / 1000 * f, vida: E_media / 1000 * f * p.vida_util }));

    // 16. Verificación
    const verificacion = [
      ["Velocidad en la tubería ≤ " + fx(p.V_max, 1) + " m/s", `${fx(hd.V, 2)} m/s`, hd.V <= p.V_max],
      ["Pérdidas hidráulicas ≤ " + fx(p.perdida_max * 100, 0) + " % de Hb", `${fx(hd.perdida * 100, 2)} %`, hd.perdida <= p.perdida_max],
      ["Sobrepresión ≤ 30 % de Hb con el cierre especificado", `cierre ≥ ${fx(T_min, 0)} s`, true],
      ["Turbina factible en física y catálogo", `${turbina} × ${n_unid}, ${fx(n_rpm, 0)} rpm, Hs = ${fx(Hs, 1)} m`, Hs >= HS_MIN],
      ["Caudal ecológico respetado todos los días", `${fx(operacion.remOk * 100, 1)} %`, operacion.remOk >= 1 - 1e-12],
      ["Potencia menor de 20 MW (planta menor)", `${fx(P_inst, 2)} MW`, P_inst < 20],
      ["VAN > 0", `${fx(ind.VAN / 1e9, 1)} mil millones COP`, ind.VAN > 0],
      ["TIR > i", `${fx(ind.TIR * 100, 1)} % > ${fx(p.i_desc * 100, 0)} %`, ind.TIR > p.i_desc],
      ["B/C > 1", fx(ind.BC, 2), ind.BC > 1],
    ].map(([c, r, ok]) => ({ criterio: c, resultado: r, cumple: ok }));

    return { p, avisos, TRM, inventario, K_total, tabla_tub, opciones, material, modo_sel, D_sel, eps_sel, hd, desglose, ariete,
      verif, catalogos, ficha, sim, operacion, E_anual, E_med_mes, E_std_mes, mercado: mk, escenarios, precioBase,
      cx, CAPEX, crono, OPEX, transf, I_base, E_base, ev, ind, tornado, van0, curvaVAN, montecarlo, evImp, indImp,
      comp_mat, cmp_tub, ref, barata, mejor, co2, verificacion, modelo: M, evaluarConfig };
  }

  function nombreMaterial(datos, id) {
    if (id === "STEEL_WELDED") return "Acero al carbono soldado (a medida)";
    const c = datos.catalogo.find((x) => x.id === id);
    return c ? c.material : id;
  }

  // ---------- optimización (sección 14): búsqueda exhaustiva con física + finanzas ----------
  function candidatosOptimizacion(datos, r) {
    const p = r.p, M = r.modelo, lista = [];
    for (let q = 18; q <= 50; q += 1) for (const c of datos.catalogo) {
      if (c.D < 1.5 || c.D > 4.0) continue;
      for (const n of [1, 2]) {
        const h = M.hidraulica(q, c.D, c.eps, r.K_total + (n > 1 ? M.K_bif : 0));
        const P = M.rho * M.g * q * h.Hn * 0.92 * p.eta_g / 1e6;
        if (h.V >= p.V_min && h.V <= p.V_max && h.perdida <= p.perdida_max && P < 20 && M.factibilidad("Francis", h.Hn, q / n).factible) lista.push([q, c.D, c.eps, c.id, n]);
      }
    }
    return lista;
  }

  const Motor = { calcular, candidatosOptimizacion, nombreMaterial, TURBINAS, ENVOLVENTES, interp, cuantil, suma, media };
  if (typeof module !== "undefined" && module.exports) module.exports = Motor; else raiz.Motor = Motor;
})(typeof window !== "undefined" ? window : globalThis);
