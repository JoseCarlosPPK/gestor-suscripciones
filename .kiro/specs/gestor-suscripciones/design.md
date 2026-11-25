# Design Document

## Overview

El gestor local de gastos recurrentes y alertas de renovación es una aplicación CLI en TypeScript estricto sobre Node.js v26.13.1. Permite registrar, editar y eliminar suscripciones periódicas; calcular el gasto mensual y anual normalizado; alertar sobre próximas renovaciones; y exportar informes en consola, JSON o CSV.

La arquitectura separa de forma estricta tres capas:

1. **Dominio / lógica pura** (`src/domain/`): funciones sin efectos secundarios que operan sobre tipos explícitos.
2. **Persistencia / I/O** (`src/storage/`): lectura y escritura atómica del archivo `data/subscriptions.json`.
3. **Interfaz CLI** (`src/cli/`): punto de entrada que conecta comandos con la capa de dominio y persistencia.

Esta separación garantiza que toda la lógica de negocio es testeable de forma unitaria sin tocar el disco ni el proceso.

### Convención TSDoc / JSDoc

Todas las funciones, interfaces y tipos exportados llevan comentario TSDoc (`/** ... */`) en **inglés**, indicando:

- `@param` — descripción de cada parámetro.
- `@returns` — descripción del valor de retorno.
- Propósito general en la primera línea del comentario.

Los archivos `.md` y los comentarios narrativos extensos se redactan en **español**.

---

## Architecture

```
gestor-suscripciones/
├── src/
│   ├── domain/
│   │   ├── types.ts            # Tipos explícitos del dominio
│   │   ├── validation.ts       # Validadores de campos (funciones puras)
│   │   ├── subscriptions.ts    # CRUD sobre la lista en memoria
│   │   ├── calculations.ts     # Cálculo de gasto normalizado y proyectado
│   │   ├── alerts.ts           # Próximo cobro y ventana de alerta
│   │   └── export.ts           # Generación de consola / JSON / CSV
│   ├── storage/
│   │   └── fileStorage.ts      # Lectura y escritura de subscriptions.json
│   ├── cli/
│   │   └── index.ts            # Punto de entrada y enrutamiento de comandos
│   └── errors/
│       └── AppError.ts         # Clase de error tipado con código e i18n
├── data/
│   └── subscriptions.json      # Almacén de datos (creado en primera escritura)
├── tests/
│   ├── domain/                 # Tests unitarios y de propiedad para el dominio
│   └── storage/                # Tests con mocks de disco para la capa de persistencia
├── package.json
└── tsconfig.json
```

**Flujo de datos en una operación de escritura:**

```
CLI (process.argv)
  → parsear argumentos
  → readSubscriptions(DATA_PATH)        [I/O]
  → función de dominio(lista, input)     [pura]
  → writeSubscriptions(DATA_PATH, lista) [I/O]
  → stdout / stderr
```

**Generación de UUID v4:** Se utiliza el módulo nativo `node:crypto` (`crypto.randomUUID()`) para generar ids sin dependencias externas.

---

## Components and Interfaces

### AppError (`src/errors/AppError.ts`)

Todos los errores del sistema se lanzan como instancias de `AppError`. Nunca se propagan strings ni `Error` genéricos desde el dominio.

```typescript
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_ID"
  | "FILE_NOT_FOUND"
  | "FILE_CORRUPT"
  | "SCHEMA_MISMATCH"
  | "IO_READ_ERROR"
  | "IO_WRITE_ERROR"
  | "UNSUPPORTED_FORMAT"
  | "FORBIDDEN_FIELD";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,           // Español, legible para el usuario
    public readonly context?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}
```

### Validation (`src/domain/validation.ts`)

Funciones puras que reciben un valor y devuelven `void` o lanzan `AppError`. Se invocan tanto en creación como en edición.

