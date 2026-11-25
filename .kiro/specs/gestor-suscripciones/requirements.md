# Requirements Document

## Introduction

Este documento especifica los requisitos del **gestor local de gastos recurrentes y alertas de renovación**. El sistema permite gestionar suscripciones periódicas (alta, edición, baja), calcular el gasto mensual y anual normalizado, alertar sobre próximas renovaciones, mantener la persistencia de datos en un archivo JSON local y exportar informes en diferentes formatos.

El sistema se implementa en TypeScript estricto sobre Node.js v26.13.1, separando la lógica de negocio (funciones puras) de la capa de entrada/salida (CLI y archivo).

---

## Glossary

### Términos del dominio

- **Suscripción**: Gasto recurrente con nombre, importe, moneda, fecha de inicio, frecuencia de cobro y estado. Es la entidad central del sistema.
- **Gasto normalizado mensual**: Suma del importe de todas las suscripciones activas dividido por su factor de frecuencia (1 para mensual, 3 para trimestral, 12 para anual), expresado en unidades por mes.
- **Gasto proyectado anual**: El gasto normalizado mensual multiplicado por 12.
- **Próximo cobro**: La siguiente fecha futura (mayor o igual a la fecha de referencia) en la que se cobra una suscripción activa, calculada avanzando la frecuencia desde `startDate`.
- **Ventana de alerta**: Rango de fechas `[referenceDate, referenceDate + N días]` (inclusive en ambos extremos) utilizado para detectar suscripciones cuyo próximo cobro está próximo. El valor por defecto de N es 7 días.
- **Fecha de referencia**: Fecha a partir de la cual se calculan el próximo cobro y la ventana de alerta. Por defecto es la fecha actual del sistema.
- **Exportación**: Generación de un informe legible (consola) o descargable (JSON / CSV) con el desglose de suscripciones activas y los totales calculados.
- **Persistencia**: Lectura y escritura de las suscripciones en el archivo `data/subscriptions.json` con formato JSON legible (indentación de 2 espacios).
- **Error descriptivo y tipado**: Objeto de error con código identificador, mensaje en español legible para el usuario y contexto suficiente para depuración, sin exponer detalles internos del sistema.

### Modelo de entidades

Tipo TypeScript: `Subscription`

| Campo       | Tipo TypeScript                                    | Restricciones                                        | Descripción                                      |
|-------------|----------------------------------------------------|------------------------------------------------------|--------------------------------------------------|
| `id`        | `string`                                           | UUID v4 único, generado automáticamente              | Identificador único de la suscripción            |
| `name`      | `string`                                           | No vacío (longitud ≥ 1 tras recortar espacios)       | Nombre descriptivo de la suscripción             |
| `amount`    | `number`                                           | Estrictamente mayor que 0, finito                    | Importe del cobro por periodo                    |
| `currency`  | `string`                                           | No vacío (longitud ≥ 1 tras recortar espacios)       | Código o símbolo de la moneda (p.ej. `"EUR"`)    |
| `startDate` | `string`                                           | Formato `YYYY-MM-DD`, fecha de calendario válida     | Fecha de inicio del primer cobro                 |
| `frequency` | `"mensual" \| "trimestral" \| "anual"`             | Solo los tres valores literales permitidos           | Periodicidad de cobro                            |
| `status`    | `"activa" \| "pausada"`                            | Solo los dos valores literales permitidos            | Estado operativo de la suscripción               |

---

## Requirements

### Requisito 1 — Alta de suscripciones

**Historia de usuario:** Como usuario, quiero registrar una nueva suscripción con todos sus datos, para llevar un control completo de mis gastos recurrentes.

#### Criterios de aceptación

1. WHEN el usuario proporciona `name`, `amount`, `currency`, `startDate`, `frequency` y `status` válidos, THE Sistema SHALL crear una nueva suscripción con un `id` UUID v4 único generado automáticamente y devolverla como resultado de la operación.
2. THE Sistema SHALL garantizar que el `id` generado no coincide con el de ninguna suscripción existente en el almacén de datos.
3. IF `name` es una cadena vacía o compuesta solo de espacios, THEN THE Sistema SHALL retornar un error descriptivo indicando que el nombre no puede estar vacío.
4. IF `amount` es menor o igual a `0`, no es un número finito, o no es de tipo `number`, THEN THE Sistema SHALL retornar un error descriptivo indicando que el importe debe ser un número positivo.
5. IF `currency` es una cadena vacía o compuesta solo de espacios, THEN THE Sistema SHALL retornar un error descriptivo indicando que la moneda no puede estar vacía.
6. IF `startDate` no sigue el formato `YYYY-MM-DD` o no representa una fecha de calendario válida, THEN THE Sistema SHALL retornar un error descriptivo indicando el formato esperado.
7. IF `frequency` no es uno de los valores `"mensual"`, `"trimestral"` o `"anual"`, THEN THE Sistema SHALL retornar un error descriptivo listando los valores permitidos.
8. IF `status` no es `"activa"` ni `"pausada"`, THEN THE Sistema SHALL retornar un error descriptivo listando los valores permitidos.
9. IF cualquier campo obligatorio está ausente en la entrada, THEN THE Sistema SHALL retornar un error descriptivo identificando el campo faltante.

