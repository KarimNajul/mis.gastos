# Mis Gastos

App para registrar gastos por periodos. Se distribuye como:

- **APK para Android** (Capacitor)
- **EXE portable para Windows** (Electron)
- **Web instalable (PWA)** desde el navegador

Los datos se guardan en cada dispositivo. Para pasarlos de uno a otro: *Ajustes → Exportar* y luego *Importar* en el otro.

## Cómo funciona

- **Inicio:** cargás gastos (nombre, descripción, costo y categoría) en el periodo actual.
- **Finalizar periodo:** cierra el periodo, lo guarda en el historial, muestra el resumen (total, promedio, torta por categoría y barras por gasto) y empieza uno nuevo.
- **Historial:** todos los periodos finalizados con su resumen.
- **Ajustes:** exportar/importar los datos (`.json`) y borrar todo.

## Estructura

| Ruta | Qué es |
|---|---|
| `www/` | La app (HTML, CSS, JS). **Acá se hacen los cambios.** |
| `www/app.js` | Toda la lógica: datos, vistas, gráficos, exportar/importar |
| `electron/main.js` | Ventana de escritorio para el EXE |
| `capacitor.config.json` | Configuración del APK |
| `assets/` | Ícono y pantalla de inicio de Android |
| `android-firma/debug.keystore` | Firma fija del APK (para poder actualizar sin perder datos) |
| `.github/workflows/compilar.yml` | Compila APK + EXE en GitHub y los publica en Releases |

## Descargar las apps

Cada vez que se suben cambios a `main`, GitHub Actions compila todo (unos 10 minutos) y crea una versión nueva en la página **Releases** del repositorio con:

- `MisGastos.apk` → abrilo desde el celular. Android va a pedir permiso para "instalar apps de origen desconocido".
- `MisGastos.exe` → doble clic. Windows SmartScreen puede avisar que es de un editor desconocido: *Más información → Ejecutar de todas formas*.

Instalar un APK nuevo encima del anterior **conserva los datos**.

## Probar la versión web en la PC

```
python -m http.server 8080 --directory www
```

Y abrir <http://localhost:8080>.

## Notas

- La firma del APK es de prueba (sirve para instalar directo). Para publicar en Google Play habría que crear una firma de release.
- Si se modifica la versión web (PWA), subir la versión en `www/sw.js` (`mis-gastos-v1` → `v2`).
