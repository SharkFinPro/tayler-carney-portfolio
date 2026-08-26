"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBold,
  faItalic,
  faUnderline,
  faCode,
  faListUl,
  faListOl,
  faLink,
  faLinkSlash,
  faImage,
  faRemoveFormat,
} from "@fortawesome/free-solid-svg-icons";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import AssetPicker from "@/components/AssetPicker";
import { astToHtml, htmlToAst, imageNodeFromRef, imageNodeHtml, isSafeUrl } from "./richTextAst";
import type { RichTextAST } from "../blocks";
import styles from "./RichTextEditor.module.scss";

// CSS-module lookups go through an index signature, so each one is typed
// `string | undefined`. Almost every use is a className, which accepts that --
// but classList takes definite tokens and throws on an empty one. Resolve the
// single class this file toggles imperatively once, here.
const IMAGE_SELECTED: string | undefined = styles.imageSelected;

/** Add or remove the "this image is selected" outline on a figure. */
function markSelected(figure: HTMLElement, selected: boolean) {
  if (IMAGE_SELECTED) figure.classList.toggle(IMAGE_SELECTED, selected);
}

type Props = {
  value: RichTextAST;
  onChange: (content: RichTextAST) => void;
};

// Block formats offered in the toolbar dropdown. No H1: the page's single <h1>
// is its title, so body content starts at H2 to keep one <h1> per page.
const BLOCKS: { value: string; label: string }[] = [
  { value: "p", label: "Paragraph" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "h4", label: "Heading 4" },
  { value: "h5", label: "Heading 5" },
  { value: "h6", label: "Heading 6" },
  { value: "blockquote", label: "Quote" },
  { value: "pre", label: "Code block" },
];

const BLOCK_VALUES = new Set(BLOCKS.map((b) => b.value));

type ToolbarState = {
  block: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  code: boolean;
  ul: boolean;
  ol: boolean;
};

const INITIAL_STATE: ToolbarState = {
  block: "p",
  bold: false,
  italic: false,
  underline: false,
  code: false,
  ul: false,
  ol: false,
};

