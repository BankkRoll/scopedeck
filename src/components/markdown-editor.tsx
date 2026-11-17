import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { EditorView, keymap } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useDeferredValue, useMemo } from "react";
import { Markdown } from "./markdown";

const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "var(--ink)", fontSize: "13px" },
  ".cm-content": { fontFamily: "var(--font-mono)", padding: "12px 0", caretColor: "var(--ink)" },
  ".cm-line": { padding: "0 14px", lineHeight: "20px" },
  ".cm-cursor": { borderLeftColor: "var(--ink)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent) !important",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-placeholder": { color: "var(--faint)" },
  ".cm-scroller": { overflow: "auto" },
});

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--ink)", fontWeight: "600" },
  { tag: tags.strong, color: "var(--ink)", fontWeight: "600" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--link)" },
  { tag: tags.monospace, color: "var(--muted)" },
  {
    tag: [tags.processingInstruction, tags.meta, tags.labelName, tags.contentSeparator],
    color: "var(--faint)",
  },
  { tag: tags.quote, color: "var(--muted)" },
]);

interface MarkdownEditorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onSubmitShortcut?: () => void;
}

export function MarkdownEditor({
  label,
  value,
  onChange,
  placeholder,
  onSubmitShortcut,
}: MarkdownEditorProps) {
  const preview = useDeferredValue(value);
  const extensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(markdownHighlight),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": label }),
      keymap.of(
        onSubmitShortcut
          ? [
              {
                key: "Mod-Enter",
                run: () => {
                  onSubmitShortcut();
                  return true;
                },
              },
            ]
          : [],
      ),
    ],
    [label, onSubmitShortcut],
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-line">
      <div className="min-h-0 overflow-hidden">
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          theme={editorTheme}
          placeholder={placeholder}
          height="100%"
          className="h-full"
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            autocompletion: false,
            syntaxHighlighting: false,
          }}
        />
      </div>
      <div className="min-h-0 overflow-y-auto px-4 py-3" aria-label={`${label} preview`}>
        {preview.trim() ? (
          <Markdown source={preview} />
        ) : (
          <p className="text-faint">The sanitized preview appears here.</p>
        )}
      </div>
    </div>
  );
}
