"""Crea la base de datos SQL del proyecto PCH a partir de los archivos de la carpeta data/.

    python base_datos/crear_base_datos.py

Genera base_datos/pch_proyecto.sqlite (SQLite) y base_datos/pch_proyecto.sql (esquema y datos en SQL estándar).
Es el mismo código de la celda 4.1 del cuaderno.
"""
import sqlite3
from datetime import date
from pathlib import Path

import pandas as pd

def crear_base_datos(carpeta_datos, ruta_db):  # Crea la base SQLite con todos los datos de entrada del proyecto.
    carpeta_datos, ruta_db = Path(carpeta_datos), Path(ruta_db)  # Rutas como objetos Path.
    ruta_db.parent.mkdir(parents=True, exist_ok=True)  # Crea la carpeta de la base si no existe.
    tub = carpeta_datos / "Base Datos Tuberias PCH.xlsx"  # Excel de tuberías (Entrega 1).
    acc = carpeta_datos / "Base Datos Accesorios PCH.xlsx"  # Excel de accesorios con su K.
    rio_xl = pd.read_excel(carpeta_datos / "S04 Datos de Rio.xlsx", sheet_name="Rio")  # Serie diaria de caudales.
    tablas = {  # Nombre de la tabla: (datos, descripción, archivo fuente).
        "caudales_rio": (rio_xl.set_axis(["dia", "Q_rio_m3s"], axis=1),
                         "Caudal medio diario del río (m³/s)", "S04 Datos de Rio.xlsx"),
        "tuberias_materiales": (pd.read_excel(tub, sheet_name="Materiales"),
                                "Materiales de tubería: rugosidad de diseño, uso y fuente", tub.name),
        "tuberias_diametros": (pd.read_excel(tub, sheet_name="Diametros_comerciales"),
                               "Diámetros comerciales por material y fabricante", tub.name),
        "tuberias_rangos": (pd.read_excel(tub, sheet_name="Rangos_materiales"),
                            "Rango de diámetros de fabricación de cada material", tub.name),
        "tuberias_fuentes": (pd.read_excel(tub, sheet_name="Fuentes"), "Catálogos de respaldo de las tuberías", tub.name),
        "accesorios": (pd.read_excel(acc, sheet_name="Accesorios"),
                       "Tipos de accesorio con su método de cálculo de K y su fuente", acc.name),
        "accesorios_fuentes": (pd.read_excel(acc, sheet_name="Fuentes"), "Referencias de los coeficientes K", acc.name),
        "precios_xm": (pd.read_csv(carpeta_datos / "precios_xm_mensual.csv"),
                       "Precios mensuales de bolsa y contratos publicados por XM (COP/kWh corrientes)", "precios_xm_mensual.csv"),
        "dataset_hidraulico": (pd.read_csv(carpeta_datos / "dataset_hidraulico_v0.1.0.csv"),
                               "Dataset hidráulico de 8.400 casos de la Entrega 2", "dataset_hidraulico_v0.1.0.csv"),
    }
    if ruta_db.exists():  # Se reconstruye desde cero para no mezclar versiones.
        ruta_db.unlink()  # Borra la base anterior.
    with sqlite3.connect(ruta_db) as con:  # Crea la base.
        for nombre, (df, _, _) in tablas.items():  # Una tabla por archivo u hoja.
            df.to_sql(nombre, con, index=False)  # Escribe la tabla.
        pd.DataFrame([(n, d, f, len(df)) for n, (df, d, f) in tablas.items()],  # Diccionario de datos.
                     columns=["tabla", "descripcion", "archivo_fuente", "filas"]).assign(creada=str(date.today())).to_sql(
            "metadatos", con, index=False)  # Tabla de metadatos.
        con.execute("CREATE VIEW v_catalogo_tuberias AS SELECT d.*, m.epsilon_diseno_mm FROM tuberias_diametros d "
                    "LEFT JOIN tuberias_materiales m USING (Material_ID)")  # Vista: diámetro + rugosidad del material.
        con.execute("CREATE INDEX ix_diametros_material ON tuberias_diametros (Material_ID)")  # Índice para filtrar por material.
    with sqlite3.connect(ruta_db) as con, open(ruta_db.with_suffix(".sql"), "w", encoding="utf-8") as f:  # Respaldo portable.
        for linea in con.iterdump():  # Esquema y datos en SQL estándar.
            f.write(linea + "\n")  # Una sentencia por línea.
    return ruta_db  # Ruta de la base creada.


if __name__ == "__main__":
    raiz = Path(__file__).resolve().parents[1]
    ruta = crear_base_datos(raiz / "data", raiz / "base_datos" / "pch_proyecto.sqlite")
    with sqlite3.connect(ruta) as con:
        print(pd.read_sql("SELECT tabla, filas, descripcion FROM metadatos", con).to_string(index=False))
    print("Base creada:", ruta)
