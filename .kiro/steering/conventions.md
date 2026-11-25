# Convenciones del proyecto

## Stack y versiones
- Usa la **última versión estable de TypeScript** disponible en npm (evita versiones beta/nightly salvo que se pida explícitamente) sobre **Node.js v26.13.1 (npm v12.2.3)**.
- Mantén `strict: true` habilitado en `tsconfig.json`.
- Evita `any`; modela dominios, estados y frecuencias con tipos explícitos (`"mensual" | "trimestral" | "anual"`, `"activa" | "pausada"`).
- Separa la lógica de negocio (cálculo de gasto normalizado, próxima fecha de cobro, ventana de alerta y exportación) en funciones puras y modulares, separadas de la entrada/salida (CLI o archivo).

## Validación y manejo de errores
- Valida todas las entradas en los límites del sistema (alta, edición, lectura de archivo y parámetros de alerta).
- Rechaza importes menores o iguales a `0`, cadenas vacías, fechas inválidas o frecuencias/estados no soportados con errores descriptivos y tipados.
- Nunca silencies fallos de lectura/escritura de disco ni de parseo de datos.

## Persistencia y estructura
- Guarda los datos en un archivo local `subscriptions.json` de forma legible (JSON formateado) y segura ante escrituras.
- Incluye scripts claros en `package.json` para compilar/ejecutar y lanzar pruebas automatizadas.
- Mantén el código limpio, autocontenido y fácil de probar unitariamente.

## Idioma del proyecto
- Redacta toda la documentación (especificaciones, README, comentarios técnicos extensos y explicaciones) en **español**.
- Escribe todo el código en **inglés**: nombres de variables, funciones, clases, interfaces, tipos, archivos de código, pruebas y mensajes internos del código.
- Si hay textos visibles para el usuario final o salidas de CLI en español, mantén la lógica interna y los identificadores en inglés.


## Código y documentación TSDoc
- Documenta por defecto todas las funciones, clases, interfaces y tipos relevantes usando comentarios en formato **TSDoc / JSDoc** (`/** ... */`), indicando su propósito, parámetros y valor de retorno cuando aporte claridad.
- Mantén la documentación técnica y archivos `.md` en **español**, y el código, identificadores, comentarios TSDoc y mensajes de commit en **inglés**.

## Git y GitHub
- Los mensajes de commit deben escribirse en **inglés**, siguiendo un formato claro como `feat: ...`, `test: ...`, `fix: ...` o `chore: ...`.
- Trabaja con **commits atómicos**: cada commit debe representar un cambio pequeño, coherente y autocontenido.
- Para cada requisito, crea y cambia a una rama de desarrollo usando `git checkout -b dev_<nombre_requisito_resumido>` (por ejemplo, `dev_crud_subscriptions` o `dev_normalized_billing`).
- Está permitido hacer `push` de la rama de desarrollo usando explícitamente `git push -u origin <mismo_nombre_rama_local>`.
- **Prohibido** hacer commits directamente en `main` o hacer `merge` hacia `main`.
- Al terminar un requisito, puedes abrir una Pull Request (PR) contra `main` que incluya:
  1. Descripción de lo que resuelve el requisito.
  2. Una *checklist* con los criterios/tareas completados, marcando explícitamente lo que se ha realizado.
- Mantén un `.gitignore` adecuado para TypeScript/Node (`node_modules/`, `dist/`, archivos temporales) y no subas datos sensibles ni archivos de estado residuales de pruebas.

## Flujo de pruebas (TDD), actualización documental y roles de agentes
- Usa el test runner nativo de Node.js (`node --test`, disponible en Node.js LTS) para escribir y ejecutar pruebas sin dependencias externas innecesarias.
- Antes de codificar un requisito, sigue este ciclo estricto con tres roles/agentes:
  1. **Agente de pruebas (*Test Agent*):** crea los tests del requisito antes de que exista su implementación. Debe cubrir las funciones de cálculo (totales mensuales/anuales, próxima fecha de cobro, alertas) y las operaciones de alta (creación), edición (actualización) y borrado (eliminación) de suscripciones, además de casos inválidos. Al ejecutar estos tests por primera vez, **todos deben fallar** porque el código aún no está implementado.
  2. **Agente de desarrollo (*Developer Agent*):** implementa el código del requisito en la rama `dev_<nombre_requisito_resumido>` (documentando las funciones con TSDoc) para resolver las tareas y hacer que se cumpla la especificación.
  3. **Agente de validación/QA (*Test Runner / QA Agent*):** ejecuta la suite de tests correspondiente al requisito y emite un informe rápido indicando:
     - Si los tests pasaron o no.
     - Qué tests específicos fallaron (si los hay) y el motivo breve.
     - Si algún test falla, devuelve el control al **Agente de desarrollo** para que corrija el problema y repita el ciclo de ejecución de tests hasta que todos pasen.
     - **Cuando todos los tests pasen:** actualiza la documentación necesaria (archivos `.md` relevantes, como especificaciones, README o guías de uso) para reflejar el estado real del requisito.