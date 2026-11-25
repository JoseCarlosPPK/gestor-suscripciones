# Implementation Plan: Gestor de suscripciones

## Overview

Plan de implementación del gestor local de gastos recurrentes y alertas de renovación en TypeScript estricto sobre Node.js v26.13.1, con tests nativos de `node --test`. Cada requisito funcional sigue el flujo TDD de tres agentes (Test Agent → Developer Agent → QA Agent) sobre su propia rama `dev_<nombre_requisito_resumido>`, con commits atómicos en inglés (`feat:`, `test:`, `fix:`, `chore:`) y prohibición explícita de commits o merges directos en `main`.

El orden de ejecución es: infraestructura → alta (REQ-1) → edición (REQ-2) → baja (REQ-3) → cálculo (REQ-4) → alertas (REQ-5) → persistencia completa (REQ-6) → exportación (REQ-7) → CLI → PRs y documentación. El framework de pruebas es `node --test` nativo; los property tests usan generadores aleatorios propios inline (sin fast-check, sin vitest, sin jest).

## Tasks

- [x] 1. Infraestructura inicial del proyecto
  - [x] 1.1 Crear estructura de proyecto, `package.json` y `tsconfig.json`
    - Crear `src/domain/`, `src/storage/`, `src/cli/`, `src/errors/`, `tests/domain/`, `tests/storage/`, `data/`
    - `package.json` con scripts: `build` (tsc), `start` (node dist/cli/index.js), `test` (node --test)
    - `tsconfig.json` con `strict: true`, `target: ES2022`, `module: Node16`, `outDir: dist`, `rootDir: src`
    - Actualizar `.gitignore`: `node_modules/`, `dist/`, `*.tmp`, `data/subscriptions.json`
    - Instalar `typescript` como dependencia de desarrollo
    - _Requirements: 6.2 (formato legible del almacén), Convenciones (stack y scripts)_
  - [x] 1.2 Implementar tipos del dominio (`src/domain/types.ts`)
    - Definir `Frequency`, `SubscriptionStatus`, `ExportFormat`, `Subscription`, `CreateSubscriptionInput`, `UpdateSubscriptionInput`, `SpendingSummary`, `AlertWindow`, `ExportResult` según el design doc
    - Documentar todos los tipos con TSDoc en inglés
    - _Requirements: Modelo de entidades (Glossary), 1.1_
  - [x] 1.3 Implementar `AppError` (`src/errors/AppError.ts`)
    - Clase `AppError extends Error` con `ErrorCode` tipado (los 10 códigos del design), mensaje en español y `context` opcional
    - TSDoc completo
    - _Requirements: 1.3–1.9, 2.2, 3.2, 6.4–6.7 (errores descriptivos y tipados)_
  - [x] 1.4 Configurar el runner de tests
    - Añadir configuración para que `node --test` ejecute `tests/**/*.test.ts` (o JS compilado según estrategia)
    - Crear un test de humo mínimo que verifique el runner
    - _Requirements: Estrategia de testing (design)_

