"""Dashboard interactivo del proyecto PCH.

    streamlit run dashboard/app.py

Permite cambiar los requerimientos iniciales (caudal, salto, longitud, tubería, accesorios, TRM, economía) y
recalcula el proyecto completo con el mismo cuaderno de notebooks/, organizado por pestañas.
"""
from __future__ import annotations

import io
import json
import sqlite3
import sys
import zipfile
from pathlib import Path

import pandas as pd
import streamlit as st

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
from pch import motor  # noqa: E402

st.set_page_config(page_title="PCH · Dashboard del proyecto", page_icon="💧", layout="wide")
st.markdown("<style>section[data-testid='stSidebar']{min-width:430px;max-width:430px}</style>", unsafe_allow_html=True)


# ----------------------------------------------------------------------------- datos de apoyo
@st.cache_data(show_spinner=False)
def leer_sql(sql: str, params: tuple = ()) -> pd.DataFrame:
    with sqlite3.connect(f"file:{motor.BASE_DATOS}?mode=ro", uri=True) as con:
        return pd.read_sql(sql, con, params=params)


@st.cache_data(show_spinner=False)
def por_defecto() -> dict:
    return motor.parametros_por_defecto()


@st.cache_data(show_spinner=False, max_entries=20)
def calcular(params_json: str) -> motor.Resultado:
    return motor.ejecutar(json.loads(params_json))


if not motor.BASE_DATOS.exists():
    st.error("No existe la base de datos. Ejecute primero: python base_datos/crear_base_datos.py")
    st.stop()

D0 = por_defecto()
acc_bd = leer_sql("SELECT ID, Categoria, Accesorio, Detalle, Metodo, K_tabla FROM accesorios")
cat_tub = leer_sql("SELECT Material_ID, Material, Diametro_hidraulico_m FROM v_catalogo_tuberias "
                   "WHERE Disponible_catalogo IS NULL OR Disponible_catalogo = 1 ORDER BY Material_ID, Diametro_hidraulico_m")
materiales = cat_tub.drop_duplicates("Material_ID").set_index("Material_ID")["Material"].to_dict()

# ----------------------------------------------------------------------------- barra lateral: requerimientos
st.sidebar.title("💧 Requerimientos iniciales")
st.sidebar.caption("Cambie los datos y pulse **Calcular**. El proyecto completo se recalcula con el cuaderno.")

with st.sidebar.expander("Sitio e hidrología", expanded=True):
    Q_diseno = st.number_input("Caudal de diseño Q (m³/s)", 2.0, 80.0, float(D0["Q_diseno"]), 1.0)
    Q_eco = st.number_input("Caudal ecológico (m³/s)", 0.0, 30.0, float(D0["Q_eco"]), 0.5)
    H_bruto = st.number_input("Salto bruto H (m)", 10.0, 600.0, float(D0["H_bruto"]), 5.0)
    L = st.number_input("Longitud de la tubería L (m)", 50.0, 10000.0, float(D0["L"]), 50.0)

with st.sidebar.expander("Criterios de diseño"):
    V_max = st.number_input("Velocidad máxima (m/s)", 1.0, 8.0, float(D0["V_max"]), 0.5)
    perdida_max = st.number_input("Pérdida máxima (% de H)", 1.0, 15.0, float(D0["perdida_max"]) * 100, 0.5) / 100
    T_cierre = st.number_input("Tiempo de cierre de la válvula (s)", 1.0, 120.0, float(D0["T_cierre"]), 1.0)

with st.sidebar.expander("Tubería", expanded=True):
    ids_mat = list(materiales)
    material_id = st.selectbox("Material", ids_mat, index=ids_mat.index(D0["material_id"]),
                               format_func=lambda m: f"{materiales[m]} ({m})")
    diam = cat_tub.loc[cat_tub.Material_ID == material_id, "Diametro_hidraulico_m"].round(3).tolist()
    D_op = st.selectbox("Diámetro interno", ["Automático: menor que cumple"] + diam,
                        format_func=lambda d: d if isinstance(d, str) else f"{d:.2f} m")
    D_tuberia = None if isinstance(D_op, str) else float(D_op)
    st.caption("Si el diámetro elegido no cumple V y pérdidas, el cálculo avisa y usa el menor que cumple.")

