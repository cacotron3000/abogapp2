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
   - opcionalmente `table_prefix`

### 2) Botones de sincronización
En la barra superior hay dos acciones:
- **Leer DB cPanel**: descarga el estado guardado en MySQL y lo carga en la app.
- **Escribir DB cPanel**: guarda el estado actual de la app en MySQL.

### 3) Endpoint backend
- Archivo: `backend/sync.php`
- Recibe POST JSON con:
  - `{ "action": "pull" }`
  - `{ "action": "push", "state": { ... } }`
  - `{ "action": "verify_login", "email": "...", "password": "..." }`

### 4) Estructura en MySQL (por sección)
El backend crea tablas separadas por sección usando `table_prefix`:
- `abogapp2_users` (fija para usuarios de la app)
- `${table_prefix}_clientes`
- `${table_prefix}_asuntos`
- `${table_prefix}_causas` (incluye audiencias dentro de cada causa, por ejemplo `proximaAudiencia`)
- `${table_prefix}_tareas`
- `${table_prefix}_plazos`
- `${table_prefix}_cotizaciones`
- `${table_prefix}_logs`
- `${table_prefix}_meta` (sesión)

Cada registro se guarda por `id` y `payload` JSON en los módulos funcionales; la tabla de usuarios usa columnas estructuradas.

En `abogapp2_users` se usan columnas estructuradas:
`id`, `email`, `nombre`, `telefono`, `role`, `password_hash`, `is_admin`, `active`, `created_at`, `updated_at`.

Las contraseñas de usuarios se guardan en `password_hash` con `password_hash()` de PHP (no en texto plano).

## Roadmap de mejoras de UX y fidelización

Prioridades sugeridas para aumentar adopción diaria del equipo:

1. **Bandeja de hoy en el dashboard** con tareas atrasadas, plazos próximos y audiencias cercanas.
2. **Estado de sincronización visible** (última sync exitosa, pendientes por sync y estado offline/online).
3. **Plantillas reutilizables** para asuntos, tareas y plazos recurrentes.
4. **Actividad del equipo** con filtros por usuario y fecha para trazabilidad operacional.
5. **Notificaciones internas** para vencimientos, tareas sin responsable y causas sin próxima audiencia.

Estas mejoras están ordenadas por impacto operativo inmediato y facilidad de adopción por parte de estudios jurídicos pequeños y medianos.