```typescript
export function validateName(value: unknown): asserts value is string;
export function validateAmount(value: unknown): asserts value is number;
export function validateCurrency(value: unknown): asserts value is string;
export function validateStartDate(value: unknown): asserts value is string;
export function validateFrequency(value: unknown): asserts value is Frequency;
export function validateStatus(value: unknown): asserts value is SubscriptionStatus;

/** Valida un objeto de creación completo; lanza en el primer campo inválido. */
export function validateCreateInput(input: unknown): asserts input is CreateSubscriptionInput;

/** Valida los campos presentes en una actualización parcial; lanza si alguno es inválido. */
export function validateUpdateInput(input: unknown): asserts input is UpdateSubscriptionInput;
```

Reglas de validación por campo:

| Campo       | Regla                                                               | Código de error    |
|-------------|---------------------------------------------------------------------|--------------------|
| `name`      | `typeof === "string"`, `trim().length >= 1`                         | `VALIDATION_ERROR` |
| `amount`    | `typeof === "number"`, `isFinite`, `> 0`                            | `VALIDATION_ERROR` |
| `currency`  | `typeof === "string"`, `trim().length >= 1`                         | `VALIDATION_ERROR` |
| `startDate` | Regex `/^\d{4}-\d{2}-\d{2}$/`, `new Date(v)` produce fecha válida  | `VALIDATION_ERROR` |
| `frequency` | Valor en `["mensual", "trimestral", "anual"]`                       | `VALIDATION_ERROR` |
| `status`    | Valor en `["activa", "pausada"]`                                    | `VALIDATION_ERROR` |
| `id` en update | Presencia del campo `id` → lanza con código `FORBIDDEN_FIELD`  | `FORBIDDEN_FIELD`  |

### Subscriptions CRUD (`src/domain/subscriptions.ts`)

Operaciones puras que reciben la lista actual de suscripciones y devuelven la lista modificada. No leen ni escriben disco.

```typescript
/**
 * Crea una nueva suscripción, valida la entrada y genera el id.
 * Lanza AppError si la validación falla.
 */
export function createSubscription(
  existing: Subscription[],
  input: CreateSubscriptionInput
): { updated: Subscription[]; created: Subscription };

/**
 * Actualiza los campos indicados de la suscripción con el id dado.
 * Operación atómica: si la validación falla, devuelve la lista sin cambios.
 * Lanza AppError si id no existe, se intenta actualizar el id, o algún campo es inválido.
 */
export function updateSubscription(
  existing: Subscription[],
  id: string,
  input: UpdateSubscriptionInput
): { updated: Subscription[]; subscription: Subscription };

/**
 * Elimina la suscripción con el id dado.
 * Lanza AppError NOT_FOUND si el id no existe.
 */
export function deleteSubscription(
  existing: Subscription[],
  id: string
): { updated: Subscription[] };

/** Devuelve la suscripción por id o lanza AppError NOT_FOUND. */
export function findById(existing: Subscription[], id: string): Subscription;
```

### Calculations (`src/domain/calculations.ts`)

```typescript
/** Mapa de frecuencia a su factor divisor para normalización mensual. */
const FREQUENCY_FACTOR: Record<Frequency, number> = {
  mensual: 1,
  trimestral: 3,
  anual: 12,
};

/** Calcula el gasto normalizado mensual sumando amount/factor para suscripciones activas. */
export function computeMonthlyNormalized(subscriptions: Subscription[]): number;

/** Calcula el gasto proyectado anual = monthlyNormalized * 12. */
export function computeAnnualProjected(subscriptions: Subscription[]): number;

/** Devuelve ambos totales en un único SpendingSummary. */
export function computeSpendingSummary(subscriptions: Subscription[]): SpendingSummary;
```

### Alerts (`src/domain/alerts.ts`)

```typescript
/**
 * Calcula la próxima fecha de cobro >= referenceDate avanzando
 * startDate en incrementos de la frecuencia correspondiente.
 * Devuelve string en formato YYYY-MM-DD.
 */
export function computeNextChargeDate(
  subscription: Subscription,
  referenceDate: string
): string;

/**
 * Devuelve las suscripciones activas cuyo próximo cobro cae en
 * [referenceDate, referenceDate + horizonDays] (ambos inclusive).
 * Lanza AppError VALIDATION_ERROR si horizonDays < 0.
 * El valor por defecto de horizonDays es 7.
 */
export function getAlertWindow(
  subscriptions: Subscription[],
  referenceDate: string,
  horizonDays?: number
): AlertWindow;
```

