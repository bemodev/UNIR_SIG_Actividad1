# 🍕 San Francisco Crust Pizza · Sistema Inteligente de Apoyo a la Toma de Decisiones

Dashboard web interactivo que integra las bases de **Ventas, Clientes y Productos** de una cadena regional de pizzerías en EE. UU., con filtros, hallazgos automáticos, carga de datos propios y un asistente de IA que propone recomendaciones comerciales.

**▶ Aplicación publicada:** https://bemodev.github.io/UNIR_SIG_Actividad1/

**🎬 Video de presentación (10 min):** [▶ Ver en YouTube](https://youtu.be/ep7LpVGEzUw) · [descargar MP4 720p](docs/video/SFCP_Grupo5_presentacion_720p.mp4)

[![Video de presentación en YouTube](https://img.youtube.com/vi/ep7LpVGEzUw/maxresdefault.jpg)](https://youtu.be/ep7LpVGEzUw)

---

## Contexto académico
| | |
|---|---|
| Universidad | Universidad Internacional de La Rioja (UNIR) |
| Programa | Máster Universitario en Dirección Comercial y Ventas (PS) · PER 16768 · Octubre 2026 |
| Asignatura | Sistemas de Información para la Toma de Decisiones Comerciales |
| Actividad | Actividad 1 · Desarrollo de un Sistema Inteligente de Apoyo a la Toma de Decisiones con IA |
| Equipo | Grupo 5 – Lote 6 |
| Profesor | Alberto Francesena Alvarez |

**Integrantes:** Rodríguez Gallegos, Manuel Alejandro · Sánchez Paredes, Margot Elisabeth · Torres Lopez, Madeline Nicole · Betancourt Garces, Dario Jose · Urbina López, José Andrés

---

## Documentación
- 📄 **[Prompt final](docs/PROMPT_generador_app.md)** — descripción completa de la aplicación, resultado del refinamiento iterativo con IA.
- 💬 **[Conversación con la IA](docs/Conversaci%C3%B3n%20con%20IA.md)** — transcripción anonimizada de la sesión de trabajo con Claude Code: cómo se pidió, revisó y mejoró la aplicación paso a paso.
- 📚 **Guías de implementación** (paso a paso, pensadas para alguien que parte de cero con IA):

| Guía | Contenido |
|---|---|
| [Guía 0 · Preparación y método de trabajo](docs/Gu%C3%ADas%20de%20implementaci%C3%B3n/Gu%C3%ADa%200%20-%20Preparaci%C3%B3n%20y%20m%C3%A9todo%20de%20trabajo.docx) | Qué es la IA, cómo conversar con ella, materiales y ciclo de trabajo |
| [Guía 1 · Aplicación funcional en local](docs/Gu%C3%ADas%20de%20implementaci%C3%B3n/Gu%C3%ADa%201%20-%20Aplicaci%C3%B3n%20funcional%20en%20local.docx) | KPI, gráficas, filtros, pestañas y recomendaciones |
| [Guía 2 · Publicación en GitHub Pages](docs/Gu%C3%ADas%20de%20implementaci%C3%B3n/Gu%C3%ADa%202%20-%20Publicaci%C3%B3n%20en%20GitHub%20Pages.docx) | Repositorio, beneficio de estudiante y enlace público |
| [Guía 3 · Carga de datos propios](docs/Gu%C3%ADas%20de%20implementaci%C3%B3n/Gu%C3%ADa%203%20-%20Carga%20de%20datos%20propios.docx) | Validación, formatos regionales e informe de calidad |
| [Guía 4 · IA generativa con Cloudflare](docs/Gu%C3%ADas%20de%20implementaci%C3%B3n/Gu%C3%ADa%204%20-%20IA%20generativa%20con%20Cloudflare.docx) | Asistente de IA gratuito y seguro desde el enlace |
| [Guía 5 · Buenas prácticas web y de dashboards](docs/Gu%C3%ADas%20de%20implementaci%C3%B3n/Gu%C3%ADa%205%20-%20Buenas%20pr%C3%A1cticas%20web%20y%20de%20dashboards.docx) | Dinamismo, etiquetas de datos, portada, exportación y auditoría |
| [Guía 6 · Glosario](docs/Gu%C3%ADas%20de%20implementaci%C3%B3n/Gu%C3%ADa%206%20-%20Glosario.docx) | Panel lateral con la definición de cada indicador |
| [Guía 7 · Acerca de](docs/Gu%C3%ADas%20de%20implementaci%C3%B3n/Gu%C3%ADa%207%20-%20Acerca%20de.docx) | Presentación del proyecto, equipo y ficha técnica |
| [Anexos](docs/Gu%C3%ADas%20de%20implementaci%C3%B3n/Gu%C3%ADa%20A%20-%20Anexos.docx) | Línea de tiempo de prompts reales, prompt final, checklist y problemas frecuentes |

---

## Funcionalidades principales
- **Dashboard ejecutivo:** ventas, utilidad, margen, ticket, clientes, transacciones, unidades y descuentos, con variación ▲▼ y hallazgos clave.
- **Filtros** por fecha, ciudad, sucursal, segmento, estado del cliente (activo/inactivo), categoría, producto, canal y forma de pago; también al hacer clic en las gráficas.
- **Comparativo anual**, análisis de productos, sucursales y clientes.
- **Carga de datos propios** (Excel o CSV) con validación, sin modificar el código.
- **Asistente de IA:** motor de reglas integrado y modelo de lenguaje (Llama 3.3 vía Cloudflare Workers AI).
- **Exportación** a CSV y PDF, glosario de indicadores y sección "Acerca de".

## Tecnología
HTML, CSS y JavaScript sin frameworks · SheetJS · Chart.js · chartjs-plugin-datalabels · html2canvas · jsPDF · GitHub Pages · Cloudflare Workers AI. Aplicación generada con **Claude Code (Anthropic), modelo Claude Opus 5.5**.

## Actualizar los datos
- **Desde la app:** pestaña **Cargar datos** → elegir el nuevo Excel de ventas (y, si se quiere, clientes y productos).
- **Para todos los usuarios:** reemplazar los archivos de la carpeta `data/` con el mismo nombre (definidos en `data/config.json`).

---
*Proyecto académico. Datos de uso exclusivamente educativo.*
