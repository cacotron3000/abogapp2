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

## Recordatorio diario automático por correo (cron)

La app permite envío manual desde **Utilidades**, pero para automatizar horario diario se incluye:

- Script: `backend/cron_daily_reminder.php`
- Fuente de datos: consulta directa a MySQL sobre:
  - `abogapp2_users` (usuarios activos con email)
  - `${table_prefix}_tareas` (tareas pendientes en `payload` JSON)

### 1) Configuración previa
En `backend/config.php` debe estar definido:
- `host`, `dbname`, `user`, `pass`, `charset`, `table_prefix`
- `mail_from` (remitente)

### 2) Probar manualmente por terminal
```bash
php /ruta/a/abogapp/backend/cron_daily_reminder.php
```

### 3) Programar en cPanel (Cron Jobs)
Ejemplo para ejecutar todos los días a las **08:00** (hora del servidor):
```cron
0 8 * * * /usr/bin/php /home/USUARIO/public_html/abogapp/backend/cron_daily_reminder.php >/dev/null 2>&1
```

### 4) Cambiar horario
Solo modifica los primeros campos del cron:
- `0 8 * * *` → 08:00 diario
- `30 7 * * *` → 07:30 diario
- `0 18 * * 1-5` → 18:00 lunes a viernes

> Recomendación: verificar primero que el servidor tenga salida de correo habilitada para `mail()`.

## Importación CSV por sección

La app permite importar y exportar CSV directamente desde **Clientes** y **Causas judiciales**.

### Regla de duplicados
- **Clientes**: se detecta duplicado por `rut` o `correo`.
- **Causas**: se detecta duplicado por `rit` o `rol`.
- Si hay coincidencia, la app **pregunta si desea reemplazar** el registro existente.

### Template CSV: Clientes
Encabezados esperados:
```csv
tipo,nombre,rut,correo,telefono,comuna,region,estado,observaciones
```
Ejemplo:
```csv
Persona natural,Juan Pérez,12.345.678-9,juan@correo.cl,+56911112222,La Serena,Coquimbo,Activo,Cliente laboral
Empresa,Comercial XYZ SpA,76.123.456-7,contacto@xyz.cl,+56512223344,Santiago,Metropolitana,Activo,Empresa con múltiples causas
```

### Template CSV: Causas
Encabezados esperados:
```csv
asuntoNombre,tribunal,rit,rol,caratula,estadoProcesal,etapa,proximaAudiencia,link
```
Ejemplo:
```csv
Despido injustificado Pérez,Juzgado de Letras del Trabajo de La Serena,T-123-2026,123-2026,Pérez con XYZ,Audiencia preparatoria pendiente,Discusión,2026-05-15,https://oficinajudicialvirtual.pjud.cl/
Cobro de pesos ABC,Juzgado Civil de Coquimbo,C-456-2026,456-2026,ABC con López,En tramitación,Prueba,2026-06-10,https://oficinajudicialvirtual.pjud.cl/
```

> Nota: `asuntoNombre` debe existir previamente en la app para asociar correctamente la causa al asunto.
