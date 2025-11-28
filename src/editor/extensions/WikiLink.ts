import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * WikiLink Extension for Tiptap
 * 
 * Renders [[text]] as a styled link (blue capsule).
 * In Phase 1, this is display-only. Navigation will be added later.
 */

// Regex to match [[wikilinks]]
const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g;

export const WikiLink = Mark.create({
  name: "wikilink",

  addOptions() {
    return {
      HTMLAttributes: {
        class: "wiki-link",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-wikilink]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-wikilink": "",
      }),
      0,
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("wikilink-decorator"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            const doc = state.doc;

            doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;

              const text = node.text;
              let match;

              while ((match = WIKILINK_REGEX.exec(text)) !== null) {
                const start = pos + match.index;
                const end = start + match[0].length;

                decorations.push(
                  Decoration.inline(start, end, {
                    class: "wiki-link",
                    "data-link": match[1],
                  })
                );
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});
