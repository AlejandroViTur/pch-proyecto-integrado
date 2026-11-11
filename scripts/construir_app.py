"""Construye la aplicación web del proyecto (carpeta sitio/) para publicarla en GitHub Pages.

    python scripts/construir_app.py

1. Lee la base de datos SQL de entrada (base_datos/pch_proyecto.sqlite) y deja los datos que necesita el motor de
   cálculo de la app en sitio/datos/datos.json (serie de caudales, catálogo de tuberías, accesorios con su K, precios
   XM en pesos constantes, parámetros por defecto y TRM).
2. Copia los resultados de la última ejecución del cuaderno (resultados/resumen.json, tablas y figuras) a
   sitio/datos/resultados.json y sitio/figuras/.
3. Copia la interfaz (carpeta app/) a sitio/.

El motor de la app (app/js/motor.js) usa las mismas ecuaciones del cuaderno; este script solo prepara los datos.
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
from pch.motor import parametros_por_defecto  # noqa: E402

DB = RAIZ / "base_datos" / "pch_proyecto.sqlite"
RES = RAIZ / "resultados"
APP = RAIZ / "app"
SITIO = RAIZ / "sitio"

# --- Mismas funciones de la sección 5 del cuaderno (coeficiente K de cada accesorio)
CODO90_RD = [1, 1.5, 2, 3, 4, 6, 8, 10]
CODO90_K = [0.35, 0.25, 0.19, 0.17, 0.16, 0.18, 0.20, 0.22]
V_REJILLA, V_REF = 1.0, 4.0


def k_accesorio(f) -> float:
    if f["Metodo"] == "codo":
        k90 = np.interp(f["r_D"], CODO90_RD, CODO90_K)
        c = np.interp(f["Angulo_grados"], [0, 22.5, 45, 60, 90, 180], [0, 0.40, 0.65, 0.80, 1.0, 1.4])
        return float(k90 * c)
    if f["Metodo"] == "rejilla":
        k = f["kt"] * (f["t_mm"] / f["b_mm"]) ** (4 / 3) * math.sin(math.radians(f["phi_grados"]))
        return float(k * (V_REJILLA / V_REF) ** 2)
    return float(f["K_tabla"])


# --- Misma deflactación de la sección 4.5 (IPC DANE)
IPC_DANE = {2023: 9.28, 2024: 5.20, 2025: 5.10, 2026: 6.29}


def nivel_ipc(t: pd.Timestamp) -> float:
    nivel = 1.0
    for a in range(2023, t.year):
        nivel *= 1 + IPC_DANE.get(a, 0) / 100
    return nivel * (1 + IPC_DANE.get(t.year, 0) / 100) ** ((t.month - 0.5) / 12)


def limpio(v):
    """Convierte valores de pandas/numpy a JSON (NaN → None)."""
    if isinstance(v, dict):
        return {k: limpio(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [limpio(x) for x in v]
    if isinstance(v, (np.floating, float)):
        return None if not math.isfinite(float(v)) else round(float(v), 10)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.bool_):
        return bool(v)
    return v


def datos_de_entrada() -> dict:
    p = parametros_por_defecto()
    with sqlite3.connect(DB) as con:
        q = lambda s: pd.read_sql(s, con)  # noqa: E731
        rio = q("SELECT dia, Q_rio_m3s FROM caudales_rio ORDER BY dia")
        materiales = q("SELECT * FROM tuberias_materiales")
        diametros = q("SELECT * FROM tuberias_diametros")
        acc = q("SELECT * FROM accesorios")
        px = q("SELECT * FROM precios_xm")
        meta = q("SELECT tabla, descripcion, archivo_fuente, filas FROM metadatos")

    # Serie de caudales con el mismo control de calidad y el mismo calendario del cuaderno.
    rio["Q_rio_m3s"] = pd.to_numeric(rio["Q_rio_m3s"], errors="coerce")
    rio["fecha"] = pd.date_range("2000-01-01", periods=len(rio), freq="D")
    qq = rio["Q_rio_m3s"]
    rio = rio[~(qq.isna() | (qq < 0) | (qq > 2000))].reset_index(drop=True)

    # Catálogo de tuberías (sección 4.4).
    cat = diametros.merge(materiales[["Material_ID", "epsilon_diseno_mm"]], on="Material_ID", how="left")
    eps_di = materiales.loc[materiales["Material_ID"].str.startswith("DI"), "epsilon_diseno_mm"].dropna()
    es_di = cat["Material_ID"].str.startswith("DI")
    cat.loc[es_di, "epsilon_diseno_mm"] = cat.loc[es_di, "epsilon_diseno_mm"].fillna(eps_di.iloc[0])
    cat = cat[cat["Disponible_catalogo"].fillna(True).astype(bool)]
    cat = cat.dropna(subset=["Diametro_hidraulico_m", "epsilon_diseno_mm"]).reset_index(drop=True)
    eps_acero = float(materiales.set_index("Material_ID").loc["STEEL_WELDED", "epsilon_diseno_mm"])

    # Precios XM en pesos constantes del año base (sección 4.5).
    px["fecha"] = pd.to_datetime(px["periodo_mes"] + "-01")
    px = px[(px["valor"] >= 0) & (px["valor"] <= 5000)].copy()
    ipc_base = np.mean([nivel_ipc(pd.Timestamp(p["anio_base"], m, 1)) for m in range(1, 13)])
    px["valor_const"] = px["valor"] * ipc_base / px["fecha"].map(nivel_ipc)
    precios = {}
    for var in ("bolsa", "SICEP", "contrato_regulado", "contrato_no_regulado"):
        s = px[px["variable"] == var].sort_values("fecha")
        precios[var] = [{"mes": f, "valor": v, "corriente": c, "url": u}
                        for f, v, c, u in zip(s["periodo_mes"], s["valor_const"], s["valor"], s["url"])]

    acc["K"] = acc.apply(k_accesorio, axis=1)
    parametros = {k: v for k, v in p.items() if isinstance(v, (int, float, str, dict, type(None))) and not k.startswith("archivo")}

    return limpio({
        "parametros": parametros,
        "rio": {"Q": rio["Q_rio_m3s"].round(4).tolist(), "mes": rio["fecha"].dt.month.tolist(),
                "inicio": "2000-01-01"},
        "catalogo": [{"id": r.Material_ID, "material": r.Material, "D": r.Diametro_hidraulico_m, "eps": r.epsilon_diseno_mm,
                      "fabricante": r.Fabricante, "serie": r.Serie_Producto, "DN": r.DN_mm}
                     for r in cat.itertuples()],
        "eps_acero": eps_acero,
        "materiales": [{"id": r.Material_ID, "material": r.Material, "familia": r.Familia, "uso": r.Uso_PCH,
                        "eps": r.epsilon_diseno_mm, "fuente": r.Fuente_catalogo} for r in materiales.itertuples()],
        "accesorios": [{"id": r.ID, "categoria": r.Categoria, "accesorio": r.Accesorio, "detalle": r.Detalle,
                        "metodo": r.Metodo, "K": r.K, "fuente": r.Fuente} for r in acc.itertuples()],
        "precios": precios,
        "metadatos": meta.to_dict("records"),
    })


def titulos_figuras() -> list[tuple[str, str]]:
    """(sección, título) de cada gráfica del cuaderno, en el mismo orden en que scripts/generar_readme.py las numera."""
    import nbformat
    nb = nbformat.read(RAIZ / "notebooks" / "PCH_Proyecto_Integrado.ipynb", as_version=4)
    seccion, salida = "", []
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
        salida += [(seccion, titulo) for o in c.get("outputs", []) if o.get("data", {}).get("image/png")]
    return salida


def resultados_cuaderno() -> dict:
    resumen = json.loads((RES / "resumen.json").read_text(encoding="utf-8"))
    tablas = {p.stem: pd.read_csv(p).to_dict("records") for p in sorted((RES / "tablas").glob("*.csv"))}
    archivos = sorted(p.name for p in (RES / "figuras").glob("*.png"))
    titulos = titulos_figuras()
    figuras = [{"archivo": a, "seccion": titulos[i][0] if i < len(titulos) else "",
                "titulo": titulos[i][1] if i < len(titulos) else a} for i, a in enumerate(archivos)]
    return limpio({"resumen": resumen, "tablas": tablas, "figuras": figuras})


def main() -> None:
    if SITIO.exists():
        shutil.rmtree(SITIO)
    shutil.copytree(APP, SITIO)
    (SITIO / "datos").mkdir(exist_ok=True)
    datos = datos_de_entrada()
    datos["generado"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    datos["repo"] = f"https://github.com/{os.environ.get('GITHUB_REPOSITORY', 'AlejandroViTur/pch-proyecto-integrado')}"
    res = resultados_cuaderno()
    r = res["resumen"]
    datos["trm"] = {"valor": r["TRM_COP_USD"], "fuente": r["fuente_TRM"], "fecha": r["fecha_calculo"]}
    (SITIO / "datos" / "datos.json").write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (SITIO / "datos" / "resultados.json").write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    shutil.copytree(RES / "figuras", SITIO / "figuras")
    (SITIO / ".nojekyll").write_text("")
    tam = sum(f.stat().st_size for f in SITIO.rglob("*") if f.is_file()) / 1e6
    print(f"App construida en {SITIO.relative_to(RAIZ)}/ ({tam:.1f} MB): {len(datos['rio']['Q'])} días, "
          f"{len(datos['catalogo'])} diámetros, {len(datos['accesorios'])} accesorios")


if __name__ == "__main__":
    main()