Algoritmo de próxima fecha de cobro:

1. Parsear `startDate` y `referenceDate` como fechas UTC (sin componente de hora).
2. Si `startDate >= referenceDate`, la próxima fecha es `startDate`.
3. Calcular el número de periodos enteros transcurridos desde `startDate` hasta `referenceDate` usando diferencia de meses.
4. Avanzar `startDate` en `ceil(periodos)` incrementos de frecuencia.
5. Si la fecha resultante < `referenceDate`, avanzar un periodo más.

### Export (`src/domain/export.ts`)

```typescript
/**
 * Genera el contenido de exportación en el formato indicado.
 * Lanza AppError UNSUPPORTED_FORMAT si el formato no es válido.
 */
export function generateExport(
  subscriptions: Subscription[],
  format: ExportFormat,
  referenceDate: string
): ExportResult;
```

Formatos soportados:

- `"consola"`: texto plano multilínea con nombre, próxima fecha, importe y moneda por suscripción activa, seguido de línea de totales.
- `"json"`: `JSON.stringify({ subscriptions: activas, summary }, null, 2)`.
- `"csv"`: cabecera `id,name,amount,currency,startDate,frequency,nextCharge` + una fila por suscripción activa + fila de totales `TOTAL,,monthlyNormalized,annualProjected,,`.

### File Storage (`src/storage/fileStorage.ts`)

```typescript
/**
 * Lee el archivo subscriptions.json y devuelve la lista validada.
 * - Si el archivo no existe, devuelve [].
 * - Si el JSON es inválido, lanza AppError FILE_CORRUPT.
 * - Si el esquema no cumple Subscription[], lanza AppError SCHEMA_MISMATCH.
 * - Si hay error de disco, lanza AppError IO_READ_ERROR.
 */
export async function readSubscriptions(filePath: string): Promise<Subscription[]>;

/**
 * Escribe la lista de suscripciones en subscriptions.json con indentación 2 espacios.
 * Escritura atómica: escribe en un archivo temporal y lo renombra para evitar estados parciales.
 * - Si hay error de disco, lanza AppError IO_WRITE_ERROR.
 */
export async function writeSubscriptions(
  filePath: string,
  subscriptions: Subscription[]
): Promise<void>;
```

Escritura atómica: se escribe primero en `subscriptions.json.tmp` y luego se renombra con `fs.rename()` para garantizar que el archivo nunca queda en estado parcial ante un fallo de escritura.

### CLI (`src/cli/index.ts`)

Punto de entrada que usa `process.argv` para enrutar comandos. No contiene lógica de negocio.

Comandos disponibles:

| Comando   | Descripción                                                 |
|-----------|-------------------------------------------------------------|
| `add`     | Añade una nueva suscripción                                 |
| `edit`    | Edita una suscripción existente                             |
| `delete`  | Elimina una suscripción                                     |
| `list`    | Lista todas las suscripciones                               |
| `summary` | Muestra el gasto normalizado y proyectado                   |
| `alerts`  | Muestra suscripciones próximas a renovarse                  |
| `export`  | Exporta el resumen en consola / json / csv                  |

Cada comando: (1) parsea argumentos, (2) llama a `readSubscriptions`, (3) invoca la función de dominio, (4) llama a `writeSubscriptions` si modifica estado, (5) muestra resultado por `stdout` o error por `stderr` y termina con código de salida adecuado (0 éxito, 1 error).

---

## Data Models

### Tipo `Subscription`

