# Backend de integracion del sistema

## Objetivo

Conectar todas las paginas a una fuente de datos persistente y coherente. La interfaz no debe presentar registros de demostracion como si fueran datos reales ni confirmar una operacion que no se guardo en el backend.

La implementacion debe seguir siendo un monolito modular Kotlin/Ktor. No se propone dividir el proyecto en microservicios: las operaciones de proveedores, acuerdos, vehiculos y cumplimiento necesitan consistencia transaccional y el volumen actual no justifica la complejidad operativa adicional.

## Situacion actual

| Area | Estado actual |
|---|---|
| Autenticacion e invitaciones | Backend real. Las cuentas se almacenan en SQLite; aun no hay entrega de correo para invitaciones ni recuperacion de contrasena. |
| Organizaciones de proveedores, acuerdos, vehiculos, historial y estadisticas | API y persistencia SQLite reales. La verificacion de matriculas tambien depende del servicio externo de Statens vegvesen. |
| Onboarding del proveedor | Estado, perfil, plantillas CSV, previsualizacion, confirmacion, envio y revision tienen rutas backend. |
| Certificados | El backend persiste y permite gestionar certificados, pero la lectura del listado puede usar mocks mientras algunas mutaciones escriben en el backend. |
| Dashboard y directorio de riesgo de administracion | Las consultas de resumen usan datos demo; los endpoints de dashboard y contratos a los que apunta el modo no-mock no existen. |
| Energia, alertas y prediccion de riesgo | Hay datos de demostracion y calculos en frontend. Las operaciones persistentes y varias rutas backend aun no existen. |
| Espacio del proveedor | Combina organizaciones y vehiculos reales con contratos, certificados, energia, alertas y otros datos demo. Las paginas no aprovechan consistentemente las rutas de lectura tenant-scoped ya disponibles. |

El directorio de riesgo de demostracion y las organizaciones reales son conjuntos distintos. No deben combinarse por nombre ni por numero de organizacion sin una migracion y una regla explicita de identidad.

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
- `agreements`: organizacion, vigencia, cupo, notas y estado.
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
| Dashboard admin | Resumen agregado de organizaciones, riesgo, acuerdos, alertas y cumplimiento. |
| Espacio proveedor | Resumen y lecturas acotadas a la organizacion autenticada; no aceptar un `supplierId` arbitrario de un usuario proveedor. |
| Riesgo y alertas | Ejecutar/consultar evaluaciones; listar, crear desde reglas y actualizar el seguimiento de alertas. |

Las operaciones de escritura deben responder con el registro persistido, errores HTTP explicitos y version para detectar ediciones obsoletas cuando haya concurrencia. Los filtros y paginacion deben aplicarse en el backend.

## Cambios de frontend

- Introducir una fuente por entorno: mocks solo para desarrollo/demo y APIs reales para integracion/produccion. Fallar visiblemente si una pagina requiere un endpoint ausente; no sustituir silenciosamente errores por datos demo.
- Hacer que la lista, alta, edicion y eliminacion de certificados lean y escriban la misma API.
- Sustituir `useMySupplierOverview` por consultas a endpoints del proveedor que agreguen datos persistidos; eliminar mezclas entre fixtures y registros de flota.
- Migrar el directorio de riesgo desde proveedores demo a organizaciones canonicas, con una migracion de datos definida antes de retirar fixtures.
- Conectar las acciones de estado de alertas, revisiones y ejecucion de riesgo a mutaciones backend y refrescar las consultas afectadas.
- Mantener estados de carga, error y vacio diferenciados; un error de API nunca debe mostrarse como una lista vacia exitosa.

## Plan de implementacion

1. **Cerrar el contrato de datos y la matriz pagina/API.** Inventariar cada ruta de frontend, documentar los DTOs existentes y definir los campos que reemplazan a cada fixture.
2. **Completar la persistencia canonica de proveedor.** Resolver identidad entre organizaciones reales y directorio de riesgo; conservar acuerdos, onboarding e historial al migrar datos.
3. **Eliminar la divergencia de certificados.** Unificar lectura y escritura en backend y probar persistencia tras reinicio.
4. **Completar el espacio del proveedor.** Exponer datos persistidos de contratos/acuerdos, vehiculos, onboarding, certificados, productos y energia; consumirlos en sus paginas.
5. **Implementar admin dashboard y contratos.** Crear agregaciones y operaciones de acuerdos sobre la misma fuente canonica.
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
