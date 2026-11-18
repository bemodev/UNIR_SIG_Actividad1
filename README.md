# SF Crust Pizza BI – publicación

Aplicación estática (index.html + app.js + data/). No requiere servidor propio.

## Publicar con enlace público (elige una)
- **Netlify Drop**: entra a https://app.netlify.com/drop y arrastra la carpeta `app`. Obtienes una URL pública al instante.
- **GitHub Pages**: sube el contenido de `app` a un repositorio público → Settings → Pages → Branch `main` / root.

## Probar en local
```
python -m http.server 8765 -d app
```
Abrir http://localhost:8765 (abrir el index.html con doble clic no funciona: el navegador bloquea la lectura de `data/`; en ese caso usar la pestaña "Cargar datos").

## Actualizar datos
- Desde la app: pestaña **Cargar datos** → elegir el nuevo Excel de ventas.
- O reemplazar `data/San_Francisco_Crust_Pizza_Ventas.xlsx` por uno nuevo con las mismas columnas y volver a publicar.
