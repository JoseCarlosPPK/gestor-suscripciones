# Gestor de Suscripciones

Herramienta CLI en TypeScript para gestionar gastos recurrentes y recibir alertas de renovación. Permite registrar suscripciones (con nombre, importe, moneda, frecuencia y estado), calcular el gasto mensual/anual normalizado, detectar próximos cobros y exportar informes en consola, JSON o CSV. Los datos persisten en un archivo JSON local.

---

## Requisitos previos

| Herramienta | Versión mínima | Notas |
|-------------|---------------|-------|
| **Node.js** | 22.0.0 (usado con 26.13.1) | Incluye `npm` y el test runner nativo `node --test` |
| **npm** | 12.x | Incluido con Node.js 26.x |
| **git** | cualquier reciente | Para gestión de ramas y commits |
| **gh** (GitHub CLI) | 2.x | Para crear issues y PRs desde terminal; instalar con `sudo apt install gh` o desde [cli.github.com](https://cli.github.com) |

> **TypeScript** no requiere instalación global: se instala como dependencia de desarrollo con `npm install`.

---

## Puesta en marcha

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd gestor-suscripciones

# 2. Instalar dependencias (solo TypeScript como devDependency)
npm install

# 3. Compilar
npm run build

# 4. Ejecutar la CLI
npm start -- <comando> [opciones]
```

---

## Scripts disponibles

| Script | Comando | Descripción |
|--------|---------|-------------|
| `build` | `npm run build` | Compila `src/` → `dist/` y `tests/` → `dist-tests/` con TypeScript estricto |
| `start` | `npm start` | Ejecuta la CLI desde el código compilado (`dist/cli/index.js`) |
| `test` | `npm test` | Compila y lanza toda la suite de tests con `node --test` |

---

## Uso de la CLI

Una vez compilado, todos los comandos siguen la forma:

```bash
node dist/cli/index.js <comando> [opciones]
# o bien:
npm start -- <comando> [opciones]
```

| Comando | Descripción | Ejemplo |
|---------|-------------|---------|
| `add` | Añade una nueva suscripción | `npm start -- add --name Netflix --amount 15.99 --currency EUR --startDate 2024-01-15 --frequency mensual --status activa` |
| `edit` | Edita campos de una suscripción existente | `npm start -- edit --id <uuid> --amount 17.99` |
| `delete` | Elimina una suscripción | `npm start -- delete --id <uuid>` |
| `list` | Lista todas las suscripciones (opcional: `--status activa\|pausada`) | `npm start -- list` |
| `summary` | Muestra el gasto normalizado mensual y proyectado anual | `npm start -- summary` |
| `alerts` | Muestra suscripciones con cobro próximo (por defecto 7 días) | `npm start -- alerts --days 14` |
| `export` | Exporta el informe (`consola`, `json` o `csv`) | `npm start -- export --format csv` |

Los errores se muestran en `stderr` con el formato `Error [CÓDIGO]: mensaje` y el proceso termina con código de salida `1`. Usa `--debug` para ver el contexto interno del error.

---

## Almacén de datos

Las suscripciones se guardan en `data/subscriptions.json` (creado automáticamente en la primera escritura):

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

Este archivo **no se sube a git** (está en `.gitignore`). Las escrituras son atómicas: se usa un archivo temporal `.tmp` que se renombra para evitar estados parciales.

---

## Documentación del proyecto (`.kiro/`)

El proyecto usa [Kiro](https://kiro.dev) como entorno de desarrollo. La carpeta `.kiro/` contiene toda la documentación estructurada:

### [`steering/conventions.md`](.kiro/steering/conventions.md)
Reglas del proyecto que Kiro aplica en cada sesión de forma automática: stack y versiones, validación, persistencia, idioma (documentación en español, código en inglés), TSDoc, flujo Git y ciclo TDD de tres agentes.

### [`specs/gestor-suscripciones/requirements.md`](.kiro/specs/gestor-suscripciones/requirements.md)
Especificación funcional completa. Define los 7 requisitos (alta, edición, baja, cálculo, alertas, persistencia y exportación) como historias de usuario con criterios de aceptación en formato WHEN/IF/THEN y propiedades para property-based testing.

### [`specs/gestor-suscripciones/design.md`](.kiro/specs/gestor-suscripciones/design.md)
Documento de diseño técnico. Describe la arquitectura en tres capas (dominio puro / persistencia / CLI), las interfaces de cada módulo con firmas TypeScript, el modelo de datos, el flujo de errores (`AppError`), la estrategia de testing y el flujo Git por requisito.

### [`specs/gestor-suscripciones/tasks.md`](.kiro/specs/gestor-suscripciones/tasks.md)
Plan de implementación detallado. Lista todas las tareas en orden, con dependencias, el rol que las ejecuta (Test Agent → Developer Agent → QA Agent), los commits esperados y los requisitos que satisface cada tarea. Es el documento de seguimiento del progreso.

---

## Flujo de desarrollo

El proyecto sigue un ciclo TDD estricto con tres roles por cada requisito:

1. **Test Agent** — escribe los tests antes de que exista implementación (fase roja).
2. **Developer Agent** — implementa el código hasta que todos los tests pasan (fase verde).
3. **QA Agent** — valida la suite completa y actualiza la documentación.

Cada requisito vive en su propia rama `dev_<nombre>` y termina con una Pull Request contra `main`. Los commits siguen la convención `feat:`, `test:`, `fix:`, `chore:`. Nunca se hace commit ni merge directo en `main`.

---

## Estructura del proyecto

```
gestor-suscripciones/
├── src/
│   ├── domain/         # Lógica pura: tipos, validación, CRUD, cálculos, alertas, exportación
│   ├── storage/        # Lectura y escritura atómica de subscriptions.json
│   ├── cli/            # Punto de entrada y enrutamiento de comandos
│   └── errors/         # AppError con códigos tipados
├── tests/
│   ├── domain/         # Tests unitarios y de propiedad del dominio
│   └── storage/        # Tests con mocks de disco (node:fs/promises)
├── data/               # subscriptions.json (generado en runtime, en .gitignore)
├── .kiro/              # Documentación y configuración de Kiro
├── package.json
├── tsconfig.json
└── tsconfig.test.json
```
