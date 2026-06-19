import type { Element, Root, Text } from 'hast';
import { SKIP, visit } from 'unist-util-visit';

// Replaces inline [n] citation markers in text nodes with <cite data-label="n">
// elements, so react-markdown can render them as citation chips without us having
// to split the answer's markdown block structure (a [n] mid-paragraph would
// otherwise break the paragraph in two). Runs on the parsed hast tree after
// remark-gfm; the chip's source mapping is resolved in the component, not here.
export function rehypeCitations() {
  return (tree: Root): void => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (index === undefined || parent === null || parent === undefined) {
        return;
      }
      if (!/\[\d+\]/.test(node.value)) {
        return;
      }

      const replacement: Array<Text | Element> = [];
      let last = 0;
      const pattern = /\[(\d+)\]/g;
      let match = pattern.exec(node.value);
      while (match !== null) {
        if (match.index > last) {
          replacement.push({ type: 'text', value: node.value.slice(last, match.index) });
        }
        replacement.push({
          type: 'element',
          tagName: 'cite',
          properties: { dataLabel: match[1] ?? '' },
          children: [],
        });
        last = match.index + match[0].length;
        match = pattern.exec(node.value);
      }
      if (last < node.value.length) {
        replacement.push({ type: 'text', value: node.value.slice(last) });
      }

      parent.children.splice(index, 1, ...replacement);
      return [SKIP, index + replacement.length];
    });
  };
}
