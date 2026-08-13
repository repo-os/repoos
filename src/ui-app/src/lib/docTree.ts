/**
 * Doc file-tree helpers for the Context page: build an arbitrary-depth tree
 * from flat doc paths, then flatten it into a display list driven by a set of
 * expanded keys. Directories are keyed by their FULL slash-joined path so two
 * directories that share a name at different depths never collide, and the
 * flatten step recurses to any depth (no hardcoded template nesting).
 */

export interface DocTreeNode {
  name: string;
  /** Full slash-joined path of the node — unique even for same-named dirs. */
  key: string;
  isFile: boolean;
  /** The doc path to load; present only on file nodes. */
  path?: string;
  children?: DocTreeNode[];
}

interface Builder {
  name: string;
  key: string;
  isFile: boolean;
  path?: string;
  children: Record<string, Builder>;
}

/**
 * Build a tree from flat doc paths. Directories sort before files, each level
 * alphabetically; every node gets a full-path key.
 */
export function buildDocTree(items: { path: string }[]): DocTreeNode[] {
  const root: Record<string, Builder> = {};

  for (const item of items) {
    if (!item.path) continue;
    const parts = item.path.split("/");
    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const key = parts.slice(0, i + 1).join("/");
      if (!level[part]) {
        level[part] = {
          name: part,
          key,
          isFile: isLast,
          path: isLast ? item.path : undefined,
          children: {},
        };
      }
      if (!isLast) level = level[part].children;
    }
  }

  const toList = (obj: Record<string, Builder>): DocTreeNode[] =>
    Object.values(obj)
      .sort((a, b) => {
        if (a.isFile === b.isFile) return a.name.localeCompare(b.name);
        return a.isFile ? 1 : -1;
      })
      .map((n) => {
        const node: DocTreeNode = { name: n.name, key: n.key, isFile: n.isFile, path: n.path };
        const children = toList(n.children);
        if (children.length) node.children = children;
        return node;
      });

  return toList(root);
}

export interface DocTreeFlatNode {
  key: string;
  name: string;
  isFile: boolean;
  path?: string;
  /** Nesting level for indentation. */
  depth: number;
}

/**
 * Flatten a tree into the rows to render. Collapsed directories emit only
 * their own row; expanded directories also emit their children, recursively,
 * at `depth + 1` — so the template is a single flat `v-for` with no depth cap.
 */
export function flattenDocTree(nodes: DocTreeNode[], expanded: Set<string>): DocTreeFlatNode[] {
  const out: DocTreeFlatNode[] = [];
  const walk = (list: DocTreeNode[], depth: number): void => {
    for (const n of list) {
      out.push({ key: n.key, name: n.name, isFile: n.isFile, path: n.path, depth });
      if (!n.isFile && n.children && expanded.has(n.key)) walk(n.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}