- [x] 2. Checkpoint - Infraestructura compilable y testeable
  - `npm run build` compila sin errores; el test de humo pasa.
  - Commit: `chore: set up project skeleton, types and error class`.
  - Rama: `dev_infraestructura` → abrir PR contra `main`.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. REQ-1: Alta de suscripciones (rama `dev_crud_subscriptions` — alta)
  - [x] 3.1 Test Agent: escribir tests en rojo para validadores y creación
    - Tests unitarios de `validateName`, `validateAmount`, `validateCurrency`, `validateStartDate`, `validateFrequency`, `validateStatus` (casos vacíos, `0`, `Infinity`, `NaN`, fechas inválidas como `2024-02-30`, valores fuera de dominio)
    - Tests de `validateCreateInput` con campo ausente por cada posición
    - Tests de `createSubscription`: entrada válida devuelve `created` con UUID v4 y lista ampliada; id no colisiona con existentes
    - Al ejecutar por primera vez, todos deben fallar (fase roja)
    - Commit: `test: add red tests for subscription creation and validation`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_
  - [x] 3.2 Property test: unicidad de IDs generados
    - **Property 1: Unicidad de IDs generados**
    - Generador propio inline de entradas válidas; mínimo 100 iteraciones: crear N suscripciones secuencialmente y verificar todos los ids distintos y sin colisión con ids preexistentes
    - **Validates: Requirements 1.1, 1.2**
  - [x] 3.3 Property test: rechazo exhaustivo de inputs inválidos
    - **Property 2: Rechazo de inputs inválidos en creación**
    - Generador propio inline que corrompe al menos un campo por iteración; mínimo 100 iteraciones: `createSubscription` lanza `AppError` con `VALIDATION_ERROR` y la lista queda sin cambios
    - **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**
  - [x] 3.4 Developer Agent: implementar validadores (`src/domain/validation.ts`)
    - Funciones puras con asserts tipados según la tabla del design (regex `YYYY-MM-DD` + `new Date(v)` válido, `isFinite`, `> 0`, trim no vacío, valores literales permitidos)
    - `validateCreateInput` valida campos obligatorios y lanza `AppError` con el campo faltante identificado
    - TSDoc en inglés
    - _Requirements: 1.3–1.9_
  - [x] 3.5 Developer Agent: implementar `createSubscription` (`src/domain/subscriptions.ts`)
    - Generar id con `crypto.randomUUID()`, verificar no colisión con existentes (`DUPLICATE_ID` defensivo), construir suscripción y devolver `{ updated, created }`
    - TSDoc en inglés
    - _Requirements: 1.1, 1.2_
  - [x] 3.6 Developer Agent: implementar escritura de `writeSubscriptions` (`src/storage/fileStorage.ts`)
    - Escritura atómica: `subscriptions.json.tmp` + `fs.rename()`; indentación 2 espacios; errores de disco → `AppError IO_WRITE_ERROR` con el error original como contexto; limpieza del temporal en fallo
    - TSDoc en inglés
    - _Requirements: 6.2, 6.7_
  - [x] 3.7 QA Agent: ejecutar suite, corregir y actualizar documentación
    - Ejecutar `npm test`; si hay fallos, volver a 3.4–3.5 (ciclo Developer/QA hasta verde)
    - Añadir tests de ejemplo de `writeSubscriptions` con mocks de `node:fs/promises` (`mock.method`)
    - Commit: `feat: add subscription creation with validation and atomic persistence`
    - _Requirements: 1.1–1.9, 6.2, 6.7_

- [x] 4. Checkpoint - REQ-1 completo
  - Todos los tests (unit, property, storage mock) pasan.
  - PR de `dev_crud_subscriptions` con checklist de criterios REQ-1.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. REQ-2: Edición de suscripciones (rama `dev_edicion_suscripciones`)
  - [x] 5.1 Test Agent: escribir tests en rojo para `updateSubscription` y `validateUpdateInput`
    - Id no existente → `NOT_FOUND`
    - Actualización parcial modifica solo los campos dados y conserva el resto
    - Campo inválido → error y lista original intacta (atomicidad)
    - Presencia de `id` en el input → `FORBIDDEN_FIELD`
    - Idempotencia: editar con los mismos valores no cambia el estado
    - Commit: `test: add red tests for subscription update`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 5.2 Property test: conservación de campos no modificados
    - **Property 3: Actualización parcial conserva campos no modificados**
    - Generador propio inline de subconjuntos de campos válidos; mínimo 100 iteraciones
    - **Validates: Requirements 2.1**
  - [x] 5.3 Property test: atomicidad de la edición
    - **Property 4: Atomicidad de la edición**
    - Generador propio inline que mezcla campos válidos con al menos uno inválido; mínimo 100 iteraciones verificando estado idéntico tras el fallo
    - **Validates: Requirements 2.3, 2.4**
  - [x] 5.4 Developer Agent: implementar `updateSubscription` y `validateUpdateInput`
    - `validateUpdateInput`: valida solo los campos presentes; rechaza `id` con `FORBIDDEN_FIELD`
    - `updateSubscription`: busca por id (`NOT_FOUND`), aplica cambios parcialmente, operando de forma atómica (validar todo antes de mutar)
    - TSDoc en inglés
    - _Requirements: 2.1–2.5_
  - [x] 5.5 QA Agent: ejecutar suite, corregir y actualizar documentación
    - Ciclo Developer/QA hasta verde; commit: `feat: add atomic subscription update`
    - PR de `dev_edicion_suscripciones` con checklist REQ-2
    - _Requirements: 2.1–2.5_

