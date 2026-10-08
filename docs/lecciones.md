# Lecciones aprendidas

Incidentes reales del desarrollo, contados como *postmortems* cortos: qué pasó, cómo se encontró la causa y qué cambió. Varios fueron errores de diseño propios. Quedan registrados porque son lo más instructivo del proyecto.

---

## 1. "El modelo no está disponible": la hipótesis equivocada

**Síntoma.** El chat respondía el primer mensaje y fallaba siempre en el segundo, después de exactamente 20 segundos.

**Primera hipótesis (errónea).** La configuración del modelo: una temperatura baja (0,3) y el nivel de razonamiento por defecto, que es el alto. La documentación de Gemini 3 desaconseja bajar la temperatura, porque puede causar bucles. Era una explicación plausible, y estaba mal.

**Cómo se encontró la causa.** Primero se registró la causa real de cada error, que antes se perdía al convertirlo en un 503 genérico, y el consumo de *tokens* de cada llamada. Después se hizo un experimento cambiando una sola variable: la misma conversación con y sin configuración de razonamiento. Los logs dieron la respuesta: el modelo prácticamente no razonaba en ninguna de las dos variantes, y aparecían errores de Google con el texto *"This model is currently experiencing high demand"*. Nuestro timeout de 20 segundos cortaba antes de que llegara ese error, y por eso se veía como "operación abortada".

**Qué cambió.** Se volvió a la configuración por defecto del modelo, porque no había evidencia de que los parámetros ayudaran, y se agregaron reintentos y un modelo de respaldo.

**Lección.** Una corrida exitosa no prueba nada. Hay que comparar variantes en las mismas condiciones, y la hora del día también es una variable cuando dependés de un servicio compartido. Y conviene registrar la causa de un error antes de tratar de adivinarla.

---

## 2. El respaldo que nunca llegaba

**Síntoma.** Con el modelo de respaldo ya configurado, el cliente seguía recibiendo "no disponible", y el respaldo no aparecía en los logs.

**Causa.** La política de reintentos estaba mal diseñada. Ante un timeout, reintentaba el **mismo** modelo: dos intentos de 15 segundos agotaban el presupuesto de 25, y al respaldo nunca le quedaba tiempo.

**Qué cambió.** Si un modelo tarda más de lo esperado, está saturado y reintentarlo no sirve. Ahora el reintento se reserva para las fallas rápidas, el timeout pasa directo al respaldo, y el respaldo tiene tiempo reservado dentro del presupuesto.

**Lección.** Un mecanismo de respaldo que no tiene recursos garantizados no es un respaldo.

---

## 3. El motor era veinte veces más lento de lo necesario

**Síntoma.** En otra máquina, más lenta, fallaron dos tests: el de "menos de 1 segundo" (tardó 1,5) y el de propiedades, por timeout.

**Tentación.** Subir los límites de tiempo de los tests.

**Causa.** El motor guardaba unas 160.000 combinaciones válidas, verificaba la compatibilidad de cada una y las ordenaba todas para quedarse con tres.

**Qué cambió.** Ahora mantiene solo el mejor candidato de cada nivel mientras recorre las combinaciones, y verifica la compatibilidad solo de los elegidos. Pasó de unos 2,3 segundos a unos 115 ms. Para asegurar que el resultado no cambió, un test de equivalencia comparó la versión nueva contra una copia de la vieja con cientos de pedidos aleatorios.

**Lección.** Un test de rendimiento que falla en otra máquina puede ser una señal real: el servidor de producción también es modesto. Y una optimización necesita una prueba de que no cambió el comportamiento, no solo de que es más rápida.

---

## 4. El LLM inventó precios porque no se los dábamos

**Síntoma.** En una conversación de prueba, el cliente pidió un armado con Intel y no le alcanzaba. Aceptó estirarse hasta el mínimo y recibió un armado más caro. Cuando preguntó por qué, el asistente afirmó que el mínimo "era el precio exacto del armado que te acabo de mostrar". Era falso. En los mensajes siguientes presentó como precios los presupuestos que él mismo le pasaba a la herramienta.

