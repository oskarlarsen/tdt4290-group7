# Backend de integracion del sistema

## Objetivo

Conectar todas las paginas a una fuente de datos persistente y coherente. La interfaz no debe presentar registros de demostracion como si fueran datos reales ni confirmar una operacion que no se guardo en el backend.

La implementacion debe seguir siendo un monolito modular Kotlin/Ktor. No se propone dividir el proyecto en microservicios: las operaciones de proveedores, acuerdos, vehiculos y cumplimiento necesitan consistencia transaccional y el volumen actual no justifica la complejidad operativa adicional.

## Situacion actual

| Area | Estado actual |
|---|---|
| Autenticacion e invitaciones | Backend real. Las cuentas se almacenan en SQLite; aun no hay entrega de correo para invitaciones ni recuperacion de contrasena. |
| Organizaciones de proveedores, acuerdos, vehiculos, historial y estadisticas | API y persistencia SQLite reales. La verificacion de matriculas tambien depende del servicio externo de Statens vegvesen. |
| Onboarding del proveedor | El administrador configura por acuerdo si necesita vehiculos, energia y/o productos antes de invitar al contacto. El portal supplier solo ofrece las categorias solicitadas; el backend valida el alcance en plantillas, previsualizaciones, confirmaciones y envio. El admin puede consultar los registros recibidos desde el detalle del proveedor. |
| Certificados | Listado y mutaciones del administrador usan el backend persistente. Los certificados vinculados se resuelven contra acuerdos/proveedores activos; los PDFs originales no se conservan. |
| Dashboard y directorio de riesgo de administracion | En modo backend, el directorio usa las organizaciones canonicas y muestra cuentas supplier registradas, perfil/contacto, estado de onboarding y conteos de acuerdos, vehiculos, certificados, energia y productos. El administrador puede aprobar el onboarding o solicitar cambios; esas decisiones se reflejan en el portal supplier. El riesgo sigue acotado a hallazgos persistidos de vehiculos y certificados; energia/fuel y cumplimiento global no se consideran evaluados. |
| Energia, alertas y prediccion de riesgo | Alertas admin y hallazgos derivados de verificaciones/certificados tienen persistencia. Los informes de energia, los compromisos de fuel y una evaluacion global/versionada de riesgo siguen pendientes. |
| Espacio del proveedor | La empresa, acuerdos, vehiculos, certificados, energia y productos se leen desde endpoints tenant-scoped reales. Riesgo, alertas y acciones requeridas aun no tienen endpoints y se presentan como no disponibles. |

Los fixtures de demostracion y las organizaciones reales siguen siendo fuentes distintas cuando se activa el modo mock. En modo backend, el dashboard y el directorio usan el `supplier_id` canonico, sin intentar relacionar registros por nombre o numero de organizacion.

El resumen admin clasifica como riesgo alto los hallazgos de vehiculo de prioridad alta y los certificados vencidos o que vencen en 30 dias; riesgo medio corresponde a hallazgos moderados y certificados que vencen entre 31 y 90 dias. Solo se evaluan proveedores con una verificacion persistida o un certificado vinculado con fecha de vencimiento. No tener hallazgos en esas fuentes no equivale a cumplimiento global; energia y compromisos de combustible no se puntuan.

## Arquitectura objetivo

### Modulos de aplicacion

- `auth`: usuarios, sesiones, invitaciones y permisos.
- `organizations`: organizacion del proveedor, estado, perfil y contactos.
- `agreements`: acuerdos vinculados a una organizacion.
- `fleet`: vehiculos, verificaciones externas, estadisticas e historial reversible.
- `onboarding`: estado, perfil, importaciones CSV y envio para revision.
- `compliance`: certificados, productos y energia declarada.
- `risk`: reglas/version del calculo, evaluaciones y resultados persistidos.
- `alerts`: alertas originadas por reglas, estado de seguimiento e historial.
- `dashboard`: agregaciones de lectura para las vistas de administracion y proveedor.

