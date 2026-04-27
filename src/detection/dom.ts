function getActiveElementFromRoot(root: Document | ShadowRoot): Element | null {
  const activeElement = root.activeElement;
  if (!activeElement) {
    return null;
  }

  if (activeElement instanceof HTMLElement && activeElement.shadowRoot) {
    const nestedActive = getActiveElementFromRoot(activeElement.shadowRoot);
    if (nestedActive) {
      return nestedActive;
    }
  }

  return activeElement;
}

function isContentEditableElement(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const contentEditable = element.getAttribute("contenteditable");
  return (
    element.isContentEditable ||
    contentEditable === "" ||
    contentEditable === "true" ||
    contentEditable === "plaintext-only"
  );
}

function findNearestEditableContainer(element: HTMLElement): HTMLElement | null {
  let current: Element | null = element;

  while (current instanceof HTMLElement) {
    if (isContentEditableElement(current)) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

export function getDeepActiveElement(doc: Document = document): Element | null {
  return getActiveElementFromRoot(doc);
}

export function resolveFocusedEditableElement(doc: Document = document): HTMLElement | null {
  const activeElement = getDeepActiveElement(doc);
  if (!(activeElement instanceof HTMLElement)) {
    return null;
  }

  if (
    activeElement instanceof HTMLTextAreaElement ||
    activeElement instanceof HTMLInputElement ||
    isContentEditableElement(activeElement)
  ) {
    return activeElement;
  }

  const editableAncestor = findNearestEditableContainer(activeElement);
  if (editableAncestor) {
    return editableAncestor;
  }

  return null;
}
