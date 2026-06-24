import { describe, it, expect } from "vitest";
import { splitTextIntoAutolinkNodes } from "./content-autolink";
import { transformContentUrl } from "./content-url-safety";

interface LinkNode {
  type: string;
  url?: string;
  value?: string;
  children?: Array<{ value: string }>;
}

function links(text: string): Array<{ url: string; display: string }> {
  return (splitTextIntoAutolinkNodes(text) as LinkNode[])
    .filter((node) => node.type === "link")
    .map((node) => ({
      url: node.url ?? "",
      display: node.children?.[0]?.value ?? "",
    }));
}

describe("transformContentUrl", () => {
  it("allows common and custom safe schemes", () => {
    for (const url of [
      "https://example.com",
      "http://example.com",
      "mailto:foo@bar.com",
      "tel:+12025550123",
      "ssh://example.com",
      "ftp://files.example.com/a",
      "magnet:?xt=urn:btih:abc",
      "myapp://open/thing",
    ]) {
      expect(transformContentUrl(url)).toBe(url);
    }
  });

  it("blocks dangerous schemes", () => {
    expect(transformContentUrl("javascript:alert(1)")).toBe("");
    expect(transformContentUrl("vbscript:msgbox(1)")).toBe("");
    expect(transformContentUrl("data:text/html,<script>")).toBe("");
    expect(transformContentUrl("file:///etc/passwd")).toBe("");
  });

  it("treats relative and fragment URLs as safe", () => {
    expect(transformContentUrl("/tasks/123")).toBe("/tasks/123");
    expect(transformContentUrl("#section")).toBe("#section");
    expect(transformContentUrl("./a/b:c")).toBe("./a/b:c");
  });
});

describe("splitTextIntoAutolinkNodes", () => {
  it("returns a single unchanged text node when there is nothing to link", () => {
    const nodes = splitTextIntoAutolinkNodes("just plain words here");
    expect(nodes).toEqual([{ type: "text", value: "just plain words here" }]);
  });

  it("linkifies any scheme:// URL", () => {
    expect(links("connect ssh://example.com now")).toEqual([
      { url: "ssh://example.com", display: "ssh://example.com" },
    ]);
    expect(links("get ftp://files.example.com/a.txt please")).toEqual([
      {
        url: "ftp://files.example.com/a.txt",
        display: "ftp://files.example.com/a.txt",
      },
    ]);
  });

  it("renders mailto: and tel: without the scheme prefix", () => {
    expect(links("write mailto:foo@bar.com today")).toEqual([
      { url: "mailto:foo@bar.com", display: "foo@bar.com" },
    ]);
    expect(links("call tel:+1-202-555-0123 ok")).toEqual([
      { url: "tel:+12025550123", display: "+1-202-555-0123" },
    ]);
  });

  it("linkifies bare international phone numbers (+ and 00)", () => {
    expect(links("ring +49 151 23456789 please")).toEqual([
      { url: "tel:+4915123456789", display: "+49 151 23456789" },
    ]);
    expect(links("ring 0049 151 23456789 please")).toEqual([
      { url: "tel:+4915123456789", display: "0049 151 23456789" },
    ]);
  });

  it("does not linkify short numbers, years or decimals", () => {
    expect(links("code 12345 and year 2026 and 3.14159265")).toEqual([]);
    expect(links("invoice 2026-06-23 total")).toEqual([]);
  });

  it("linkifies bare domains but not filename-like extensions", () => {
    expect(links("visit example.com for info")).toEqual([
      { url: "http://example.com", display: "example.com" },
    ]);
    expect(links("open report.zip and readme.md and notes.sh")).toEqual([]);
  });

  it("does not create links for dangerous schemes", () => {
    expect(links("click javascript://alert(1) here")).toEqual([]);
    expect(links("open file://server/share now")).toEqual([]);
  });

  it("does not double-link a tel: URL as both scheme and bare phone", () => {
    expect(links("dial tel:+12025550123 now")).toEqual([
      { url: "tel:+12025550123", display: "+12025550123" },
    ]);
  });

  it("preserves surrounding text positions", () => {
    const nodes = splitTextIntoAutolinkNodes("a ssh://example.com b") as LinkNode[];
    expect(nodes.map((n) => n.value ?? n.children?.[0]?.value)).toEqual([
      "a ",
      "ssh://example.com",
      " b",
    ]);
  });
});