Cada modulo debe exponer servicios/repositories con tipos propios. Las rutas Ktor validan la entrada y traducen resultados a HTTP; la logica de negocio no debe duplicarse en handlers ni en React.

### Datos canonicos

La organizacion de proveedor es la identidad canonica. Acuerdos, vehiculos, onboarding, certificados, productos, energia, riesgos y alertas deben referenciar su `supplier_id` u `agreement_id`; las relaciones no se deben inferir a partir de datos de presentacion.

Entidades principales:

- `suppliers`: identidad de organizacion, numero de organizacion, estado activo y fechas.
- `supplier_profiles`: datos de contacto y perfil de onboarding.
- `agreements`: organizacion, vigencia, cupo, notas, estado y categorias de informacion requeridas; sus cambios quedan en el historial inmutable de flota.
- `vehicles`, `trip_rows`, `registry_snapshots`, `vehicle_checks`: flota e historial verificable.
- `onboarding_status`, `onboarding_batches` y filas importadas: progreso, importacion y revision.
- `certificates`: estandar, identificador, acuerdo/organizacion, vigencia, metadatos y referencia al documento.
- `products` y `energy_reports`: datos declarados por organizacion/acuerdo y periodo, con procedencia y estado de validacion.
- `risk_evaluations`: organizacion, resultado, fecha, version de reglas y entradas utilizadas.
- `alerts`: organizacion, origen, severidad, estado, responsable y fechas de seguimiento.
- `audit_events`: actor, accion, entidad, instante y referencia de historial para cambios administrativos.

Usar claves foraneas e indices para las relaciones. Los datos cuantitativos deben conservar su precision decimal; los datos historicos de una evaluacion o alerta no se deben recalcular implicitamente cuando cambien los datos de entrada.

### Persistencia y transacciones

Mantener el backend como monolito modular y usar SQLite mientras siga siendo el entorno operativo del proyecto. Las escrituras de entidades relacionadas deben ser transaccionales y las operaciones destructivas deben ser reversibles o conservar historial conforme al patron existente de `fleet_changes`.

El almacenamiento de certificados debe dejar de divergir de sus escrituras: la lectura y las mutaciones de certificados han de usar la misma fuente real. Antes de consolidar bases SQLite, crear migraciones versionadas, copias de seguridad y pruebas de migracion; nunca borrar una base de datos existente para hacer avanzar el esquema.

La base de usuarios puede seguir separada durante la primera fase. Las invitaciones y la cuenta deben comprobar que la organizacion sigue activa al aceptar la invitacion y al autenticarse. Una migracion posterior de almacenamiento solo se justifica si se necesita atomicidad entre identidad y organizacion.

Aplicar migraciones compatibles y reproducibles al iniciar o mediante una tarea explicita. Configurar rutas de datos persistentes, copias de seguridad y restauracion para los entornos desplegados; no depender del filesystem efimero del contenedor.

### API prevista

Conservar los endpoints existentes de flota y onboarding. Completar y normalizar rutas bajo `/api`:

| Dominio | Lecturas/escrituras requeridas |
|---|---|
| Organizaciones | CRUD, invitaciones y estado de actividad. |
| Acuerdos y flota | CRUD de acuerdos, vehiculos, historial, estadisticas y verificaciones; conservar las rutas actuales. |
| Onboarding | Estado, perfil, plantillas, vista previa, confirmacion, envio y revision; conservar las rutas actuales. |
| Cumplimiento | CRUD/listado real de certificados, productos y reportes de energia, filtrados por organizacion/acuerdo y periodo. |
| Dashboard admin | `/api/admin/dashboard/summary` agrega organizaciones, cuentas supplier registradas, perfil/estado de onboarding, conteos de datos, acuerdos, vehiculos, certificados y evaluaciones de riesgo acotadas a evidencia existente. `POST /api/admin/onboarding/{supplierId}/review` aprueba o solicita cambios. `/api/admin/dashboard/sync` actualiza alertas derivadas; `GET/POST /api/admin/alerts`, `PATCH /api/admin/alerts/{id}`, `DELETE /api/admin/alerts/{id}` y `GET/PUT /api/admin/supplier-reviews` gestionan el seguimiento persistido. |
| Espacio proveedor | Resumen y lecturas acotadas a la organizacion autenticada; no aceptar un `supplierId` arbitrario de un usuario proveedor. |
| Riesgo y alertas | Ejecutar/consultar evaluaciones; listar, crear desde reglas y actualizar el seguimiento de alertas. |