- [x] 6. Checkpoint - REQ-2 completo
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. REQ-3: Baja de suscripciones (rama `dev_baja_suscripciones`)
  - [ ] 7.1 Test Agent: escribir tests en rojo para `deleteSubscription`
    - Id existente → eliminada de la lista y confirmación
    - Id inexistente → `NOT_FOUND`
    - La eliminación reduce el tamaño exactamente en 1 y no altera el resto
    - Commit: `test: add red tests for subscription deletion`
    - _Requirements: 3.1, 3.2_
  - [ ] 7.2 Property test: eliminación verificable
    - **Property 5: Eliminación verificable**
    - Generador propio inline de conjuntos de suscripciones; mínimo 100 iteraciones: tras eliminar, ninguna consulta con ese id lo encuentra
    - **Validates: Requirements 3.1, 3.2**
  - [ ] 7.3 Developer Agent: implementar `deleteSubscription` y `findById`
    - `findById` lanza `NOT_FOUND` si no existe; `deleteSubscription` filtra por id y devuelve `{ updated }`
    - Integrar con `writeSubscriptions` en el nivel CLI/llamador para persistir el nuevo estado
    - TSDoc en inglés
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 7.4 QA Agent: ejecutar suite, corregir y actualizar documentación
    - Ciclo Developer/QA hasta verde; commit: `feat: add subscription deletion with persistence`
    - PR de `dev_baja_suscripciones` con checklist REQ-3
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 8. Checkpoint - REQ-3 completo
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. REQ-4: Cálculo de gasto normalizado (rama `dev_normalized_billing`)
  - [ ] 9.1 Test Agent: escribir tests en rojo para `calculations.ts`
    - `computeMonthlyNormalized`: mensual/1, trimestral/3, anual/12; mezcla de frecuencias
    - Exclusión de pausadas; todas pausadas → 0; lista vacía → 0
    - `computeAnnualProjected` = mensual × 12
    - `computeSpendingSummary` devuelve ambos valores
    - Commit: `test: add red tests for normalized spending calculations`
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [ ] 9.2 Property test: relación mensual/anual
    - **Property 6: Relación mensual / anual**
    - Generador propio inline de conjuntos mixtos; mínimo 100 iteraciones: anual = mensual × 12
    - **Validates: Requirements 4.1, 4.2**
  - [ ] 9.3 Property test: exclusión de pausadas y no negatividad
    - **Property 7: Exclusión de suscripciones pausadas en cálculos**
    - Todas pausadas → 0; modificar `amount` de una pausada en conjunto mixto no altera el resumen; totales ≥ 0 con `amount > 0`
    - **Validates: Requirements 4.3, 4.4**
  - [ ] 9.4 Developer Agent: implementar `calculations.ts`
    - `FREQUENCY_FACTOR` map, `computeMonthlyNormalized`, `computeAnnualProjected`, `computeSpendingSummary` como funciones puras
    - TSDoc en inglés
    - _Requirements: 4.1–4.4_
  - [ ] 9.5 QA Agent: ejecutar suite, corregir y actualizar documentación
    - Ciclo Developer/QA hasta verde; commit: `feat: add normalized monthly and annual spending calculation`
    - PR de `dev_normalized_billing` con checklist REQ-4
    - _Requirements: 4.1–4.4_

