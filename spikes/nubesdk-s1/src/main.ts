import type { NubeSDK } from "@tiendanube/nube-sdk-types";
import {
	box,
	button,
	column,
	field,
	row,
	text,
	toastDescription,
	toastRoot,
	toastTitle,
} from "@tiendanube/nube-sdk-ui";

/**
 * Constantes de prueba para el evento 'cart:add' (completar con IDs reales de la tienda).
 */
export const TEST_PRODUCT_ID = 373517272; // Ryzen 5 5600GT, stock 3
export const TEST_VARIANT_ID = 1616521556;

/**
 * Aplicación NubeSDK para Spike S1 - Prueba de Widget de Asesor.
 */
export function App(nube: NubeSDK) {
	// 2.a Al iniciar, hacer console.log del ID de la tienda que expone el estado del SDK.
	// Campo utilizado: state.store.id (definido en NubeSDKState.store -> Store.id en @tiendanube/nube-sdk-types)
	const initialState = nube.getState();
	console.log("[NubeSDK Spike S1] Store ID:", initialState.store.id);

	// Estado local de la UI para el modal y mensajes
	let currentMessage = "";
	let isSending = false;
	let apiStatus: string | null = null;
	let apiHeaderOrigin: string | null = null;
	let apiAllowOriginHeader: string | null = null;
	let apiBodyOrigin: string | null = null;
	let apiError: string | null = null;

	/**
	 * Muestra una notificación toast utilizando toastRoot en el slot 'corner_top_right'.
	 */
	function showToast(
		titleText: string,
		descText: string,
		variant: "success" | "error",
	) {
		nube.render(
			"corner_top_right",
			toastRoot({
				variant,
				duration: 4500,
				children: [
					toastTitle({ children: titleText }),
					toastDescription({ children: descText }),
				],
				onClose: () => {
					nube.clearSlot("corner_top_right");
				},
			}),
		);
	}

	// 2.e Suscripción a eventos de éxito y fallo de agregar al carrito
	nube.on("cart:add:success", () => {
		showToast(
			"Producto agregado",
			`cart:add:success recibido (Producto: ${TEST_PRODUCT_ID}, Variante: ${TEST_VARIANT_ID})`,
			"success",
		);
	});

	nube.on("cart:add:fail", () => {
		showToast(
			"Error al agregar producto",
			`cart:add:fail recibido (Producto: ${TEST_PRODUCT_ID}, Variante: ${TEST_VARIANT_ID})`,
			"error",
		);
	});

	/**
	 * Despacha el evento 'cart:add' con los IDs de prueba.
	 */
	function handleAddToCart() {
		nube.send("cart:add", () => ({
			cart: {
				items: [
					{
						product_id: TEST_PRODUCT_ID,
						variant_id: TEST_VARIANT_ID,
						quantity: 1,
					},
				],
			},
		}));
	}

	/**
	 * 2.d Al enviar: hace fetch a https://httpbin.org/post y actualiza el modal.
	 */
	async function handleSendMessage() {
		if (isSending) return;
		isSending = true;
		apiStatus = null;
		apiHeaderOrigin = null;
		apiAllowOriginHeader = null;
		apiBodyOrigin = null;
		apiError = null;
		renderModal();

		try {
			const payload = { message: currentMessage };
			const response = await fetch("https://httpbin.org/post", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			apiStatus = `${response.status} ${response.statusText}`;
			apiHeaderOrigin =
				response.headers.get("origin") ?? "(no presente en response headers)";
			apiAllowOriginHeader =
				response.headers.get("access-control-allow-origin") ??
				"(no presente en response headers)";

			const json = (await response.json().catch(() => null)) as Record<
				string,
				unknown
			> | null;
			const echoedHeaders = json?.headers as Record<string, unknown> | undefined;
			apiBodyOrigin =
				typeof echoedHeaders?.Origin === "string"
					? echoedHeaders.Origin
					: "(el navegador no mandó Origin)";
		} catch (error) {
			apiError = error instanceof Error ? error.message : String(error);
		} finally {
			isSending = false;
			renderModal();
		}
	}

	/**
	 * 2.c Renderiza el modal de chat en el slot 'modal_content'.
	 */
	function renderModal() {
		const resultItems = [];

		if (isSending) {
			resultItems.push(
				text({
					children: "Enviando mensaje a httpbin.org/post...",
					color: "#6b7280",
				}),
			);
		}

		if (apiStatus !== null) {
			resultItems.push(
				column({
					style: {
						padding: "12px",
						background: "#f0fdf4",
						borderRadius: "6px",
						gap: "6px",
					},
					children: [
						text({
							children: `HTTP Status: ${apiStatus}`,
							style: { fontWeight: "600", color: "#166534" },
						}),
						text({
							children: `Response Header 'origin': ${apiHeaderOrigin}`,
							style: { fontSize: "13px", color: "#374151" },
						}),
						text({
							children: `Response Header 'access-control-allow-origin': ${apiAllowOriginHeader}`,
							style: { fontSize: "13px", color: "#374151" },
						}),
						text({
							children: `Header Origin enviado por el navegador: ${apiBodyOrigin}`,
							style: { fontSize: "13px", color: "#374151" },
						}),
					],
				}),
			);
		}

		if (apiError !== null) {
			resultItems.push(
				column({
					style: {
						padding: "12px",
						background: "#fef2f2",
						borderRadius: "6px",
						gap: "6px",
					},
					children: [
						text({
							children: "Error en la petición fetch:",
							style: { fontWeight: "600", color: "#991b1b" },
						}),
						text({
							children: apiError,
							style: { fontSize: "13px", color: "#b91c1c" },
						}),
					],
				}),
			);
		}

		nube.render(
			"modal_content",
			column({
				style: {
					padding: "20px",
					width: "100%",
					maxWidth: "480px",
					gap: "16px",
					background: "#ffffff",
					color: "#111111",
					borderRadius: "12px",
				},
				children: [
					// Cabecera del modal
					row({
						style: {
							justifyContent: "space-between",
							alignItems: "center",
						},
						children: [
							text({
								heading: 3,
								children: "Asesor Virtual (Spike S1)",
								style: { margin: "0", fontWeight: "600" },
							}),
							button({
								children: "✕ Cerrar",
								variant: "transparent",
								onClick: () => {
									nube.clearSlot("modal_content");
								},
							}),
						],
					}),

					// Campo de texto para el mensaje
					field({
						name: "chat_message",
						label: "Mensaje para el Asesor:",
						placeholder: "Escribí tu consulta aquí...",
						value: currentMessage,
						onChange: (event) => {
							currentMessage = event.value ?? "";
						},
					}),

					// Acciones del modal
					row({
						style: {
							gap: "10px",
							alignItems: "center",
						},
						children: [
							button({
								children: isSending ? "Enviando..." : "Enviar",
								disabled: isSending,
								variant: "primary",
								onClick: async () => {
									await handleSendMessage();
								},
							}),
							button({
								children: "Agregar producto de prueba",
								variant: "secondary",
								onClick: () => {
									handleAddToCart();
								},
							}),
						],
					}),

					// Resultados o errores
					...resultItems,
				],
			}),
		);
	}

	// 2.b Renderizar en un slot de overlay tipo 'corner' un botón 'Asesor'
	// Slot utilizado: 'corner_bottom_right' (definido en COMMON_UI_SLOT en @tiendanube/nube-sdk-types)
	nube.render(
		"corner_bottom_right",
		box({
			style: {
				padding: "12px",
			},
			children: [
				button({
					children: "Asesor",
					variant: "primary",
					onClick: () => {
						renderModal();
					},
				}),
			],
		}),
	);
}
