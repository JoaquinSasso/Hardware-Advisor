import type { NubeSDK } from "@tiendanube/nube-sdk-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, TEST_PRODUCT_ID, TEST_VARIANT_ID } from "./main";

describe("Spike S1 App", () => {
	beforeEach(() => {
		// Mock global self object simulating the NubeSDK Web Worker environment
		(
			globalThis as unknown as {
				self: { __APP_DATA__: { id: string; script: string } };
			}
		).self = {
			__APP_DATA__: {
				id: "spike-app-123",
				script: "https://cdn.tiendanube.com/apps/main.min.js",
			},
		};
	});

	it("logs the store id, renders the corner button, and subscribes to events", () => {
		const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		const renders: Record<string, unknown> = {};
		const listeners: Record<string, (state: unknown) => void> = {};

		const mockNube: Partial<NubeSDK> = {
			getState: vi.fn().mockReturnValue({
				store: {
					id: 998877,
					name: "Tienda Demo",
					domain: "demo.tiendanube.com",
				},
			}),
			render: vi.fn((slot, component) => {
				renders[slot as string] = component;
			}),
			clearSlot: vi.fn(),
			on: vi.fn((event, handler) => {
				listeners[event as string] = handler as (state: unknown) => void;
			}),
			send: vi.fn(),
		};

		App(mockNube as unknown as NubeSDK);

		// 2.a Verifica console.log de store ID
		expect(consoleSpy).toHaveBeenCalledWith(
			"[NubeSDK Spike S1] Store ID:",
			998877,
		);

		// 2.b Verifica render en corner_bottom_right
		expect(mockNube.render).toHaveBeenCalledWith(
			"corner_bottom_right",
			expect.objectContaining({ type: "box" }),
		);

		// 2.e Verifica suscripción a eventos
		expect(mockNube.on).toHaveBeenCalledWith(
			"cart:add:success",
			expect.any(Function),
		);
		expect(mockNube.on).toHaveBeenCalledWith(
			"cart:add:fail",
			expect.any(Function),
		);

		// Verifica constantes exportadas
		expect(TEST_PRODUCT_ID).toBeTypeOf("number");
		expect(TEST_VARIANT_ID).toBeTypeOf("number");

		consoleSpy.mockRestore();
	});
});
