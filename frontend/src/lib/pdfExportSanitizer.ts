const UNSUPPORTED_COLOR_FUNCTION_PATTERN = /\b(?:okl(?:ab|ch)|color-mix|lab|lch)\(/i;

const COLOR_FALLBACKS = {
  background: "#ffffff",
  foreground: "#191919",
  card: "#ffffff",
  muted: "#f6f7f8",
  mutedForeground: "#4d4d4d",
  border: "#d8dde2",
  input: "#949494",
  destructive: "#d41f4c",
} as const;

const DIRECT_FALLBACK_PROPERTIES = new Set([
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "column-rule-color",
  "fill",
  "stroke",
  "stop-color",
  "flood-color",
  "lighting-color",
]);

const RESET_PROPERTIES = new Set([
  "background-image",
  "box-shadow",
  "text-shadow",
  "filter",
  "backdrop-filter",
  "-webkit-backdrop-filter",
]);

const IGNORED_PROPERTIES = new Set([
  "content",
  "perspective-origin",
  "transform-origin",
  "view-transition-name",
  "buffered-rendering",
  "alignment-baseline",
]);

type StyledElement = HTMLElement | SVGElement;

interface ExportPalette {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  destructive: string;
}

export interface UnsupportedComputedStyle {
  tagName: string;
  className: string;
  property: string;
  value: string;
}

export interface PreparedPdfExportTarget {
  backgroundColor: string;
  cleanup: () => void;
  element: HTMLElement;
}

function pruneHiddenExportElements(root: HTMLElement): void {
  const hiddenElements = root.querySelectorAll<HTMLElement>("[data-pdf-export-hide]");
  hiddenElements.forEach((element) => {
    element.remove();
  });
}

function pruneInteractiveElements(root: HTMLElement): void {
  const selectors = [
    "button",
    "[role='button']",
    "[data-slot='button']",
    "[data-slot='card-action']",
    "input",
    "select",
    "textarea",
    "[aria-haspopup='menu']",
    "[aria-expanded]",
    "[data-html2canvas-ignore='true']",
  ];

  const elements = root.querySelectorAll<HTMLElement>(selectors.join(", "));
  elements.forEach((element) => {
    element.remove();
  });
}

function getCssVar(rootStyles: CSSStyleDeclaration, name: string, fallback: string): string {
  return rootStyles.getPropertyValue(name).trim() || fallback;
}

function buildExportPalette(root: HTMLElement): ExportPalette {
  const rootStyles = getComputedStyle(root);

  return {
    background: getCssVar(rootStyles, "--background", COLOR_FALLBACKS.background),
    foreground: getCssVar(rootStyles, "--foreground", COLOR_FALLBACKS.foreground),
    card: getCssVar(rootStyles, "--card", COLOR_FALLBACKS.card),
    muted: getCssVar(rootStyles, "--muted", COLOR_FALLBACKS.muted),
    mutedForeground: getCssVar(
      rootStyles,
      "--muted-foreground",
      COLOR_FALLBACKS.mutedForeground
    ),
    border: getCssVar(rootStyles, "--border", COLOR_FALLBACKS.border),
    input: getCssVar(rootStyles, "--input", COLOR_FALLBACKS.input),
    destructive: getCssVar(rootStyles, "--destructive", COLOR_FALLBACKS.destructive),
  };
}

function getFallbackColor(property: string, palette: ExportPalette): string {
  if (property.includes("destructive")) {
    return palette.destructive;
  }

  if (property === "background-color") {
    return palette.card;
  }

  if (property.includes("border") || property.includes("outline") || property === "stroke") {
    return palette.border;
  }

  if (property.includes("muted")) {
    return palette.mutedForeground;
  }

  if (property === "fill" || property === "stop-color" || property === "flood-color") {
    return palette.foreground;
  }

  return palette.foreground;
}

function removeCloneSelectors(element: Element): void {
  element.removeAttribute("class");
  element.removeAttribute("id");

  if (element instanceof HTMLElement) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith("data-slot") || attribute.name.startsWith("data-state")) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

function sanitizePropertyValue(
  property: string,
  value: string,
  palette: ExportPalette
): string | null {
  if (!value) {
    return null;
  }

  if (!UNSUPPORTED_COLOR_FUNCTION_PATTERN.test(value)) {
    return value;
  }

  if (RESET_PROPERTIES.has(property)) {
    if (property === "background-image") {
      return "none";
    }

    if (property === "filter" || property === "backdrop-filter" || property === "-webkit-backdrop-filter") {
      return "none";
    }

    return "none";
  }

  if (property === "color" || DIRECT_FALLBACK_PROPERTIES.has(property) || property.endsWith("-color")) {
    return getFallbackColor(property, palette);
  }

  return null;
}

function syncFormValue(original: Element, clone: Element): void {
  if (original instanceof HTMLInputElement && clone instanceof HTMLInputElement) {
    clone.value = original.value;
    clone.checked = original.checked;
    return;
  }

  if (original instanceof HTMLTextAreaElement && clone instanceof HTMLTextAreaElement) {
    clone.value = original.value;
    return;
  }

  if (original instanceof HTMLSelectElement && clone instanceof HTMLSelectElement) {
    clone.value = original.value;
  }
}

function copyComputedStyles(
  original: StyledElement,
  clone: StyledElement,
  palette: ExportPalette
): void {
  const computedStyles = getComputedStyle(original);

  for (let index = 0; index < computedStyles.length; index += 1) {
    const property = computedStyles.item(index);

    if (!property || property.startsWith("--") || IGNORED_PROPERTIES.has(property)) {
      continue;
    }

    const value = computedStyles.getPropertyValue(property);
    const sanitizedValue = sanitizePropertyValue(property, value, palette);
    if (!sanitizedValue) {
      continue;
    }

    try {
      clone.style.setProperty(property, sanitizedValue, computedStyles.getPropertyPriority(property));
    } catch {
      // Some computed properties are read-only in inline styles. Skip those.
    }
  }

  clone.style.setProperty("animation", "none");
  clone.style.setProperty("transition", "none");
  clone.style.setProperty("caret-color", "transparent");
}

function getStyledElements(root: HTMLElement): StyledElement[] {
  const descendants = Array.from(root.querySelectorAll<StyledElement>("*"));
  return [root, ...descendants];
}

function sanitizeClonedTree(
  originalRoot: HTMLElement,
  clonedRoot: HTMLElement,
  palette: ExportPalette
): void {
  const originalElements = getStyledElements(originalRoot);
  const clonedElements = getStyledElements(clonedRoot);

  for (let index = 0; index < Math.min(originalElements.length, clonedElements.length); index += 1) {
    const originalElement = originalElements[index];
    const clonedElement = clonedElements[index];

    removeCloneSelectors(clonedElement);
    syncFormValue(originalElement, clonedElement);
    copyComputedStyles(originalElement, clonedElement, palette);
  }

  clonedRoot.style.setProperty("background-color", palette.background);
  clonedRoot.style.setProperty("color", palette.foreground);
}

export function findUnsupportedComputedStyles(root: HTMLElement): UnsupportedComputedStyle[] {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  const unsupported: UnsupportedComputedStyle[] = [];

  for (const element of elements) {
    const computedStyles = getComputedStyle(element);

    for (let index = 0; index < computedStyles.length; index += 1) {
      const property = computedStyles.item(index);
      if (!property) {
        continue;
      }

      const value = computedStyles.getPropertyValue(property);
      if (!UNSUPPORTED_COLOR_FUNCTION_PATTERN.test(value)) {
        continue;
      }

      unsupported.push({
        tagName: element.tagName.toLowerCase(),
        className: element.className,
        property,
        value,
      });
    }
  }

  return unsupported;
}

export function getPdfExportBackgroundColor(): string {
  return buildExportPalette(document.documentElement).background;
}

export function preparePdfExportTarget(originalRoot: HTMLElement): PreparedPdfExportTarget {
  const palette = buildExportPalette(document.documentElement);
  const container = document.createElement("div");
  const clone = originalRoot.cloneNode(true) as HTMLElement;
  const { width } = originalRoot.getBoundingClientRect();

  container.setAttribute("data-pdf-export-container", "true");
  container.style.position = "fixed";
  container.style.left = "-100000px";
  container.style.top = "0";
  container.style.pointerEvents = "none";
  container.style.opacity = "1";
  container.style.zIndex = "-1";
  container.style.backgroundColor = palette.background;
  container.style.padding = "0";
  container.style.margin = "0";
  container.style.width = `${Math.ceil(width || originalRoot.offsetWidth || 1200)}px`;

  sanitizeClonedTree(originalRoot, clone, palette);
  pruneHiddenExportElements(clone);
  pruneInteractiveElements(clone);
  container.appendChild(clone);
  document.body.appendChild(container);

  return {
    backgroundColor: palette.background,
    cleanup: () => {
      container.remove();
    },
    element: clone,
  };
}