- [ ] 10. Checkpoint - REQ-4 completo
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. REQ-5: Próximo cobro y ventana de alerta (rama `dev_alerts`)
  - [ ] 11.1 Test Agent: escribir tests en rojo para `alerts.ts`
    - `computeNextChargeDate`: `startDate >= referenceDate` → `startDate`; avance en incrementos exactos de 1/3/12 meses; resultado siempre ≥ `referenceDate`
    - `getAlertWindow`: N=0 devuelve solo cobros del día exacto; N por defecto = 7; extremos inclusive; `horizonDays < 0` → `VALIDATION_ERROR`; pausadas excluidas
    - Casos límite: fin de mes (31 de enero → mensual), años bisiestos (29/02)
    - Commit: `test: add red tests for next charge date and alert window`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ] 11.2 Property test: corrección del próximo cobro
    - **Property 8: Corrección del próximo cobro**
    - Generador propio inline de pares (startDate, referenceDate); mínimo 100 iteraciones: fecha ≥ referenceDate y alcanzable en k incrementos exactos de frecuencia
    - **Validates: Requirements 5.1**
  - [ ] 11.3 Property test: completitud e integridad de la ventana
    - **Property 9: Completitud e integridad de la ventana de alerta**
    - Generador propio inline de conjuntos y horizontes ≥ 0; mínimo 100 iteraciones: exactitud del conjunto devuelto y exclusión de pausadas
    - **Validates: Requirements 5.2, 5.5**
  - [ ] 11.4 Developer Agent: implementar `alerts.ts`
    - Algoritmo del design: fechas UTC sin hora, periodos enteros por diferencia de meses, `ceil` de incrementos, ajuste final si queda corto
    - `getAlertWindow` con `horizonDays` por defecto 7 y validación de negativos
    - TSDoc en inglés
    - _Requirements: 5.1–5.5_
  - [ ] 11.5 QA Agent: ejecutar suite, corregir y actualizar documentación
    - Ciclo Developer/QA hasta verde; commit: `feat: add next charge date and alert window`
    - PR de `dev_alerts` con checklist REQ-5
    - _Requirements: 5.1–5.5_

- [ ] 12. Checkpoint - REQ-5 completo
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. REQ-6: Persistencia y validación del almacén (rama `dev_persistence`)
  - [ ] 13.1 Test Agent: escribir tests en rojo para `readSubscriptions`
    - Archivo inexistente → `[]` sin error (`FILE_NOT_FOUND` interno, no propagado)
    - JSON inválido → `FILE_CORRUPT` (no inicializa silenciosamente)
    - JSON válido con esquema incorrecto (campos faltantes, tipos erróneos, valores fuera de dominio) → `SCHEMA_MISMATCH` identificando la inconsistencia
    - Error de disco en lectura → `IO_READ_ERROR` con error original como contexto
    - Uso de mocks de `node:fs/promises` (`mock.method`)
    - Commit: `test: add red tests for data store read and schema validation`
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6_
  - [ ] 13.2 Property test: serialización con indentación correcta
    - **Property 10: Serialización JSON con indentación correcta**
    - Generador propio inline de listas válidas; mínimo 100 iteraciones: round-trip `JSON.stringify/parse` estructuralmente equivalente e indentación de 2 espacios
    - **Validates: Requirements 6.2**
  - [ ] 13.3 Property test: rechazo de JSON corrupto o con esquema incorrecto
    - **Property 11: Rechazo de JSON corrupto o con esquema incorrecto**
    - Generador propio inline de strings no-JSON y JSON sin esquema válido; mínimo 100 iteraciones verificando `FILE_CORRUPT` / `SCHEMA_MISMATCH`
    - **Validates: Requirements 6.4, 6.5**
  - [ ] 13.4 Developer Agent: implementar `readSubscriptions` con validación de esquema
    - `readFile` con manejo de `ENOENT` → `[]`; `JSON.parse` con try/catch → `FILE_CORRUPT`; validación de cada elemento contra el esquema `Subscription` (reutilizando los validadores de `validation.ts`) → `SCHEMA_MISMATCH`; envoltorio de errores de disco → `IO_READ_ERROR`
    - TSDoc en inglés
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6_
  - [ ] 13.5 Developer Agent: completar escritura atómica con manejo de errores
    - Añadir test de ejemplo de fallo de escritura de disco → `IO_WRITE_ERROR` y archivo no queda parcial; reutilizar `writeSubscriptions` del REQ-1 extendido
    - _Requirements: 6.7_
  - [ ] 13.6 QA Agent: ejecutar suite, corregir y actualizar documentación
    - Ciclo Developer/QA hasta verde; commit: `feat: add validated data store read with atomic write`
    - PR de `dev_persistence` con checklist REQ-6
    - _Requirements: 6.1–6.7_

