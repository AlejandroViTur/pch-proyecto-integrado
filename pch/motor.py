"""Motor de cálculo del dashboard.

Ejecuta el cuaderno del proyecto (notebooks/PCH_Proyecto_Integrado.ipynb) con los parámetros que elija el
usuario, de modo que el dashboard y el cuaderno usan exactamente las mismas ecuaciones y datos. Devuelve:

* las secciones del cuaderno con su texto, tablas, gráficas e impresiones, para mostrarlas organizadas;
* el resumen y las tablas de resultados que exporta la sección 16.1 (resumen.json y CSV).
"""
from __future__ import annotations

import ast
import contextlib
import io
import json
import os
import re
import tempfile
import threading
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # Sin ventanas: las figuras se guardan como PNG.
import matplotlib.pyplot as plt  # noqa: E402
import nbformat  # noqa: E402
import pandas as pd  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
CUADERNO = RAIZ / "notebooks" / "PCH_Proyecto_Integrado.ipynb"
BASE_DATOS = RAIZ / "base_datos" / "pch_proyecto.sqlite"

# Celdas que solo tienen sentido dentro de Jupyter (instalación, controles ipywidgets).
OMITIR = ("# INSTALACIÓN AUTOMÁTICA", "# SELECTOR INTERACTIVO", "# INTERFAZ INTERACTIVA")
_CANDADO = threading.Lock()  # matplotlib y el directorio de trabajo son globales: una ejecución a la vez.


@dataclass
class Bloque:
    tipo: str  # "md" (texto del cuaderno), "texto" (print), "tabla", "figura" (PNG) o "error"
    contenido: object


@dataclass
class Seccion:
    numero: str
    titulo: str
    bloques: list[Bloque] = field(default_factory=list)


@dataclass
class Resultado:
    secciones: list[Seccion]
    resumen: dict
    tablas: dict[str, pd.DataFrame]
    segundos: float
    error: str | None = None


def _titulo_seccion(md: str):
    m = re.search(r"^# (\d+)\.\s+(.+)$", md, flags=re.M)
    return (m.group(1), m.group(2).strip()) if m else None


def _a_png(fig) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=110, bbox_inches="tight")
    plt.close(fig)
    return buf.getvalue()


def ejecutar(parametros: dict | None = None, cuaderno: Path = CUADERNO) -> Resultado:
    """Ejecuta el cuaderno con `parametros` (nombre de variable de la celda de parámetros → valor)."""
    parametros = dict(parametros or {})
    nb = nbformat.read(cuaderno, as_version=4)
    secciones = [Seccion("0", "Portada")]
    salida = Path(tempfile.mkdtemp(prefix="pch_"))
    ns: dict = {"__name__": "__pch__"}
    bloques: list[Bloque] = []

    def capturar(*objs, **_):  # Reemplaza a IPython.display.display.
        for o in objs:
            if isinstance(o, (pd.DataFrame, pd.Series)):
                bloques.append(Bloque("tabla", o.to_frame() if isinstance(o, pd.Series) else o))
            elif hasattr(o, "data") and isinstance(getattr(o, "data"), str):  # IPython Markdown
                bloques.append(Bloque("md", o.data))
            elif o is not None:
                bloques.append(Bloque("texto", str(o)))

    def mostrar(*_, **__):  # Reemplaza a plt.show: guarda la figura actual.
        bloques.append(Bloque("figura", _a_png(plt.gcf())))

    t0 = time.perf_counter()
    error = None
    with _CANDADO:
        dir_anterior, show_anterior = os.getcwd(), plt.show
        os.chdir(RAIZ / "notebooks")  # El cuaderno busca la carpeta data/ desde aquí.
        plt.show = mostrar
        try:
            for celda in nb.cells:
                if celda.cell_type == "markdown":
                    ts = _titulo_seccion(celda.source)
                    if ts:
                        secciones.append(Seccion(*ts))
                    secciones[-1].bloques.append(Bloque("md", celda.source.replace("\n---\n", "\n").lstrip("-\n")))
                    continue
                if celda.cell_type != "code" or celda.source.lstrip().startswith(OMITIR):
                    continue
                bloques = []
                codigo = "\n".join(l for l in celda.source.split("\n") if not l.lstrip().startswith(("%", "!")))
                arbol = ast.parse(codigo)
                ultima = arbol.body.pop() if arbol.body and isinstance(arbol.body[-1], ast.Expr) else None
                texto = io.StringIO()
                try:
                    with contextlib.redirect_stdout(texto):
                        ns["display"] = capturar
                        exec(compile(arbol, "<celda>", "exec"), ns)
                        ns["display"] = capturar  # la celda de librerías vuelve a importar display
                        if ultima is not None:
                            valor = eval(compile(ast.Expression(ultima.value), "<celda>", "eval"), ns)
                            capturar(valor)
                except Exception:
                    error = traceback.format_exc(limit=3)
                    bloques.append(Bloque("error", error))
                if texto.getvalue().strip():
                    bloques.insert(0, Bloque("texto", texto.getvalue().rstrip()))
                for num in plt.get_fignums():  # Figuras que no llamaron a plt.show.
                    bloques.append(Bloque("figura", _a_png(plt.figure(num))))
                secciones[-1].bloques.extend(bloques)
                if "# PARÁMETROS EDITABLES" in celda.source:  # Aplica los parámetros del usuario.
                    ns.update(parametros)
                    ns["SALIDAS"] = salida  # Los resultados del dashboard no tocan la carpeta resultados/.
                if error:
                    break
        finally:
            plt.show = show_anterior
            plt.close("all")
            os.chdir(dir_anterior)

    resumen, tablas = {}, {}
    if (salida / "resumen.json").exists():
        resumen = json.loads((salida / "resumen.json").read_text(encoding="utf-8"))
    for csv in sorted((salida / "tablas").glob("*.csv")) if (salida / "tablas").exists() else []:
        tablas[csv.stem] = pd.read_csv(csv)
    return Resultado(secciones, resumen, tablas, time.perf_counter() - t0, error)


def parametros_por_defecto(cuaderno: Path = CUADERNO) -> dict:
    """Valores de la celda de parámetros del cuaderno (sin ejecutar el resto)."""
    nb = nbformat.read(cuaderno, as_version=4)
    celda = next(c for c in nb.cells if c.cell_type == "code" and "# PARÁMETROS EDITABLES" in c.source)
    ns = {"DATOS": RAIZ / "data", "Path": Path}
    exec(celda.source, ns)
    return {k: v for k, v in ns.items() if not k.startswith("__") and k not in ("DATOS", "Path")}
