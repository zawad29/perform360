"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({
  active = false,
  disabled = false,
  ariaLabel,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center border transition-colors ${
        active
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-900"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Add guidance...",
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "min-h-[calc(3lh+1.5rem)] px-3 py-3 text-[13px] leading-relaxed text-gray-800 focus:outline-none prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 [&_p:first-child]:mt-0 [&_ul:first-child]:mt-0 [&_ol:first-child]:mt-0",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="border border-gray-200 bg-white">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 px-2 py-2">
        <ToolbarButton
          ariaLabel="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={14} strokeWidth={2} />
        </ToolbarButton>
        <div className="mx-1 h-8 w-px bg-gray-200" />
        <ToolbarButton
          ariaLabel="Undo"
          disabled={!editor.can().chain().focus().undo().run()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={14} strokeWidth={2} />
        </ToolbarButton>
        <ToolbarButton
          ariaLabel="Redo"
          disabled={!editor.can().chain().focus().redo().run()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={14} strokeWidth={2} />
        </ToolbarButton>
      </div>

      <div className="relative">
        {!editor.getText().trim() && (
          <div className="pointer-events-none absolute left-3 top-3 text-[13px] text-gray-300">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
