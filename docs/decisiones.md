# Registro de decisiones

Cada entrada cuenta qué se decidió, qué alternativas había y por qué se eligió esa. Algunas decisiones se revirtieron más adelante: quedan registradas igual, marcadas como **reemplazadas**, porque el porqué del cambio es tan útil como la decisión.

---

### D1. El LLM conversa; el motor decide

**Decisión.** El LLM solo traduce lo que dice el cliente a requisitos estructurados y después explica el resultado. La elección de piezas y la compatibilidad las resuelve código determinístico.

**Alternativa descartada.** Darle el catálogo al LLM y pedirle que arme la PC. Es más rápido de construir, pero tarde o temprano junta un procesador AM4 con una mother AM5, o inventa un producto, y no hay forma de explicar ni de testear por qué lo hizo.

**Consecuencia.** El motor se prueba con tests comunes y de propiedades. Lo que se evalúa del LLM queda acotado a entender al cliente y redactar.

---

### D2. TypeScript en todo el monorepo

**Alternativas.** Python para el backend, que tiene buen ecosistema de LLM.

**Motivo.** El widget de la tienda es TypeScript sí o sí. Con un solo lenguaje, los contratos (esquemas zod) se comparten entre la API, el motor y el cliente, y no se desincronizan.

---

### D3. Postgres con migraciones SQL escritas a mano

**Alternativas.** Firestore (NoSQL), o migraciones generadas por el ORM.

**Motivo.** El dominio es relacional y tiene invariantes que conviene que garantice la base: claves compuestas, CHECKs, unicidad parcial. Escribir el SQL a mano hace que cada restricción se pueda leer y defender. Drizzle se usa solo para tipar las consultas.

**Variante.** Neon en producción, porque Supabase pausa los proyectos gratuitos inactivos. PGlite (Postgres compilado a WASM) para desarrollo y tests, porque evita Docker.

---

### D4. Catálogo global de componentes y variantes por tienda

**Decisión.** Los componentes y sus especificaciones son globales. Los productos de cada tienda (`store_variants`) se vinculan a un componente, y todo lo que pertenece a una tienda lleva `store_id`.

**Motivo.** Deja abierta la posibilidad de usar el sistema en otras tiendas sin construir nada para eso hoy. Si hay una segunda tienda, reutiliza las especificaciones ya cargadas.

---

### D5. Un producto entra al asesor solo si una persona lo habilitó

**Problema.** Los nombres de los productos no están estandarizados, hay productos mal categorizados y el stock cargado no siempre coincide con lo que hay en el local.

**Decisión.** Cada variante tiene un estado de vínculo (`unmapped`, `suggested`, `confirmed`, `ignored`) y un flag `advisor_enabled`, y la base impide habilitar algo que no está confirmado.

**Alternativa descartada.** Un motor de *fuzzy matching* que adivine qué componente es cada producto en cada consulta. Con unas decenas de productos, vincular una sola vez y confirmar a mano es más simple y más confiable. El LLM puede proponer el vínculo para los productos nuevos, pero siempre lo confirma una persona.

---

### D6. Especificaciones en tablas por tipo con clave foránea compuesta

**Alternativa.** Una columna JSONB con las especificaciones.

**Motivo.** Con tablas, la base valida cada campo (un socket no puede ser nulo) y las consultas son SQL común. La FK `(component_id, type)` hace imposible guardar especificaciones en el tipo equivocado. El costo es una migración por cada atributo nuevo, que a esta escala es aceptable.

---

### D7. Motor por fuerza bruta con poda

**Alternativa.** Un *constraint solver*.

**Motivo.** Con unos 50 componentes hay cientos de miles de combinaciones como mucho, y se recorren en milisegundos. Un solver agrega una dependencia y una caja negra sin ningún beneficio a esta escala. Si el catálogo creciera mucho, se puede podar por etapas sin cambiar la interfaz.

---

### D8. Tres armados definidos por el gasto

**Decisión.** Los armados son el mejor posible gastando como máximo el 70 %, el 85 % y el 100 % del presupuesto (110 % si el cliente dijo que puede estirarse). Si dos topes dan el mismo armado, se muestra uno solo.

**Motivo.** Se explica en una oración, y garantiza algo verificable: a mayor precio, el puntaje nunca baja. Esa propiedad la comprueba un test de propiedades.

---

### D9. Política de placa de video por uso, con gráficos integrados para gaming liviano

**Decisión inicial.** Gaming siempre con GPU dedicada.

**Cambio.** El dueño del proyecto señaló que un procesador con gráficos integrados modernos alcanza para juegos competitivos livianos (CS2, LoL, Valorant, Fortnite en calidad baja o media). Para eso se agregaron:

- `igpuScore` por procesador, en la misma escala que el puntaje de las GPUs, con un mínimo para jugar sin placa de video.
- `gamingDemand` (`light` o `demanding`) en los requisitos.

La GPU es obligatoria solo para juegos exigentes o resoluciones altas. En los demás casos, si el presupuesto no alcanza para una GPU, gana el armado con gráficos integrados, y lleva una advertencia que dice para qué tipo de juegos sirve.