with st.sidebar.expander("Accesorios del tramo", expanded=True):
    etiquetas = {r.ID: f"{r.Accesorio} - {r.Detalle}" for r in acc_bd.itertuples()}
    tabla_acc0 = pd.DataFrame({"ID": list(D0["accesorios_tramo"]), "Cantidad": list(D0["accesorios_tramo"].values())})
    tabla_acc = st.data_editor(
        tabla_acc0, num_rows="dynamic", width="stretch", hide_index=True, key="acc",
        column_config={"ID": st.column_config.SelectboxColumn("Tipo de accesorio (ID)", options=list(etiquetas), required=True, width="medium"),
                       "Cantidad": st.column_config.NumberColumn("Cantidad", min_value=0, max_value=200, step=1, required=True, width="small")})
    st.caption("Agregue filas con ➕ o bórrelas seleccionándolas. Cada fila es un tipo (ID) y su cantidad.")
    with st.popover("Ver los 51 tipos de accesorio"):
        st.dataframe(acc_bd[["ID", "Categoria", "Accesorio", "Detalle"]], hide_index=True, width="stretch")
    accesorios = {str(r.ID): int(r.Cantidad) for r in tabla_acc.dropna().itertuples() if int(r.Cantidad) > 0}

with st.sidebar.expander("Tasa de cambio y economía"):
    modo_trm = st.radio("TRM", ["En línea (TRM del día, datos.gov.co)", "Valor manual"], index=0)
    TRM_respaldo = st.number_input("TRM manual o de respaldo (COP/USD)", 1000.0, 10000.0, float(D0["TRM_respaldo"]), 10.0)
    i_desc = st.number_input("Tasa de descuento (%)", 1.0, 30.0, float(D0["i_desc"]) * 100, 0.5) / 100
    vida_util = st.number_input("Vida útil (años)", 10, 60, int(D0["vida_util"]), 1)
    frac_contrato = st.slider("Energía vendida en contrato (%)", 0, 100, int(D0["frac_contrato"] * 100)) / 100
    c_ref = st.number_input("CAPEX de referencia (USD/kW)", 500.0, 8000.0, float(D0["c_ref_usd_kw"]), 50.0)

with st.sidebar.expander("Equipos"):
    eta_g = st.number_input("Eficiencia del generador", 0.80, 0.99, float(D0["eta_g"]), 0.005, format="%.3f")
    disponibilidad = st.number_input("Disponibilidad anual", 0.70, 1.00, float(D0["disponibilidad"]), 0.01)

parametros = dict(
    Q_diseno=Q_diseno, Q_eco=Q_eco, H_bruto=H_bruto, L=L, V_max=V_max, perdida_max=perdida_max, T_cierre=T_cierre,
    material_id=material_id, D_tuberia=D_tuberia, accesorios_tramo=accesorios,
    TRM_en_linea=modo_trm.startswith("En línea"), TRM_respaldo=TRM_respaldo, i_desc=i_desc, vida_util=int(vida_util),
    frac_contrato=frac_contrato, c_ref_usd_kw=c_ref, eta_g=eta_g, disponibilidad=disponibilidad,
    busqueda_hiperparametros=False, seleccion_por_consola=False, seleccion_tuberia_por_consola=False)

c1, c2 = st.sidebar.columns(2)
if c1.button("▶ Calcular", type="primary", width="stretch") or "params" not in st.session_state:
    st.session_state.params = json.dumps(parametros, sort_keys=True)
if c2.button("↺ Valores base", width="stretch"):
    st.session_state.clear()
    st.rerun()

with st.spinner("Calculando el proyecto completo (≈ 20 s)…"):
    res = calcular(st.session_state.params)
P = json.loads(st.session_state.params)
if json.dumps(parametros, sort_keys=True) != st.session_state.params:
    st.sidebar.warning("Hay cambios sin calcular: pulse **Calcular**.")

# ----------------------------------------------------------------------------- utilidades de vista
R, T = res.resumen, res.tablas
SEC = {s.numero: s for s in res.secciones}