- [ ] 14. Checkpoint - REQ-6 completo
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. REQ-7: Exportación de informes (rama `dev_export`)
  - [ ] 15.1 Test Agent: escribir tests en rojo para `export.ts`
    - Formato `"consola"`: nombre, próxima fecha, importe y moneda de cada activa + línea de totales
    - Formato `"json"`: objeto con las activas y los totales de `computeSpendingSummary`
    - Formato `"csv"`: cabecera, una fila por activa, fila de totales final
    - Formato desconocido → `UNSUPPORTED_FORMAT` listando los formatos soportados
    - Pausadas nunca incluidas en ningún formato
    - Commit: `test: add red tests for report export`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [ ] 15.2 Property test: completitud de las exportaciones
    - **Property 12: Completitud de las exportaciones**
    - Generador propio inline de N activas y M pausadas; mínimo 100 iteraciones: cardinalidad CSV = N, contenido JSON/consola = N activas, totales correctos, cero pausadas
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5**
  - [ ] 15.3 Developer Agent: implementar `generateExport`
    - Tres formatos según el design (CSV con cabecera `id,name,amount,currency,startDate,frequency,nextCharge` y fila `TOTAL,,monthlyNormalized,annualProjected,,`); integración con `computeSpendingSummary` y `computeNextChargeDate`
    - TSDoc en inglés
    - _Requirements: 7.1–7.5_
  - [ ] 15.4 QA Agent: ejecutar suite, corregir y actualizar documentación
    - Ciclo Developer/QA hasta verde; commit: `feat: add console, json and csv report export`
    - PR de `dev_export` con checklist REQ-7
    - _Requirements: 7.1–7.5_

- [ ] 16. Checkpoint - REQ-7 completo
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 17. CLI: punto de entrada con todos los comandos (rama `dev_cli`)
  - [ ] 17.1 Test Agent: escribir tests en rojo para el enrutamiento de la CLI
    - Tests de parseo de argumentos por comando (`add`, `edit`, `delete`, `list`, `summary`, `alerts`, `export`)
    - Tests de integración por comando invocando la CLI con mocks de `readSubscriptions`/`writeSubscriptions`: add persiste y muestra la creada; edit/delete persisten; summary muestra totales; alerts aplica N por defecto y `--days` opcional; export con `--format consola|json|csv`
    - Error de dominio → stderr con formato `Error [CODE]: mensaje` y código de salida 1; éxito → 0
    - Commit: `test: add red tests for CLI command routing`
    - _Requirements: 1.1–1.9, 2.1–2.5, 3.1–3.3, 4.1–4.4, 5.1–5.5, 7.1–7.5_
  - [ ] 17.2 Developer Agent: implementar `src/cli/index.ts`
    - Enrutamiento por `process.argv`, sin lógica de negocio: parsear → `readSubscriptions(DATA_PATH)` → función de dominio → `writeSubscriptions` si hay cambio de estado → stdout/stderr con códigos de salida 0/1
    - Captura de `AppError` en el nivel más alto; flag `--debug` para mostrar `context`; nunca exponer stack traces
    - Comando `list` con filtro opcional por estado
    - TSDoc en inglés
    - _Requirements: Flujo de datos del design (Architecture), 6.1, 6.2_
  - [ ] 17.3 QA Agent: ejecutar suite completa y de integración, corregir y actualizar documentación
    - Ciclo Developer/QA hasta verde; commit: `feat: add CLI entry point with all commands`
    - PR de `dev_cli` con checklist de integración
    - _Requirements: Todos (integración end-to-end automatizada)_

