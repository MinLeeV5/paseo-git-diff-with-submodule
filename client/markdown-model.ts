import { markdownHtml } from "./preview-model";

export type MarkdownNode = {
  key: number;
  tag: string;
  attributes: Record<string, string>;
  children: (MarkdownNode | string)[];
};

function decode(text: string) {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  };
  return text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => entities[entity]);
}

// Read only the markup emitted by our Markdown formatter, never arbitrary HTML.
// This shares escaping, supported syntax and heading IDs with the web preview.
export function markdownNodes(source: string, background: string): MarkdownNode[] {
  const root: MarkdownNode = { key: -1, tag: "root", attributes: {}, children: [] };
  const stack = [root];
  for (const match of markdownHtml(source, background).matchAll(/<([^>]+)>|([^<]+)/g)) {
    const parent = stack[stack.length - 1];
    if (match[2] !== undefined) {
      parent.children.push(decode(match[2]));
      continue;
    }
    const token = match[1];
    if (token.startsWith("/")) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const tag = /^\w+/.exec(token)?.[0];
    if (!tag) continue;
    const attributes = Object.fromEntries(
      [...token.matchAll(/([\w-]+)="([^"]*)"/g)].map((attribute) => [
        attribute[1],
        decode(attribute[2]),
      ]),
    );
    if (tag === "input") attributes.checked = /\schecked(?:\s|$)/.test(token) ? "true" : "false";
    const node: MarkdownNode = { key: match.index, tag, attributes, children: [] };
    parent.children.push(node);
    if (!["br", "hr", "img", "input"].includes(tag)) stack.push(node);
  }
  return root.children.filter((node): node is MarkdownNode => typeof node !== "string");
}
