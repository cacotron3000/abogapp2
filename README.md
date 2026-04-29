# AbogApp 2.0

Versión actualizada con generador de cotizaciones sin dependencia de plantilla física DOCX.

Cambios de esta versión:
- La cotización generada inserta solo el logo del estudio jurídico en el encabezado, centrado.
- Los campos “Resumen requerimiento” y “Servicio propuesto” conservan saltos de línea en el DOCX.
- El formulario permite agregar conceptos dinámicamente.
- El monto fijo se formatea como `$xxx.xxx.-`.
- Fuente Tahoma 11 y texto negro.

## Sincronización lectura/escritura con base de datos cPanel (PHP + MySQL)

La aplicación sigue funcionando en frontend HTML/JS, y ahora incluye backend en PHP para leer y escribir el estado completo en una base de datos MySQL de cPanel.

### 1) Configurar backend
1. Copiar `backend/config.sample.php` como `backend/config.php`.
2. Completar credenciales de MySQL de cPanel:
   - `host`
   - `dbname`
   - `user`
   - `pass`
   - opcionalmente `table` y `state_key`

### 2) Botones de sincronización
En la barra superior hay dos acciones:
- **Leer DB cPanel**: descarga el estado guardado en MySQL y lo carga en la app.
- **Escribir DB cPanel**: guarda el estado actual de la app en MySQL.

### 3) Endpoint backend
- Archivo: `backend/sync.php`
- Recibe POST JSON con:
  - `{ "action": "pull" }`
  - `{ "action": "push", "state": { ... } }`

La tabla se autocrea si no existe (`abogapp_state` por defecto), almacenando el JSON del estado de la aplicación.