- [ ] 18. Checkpoint - CLI completo
  - `npm run build` y `npm test` en verde; la CLI responde a los 7 comandos.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. PRs y documentación final
  - [ ] 19.1 Verificar y completar las Pull Requests de cada requisito
    - Revisar que cada rama `dev_*` tiene su PR contra `main` con descripción del requisito y checklist de criterios de aceptación marcados
    - Ningún commit ni merge directo en `main`
    - _Requirements: Git Workflow (design), Convenciones_
  - [ ] 19.2 Redactar README y guía de uso
    - README en español: instalación, scripts (`build`, `start`, `test`), comandos de la CLI con ejemplos, formato de `data/subscriptions.json`
    - Commit: `chore: add README and usage guide`
    - _Requirements: Convenciones (idioma del proyecto)_

- [ ] 20. Final checkpoint - Suite completa en verde
  - Ejecutar `npm run build && npm test`: compilación sin errores y todos los tests (unit, property, storage, CLI) pasan.
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tareas marcadas con `*` son opcionales (tests) y pueden omitirse para un MVP más rápido, aunque el flujo TDD de conventions.md recomienda escribirlas antes de la implementación
- Cada requisito se desarrolla en su rama `dev_<nombre_requisito_resumido>` siguiendo el ciclo de tres agentes: Test Agent (rojo) → Developer Agent (verde) → QA Agent (validación + docs)
- Framework de testing: `node --test` nativo de Node.js v26.13.1; los property tests usan generadores aleatorios propios inline, sin fast-check ni dependencias externas
- Commits atómicos en inglés con prefijos `feat:`, `test:`, `fix:`, `chore:`; prohibido commit/merge directo en `main`
- Cada tarea referencia los criterios de aceptación específicos de requirements.md para trazabilidad
- Los checkpoints validan incrementalmente antes de avanzar al siguiente requisito

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 3, "tasks": ["3.4", "3.5", "3.6"] },
    { "id": 4, "tasks": ["3.7"] },
    { "id": 5, "tasks": ["4"] },
    { "id": 6, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 7, "tasks": ["5.4"] },
    { "id": 8, "tasks": ["5.5"] },
    { "id": 9, "tasks": ["6"] },
    { "id": 10, "tasks": ["7.1", "7.2"] },
    { "id": 11, "tasks": ["7.3"] },
    { "id": 12, "tasks": ["7.4"] },
    { "id": 13, "tasks": ["8"] },
    { "id": 14, "tasks": ["9.1", "9.2", "9.3"] },
    { "id": 15, "tasks": ["9.4"] },
    { "id": 16, "tasks": ["9.5"] },
    { "id": 17, "tasks": ["10"] },
    { "id": 18, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 19, "tasks": ["11.4"] },
    { "id": 20, "tasks": ["11.5"] },
    { "id": 21, "tasks": ["12"] },
    { "id": 22, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 23, "tasks": ["13.4", "13.5"] },
    { "id": 24, "tasks": ["13.6"] },
    { "id": 25, "tasks": ["14"] },
    { "id": 26, "tasks": ["15.1", "15.2"] },
    { "id": 27, "tasks": ["15.3"] },
    { "id": 28, "tasks": ["15.4"] },
    { "id": 29, "tasks": ["16"] },
    { "id": 30, "tasks": ["17.1"] },
    { "id": 31, "tasks": ["17.2"] },
    { "id": 32, "tasks": ["17.3"] },
    { "id": 33, "tasks": ["18"] },
    { "id": 34, "tasks": ["19.1", "19.2"] },
    { "id": 35, "tasks": ["20"] }
  ]
}
```
