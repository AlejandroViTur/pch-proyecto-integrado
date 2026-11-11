# 💧 Pequeña Central Hidroeléctrica (PCH) · Proyecto integrado

[![Ejecutar proyecto PCH](https://github.com/AlejandroViTur/pch-proyecto-integrado/actions/workflows/ejecutar_proyecto.yml/badge.svg)](https://github.com/AlejandroViTur/pch-proyecto-integrado/actions/workflows/ejecutar_proyecto.yml)
[![Informe web](https://img.shields.io/badge/informe-GitHub%20Pages-2a78d6)](https://alejandrovitur.github.io/pch-proyecto-integrado/)
![Python](https://img.shields.io/badge/Python-3.14-1baf7a)

Diseño completo de una PCH paso a paso: datos y control de calidad, accesorios y pérdidas, selección de la tubería,
golpe de ariete, selección de turbina con *Gradient Boosting* verificada con física, energía, mercado XM, CAPEX/OPEX y
evaluación económica (metodología de la clase 14), ML hidráulico, optimización, comparativo de tuberías y beneficio ambiental.

> Los resultados de abajo se generan **automáticamente** cada vez que se sube un cambio al repositorio
> (o al ejecutar el flujo *Ejecutar proyecto PCH* desde la pestaña **Actions**).

## Contenido

| Parte | Dónde |
|---|---|
| Cuaderno con todo el desarrollo (se ve completo en GitHub) | [`notebooks/PCH_Proyecto_Integrado.ipynb`](notebooks/PCH_Proyecto_Integrado.ipynb) |
| Informe web navegable | [https://alejandrovitur.github.io/pch-proyecto-integrado/](https://alejandrovitur.github.io/pch-proyecto-integrado/) |
| Dashboard interactivo (Streamlit) | [`dashboard/app.py`](dashboard/app.py) |
| Base de datos SQL de entrada | [`base_datos/pch_proyecto.sqlite`](base_datos/pch_proyecto.sqlite) · [`pch_proyecto.sql`](base_datos/pch_proyecto.sql) |
| Resultados (JSON, CSV y SQL) | [`resultados/`](resultados/) |

## Resultados de la última ejecución

**Fecha del cálculo:** 2026-11-11 · **TRM:** 3,269.88 COP/USD (valor de respaldo de la celda de parámetros (no se pudo consultar en línea: URLError))

**Requerimientos iniciales:** Q = 28 m³/s · Q ecológico = 4 m³/s · H bruto = 80 m ·
L = 1200 m · tubería PE100_AGRU D = 2.83 m (automática: menor diámetro que cumple) · accesorios: ENT_ABOCINADA × 1, REJ_RECTANGULAR × 1, CODO_45_RD3 × 4, VAL_MARIPOSA × 2, JUNTA_DILATACION × 2, RED_CONICA × 1

| Indicador | Valor |
|---|---|
| Potencia instalada | **18.24 MW** |
| Energía neta media | **142.6 GWh/año** (factor de planta 97%) |
| Turbina | **Francis × 1**, 400 rpm, D3 = 1.70 m, Hs = -4.5 m |
| Hidráulica | V = 4.45 m/s · ΣK = 1.154 · h_L = 4.68 m (5.85 % de H) · H neto = 75.32 m |
| Golpe de ariete | cierre mínimo 45 s |
| CAPEX | **52.1 MUSD** = 170.5 mil millones de COP |
| VAN · TIR · B/C | **285.1 mil M COP** · **28.3%** · **2.09** |
| Recuperación | 3.5 años (estático) · 4.6 años (descontado) |
| LCOE | 192 COP/kWh |
| P(VAN < 0), Monte Carlo | 0.0% |
| CO₂ evitado | 86,579 t/año |

### Verificación de criterios

| Criterio | Resultado | Cumple |
|---|---|---|
| Velocidad en la tubería ≤ 5 m/s | 4.45 m/s | ✔ |
| Pérdidas hidráulicas ≤ 6 % de Hb | 5.85% | ✔ |
| Sobrepresión ≤ 30 % de Hb con el cierre especificado | cierre ≥ 45 s | ✔ |
| Turbina del GB factible en física y catálogo | Francis × 1, 400 rpm, Hs = -4.5 m | ✔ |
| Caudal ecológico respetado todos los días | 100.0% | ✔ |
| Potencia menor de 20 MW (planta menor) | 18.24 MW | ✔ |
| VAN > 0 | 285 mil millones COP | ✔ |
| TIR > i | 28.3% > 10% | ✔ |
| B/C > 1 | 2.09 | ✔ |

### Tuberías que cumplen el diseño frente a la seleccionada

28 tuberías cumplen el diseño. La más barata es **PRFV / GRP Flowtite D = 2.90 m** (ahorro de
1,374 millones de COP en tubería); la de mayor VAN es **PRFV / GRP Flowtite D = 3.40 m**; el material sugerido es
**PRFV / GRP Flowtite D = 3.40 m**. Las diez primeras, de la más barata a la más cara:

| Material | D [m] | V [m/s] | η_cond [%] | Costo tubería [M COP] | Δ costo tubería [%] | VAN [mil M COP] | Nota |
|---|---|---|---|---|---|---|---|
| PRFV / GRP Flowtite | 2.90 | 4.24 | 94.45 | 11,052.76 | -11.06 | 287.81 | ▼ más barata  |
| PRFV / GRP Flowtite | 3.00 | 3.96 | 95.28 | 11,771.46 | -5.28 | 289.32 |  |
| PE 100-RC AGRU | 2.83 | 4.45 | 94.15 | 12,427.13 | 0.00 | 285.07 | ◀ seleccionada  |
| PRFV / GRP Flowtite | 3.10 | 3.71 | 95.96 | 12,512.67 | 0.69 | 290.36 |  |
| Acero al carbono soldado (a medida) | 2.90 | 4.24 | 94.27 | 13,003.24 | 4.64 | 284.66 |  |
| PRFV / GRP Flowtite | 3.20 | 3.48 | 96.53 | 13,276.39 | 6.83 | 291.03 |  |
| Acero al carbono soldado (a medida) | 3.00 | 3.96 | 95.13 | 13,848.78 | 11.44 | 286.10 |  |
| PE 100-RC AGRU | 3.00 | 3.96 | 95.55 | 13,848.78 | 11.44 | 287.35 |  |
| PRFV / GRP Flowtite | 3.30 | 3.27 | 97.00 | 14,062.61 | 13.16 | 291.39 |  |
| Acero al carbono soldado (a medida) | 3.10 | 3.71 | 95.84 | 14,720.79 | 18.46 | 287.05 |  |

### Escenarios de mercado

| Escenario | Energía [GWh] | Precio [COP/kWh] | VAN [MCOP] | B/C | PB estático [años] | PB dinámico [años] | C_T [MCOP] | Anualidad A [MCOP/año] | LCOE [COP/kWh] | TIR [%] |
|---|---|---|---|---|---|---|---|---|---|---|
| 1. Venta en bolsa | 144.17 | 573.00 | 504,301.66 | 2.84 | 2.38 | 2.86 | 274,450.82 | 29,113.54 | 201.94 | 41.98 |
| 2. Contrato bilateral | 144.17 | 327.85 | 191,108.67 | 1.75 | 4.44 | 6.17 | 254,459.77 | 26,992.90 | 187.23 | 22.45 |
| 3. Conservador | 135.50 | 149.99 | -47,623.26 | 0.80 | 13.08 |  | 239,221.57 | 25,376.44 | 187.28 | 6.48 |
| 4. Base | 144.17 | 401.40 | 285,066.56 | 2.09 | 3.53 | 4.58 | 260,457.09 | 27,629.09 | 191.64 | 28.33 |
| 5. Optimista | 147.25 | 773.42 | 781,464.53 | 3.67 | 1.69 | 1.94 | 292,142.06 | 30,990.21 | 210.46 | 59.23 |

### Gráficas principales

<img src="resultados/figuras/05_curva_del_sistema_salto_neto_y_potencia_vs_caudal.png" width="49%" alt="Curva del sistema: salto neto y potencia vs caudal">
<img src="resultados/figuras/22_van_vs_caudal_de_diseno_mejor_configuracion_de_cada_caudal.png" width="49%" alt="Van vs caudal de diseño (mejor configuración de cada caudal)">
<img src="resultados/figuras/23_comparativo_de_materiales_costo_vs_eficiencia_y_van.png" width="49%" alt="Comparativo de materiales: costo vs eficiencia y van">
<img src="resultados/figuras/24_diferencia_de_costo_de_cada_tuberia_que_cumple_frente_a_la_s.png" width="49%" alt="Diferencia de costo de cada tubería que cumple frente a la seleccionada">

### Todas las gráficas, por sección

#### 4. Datos de entrada y control de calidad

<details><summary>Curva de duración</summary>

![Curva de duración](resultados/figuras/01_curva_de_duracion.png)

</details>

#### 5. Accesorios, válvulas y pérdidas menores

<details><summary>Curvas de pérdida de accesorios y válvulas</summary>

![Curvas de pérdida de accesorios y válvulas](resultados/figuras/02_curvas_de_perdida_de_accesorios_y_valvulas.png)

</details>

#### 6. Modelo hidráulico y selección de la tubería

<details><summary>Desglose de pérdidas menores con la velocidad de diseño</summary>

![Desglose de pérdidas menores con la velocidad de diseño](resultados/figuras/03_desglose_de_perdidas_menores_con_la_velocidad_de_diseno.png)

</details>
<details><summary>Pérdidas vs diámetro para cada material</summary>

![Pérdidas vs diámetro para cada material](resultados/figuras/04_perdidas_vs_diametro_para_cada_material.png)

</details>
<details><summary>Curva del sistema: salto neto y potencia vs caudal</summary>

![Curva del sistema: salto neto y potencia vs caudal](resultados/figuras/05_curva_del_sistema_salto_neto_y_potencia_vs_caudal.png)

</details>

#### 7. Golpe de ariete y espesor de pared

<details><summary>Sobrepresión vs tiempo de cierre</summary>

![Sobrepresión vs tiempo de cierre](resultados/figuras/06_sobrepresion_vs_tiempo_de_cierre.png)

</details>

#### 8. Selección de turbina con Gradient Boosting

<details><summary>Carta de selección por fabricante con el punto de diseño</summary>

![Carta de selección por fabricante con el punto de diseño](resultados/figuras/07_carta_de_seleccion_por_fabricante_con_el_punto_de_diseno.png)

</details>
<details><summary>Matriz de confusión del gradient boosting y reporte por clase</summary>

![Matriz de confusión del gradient boosting y reporte por clase](resultados/figuras/08_matriz_de_confusion_del_gradient_boosting_y_reporte_por_clas.png)

</details>
<details><summary>Mapa de decisión del modelo en el plano caudal-salto</summary>

![Mapa de decisión del modelo en el plano caudal-salto](resultados/figuras/09_mapa_de_decision_del_modelo_en_el_plano_caudal_salto.png)

</details>
<details><summary>Importancia de las variables (permutación)</summary>

![Importancia de las variables (permutación)](resultados/figuras/10_importancia_de_las_variables_permutacion.png)

</details>
<details><summary>Eficiencia a carga parcial y corrección de moody</summary>

![Eficiencia a carga parcial y corrección de moody](resultados/figuras/11_eficiencia_a_carga_parcial_y_correccion_de_moody.png)

</details>

#### 9. Producción de energía

<details><summary>Caudal del río, caudal turbinado y potencia (tres años)</summary>

![Caudal del río, caudal turbinado y potencia (tres años)](resultados/figuras/12_caudal_del_rio_caudal_turbinado_y_potencia_tres_anos.png)

</details>
<details><summary>Energía mensual y variabilidad entre años</summary>

![Energía mensual y variabilidad entre años](resultados/figuras/13_energia_mensual_y_variabilidad_entre_anos.png)

</details>

#### 10. Mercado eléctrico e ingresos (XM)

<details><summary>Precios oficiales de xm en pesos constantes</summary>

![Precios oficiales de xm en pesos constantes](resultados/figuras/14_precios_oficiales_de_xm_en_pesos_constantes.png)

</details>
<details><summary>Ingreso mensual por escenario</summary>

![Ingreso mensual por escenario](resultados/figuras/15_ingreso_mensual_por_escenario.png)

</details>

#### 11. CAPEX y OPEX (metodología de la clase 14)

<details><summary>Referencias de costo por kw instalado</summary>

![Referencias de costo por kw instalado](resultados/figuras/16_referencias_de_costo_por_kw_instalado.png)

</details>
<details><summary>Cronograma de actividades (clase 14) y distribución de la inversión por periodo</summary>

![Cronograma de actividades (clase 14) y distribución de la inversión por periodo](resultados/figuras/17_cronograma_de_actividades_clase_14_y_distribucion_de_la_inve.png)

</details>

#### 12. Evaluación económica

<details><summary>Recuperación de la inversión y van vs tasa de descuento</summary>

![Recuperación de la inversión y van vs tasa de descuento](resultados/figuras/18_recuperacion_de_la_inversion_y_van_vs_tasa_de_descuento.png)

</details>
<details><summary>Análisis de sensibilidad (tornado ±20 %)</summary>

![Análisis de sensibilidad (tornado ±20 %)](resultados/figuras/19_analisis_de_sensibilidad_tornado_20.png)

</details>
<details><summary>Simulación de monte carlo del van</summary>

![Simulación de monte carlo del van](resultados/figuras/20_simulacion_de_monte_carlo_del_van.png)

</details>

#### 13. ML hidráulico: factibilidad de la tubería y predicción de pérdidas

<details><summary>Predicción del ml vs cálculo físico (conjunto de prueba)</summary>

![Predicción del ml vs cálculo físico (conjunto de prueba)](resultados/figuras/21_prediccion_del_ml_vs_calculo_fisico_conjunto_de_prueba.png)

</details>

#### 14. Optimización: método tradicional vs ML + física

<details><summary>Van vs caudal de diseño (mejor configuración de cada caudal)</summary>

![Van vs caudal de diseño (mejor configuración de cada caudal)](resultados/figuras/22_van_vs_caudal_de_diseno_mejor_configuracion_de_cada_caudal.png)

</details>
<details><summary>Comparativo de materiales: costo vs eficiencia y van</summary>

![Comparativo de materiales: costo vs eficiencia y van](resultados/figuras/23_comparativo_de_materiales_costo_vs_eficiencia_y_van.png)

</details>
<details><summary>Diferencia de costo de cada tubería que cumple frente a la seleccionada</summary>

![Diferencia de costo de cada tubería que cumple frente a la seleccionada](resultados/figuras/24_diferencia_de_costo_de_cada_tuberia_que_cumple_frente_a_la_s.png)

</details>

#### 16. Resumen de resultados

<details><summary>Indicadores clave del caso base</summary>

![Indicadores clave del caso base](resultados/figuras/25_indicadores_clave_del_caso_base.png)

</details>

## Base de datos SQL

Todos los datos de entrada están en `base_datos/pch_proyecto.sqlite` (SQLite) y en `base_datos/pch_proyecto.sql`
(esquema y datos en SQL estándar). El cuaderno, el dashboard y este README leen de ella.

| Tabla | Filas | Descripción | Fuente |
|---|---|---|---|
| caudales_rio | 9,124 | Caudal medio diario del río (m³/s) | S04 Datos de Rio.xlsx |
| tuberias_materiales | 6 | Materiales de tubería: rugosidad de diseño, uso y fuente | Base Datos Tuberias PCH.xlsx |
| tuberias_diametros | 131 | Diámetros comerciales por material y fabricante | Base Datos Tuberias PCH.xlsx |
| tuberias_rangos | 6 | Rango de diámetros de fabricación de cada material | Base Datos Tuberias PCH.xlsx |
| tuberias_fuentes | 5 | Catálogos de respaldo de las tuberías | Base Datos Tuberias PCH.xlsx |
| accesorios | 51 | Tipos de accesorio con su método de cálculo de K y su fuente | Base Datos Accesorios PCH.xlsx |
| accesorios_fuentes | 3 | Referencias de los coeficientes K | Base Datos Accesorios PCH.xlsx |
| precios_xm | 166 | Precios mensuales de bolsa y contratos publicados por XM (COP/kWh corrientes) | precios_xm_mensual.csv |
| dataset_hidraulico | 8,400 | Dataset hidráulico de 8.400 casos de la Entrega 2 | dataset_hidraulico_v0.1.0.csv |

Ejemplo de consulta:

```sql
SELECT Material_ID, COUNT(*) AS diametros, MIN(Diametro_hidraulico_m) AS D_min, MAX(Diametro_hidraulico_m) AS D_max
FROM v_catalogo_tuberias GROUP BY Material_ID;
```

## Cómo usarlo

```bash
python -m pip install -r requirements.txt
python base_datos/crear_base_datos.py          # (re)crea la base SQL desde data/
streamlit run dashboard/app.py                 # dashboard interactivo
jupyter lab notebooks/PCH_Proyecto_Integrado.ipynb   # cuaderno paso a paso
```

En el **dashboard** se cambian los requerimientos iniciales (caudal, salto, longitud, material y diámetro de la tubería,
tipo y cantidad de accesorios, TRM, tasa de descuento, vida útil, etc.) y se recalcula el proyecto completo con las
mismas ecuaciones del cuaderno. Para cambiar los resultados de este README, edite la celda **3. Parámetros editables**
del cuaderno y suba el cambio: el flujo de GitHub lo vuelve a ejecutar.

### Dashboard en línea

El dashboard se puede publicar gratis en **Streamlit Community Cloud**: entrar a [share.streamlit.io](https://share.streamlit.io)
con la cuenta de GitHub, *Create app* → repositorio `AlejandroViTur/pch-proyecto-integrado`, rama `main`, archivo `dashboard/app.py` → *Deploy*.

## Estructura

```
data/            archivos fuente (Excel y CSV)
base_datos/      base SQL del proyecto (.sqlite y .sql) y el script que la crea
notebooks/       cuaderno con el desarrollo completo (ejecutado)
pch/motor.py     motor que ejecuta el cuaderno con otros parámetros (lo usa el dashboard)
dashboard/       dashboard interactivo en Streamlit
resultados/      resumen.json, tablas CSV, pch_resultados.sqlite y gráficas
scripts/         generador de este README
.github/         flujo que ejecuta el proyecto y publica el informe
```