**Causa (error de diseño).** Le habíamos ocultado los precios al LLM para que no pudiera inventarlos. Pero el cliente igual preguntaba por precios, y el modelo respondía con los únicos números que tenía. Además, al aceptar el mínimo, el modelo elegía por su cuenta un presupuesto mayor.

**Qué cambió.**
- El LLM ve el total exacto de cada armado y el mínimo como entero.
- El prompt le indica que, si el cliente acepta el mínimo, busque con ese monto exacto.
- Un control en el código reemplaza toda respuesta que contenga un monto que no corresponde a nada real.
- Se guarda en el historial la respuesta que vio el cliente.

**Lección.** Ocultarle información correcta a un LLM no evita que hable del tema: lo empuja a inventar. Lo mejor es darle el dato correcto y verificar con código lo que escribe.

**Corolario.** La primera versión del control consideraba precio a cualquier número de cinco dígitos, y por eso marcaba "i5‑12400F" como precio inventado. Para validar lo que produce un LLM, también hay que pensar en los falsos positivos.

---

## 5. Prohibirle algo al modelo no alcanza

**Síntoma.** El prompt prohibía la palabra "perfecto" y pedía texto sin markdown. El modelo igual escribía "te alcanza perfecto", negritas e itálicas.

**Qué cambió.** El formato se limpia en el código. Las exageraciones todavía no tienen un control automático: se van a medir en la evaluación con frases reales, para decidir con datos si alcanza con cambiar el prompt o hace falta otro modelo.

**Lección.** Las instrucciones negativas en un prompt son la parte menos confiable. Si una regla es crítica y se puede verificar, va al código.

---

## 6. Transacciones que no eran transacciones

**Problema.** El primer migrador abría la transacción con un `BEGIN` suelto y la cerraba con un `COMMIT` suelto. Los tests pasaban porque PGlite tiene una sola conexión. En producción, el driver de Postgres usa un *pool*: cada sentencia podía ir a una conexión distinta, y la migración no habría sido atómica.

**Qué cambió.** Las transacciones usan la API del driver, que fija una conexión durante toda la transacción. Lo mismo para el bloqueo de filas (`SELECT … FOR UPDATE`) al agregar mensajes a una conversación.

**Lección.** Que un test pase en un entorno simplificado no significa que el comportamiento sea correcto en producción. Hay que saber qué diferencias esconde el entorno de test.

---

## 7. La API key llegó a un commit

**Qué pasó.** El `.gitignore` no excluía `.env`, y un `git add -A` incluyó la API key en un commit. Al hacer push, la protección de secretos de GitHub lo detectó y rechazó el push completo. El mismo commit traía además carpetas generadas (`node_modules`, `dist`) por unos 40 MB.

**Qué cambió.** Como el commit no se había subido, alcanzó con sacar los archivos y corregir ese commit, sin reescribir el historial. Se agregaron reglas al `.gitignore` y una verificación con `git check-ignore` antes de cada push.

**Lección.** El `.gitignore` se configura antes del primer secreto, no después. Y cuando una herramienta bloquea un secreto, no se usa la opción de "permitirlo".

---

## 8. Errores que se escondían en silencio

A lo largo del desarrollo apareció muchas veces el mismo patrón en el código: algo que "no puede pasar" y que, si pasaba, se resolvía en silencio. Algunos ejemplos:

- Una función de puntaje que devolvía 0 si recibía un componente del tipo equivocado.
- Un `null` que se ponía por defecto cuando un dato llegaba vacío.
- Un `if (item)` que salteaba un caso imposible.
- Un catálogo opcional que, si faltaba, hacía que el asistente dijera que un armado traía 0 GB de RAM.

**Regla adoptada.** Un estado imposible lanza un error con un mensaje claro. Y siempre que se puede, el compilador lo impide: con tipos acotados por cada clase de componente, pasarle a una función de CPU una GPU no compila.

**Lección.** Un error que se esconde no desaparece: aparece más tarde, en otro lugar, con un mensaje que no tiene nada que ver con la causa.
