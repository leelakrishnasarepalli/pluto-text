export function buildAppendText(existingText: string, insertedText: string): string {
  if (!existingText.trim()) {
    return insertedText;
  }

  if (!insertedText.trim()) {
    return existingText;
  }

  const needsDoubleNewline = !existingText.endsWith("\n\n") && insertedText.includes("\n");
  const separator = existingText.endsWith("\n")
    ? needsDoubleNewline
      ? "\n"
      : ""
    : insertedText.startsWith("\n")
      ? ""
      : needsDoubleNewline
        ? "\n\n"
        : "\n";

  return `${existingText}${separator}${insertedText}`;
}
