# AbogApp 2.0

## Sincronización (Frontend + PHP + MySQL)

La app ahora sincroniza con **frontend en navegador** y **backend PHP (`backend/api.php`)** sobre **MySQL**.

### Componentes
- `js/sync.js`: cliente JS de sincronización.
- `backend/api.php`: API backend en PHP para lectura/escritura.
- `schema.sql`: tablas `abogapp_*` para sincronizar secciones (clientes, asuntos, tareas, etc.).

### Operaciones de sincronización
#### Lectura (frontend)
- `pulltabla(tabla)` → llama endpoint `pull_table`
- `pullall()` → llama endpoint `pull_all`

#### Escritura hacia MySQL cPanel
- `pushtabla(tabla, rows)` → `push_table`
- `pushregistro(tabla, row)` → `push_record`
- `deleteregistro(tabla, id)` → `delete_record`

### Configuración en cPanel/PHP
Define variables de entorno (o ajusta defaults en `api.php`):
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASS`
- `API_KEY`

### Flujo recomendado
1. Crear tablas ejecutando `schema.sql` en MySQL.
2. Subir proyecto a hosting/cPanel.
3. Verificar acceso a `backend/api.php?action=pull_all` con header `x-api-key`.
4. Desde UI usar botón **Forzar sincronización**.
