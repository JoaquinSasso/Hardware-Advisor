export function toPlainText(text: string): string {
	return (
		text
			.replace(/\*\*(.+?)\*\*/g, "$1") // **negrita** (antes que la itálica)
			.replace(/__(.+?)__/g, "$1") // __negrita__
			.replace(/^#{1,6}\s+/gm, "") // # títulos
			.replace(/`([^`]+)`/g, "$1") // `código`
			.replace(/^\*\s+/gm, "- ") // "* item" → "- item"
			// *itálica*: el asterisco de apertura no puede venir después de una letra o número,
			// ni estar seguido de un espacio; el de cierre no puede estar precedido de un espacio
			// ni seguido de una letra o número. Así no toca "2*3*4" ni los ítems de lista.
			.replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g, "$1$2")
	);
}