def ver_bloques(bloques, tipos=("md", "texto", "tabla", "figura", "error")):
    for b in bloques:
        if b.tipo not in tipos:
            continue
        if b.tipo == "md":
            st.markdown(b.contenido)
        elif b.tipo == "texto":
            st.code(b.contenido, language=None)
        elif b.tipo == "tabla":
            st.dataframe(b.contenido.round(3) if hasattr(b.contenido, "round") else b.contenido, width="stretch")
        elif b.tipo == "figura":
            st.image(b.contenido, width="stretch")
        else:
            st.error(b.contenido)


def ver_seccion(numeros, tipos=("texto", "tabla", "figura", "error"), texto=False):
    for n in numeros:
        s = SEC.get(str(n))
        if s is None:
            continue
        st.subheader(f"{s.numero}. {s.titulo}".replace("*", ""))
        ver_bloques(s.bloques, tipos + (("md",) if texto else ()))


# ----------------------------------------------------------------------------- encabezado
st.title("💧 PCH · Dashboard del proyecto")
if res.error:
    st.error("El cálculo se detuvo por un error (revise los datos de entrada):")
    st.code(res.error)
    st.stop()

h, e, ec, tb = R["hidraulica"], R["energia"], R["economia"], R["turbina"]
st.caption(f"Cálculo del {R['fecha_calculo']} · TRM {R['TRM_COP_USD']:,.2f} COP/USD ({R['fuente_TRM']}) · "
           f"{res.segundos:.0f} s")
def tarjeta(col, titulo, valor, detalle=None):
    col.metric(titulo, valor, detalle, delta_color="off", delta_arrow="off", border=True)


k = st.columns(3)
tarjeta(k[0], "Potencia instalada", f"{e['P_MW']:.2f} MW", f"Turbina {tb['tipo']} × {tb['unidades']} · {tb['rpm']:.0f} rpm")
tarjeta(k[1], "Energía neta media", f"{e['E_GWh_anio']:,.1f} GWh/año", f"Factor de planta {e['factor_planta']:.0%}")
tarjeta(k[2], "Tubería seleccionada", f"D = {R['parametros']['D_m']:.2f} m",
        f"{R['parametros']['material']} · V = {h['V_m_s']:.2f} m/s · pérdidas {h['perdida_pct']:.2f} % de H")
k = st.columns(3)
tarjeta(k[0], "VAN (escenario base)", f"{ec['VAN [MCOP]'] / 1e3:,.1f} mil M COP", f"TIR {ec['TIR']:.1%} · B/C {ec['B/C']:.2f}")
tarjeta(k[1], "CAPEX", f"{ec['CAPEX_MUSD']:,.1f} MUSD", f"{ec['CAPEX_MCOP'] / 1e3:,.1f} mil M COP con la TRM del día")
tarjeta(k[2], "CO₂ evitado", f"{R['ambiente']['CO2_t_anio']:,.0f} t/año", f"Salto neto {h['H_neto_m']:.1f} m · ΣK = {h['K_total']:.3f}")

pest = st.tabs(["📋 Resumen", "🚰 Hidráulica y accesorios", "⚙️ Turbina", "⚡ Energía y mercado", "💰 Economía",
                "🧮 Tuberías: costos", "🤖 ML y optimización", "📖 Informe paso a paso", "🗄️ Base de datos SQL", "⬇️ Descargas"])

with pest[0]:
    a, b = st.columns([1.1, 1])
    with a:
        st.subheader("Verificación de criterios")
        st.dataframe(pd.DataFrame(R["verificacion"]), hide_index=True, width="stretch")
        st.subheader("Tuberías")
        t = R["tuberias"]
        st.markdown(f"- **{t['opciones_que_cumplen']}** tuberías cumplen el diseño.\n"
                    f"- Más barata que cumple: **{t['mas_barata']}** (ahorro de {t['ahorro_mas_barata_MCOP']:,.0f} M COP frente a la seleccionada).\n"
                    f"- Mayor VAN: **{t['mayor_VAN']}**.\n- Material sugerido: **{t['material_sugerido']}**.")
    with b:
        st.subheader("Indicadores clave")
        st.dataframe(pd.DataFrame(R["kpi"].items(), columns=["Indicador", "Valor"]), hide_index=True, width="stretch")
        st.subheader("Accesorios del tramo")
        st.dataframe(T["perdidas_accesorios"].round(3), hide_index=True, width="stretch")
    if "17" in SEC:
        st.subheader("Conclusiones")
        ver_bloques(SEC["17"].bloques[1:])