---

### D10. Memoria en un solo canal: se penaliza, no se prohíbe

**Contexto.** Los gráficos integrados usan la RAM como memoria de video, y con un solo módulo rinden bastante menos.

**Decisión.** Sin GPU dedicada y con un solo módulo, el puntaje gráfico se multiplica por 0,6. El mínimo para jugar se compara contra el valor sin penalizar.

**Alternativa descartada.** Exigir dos módulos. Dejaría sin opciones a presupuestos ajustados. Con la penalización, si alcanza para dos módulos, gana el armado con dos.

---

### D11. Advertencias según la audiencia

**Decisión.** Cada armado tiene `warnings`, que ve el cliente, e `internalNotes`, para el local. "Puede requerir actualizar el BIOS" es una nota interna: el local arma la PC gratis, así que no tiene sentido preocupar al cliente con eso. Un `Record` tipado obliga a clasificar cada código de advertencia nuevo.

**Detalle.** Las notas internas tampoco van en el mensaje de WhatsApp, porque el cliente lo ve antes de enviarlo. En su lugar, el mensaje lleva un código de armado que el local puede buscar.

---

### D12. Historial en formato propio

**Decisión.** Las conversaciones se guardan como turnos propios (`user`, `assistant`, `tool`), y un adaptador los traduce al formato del proveedor. Los datos internos del proveedor (por ejemplo, las *thought signatures* de Gemini) viajan en un campo opaco, `providerData`, y se reenvían tal cual.

**Motivo.** Cambiar de proveedor de LLM tiene que ser escribir un adaptador nuevo, no rediseñar la base de datos.

---

### D13. Montos en pesos para el LLM, en centavos para el sistema

Un LLM se equivoca fácilmente con un cero de más o de menos. La herramienta recibe `budgetMaxArs` como entero en pesos, y el código lo convierte a centavos. Todo el dinero del sistema son enteros en centavos, sin punto flotante.

---

### D14. ~~Ocultarle los precios al LLM~~ — reemplazada por D15

**Decisión original.** El LLM no veía ningún precio, para que no pudiera inventarlos.

**Por qué se reemplazó.** En una prueba real hizo exactamente lo contrario: cuando el cliente preguntó por precios, inventó montos con los únicos números que tenía (el presupuesto y el mínimo). Ver [lecciones](lecciones.md#4-el-llm-inventó-precios-porque-no-se-los-dábamos).

---

### D15. El LLM ve los precios exactos y el código verifica lo que escribe

**Decisión.** El resultado de la herramienta incluye el total de cada armado ya formateado (`totalLabel`) y el presupuesto mínimo como entero (`minimumBudgetArs`). Un *money guard* extrae los montos de cada respuesta: si aparece uno que no es un total devuelto, el mínimo o algo que escribió el cliente, la respuesta se reemplaza por un texto seguro. En el historial se guarda lo que vio el cliente, para que el modelo no defienda en el mensaje siguiente un precio que nunca se mostró.

---

### D16. El formato se limpia en el código

Pedirle al modelo "sin markdown" no alcanzó. La API quita negritas, itálicas y títulos antes de responder, y la interfaz muestra siempre texto plano (`textContent`, nunca `innerHTML`). En la base se guarda el texto original, para poder medir cuánto ignora el modelo la instrucción.

---

### D17. Resiliencia del cliente LLM

**Decisión.** Si el modelo principal falla rápido (un 503 en menos de 5 segundos), se le da otra oportunidad. Si falla lento o por timeout, se pasa directo a un modelo de respaldo, que tiene tiempo reservado. Hay un presupuesto total de 25 segundos por llamada. Reintentar es seguro porque llamar al modelo no tiene efectos secundarios: la herramienta recién se ejecuta después.

**Primera versión, corregida.** Reintentaba el modelo principal también después de un timeout. En un caso real, dos timeouts consumieron todo el tiempo y el respaldo nunca llegó a intentarse.

---

### D18. Sugerencias de mensaje fijas

Hay dos listas fijas: antes y después de la primera recomendación. Pedirle al LLM texto, llamada a herramienta y además sugerencias estructuradas en la misma respuesta es frágil, y una lista fija es predecible y fácil de testear.

---

### D19. Desarrollar con un catálogo de prueba que entra por el mismo camino que el real

**Contexto.** El catálogo real no alcanzaba para armar casi ninguna PC, y su stock no reflejaba el local.

**Alternativa descartada.** Una maqueta aparte con datos inventados, que después habría que tirar.

**Decisión.** Un CSV ficticio con el formato exacto del export de Tiendanube, con sus especificaciones y sus vínculos, cargado con el mismo importador. Incluye trampas a propósito: procesadores sin cooler, placas de video que no entran en ciertos gabinetes, productos sin stock o despublicados, SKUs repetidos. Sirve a la vez para desarrollar y para testear el motor.

---

### D20. Migraciones fuera del arranque de la API

En Cloud Run pueden levantarse varias instancias a la vez, y si todas migran al iniciar, compiten entre sí. Las migraciones van a ser un paso separado del despliegue.
