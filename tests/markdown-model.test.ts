import { describe, expect, it } from "vitest";
import { type MarkdownNode, markdownNodes } from "../client/markdown-model";

function descendants(nodes: (MarkdownNode | string)[]): MarkdownNode[] {
  return nodes.flatMap((node) =>
    typeof node === "string" ? [] : [node, ...descendants(node.children)],
  );
}

describe("native Markdown content", () => {
  it("preserves formatted blocks, inline code links, tasks, and Unicode heading anchors", () => {
    const nodes = markdownNodes(
      "# 安装 与 `运行`\n\n# 安装 与 `运行`\n\n[`入口`](<./a b.md#标题>)\n\n- [x] 完成\n- [ ] 待办\n\n| 项目 | 状态 |\n| --- | --- |\n| **预览** | 正常 |\n\n```ts\nconst ready = true;\n```",
      "#ffffff",
    );
    expect(nodes.map((node) => node.tag)).toEqual(["h1", "h1", "p", "ul", "div", "pre"]);
    expect(nodes.slice(0, 2).map((node) => node.attributes.id)).toEqual([
      "安装-与-运行",
      "安装-与-运行-1",
    ]);
    const all = descendants(nodes);
    const link = all.find((node) => node.tag === "a");
    expect(link?.attributes.href).toBe("./a b.md#标题");
    expect(link?.children).toEqual([expect.objectContaining({ tag: "code", children: ["入口"] })]);
    expect(
      all.filter((node) => node.tag === "input").map((node) => node.attributes.checked),
    ).toEqual(["true", "false"]);
    expect(all.filter((node) => node.tag === "tr")).toHaveLength(2);
    expect(
      all.some((node) => node.tag === "span" && node.attributes.style.startsWith("color:")),
    ).toBe(true);
  });

  it("keeps HTML literal, decodes entities once, and never creates executable links", () => {
    const nodes = markdownNodes(
      '<script>bad()</script> &amp; &lt; "quoted"\n\n[unsafe](javascript:alert) [safe](https://example.com/?a=1&b=2)\n\n`<tag>&value`',
      "#ffffff",
    );
    const all = descendants(nodes);
    expect(all.some((node) => node.tag === "script")).toBe(false);
    expect(nodes[0].children).toEqual(['<script>bad()</script> &amp; &lt; "quoted"']);
    expect(all.filter((node) => node.tag === "a").map((node) => node.attributes.href)).toEqual([
      "https://example.com/?a=1&b=2",
    ]);
    expect(all.find((node) => node.tag === "code")?.children).toEqual(["<tag>&value"]);
  });

  it("keeps Mermaid source available without a web renderer", () => {
    const nodes = markdownNodes('```mermaid\ngraph LR\nA["<script>"]-->B\n```', "#ffffff");
    expect(nodes[0].tag).toBe("figure");
    const source = descendants(nodes).find((node) => node.attributes.class === "mermaid-source");
    expect(source?.children).toEqual(['graph LR\nA["<script>"]-->B']);
  });
});