```typescript
export type Frequency = "mensual" | "trimestral" | "anual";
export type SubscriptionStatus = "activa" | "pausada";
export type ExportFormat = "consola" | "json" | "csv";

export interface Subscription {
  id: string;             // UUID v4, generado automáticamente con crypto.randomUUID()
  name: string;           // No vacío tras trim
  amount: number;         // > 0, finito
  currency: string;       // No vacío tras trim
  startDate: string;      // YYYY-MM-DD, fecha de calendario válida
  frequency: Frequency;
  status: SubscriptionStatus;
}
```

### Tipos de entrada

```typescript
/** Entrada para creación; id se genera internamente. */
export type CreateSubscriptionInput = Omit<Subscription, "id">;

/** Entrada para edición; solo los campos a modificar (sin id). */
export type UpdateSubscriptionInput = Partial<Omit<Subscription, "id">>;
```

### Tipos de salida

```typescript
export interface SpendingSummary {
  monthlyNormalized: number;  // Suma amount/factor de activas
  annualProjected: number;    // monthlyNormalized * 12
}

export interface AlertWindow {
  referenceDate: string;         // YYYY-MM-DD
  horizonDays: number;           // >= 0, default 7
  subscriptions: Subscription[]; // Solo activas dentro de la ventana
}

export interface ExportResult {
  format: ExportFormat;
  content: string;               // Texto plano (consola/csv) o JSON serializado
}
```

### Formato en disco (`data/subscriptions.json`)

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Netflix",
    "amount": 15.99,
    "currency": "EUR",
    "startDate": "2024-01-15",
    "frequency": "mensual",
    "status": "activa"
  }
]
```

El archivo es un array JSON plano con indentación de 2 espacios. Nunca se envuelve en un objeto de nivel superior.

### Configuración de TypeScript y scripts

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "noImplicitAny": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  }
}
```

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/cli/index.js",
    "dev": "ts-node src/cli/index.ts",
    "test": "node --test",
    "test:watch": "node --test --watch"
  }
}
```

---

## Error Handling

Todos los errores del dominio fluyen como `AppError`. La CLI los captura en el nivel más alto, formatea el mensaje en español y termina con código de salida 1.

```
Flujo de error:
  CLI → dominio → lanza AppError(code, mensajeEspañol, contexto)
       ↑ captura en CLI
       → stderr: "Error [VALIDATION_ERROR]: El nombre no puede estar vacío."
       → process.exit(1)
