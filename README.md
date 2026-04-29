# AbogApp 2.0

Versión actualizada con generador de cotizaciones sin dependencia de plantilla física DOCX.

Cambios de esta versión:
- La cotización generada inserta solo el logo del estudio jurídico en el encabezado, centrado.
- Los campos “Resumen requerimiento” y “Servicio propuesto” conservan saltos de línea en el DOCX.
- El formulario permite agregar conceptos dinámicamente.
- El monto fijo se formatea como `$xxx.xxx.-`.
- Fuente Tahoma 11 y texto negro.

## Backend de sincronización DB (Node.js)

Se agregó un backend de sincronización bidireccional para la tabla `abogapp_users`.

### Configuración
1. Copia `.env.example` a `.env` y ajusta `APP_DB_*` (tu DB de app).
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Inicia backend:
   ```bash
   npm run start
   ```

### Endpoints
- `GET /health`
- `GET /sync/status` (requiere header `x-api-key`)
- `POST /sync/run` (requiere header `x-api-key`)
- `GET /users` (requiere header `x-api-key`)
- `POST /users/upsert` (requiere header `x-api-key`)
- `DELETE /users/:email` (requiere header `x-api-key`)

### Sincronización
- Pull automático desde cPanel hacia la DB de la app cada `SYNC_INTERVAL_MS` (default: 5000ms).
- Upsert de usuarios por `email`.
- Si un usuario existe en app pero ya no existe en cPanel, se elimina en app.
