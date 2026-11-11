"""Genera el README.md con los resultados de la última ejecución del cuaderno.

    python scripts/generar_readme.py

Lee resultados/resumen.json, las tablas CSV y las gráficas del cuaderno ejecutado (notebooks/), guarda cada gráfica
como PNG en resultados/figuras/ y reescribe README.md con toda la información organizada.
"""
from __future__ import annotations

import base64
import json
import os
import re
import sqlite3
import unicodedata
from pathlib import Path

import nbformat
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
NB = RAIZ / "notebooks" / "PCH_Proyecto_Integrado.ipynb"
RES = RAIZ / "resultados"
FIG = RES / "figuras"
REPO = os.environ.get("GITHUB_REPOSITORY", "OWNER/pch-proyecto-integrado")
DUENO, NOMBRE = REPO.split("/")
PAGINA = f"https://{DUENO.lower()}.github.io/{NOMBRE}/"


def slug(t: str) -> str:
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")[:60]


def tabla_md(df: pd.DataFrame, decimales: int = 2) -> str:
    df = df.copy()
    for c in df.select_dtypes("number"):
        df[c] = df[c].map(lambda v: "" if pd.isna(v) else f"{v:,.{decimales}f}")
    df = df.fillna("").astype(str)
    filas = ["| " + " | ".join(df.columns) + " |", "|" + "---|" * len(df.columns)]
    filas += ["| " + " | ".join(r) + " |" for r in df.values.tolist()]
    return "\n".join(filas)


def extraer_figuras() -> list[tuple[str, str, str]]:
    """(sección, título, ruta relativa) de cada gráfica del cuaderno ejecutado."""
    FIG.mkdir(parents=True, exist_ok=True)
    for viejo in FIG.glob("*.png"):
        viejo.unlink()
    nb = nbformat.read(NB, as_version=4)
    seccion, salida, n = "", [], 0
    for c in nb.cells:
        if c.cell_type == "markdown":
            m = re.search(r"^# (\d+)\.\s+(.+)$", c.source, flags=re.M)
            if m:
                seccion = f"{m.group(1)}. {m.group(2).replace('*', '')}"
            continue
        if c.cell_type != "code":
            continue
        cab = next((l[2:] for l in c.source.splitlines() if l.startswith("# ") and not l.startswith("# ===")), "Gráfica")
        titulo = re.sub(r"^GRÁFICA \d+ - ", "", cab).capitalize()
        for o in c.get("outputs", []):
            png = o.get("data", {}).get("image/png")
            if png:
                n += 1
                ruta = FIG / f"{n:02d}_{slug(titulo)}.png"
                ruta.write_bytes(base64.b64decode(png))
                salida.append((seccion, titulo, ruta.relative_to(RAIZ).as_posix()))
    return salida