#### Propiedades para property-based testing

- **Unicidad de `id`**: Para cualquier conjunto de suscripciones válidas creadas secuencialmente, todos los `id` generados son distintos entre sí.
- **Rechazo exhaustivo**: Para cualquier combinación de campos en la que al menos uno no cumple las restricciones, THE Sistema SHALL retornar un error y no persistir ninguna nueva suscripción.

---

### Requisito 2 — Edición de suscripciones

**Historia de usuario:** Como usuario, quiero modificar los datos de una suscripción existente, para mantener la información actualizada ante cambios en precio, estado u otros datos.

#### Criterios de aceptación

1. WHEN el usuario proporciona un `id` existente y un conjunto de campos a actualizar, todos válidos, THE Sistema SHALL aplicar los cambios únicamente a esos campos y conservar el resto sin modificación.
2. IF el `id` proporcionado no corresponde a ninguna suscripción existente, THEN THE Sistema SHALL retornar un error descriptivo indicando que la suscripción no fue encontrada.
3. IF alguno de los campos a actualizar no cumple las mismas restricciones definidas en el Requisito 1, THEN THE Sistema SHALL retornar un error descriptivo identificando el campo inválido.
4. WHEN la validación de cualquier campo falla, THE Sistema SHALL dejar la suscripción original sin ninguna modificación (operación atómica).
5. THE Sistema SHALL prohibir la actualización del campo `id` de una suscripción existente.

#### Propiedades para property-based testing

- **Idempotencia**: Editar una suscripción con exactamente los mismos valores que ya tiene produce un estado final idéntico al inicial.
- **Atomicidad**: Para cualquier actualización que incluya al menos un campo inválido, el estado de la suscripción después de la operación es idéntico al estado anterior.

---

### Requisito 3 — Baja de suscripciones

**Historia de usuario:** Como usuario, quiero eliminar una suscripción que ya no utilizo, para que no afecte a mis cálculos de gasto.

#### Criterios de aceptación

1. WHEN el usuario proporciona un `id` existente, THE Sistema SHALL eliminar la suscripción correspondiente del almacén de datos y confirmar la operación.
2. IF el `id` proporcionado no corresponde a ninguna suscripción existente, THEN THE Sistema SHALL retornar un error descriptivo indicando que la suscripción no fue encontrada.
3. WHEN la eliminación se completa con éxito, THE Sistema SHALL persistir el nuevo estado del almacén de datos en `subscriptions.json`.

#### Propiedades para property-based testing

- **Eliminación verificable**: Tras eliminar una suscripción por `id`, ninguna consulta posterior al almacén de datos retorna una suscripción con ese `id`.

---

### Requisito 4 — Cálculo de gasto normalizado

**Historia de usuario:** Como usuario, quiero conocer cuánto gasto mensual y anualmente en suscripciones activas, para tomar decisiones informadas sobre mis gastos.

#### Criterios de aceptación

1. THE Sistema SHALL calcular el gasto normalizado mensual sumando, para cada suscripción con `status` igual a `"activa"`, el cociente `amount / factor`, donde `factor` es `1` para `"mensual"`, `3` para `"trimestral"` y `12` para `"anual"`.
2. THE Sistema SHALL calcular el gasto proyectado anual multiplicando el gasto normalizado mensual por `12`.
3. WHILE ninguna suscripción tiene `status` igual a `"activa"`, THE Sistema SHALL retornar `0` como gasto normalizado mensual y `0` como gasto proyectado anual.
4. THE Sistema SHALL excluir del cálculo todas las suscripciones con `status` igual a `"pausada"`.

#### Propiedades para property-based testing

- **Relación mensual/anual**: Para cualquier conjunto de suscripciones, el gasto proyectado anual es siempre igual al gasto normalizado mensual multiplicado por `12`.
- **No negatividad**: Para cualquier conjunto de suscripciones con `amount > 0`, ambos totales son siempre mayores o iguales a `0`.
- **Efecto de pausa total**: Si todas las suscripciones tienen `status` igual a `"pausada"`, ambos totales son `0`.