with pest[1]:
    ver_seccion([5, 6, 7])
with pest[2]:
    ver_seccion([8])
with pest[3]:
    ver_seccion([9, 10])
with pest[4]:
    ver_seccion([11, 12])

with pest[5]:
    st.subheader("Todas las tuberías que cumplen el diseño frente a la seleccionada")
    ct = T["comparativo_costos_tuberias"]
    st.dataframe(ct.round(2), hide_index=True, width="stretch")
    st.scatter_chart(ct, x="Costo tubería [M COP]", y="VAN [mil M COP]", color="Material", size="η_cond [%]")
    st.caption("Cada punto es una tubería que cumple el diseño: más a la izquierda es más barata, más arriba más rentable.")
    s14 = SEC.get("14")
    if s14:
        figs = [b_ for b_ in s14.bloques if b_.tipo == "figura"]
        for f in figs[-2:]:
            st.image(f.contenido, width="stretch")
    st.subheader("Comparativo de materiales (mejor diámetro de cada uno)")
    st.dataframe(T["comparativo_materiales"].round(2), hide_index=True, width="stretch")

with pest[6]:
    ver_seccion([13, 14, 15])

with pest[7]:
    nombres = [f"{s.numero}. {s.titulo}".replace("*", "") for s in res.secciones]
    elegido = st.selectbox("Sección", nombres, index=1)
    ver_bloques(res.secciones[nombres.index(elegido)].bloques)

with pest[8]:
    st.subheader("Base de datos SQL del proyecto")
    st.dataframe(leer_sql("SELECT tabla, filas, descripcion, archivo_fuente FROM metadatos"), hide_index=True,
                 width="stretch")
    tabla = st.selectbox("Ver tabla", leer_sql("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").name)
    st.dataframe(leer_sql(f'SELECT * FROM "{tabla}" LIMIT 500'), width="stretch")
    st.markdown("**Consulta SQL** (solo lectura)")
    sql = st.text_area("SQL", "SELECT Material_ID, COUNT(*) AS diametros, MIN(Diametro_hidraulico_m) AS D_min, "
                       "MAX(Diametro_hidraulico_m) AS D_max\nFROM v_catalogo_tuberias GROUP BY Material_ID", height=110)
    if st.button("Ejecutar consulta"):
        if not sql.strip().lower().startswith(("select", "with")):
            st.warning("Solo se permiten consultas SELECT.")
        else:
            try:
                st.dataframe(leer_sql(sql), width="stretch")
            except Exception as err:  # noqa: BLE001
                st.error(str(err))

with pest[9]:
    st.subheader("Descargar los resultados de este cálculo")
    st.download_button("resumen.json", json.dumps(R, ensure_ascii=False, indent=2), "resumen.json", "application/json")
    xls = io.BytesIO()
    with pd.ExcelWriter(xls) as w:
        for n, t_ in T.items():
            t_.to_excel(w, sheet_name=n[:31], index=False)
    st.download_button("Tablas de resultados (Excel)", xls.getvalue(), "resultados_pch.xlsx")
    zbuf = io.BytesIO()
    with zipfile.ZipFile(zbuf, "w", zipfile.ZIP_DEFLATED) as z:
        for n, t_ in T.items():
            z.writestr(f"{n}.csv", t_.to_csv(index=False))
    st.download_button("Tablas de resultados (CSV en zip)", zbuf.getvalue(), "resultados_pch.zip")
    st.download_button("Base de datos (SQLite)", motor.BASE_DATOS.read_bytes(), "pch_proyecto.sqlite")
    sql_dump = motor.BASE_DATOS.with_suffix(".sql")
    if sql_dump.exists():
        st.download_button("Base de datos (script SQL)", sql_dump.read_bytes(), "pch_proyecto.sql")
    st.markdown("**Parámetros de este cálculo**")
    st.json(P)
