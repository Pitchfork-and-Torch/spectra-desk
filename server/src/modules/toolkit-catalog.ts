/**
 * Spectra Desk Toolkit catalog - operator search URL library (v7).
 * Sourced from public search endpoints (Exploratores-inspired catalog).
 */
import catalogJson from "../data/toolkit-catalog.json" with { type: "json" };

export interface ToolkitTool {
  id: string;
  category: string;
  group: string;
  categoryLabel: string;
  urlTemplate: string;
  validator: string | null;
  noInput: boolean;
  placeholders: string[];
}

export interface ToolkitCategory {
  id: string;
  count: number;
  label: string;
  group: string;
}

export interface ToolkitCatalog {
  source: {
    project: string;
    upstream: string;
    version: string;
    note: string;
  };
  generatedAt: string;
  toolCount: number;
  categories: ToolkitCategory[];
  tools: ToolkitTool[];
}

let cached: ToolkitCatalog | null = null;

export function loadToolkitCatalog(): ToolkitCatalog {
  if (cached) return cached;
  cached = catalogJson as ToolkitCatalog;
  return cached;
}

export function listToolkitCategories(): ToolkitCategory[] {
  return loadToolkitCatalog().categories;
}

export function listToolkitTools(opts?: {
  category?: string;
  group?: string;
  query?: string;
  limit?: number;
}): ToolkitTool[] {
  const cat = loadToolkitCatalog();
  let tools = cat.tools;
  if (opts?.category) tools = tools.filter((t) => t.category === opts.category);
  if (opts?.group) tools = tools.filter((t) => t.group === opts.group);
  if (opts?.query) {
    const q = opts.query.toLowerCase();
    tools = tools.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.categoryLabel.toLowerCase().includes(q) ||
        t.urlTemplate.toLowerCase().includes(q),
    );
  }
  if (opts?.limit && opts.limit > 0) tools = tools.slice(0, opts.limit);
  return tools;
}

export function getToolkitTool(id: string): ToolkitTool | undefined {
  return loadToolkitCatalog().tools.find((t) => t.id === id);
}

/** Fill a urlTemplate with params. Unknown placeholders stay as-is. */
export function resolveToolkitUrl(
  tool: ToolkitTool | string,
  params: Record<string, string>,
): { url: string; missing: string[]; tool: ToolkitTool } | { error: string } {
  const t = typeof tool === "string" ? getToolkitTool(tool) : tool;
  if (!t) return { error: `Unknown toolkit tool: ${tool}` };

  if (t.noInput) {
    return { url: t.urlTemplate, missing: [], tool: t };
  }

  const missing: string[] = [];
  let url = t.urlTemplate;
  for (const key of t.placeholders) {
    const val = params[key];
    if (val === undefined || val === "") {
      missing.push(key);
      continue;
    }
    const encoded = encodeURIComponent(val);
    url = url.split(`{${key}}`).join(encoded);
  }
  // Also accept unlisted keys for flexible templates
  for (const [key, val] of Object.entries(params)) {
    if (!val) continue;
    if (url.includes(`{${key}}`)) {
      url = url.split(`{${key}}`).join(encodeURIComponent(val));
    }
  }
  return { url, missing, tool: t };
}

export function toolkitStats(): {
  toolCount: number;
  categories: number;
  groups: string[];
  source: ToolkitCatalog["source"];
} {
  const c = loadToolkitCatalog();
  const groups = [...new Set(c.categories.map((x) => x.group))].sort();
  return {
    toolCount: c.toolCount,
    categories: c.categories.length,
    groups,
    source: c.source,
  };
}