```

Nunca se exponen stack traces al usuario final. El campo `context` de `AppError` queda disponible para logging interno si se activa un flag `--debug`.

| Situación                                       | Código de error      | Acción                                              |
|-------------------------------------------------|----------------------|-----------------------------------------------------|
| Campo de entrada inválido                       | `VALIDATION_ERROR`   | Lanza AppError con campo y restricción incumplida   |
| ID no encontrado                                | `NOT_FOUND`          | Lanza AppError con el id buscado como contexto      |
| Intento de modificar el campo `id`              | `FORBIDDEN_FIELD`    | Lanza AppError indicando que el id es inmutable     |
| Archivo inexistente en lectura                  | `FILE_NOT_FOUND`     | Devuelve lista vacía `[]` sin error                 |
| Archivo con JSON inválido                       | `FILE_CORRUPT`       | Lanza AppError; no inicializa silenciosamente       |
| JSON válido pero esquema incorrecto             | `SCHEMA_MISMATCH`    | Lanza AppError identificando la inconsistencia      |
| Error de disco en lectura                       | `IO_READ_ERROR`      | Propaga el error original como contexto             |
| Error de disco en escritura                     | `IO_WRITE_ERROR`     | Propaga el error; archivo temporal limpiado         |
| Formato de exportación no soportado             | `UNSUPPORTED_FORMAT` | Lanza AppError listando los formatos válidos        |

---

## Git Workflow

Cada requisito tiene su propia rama de desarrollo. Nunca se hace commit ni merge directamente en `main`.

**Nomenclatura de ramas:**

```
git checkout -b dev_<nombre_requisito_resumido>
```

Ejemplos: `dev_crud_subscriptions`, `dev_normalized_billing`, `dev_alerts`, `dev_persistence`, `dev_export`.

**Commits atómicos en inglés** siguiendo la convención:

| Prefijo   | Uso                                         |
|-----------|---------------------------------------------|
| `feat:`   | Nueva funcionalidad                         |
| `test:`   | Añadir o corregir tests                     |
| `fix:`    | Corrección de errores                       |
| `chore:`  | Tareas auxiliares (build, dependencias, CI) |

Cada commit representa un cambio pequeño, coherente y autocontenido.

**Pull Request al terminar el requisito:** abrir PR contra `main` con:
1. Descripción de lo que resuelve el requisito.
2. Checklist con los criterios de aceptación completados, marcados explícitamente.

**`.gitignore` mínimo requerido:**

```
node_modules/
dist/
*.tmp
subscriptions.json
```

No se sube `subscriptions.json` con datos reales ni archivos de estado residuales de pruebas.

---

## Testing Strategy

**Framework:** `node --test` nativo de Node.js v26.13.1. No se introduce ninguna dependencia externa de testing (ni Vitest, ni Jest, ni fast-check).

Para property-based testing se implementan **generadores propios inline** que producen instancias aleatorias de los tipos del dominio, o se utiliza una librería ligera compatible con `node:test` si existe y está disponible sin dependencias transitivas pesadas.

**Flujo TDD estricto — tres roles por requisito:**

1. **Test Agent** — escribe los tests *antes* de que exista la implementación. Al ejecutarlos por primera vez, **todos deben fallar** (fase roja). Cubre:
   - Funciones de cálculo (totales mensuales/anuales, próxima fecha de cobro, alertas).
   - Operaciones de escritura (creación, actualización, eliminación).
   - Casos de entrada inválida.

2. **Developer Agent** — implementa el código del requisito en la rama `dev_<nombre>`, documenta con TSDoc y hace que todos los tests pasen (fase verde).

3. **QA Agent** — ejecuta la suite completa y emite un informe indicando:
   - Tests pasados / fallidos.
   - Motivo breve de cada fallo.
   - Si alguno falla, devuelve el control al Developer Agent hasta que todos pasen.
   - Cuando todos pasan, actualiza la documentación relevante (`.md`, README).

**Estrategia dual:**

- **Tests de propiedad** (`tests/domain/`): verifican invariantes universales con generadores aleatorios propios. Cubren el dominio puro (validación, CRUD, cálculos, alertas, exportación). Mínimo 100 iteraciones por propiedad.
- **Tests de ejemplo** (`tests/domain/` y `tests/storage/`): verifican comportamientos específicos, casos límite y puntos de integración.

**Balance:**

- Las propiedades cubren el espacio de inputs amplio; los tests de ejemplo cubren comportamientos puntuales no capturables por propiedades universales (defaults, formatos de salida concretos, mensajes de error).
- La capa de persistencia se testa íntegramente con mocks de `node:fs/promises` usando los test doubles nativos de `node:test` (`mock.method`, `mock.module`).

---

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse para todas las ejecuciones válidas del sistema: una afirmación formal sobre qué debe hacer el sistema. Las propiedades son el puente entre las especificaciones legibles por humanos y las garantías de corrección verificables automáticamente.*

### Property 1: Unicidad de IDs generados

*Para cualquier* conjunto de N suscripciones creadas secuencialmente con entradas válidas, todos los `id` generados son distintos entre sí y no colisionan con ningún `id` preexistente en el almacén.

**Validates: Requirements 1.1, 1.2**

### Property 2: Rechazo de inputs inválidos en creación

*Para cualquier* objeto de entrada en el que al menos un campo viola sus restricciones (nombre vacío o solo espacios, importe ≤ 0 o no finito, moneda vacía, fecha con formato incorrecto o calendario inválido, frecuencia o estado fuera de los valores permitidos, o campo obligatorio ausente), `createSubscription` lanza un `AppError` con código `VALIDATION_ERROR` y no añade ningún elemento a la lista.

**Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**

### Property 3: Actualización parcial conserva campos no modificados

*Para cualquier* suscripción existente y cualquier subconjunto no vacío de campos válidos a actualizar (excluyendo `id`), los campos no incluidos en la actualización permanecen idénticos al valor original.

**Validates: Requirements 2.1**

### Property 4: Atomicidad de la edición

*Para cualquier* actualización que incluya al menos un campo con valor inválido, el estado de la suscripción después de intentar `updateSubscription` es bit a bit idéntico al estado anterior a la operación.

**Validates: Requirements 2.3, 2.4**

### Property 5: Eliminación verificable

*Para cualquier* suscripción existente con un `id` dado, tras ejecutar `deleteSubscription`, ninguna consulta posterior a la lista devuelve un elemento con ese mismo `id`.

**Validates: Requirements 3.1, 3.2**

### Property 6: Relación mensual / anual

*Para cualquier* conjunto de suscripciones (con cualquier combinación de estados y frecuencias), el gasto proyectado anual devuelto por `computeSpendingSummary` es siempre igual al gasto normalizado mensual multiplicado por 12.

**Validates: Requirements 4.1, 4.2**

### Property 7: Exclusión de suscripciones pausadas en cálculos

*Para cualquier* conjunto de suscripciones en que todas tienen `status === "pausada"`, ambos totales devueltos por `computeSpendingSummary` son 0. Además, para cualquier suscripción pausada en un conjunto mixto, modificar su `amount` no altera el resultado de `computeSpendingSummary`.

**Validates: Requirements 4.3, 4.4**

### Property 8: Corrección del próximo cobro

*Para cualquier* suscripción activa con una `startDate` y una `referenceDate` arbitrarias, la fecha devuelta por `computeNextChargeDate` es mayor o igual a `referenceDate` y es alcanzable avanzando `startDate` en exactamente k incrementos de la frecuencia correspondiente (con k ≥ 0 entero).

**Validates: Requirements 5.1**

### Property 9: Completitud e integridad de la ventana de alerta

*Para cualquier* conjunto de suscripciones y cualquier `horizonDays >= 0`, la función `getAlertWindow` devuelve exactamente el conjunto de suscripciones activas cuyo próximo cobro cae en `[referenceDate, referenceDate + horizonDays]`; no incluye ninguna suscripción pausada ni ninguna fuera de la ventana, y no omite ninguna que esté dentro.

**Validates: Requirements 5.2, 5.5**

### Property 10: Serialización JSON con indentación correcta

*Para cualquier* lista de suscripciones válidas, el resultado de serializar con `JSON.stringify(list, null, 2)` y luego parsear con `JSON.parse` produce un array estructuralmente equivalente al original, y el string serializado contiene indentación de exactamente 2 espacios.

**Validates: Requirements 6.2**

### Property 11: Rechazo de JSON corrupto o con esquema incorrecto

*Para cualquier* string que no sea JSON válido, `readSubscriptions` lanza `AppError` con código `FILE_CORRUPT`. *Para cualquier* JSON válido que no satisfaga el esquema de `Subscription[]` (campos faltantes, tipos incorrectos o valores fuera de los permitidos), `readSubscriptions` lanza `AppError` con código `SCHEMA_MISMATCH`.

**Validates: Requirements 6.4, 6.5**

### Property 12: Completitud de las exportaciones

*Para cualquier* conjunto de N suscripciones activas, `generateExport` cumple:
- Formato `"json"`: el objeto exportado contiene exactamente las N suscripciones activas y los totales `monthlyNormalized` y `annualProjected` calculados por `computeSpendingSummary`.
- Formato `"csv"`: el texto exportado contiene exactamente N filas de datos (sin contar la cabecera ni la fila de totales), y la fila de totales refleja los valores de `computeSpendingSummary`.
- Formato `"consola"`: el texto exportado contiene el nombre, próxima fecha de cobro, importe y moneda de cada una de las N suscripciones activas.
- Ningún formato incluye suscripciones con `status === "pausada"`.

**Validates: Requirements 7.1, 7.2, 7.3, 7.5**