Las operaciones de escritura deben responder con el registro persistido, errores HTTP explicitos y version para detectar ediciones obsoletas cuando haya concurrencia. Los filtros y paginacion deben aplicarse en el backend.

## Cambios de frontend

- Introducir una fuente por entorno: mocks solo para desarrollo/demo y APIs reales para integracion/produccion. Fallar visiblemente si una pagina requiere un endpoint ausente; no sustituir silenciosamente errores por datos demo.
- Hacer que la lista, alta, edicion y eliminacion de certificados lean y escriban la misma API.
- Sustituir `useMySupplierOverview` por consultas a endpoints del proveedor que agreguen datos persistidos; eliminar mezclas entre fixtures y registros de flota.
- En modo backend, alimentar el directorio desde organizaciones canonicas; conservar los fixtures solo en modo demo y no mezclarlos con registros reales.
- Conectar las acciones de estado de alertas, revisiones y ejecucion de riesgo a mutaciones backend y refrescar las consultas afectadas.
- Mantener estados de carga, error y vacio diferenciados; un error de API nunca debe mostrarse como una lista vacia exitosa.

## Plan de implementacion

1. **Cerrar el contrato de datos y la matriz pagina/API.** Inventariar cada ruta de frontend, documentar los DTOs existentes y definir los campos que reemplazan a cada fixture.
2. **Completar la persistencia canonica de proveedor.** Resolver identidad entre organizaciones reales y directorio de riesgo; conservar acuerdos, onboarding e historial al migrar datos.
3. **Eliminar la divergencia de certificados.** Unificar lectura y escritura en backend y probar persistencia tras reinicio.
4. **Completar el espacio del proveedor.** Exponer datos persistidos de contratos/acuerdos, vehiculos, onboarding, certificados, productos y energia; consumirlos en sus paginas.
5. **Implementar admin dashboard y contratos.** Los acuerdos y el dashboard admin usan la fuente canonica; los hallazgos de vehiculos/certificados se agregan en el resumen y las alertas se persisten. Falta integrar energia, evaluar cumplimiento y versionar un modelo de riesgo más amplio.
6. **Implementar energia, riesgo y alertas.** Persistir reportes y versiones de reglas, generar evaluaciones reproducibles y habilitar seguimiento de alertas.
7. **Retirar mocks de los flujos conectados y validar despliegue.** Migraciones, backups, pruebas de integracion, build y pruebas de navegador por rol.

Cada fase debe llegar a la rama con tests antes de comenzar la siguiente. No declarar una pagina conectada hasta que sus lecturas y mutaciones sean API-backed, los datos sobrevivan un reinicio y exista una prueba que lo verifique.

## Criterios de aceptacion globales

- Cada pagina tiene una matriz explicita de endpoint, modelo persistido, permisos y estados de error.
- Las organizaciones y datos relacionados se muestran iguales en admin y en el espacio del proveedor, respetando el tenant.
- Crear, editar, eliminar, importar o revisar datos los conserva despues de reiniciar el backend.
- Las operaciones fallidas no actualizan optimistamente la UI ni producen respuestas exitosas ficticias.
- Las eliminaciones mantienen las referencias y el historial necesarios; restaurar cambios no rompe restricciones de unicidad.
- Pruebas API/integracion verifican permisos, validacion, persistencia, conflictos de concurrencia y transacciones.
- CI prueba migraciones desde una base previa, backend, frontend y contratos de API.
- El modo de produccion no activa datos demo ni fixtures de manera implicita.