/** Nearest ancestor element with the given tag between `node` and `root`. */
function closestTag(node: Node | null, root: Node | null, tag: string): HTMLElement | null {
  while (node && node !== root) {
    if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === tag) {
      return node as HTMLElement;
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * Minimal contentEditable rich-text field producing Hygraph's AST. Formatting
 * runs through the browser's execCommand (tag-based output, no extra deps);
 * images are inserted inline via the shared Media Library AssetPicker. The
 * editor is uncontrolled internally (the DOM is the source of truth) but emits
 * the serialized AST through `onChange`, so it slots into the block editor's
 * draft state like every other block form.
 */
export default function RichTextEditor({ value, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const selectedFigure = useRef<HTMLElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [toolbar, setToolbar] = useState<ToolbarState>(INITIAL_STATE);

  // Serialize the current DOM into the AST and push it to the parent draft.
  const emit = useCallback(() => {
    if (editorRef.current) onChange(htmlToAst(editorRef.current));
  }, [onChange]);

  const syncToolbar = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) return;

    try {
      let block = (document.queryCommandValue("formatBlock") || "").toLowerCase();
      if (block === "div" || block === "") block = "p";
      if (!BLOCK_VALUES.has(block)) block = "p";

      setToolbar({
        block,
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        code: !!closestTag(sel.anchorNode, editor, "CODE"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
      });
    } catch {
      /* queryCommand* can throw in odd selection states; ignore. */
    }
  }, []);

  // Load the existing content once; thereafter the DOM is the source of truth.
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = astToHtml(value);
    }
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      /* serialization handles CSS marks too */
    }
    syncToolbar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", syncToolbar);
    return () => document.removeEventListener("selectionchange", syncToolbar);
  }, [syncToolbar]);

  function clearImageSelection() {
    if (selectedFigure.current) {
      markSelected(selectedFigure.current, false);
      selectedFigure.current = null;
    }
  }

  function handleSurfaceClick(e: React.MouseEvent) {
    const figure = (e.target as HTMLElement).closest?.("figure[data-rt-image]") as HTMLElement | null;
    if (figure === selectedFigure.current) return;
    clearImageSelection();
    if (figure && editorRef.current?.contains(figure)) {
      markSelected(figure, true);
      selectedFigure.current = figure;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const figure = selectedFigure.current;
    if (!figure) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      figure.remove();
      selectedFigure.current = null;
      editorRef.current?.focus();
      emit();
      syncToolbar();
    } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      clearImageSelection();
    }
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    emit();
    syncToolbar();
  }

  function applyBlock(value: string) {
    if (!value) return;
    const next = value !== "p" && toolbar.block === value ? "p" : value;
    exec("formatBlock", `<${next}>`);
  }

  function addLink() {
    const url = (window.prompt("Link URL") || "").trim();
    if (!url) return;
    if (!isSafeUrl(url)) {
      setError("Links must start with http(s)://, mailto:, /, or #.");
      return;
    }
    setError("");
    exec("createLink", url);
  }

  function toggleInlineCode() {
    const editor = editorRef.current;
    editor?.focus();
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;

    const existing = closestTag(sel.anchorNode, editor, "CODE");
    if (existing) {
      const parent = existing.parentNode;
      if (parent) {
        while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
        parent.removeChild(existing);
      }
    } else {
      const range = sel.getRangeAt(0);
      if (range.collapsed) return;
      const code = document.createElement("code");
      try {
        code.appendChild(range.extractContents());
        range.insertNode(code);
        const after = document.createRange();
        after.selectNodeContents(code);
        sel.removeAllRanges();
        sel.addRange(after);
      } catch {
        /* selection spanned non-text boundaries; leave content unchanged */
      }
    }
    emit();
    syncToolbar();
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function openPicker() {
    saveSelection();
    setPickerOpen(true);
  }

  function insertImage(asset: { url: string; altText?: string }) {
    setPickerOpen(false);
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    const node = imageNodeFromRef(asset);
    document.execCommand("insertHTML", false, `${imageNodeHtml(node)}<p><br></p>`);
    emit();
    syncToolbar();
  }

  function toolbarButton(icon: IconDefinition, label: string, onAction: () => void, active = false) {
    return (
      <button
        type="button"
        className={`${styles.toolBtn} ${active ? styles.toolBtnActive : ""}`}
        title={label}
        aria-label={label}
        aria-pressed={active}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onAction}
      >
        <FontAwesomeIcon icon={icon} />
      </button>
    );
  }

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <select
          className={styles.blockSelect}
          value={toolbar.block}
          aria-label="Text style"
          onMouseDown={saveSelection}
          onChange={(e) => applyBlock(e.target.value)}
        >
          {BLOCKS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>

        <span className={styles.toolDivider} />

        {toolbarButton(faBold, "Bold", () => exec("bold"), toolbar.bold)}
        {toolbarButton(faItalic, "Italic", () => exec("italic"), toolbar.italic)}
        {toolbarButton(faUnderline, "Underline", () => exec("underline"), toolbar.underline)}
        {toolbarButton(faCode, "Inline code", toggleInlineCode, toolbar.code)}

        <span className={styles.toolDivider} />

        {toolbarButton(faListUl, "Bulleted list", () => exec("insertUnorderedList"), toolbar.ul)}
        {toolbarButton(faListOl, "Numbered list", () => exec("insertOrderedList"), toolbar.ol)}

        <span className={styles.toolDivider} />

        {toolbarButton(faLink, "Insert link", addLink)}
        {toolbarButton(faLinkSlash, "Remove link", () => exec("unlink"))}
        {toolbarButton(faImage, "Insert image", openPicker)}
        {toolbarButton(faRemoveFormat, "Clear formatting", () => exec("removeFormat"))}
      </div>

      <div
        ref={editorRef}
        className={styles.surface}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Rich text content"
        onInput={emit}
        onKeyDown={handleKeyDown}
        onKeyUp={syncToolbar}
        onClick={handleSurfaceClick}
        onMouseUp={syncToolbar}
        onBlur={() => {
          saveSelection();
          emit();
        }}
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {pickerOpen && <AssetPicker onSelect={insertImage} onClose={() => setPickerOpen(false)} />}
    </div>
  );
}