---

### Requisito 5 — Próximo cobro y ventana de alerta

**Historia de usuario:** Como usuario, quiero saber cuándo se me cobrarán mis próximas suscripciones activas, para anticiparme a los cargos en mi cuenta.

#### Criterios de aceptación

1. WHEN se solicita el próximo cobro de una suscripción con `status` igual a `"activa"`, THE Sistema SHALL calcular la fecha más próxima mayor o igual a `referenceDate` obtenida avanzando `startDate` en incrementos de la frecuencia correspondiente (`1` mes, `3` meses o `12` meses).
2. WHEN se solicita la ventana de alerta con un valor `N` mayor o igual a `0`, THE Sistema SHALL retornar todas las suscripciones activas cuya próxima fecha de cobro caiga dentro del rango `[referenceDate, referenceDate + N días]`, ambos extremos inclusive.
3. WHILE `N` no se especifica explícitamente, THE Sistema SHALL utilizar `N = 7` días como valor por defecto.
4. IF `N` es un número negativo, THEN THE Sistema SHALL retornar un error descriptivo indicando que el horizonte de alerta no puede ser negativo.
5. THE Sistema SHALL excluir de la ventana de alerta todas las suscripciones con `status` igual a `"pausada"`.

#### Propiedades para property-based testing

- **Ventana de cero días**: Con `N = 0`, el resultado incluye únicamente las suscripciones cuyo próximo cobro coincide exactamente con `referenceDate`.
- **Exclusión de pausadas**: Para cualquier valor de `N ≥ 0`, ninguna suscripción con `status` igual a `"pausada"` aparece en el resultado de la ventana de alerta.

---

### Requisito 6 — Persistencia y validación del almacén de datos

**Historia de usuario:** Como usuario, quiero que mis suscripciones se guarden en un archivo local, para que persistan entre sesiones y pueda recuperarlas siempre.

#### Criterios de aceptación

1. THE Sistema SHALL leer las suscripciones desde el archivo `subscriptions.json` al inicio de cada operación que lo requiera.
2. THE Sistema SHALL escribir las suscripciones en `subscriptions.json` con formato JSON con indentación de `2` espacios tras cada operación de escritura exitosa.
3. IF el archivo `subscriptions.json` no existe al intentar leer, THEN THE Sistema SHALL inicializar el almacén de datos con una lista vacía `[]` y continuar la operación.
4. IF el contenido de `subscriptions.json` no es JSON válido, THEN THE Sistema SHALL retornar un error descriptivo indicando corrupción del archivo y no inicializar el almacén silenciosamente.
5. IF el JSON de `subscriptions.json` es válido pero no cumple el esquema de `Subscription[]` (campos faltantes, tipos incorrectos o valores fuera de los permitidos), THEN THE Sistema SHALL retornar un error descriptivo identificando la inconsistencia del esquema.
6. IF ocurre un fallo de lectura de disco (p.ej. permisos insuficientes), THEN THE Sistema SHALL propagar el error al llamador sin silenciarlo.
7. IF ocurre un fallo de escritura de disco, THEN THE Sistema SHALL propagar el error al llamador sin silenciarlo y no dejar el archivo en un estado parcialmente escrito.

---

### Requisito 7 — Exportación de informes

**Historia de usuario:** Como usuario, quiero exportar un resumen de mis suscripciones activas y sus totales, para compartirlo o archivarlo fácilmente.

#### Criterios de aceptación

1. WHEN se solicita la exportación en formato `"consola"`, THE Sistema SHALL mostrar por la salida estándar el nombre, próxima fecha de cobro, importe y moneda de cada suscripción activa, seguido de los totales de gasto normalizado mensual y proyectado anual.
2. WHEN se solicita la exportación en formato `"json"`, THE Sistema SHALL generar un objeto JSON con el desglose de todas las suscripciones activas y los totales calculados.
3. WHEN se solicita la exportación en formato `"csv"`, THE Sistema SHALL generar un archivo CSV con una fila de cabecera y una fila de datos por suscripción activa, más una fila de totales al final.
4. IF el formato solicitado no es `"consola"`, `"json"` ni `"csv"`, THEN THE Sistema SHALL retornar un error descriptivo listando los formatos soportados.
5. THE Sistema SHALL incluir en todos los formatos de exportación únicamente las suscripciones con `status` igual a `"activa"`.

#### Propiedades para property-based testing

- **Cardinalidad CSV**: Para cualquier conjunto de suscripciones activas de tamaño `n`, el CSV exportado contiene exactamente `n` filas de datos (sin contar la cabecera ni la fila de totales).