def main() -> None:
    r = json.loads((RES / "resumen.json").read_text(encoding="utf-8"))
    tablas = {p.stem: pd.read_csv(p) for p in (RES / "tablas").glob("*.csv")}
    figuras = extraer_figuras()
    with sqlite3.connect(RAIZ / "base_datos" / "pch_proyecto.sqlite") as con:
        meta = pd.read_sql("SELECT tabla AS Tabla, filas AS Filas, descripcion AS Descripción, archivo_fuente AS Fuente FROM metadatos", con)

    p, h, e, ec, t, tb = r["parametros"], r["hidraulica"], r["energia"], r["economia"], r["tuberias"], r["turbina"]
    acc = ", ".join(f"{k} × {v}" for k, v in p["accesorios"].items())
    verif = pd.DataFrame(r["verificacion"])
    cmp_tub = tablas["comparativo_costos_tuberias"]
    cols_t = ["Material", "D [m]", "V [m/s]", "η_cond [%]", "Costo tubería [M COP]", "Δ costo tubería [%]", "VAN [mil M COP]", "Nota"]
    esc = tablas["escenarios"]

    gal, ultima = [], None
    for sec, tit, ruta in figuras:
        if sec != ultima:
            gal.append(f"\n#### {sec}\n")
            ultima = sec
        gal.append(f"<details><summary>{tit}</summary>\n\n![{tit}]({ruta})\n\n</details>")

    principales = [f for f in figuras if re.search(r"curva del sistema|diferencia de costo|comparativo de materiales|van vs caudal", f[1], re.I)]
    destacadas = "\n".join(f'<img src="{ruta}" width="49%" alt="{tit}">' for _, tit, ruta in principales[:4])

    md = f"""# 💧 Pequeña Central Hidroeléctrica (PCH) · Proyecto integrado

[![Ejecutar proyecto PCH](https://github.com/{REPO}/actions/workflows/ejecutar_proyecto.yml/badge.svg)](https://github.com/{REPO}/actions/workflows/ejecutar_proyecto.yml)
[![Aplicación web](https://img.shields.io/badge/app-Simulador%20PCH-0f9d92)]({PAGINA})
![Python](https://img.shields.io/badge/Python-3.14-1baf7a)

Diseño completo de una PCH paso a paso: datos y control de calidad, accesorios y pérdidas, selección de la tubería,
golpe de ariete, selección de turbina con *Gradient Boosting* verificada con física, energía, mercado XM, CAPEX/OPEX y
evaluación económica (metodología de la clase 14), ML hidráulico, optimización, comparativo de tuberías y beneficio ambiental.

> **Aplicación web interactiva: [{PAGINA}]({PAGINA})** · cambie caudal, salto, tubería, accesorios, TRM o tasa de
> descuento y el proyecto completo se recalcula en el navegador.
>
> Los resultados de abajo se generan **automáticamente** cada vez que se sube un cambio al repositorio
> (o al ejecutar el flujo *Ejecutar proyecto PCH* desde la pestaña **Actions**).

## Contenido

| Parte | Dónde |
|---|---|
| Cuaderno con todo el desarrollo (se ve completo en GitHub) | [`notebooks/PCH_Proyecto_Integrado.ipynb`](notebooks/PCH_Proyecto_Integrado.ipynb) |
| **Aplicación web interactiva** (resultados, gráficas y parámetros editables) | [{PAGINA}]({PAGINA}) · código en [`app/`](app/) |
| Dashboard alterno en Streamlit (ejecuta el cuaderno completo) | [`dashboard/app.py`](dashboard/app.py) |
| Base de datos SQL de entrada | [`base_datos/pch_proyecto.sqlite`](base_datos/pch_proyecto.sqlite) · [`pch_proyecto.sql`](base_datos/pch_proyecto.sql) |
| Resultados (JSON, CSV y SQL) | [`resultados/`](resultados/) |

## Resultados de la última ejecución

**Fecha del cálculo:** {r['fecha_calculo']} · **TRM:** {r['TRM_COP_USD']:,.2f} COP/USD ({r['fuente_TRM']})

**Requerimientos iniciales:** Q = {p['Q_diseno_m3s']:g} m³/s · Q ecológico = {p['Q_eco_m3s']:g} m³/s · H bruto = {p['H_bruto_m']:g} m ·
L = {p['L_m']:g} m · tubería {p['material']} D = {p['D_m']:.2f} m ({p['seleccion_tuberia']}) · accesorios: {acc}

| Indicador | Valor |
|---|---|
| Potencia instalada | **{e['P_MW']:.2f} MW** |
| Energía neta media | **{e['E_GWh_anio']:,.1f} GWh/año** (factor de planta {e['factor_planta']:.0%}) |
| Turbina | **{tb['tipo']} × {tb['unidades']}**, {tb['rpm']:.0f} rpm, D3 = {tb['D3_m']:.2f} m, Hs = {tb['Hs_m']:.1f} m |
| Hidráulica | V = {h['V_m_s']:.2f} m/s · ΣK = {h['K_total']:.3f} · h_L = {h['hL_m']:.2f} m ({h['perdida_pct']:.2f} % de H) · H neto = {h['H_neto_m']:.2f} m |
| Golpe de ariete | cierre mínimo {r['golpe_ariete']['T_cierre_min_s']:.0f} s |
| CAPEX | **{ec['CAPEX_MUSD']:,.1f} MUSD** = {ec['CAPEX_MCOP'] / 1e3:,.1f} mil millones de COP |
| VAN · TIR · B/C | **{ec['VAN [MCOP]'] / 1e3:,.1f} mil M COP** · **{ec['TIR']:.1%}** · **{ec['B/C']:.2f}** |
| Recuperación | {ec['PB estático [años]']:.1f} años (estático) · {ec['PB dinámico [años]']:.1f} años (descontado) |
| LCOE | {ec['LCOE [COP/kWh]']:,.0f} COP/kWh |
| P(VAN < 0), Monte Carlo | {ec['P_VAN_negativo']:.1%} |
| CO₂ evitado | {r['ambiente']['CO2_t_anio']:,.0f} t/año |

### Verificación de criterios

{tabla_md(verif)}

### Tuberías que cumplen el diseño frente a la seleccionada

{t['opciones_que_cumplen']} tuberías cumplen el diseño. La más barata es **{t['mas_barata']}** (ahorro de
{t['ahorro_mas_barata_MCOP']:,.0f} millones de COP en tubería); la de mayor VAN es **{t['mayor_VAN']}**; el material sugerido es
**{t['material_sugerido']}**. Las diez primeras, de la más barata a la más cara:

{tabla_md(cmp_tub[cols_t].head(10))}

### Escenarios de mercado

{tabla_md(esc, 2)}

### Gráficas principales

{destacadas}

### Todas las gráficas, por sección
{chr(10).join(gal)}

## Base de datos SQL

Todos los datos de entrada están en `base_datos/pch_proyecto.sqlite` (SQLite) y en `base_datos/pch_proyecto.sql`
(esquema y datos en SQL estándar). El cuaderno, el dashboard y este README leen de ella.

{tabla_md(meta, 0)}

Ejemplo de consulta:

```sql
SELECT Material_ID, COUNT(*) AS diametros, MIN(Diametro_hidraulico_m) AS D_min, MAX(Diametro_hidraulico_m) AS D_max
FROM v_catalogo_tuberias GROUP BY Material_ID;
```

## Cómo usarlo

```bash
python -m pip install -r requirements.txt
python base_datos/crear_base_datos.py          # (re)crea la base SQL desde data/
python scripts/construir_app.py                # arma la aplicación web en sitio/
python -m http.server -d sitio 8000            # la abre en http://localhost:8000
streamlit run dashboard/app.py                 # dashboard alterno en Streamlit
jupyter lab notebooks/PCH_Proyecto_Integrado.ipynb   # cuaderno paso a paso
```

En la **aplicación web** (y en el dashboard de Streamlit) se cambian los requerimientos iniciales (caudal, salto, longitud, material y diámetro de la tubería,
tipo y cantidad de accesorios, TRM, tasa de descuento, vida útil, etc.) y se recalcula el proyecto completo con las
mismas ecuaciones del cuaderno (el motor `app/js/motor.js` reproduce los resultados del cuaderno con error < 10⁻⁸). Para cambiar los resultados de este README, edite la celda **3. Parámetros editables**
del cuaderno y suba el cambio: el flujo de GitHub lo vuelve a ejecutar.

### Dashboard en línea

El dashboard se puede publicar gratis en **Streamlit Community Cloud**: entrar a [share.streamlit.io](https://share.streamlit.io)
con la cuenta de GitHub, *Create app* → repositorio `{REPO}`, rama `main`, archivo `dashboard/app.py` → *Deploy*.

## Estructura

```
data/            archivos fuente (Excel y CSV)
base_datos/      base SQL del proyecto (.sqlite y .sql) y el script que la crea
notebooks/       cuaderno con el desarrollo completo (ejecutado)
app/             aplicación web (HTML, CSS y el motor de cálculo en JavaScript) que se publica en GitHub Pages
pch/motor.py     motor que ejecuta el cuaderno con otros parámetros (lo usa el dashboard de Streamlit)
dashboard/       dashboard interactivo en Streamlit
resultados/      resumen.json, tablas CSV, pch_resultados.sqlite y gráficas
scripts/         generador de este README y de la aplicación web
.github/         flujo que ejecuta el proyecto y publica la aplicación
```
"""
    (RAIZ / "README.md").write_text(md, encoding="utf-8")
    print(f"README.md actualizado con {len(figuras)} gráficas")


if __name__ == "__main__":
    main()
