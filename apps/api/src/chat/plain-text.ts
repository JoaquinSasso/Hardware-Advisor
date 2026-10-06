// Quita las marcas de markdown que la interfaz no interpreta.
// Mantiene saltos de línea, numeración ("1.") y guiones de lista, que se leen bien como texto.
export function toPlainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')   // **negrita**
    .replace(/__(.+?)__/g, '$1')       // __negrita__
    .replace(/^#{1,6}\s+/gm, '')       // # títulos
    .replace(/`([^`]+)`/g, '$1')       // `código`
    .replace(/^\*\s+/gm, '- ');        // "* item" → "- item"
}
