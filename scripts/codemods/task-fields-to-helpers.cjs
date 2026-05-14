/**
 * Replace `<obj>.priority` / `<obj>.assigneePubkeys` / `<obj>.stateUpdates`
 * reads with the corresponding helper call for known task-post identifiers.
 * Skips writes (object literal property keys, assignment LHS, destructuring).
 */

const TASK_VAR_NAMES = new Set([
  "task",
  "child",
  "existingTask",
  "existing",
  "parentTask",
  "candidate",
  "post",
  "t",
  "entry",
  "item",
]);

const FIELD_TO_HELPER = {
  priority: "getTaskPriority",
  assigneePubkeys: "getTaskAssigneePubkeys",
  stateUpdates: "getTaskStateUpdates",
};

module.exports = function transform(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const helpersUsed = new Set();

  root.find(j.MemberExpression).forEach((path) => {
    const node = path.node;
    if (node.computed) return;
    if (node.property.type !== "Identifier") return;
    const helperName = FIELD_TO_HELPER[node.property.name];
    if (!helperName) return;
    const obj = node.object;
    if (obj.type !== "Identifier") return;
    if (!TASK_VAR_NAMES.has(obj.name)) return;

    const parent = path.parent.node;
    if (parent.type === "AssignmentExpression" && parent.left === node) return;
    if (parent.type === "Property" && parent.key === node && !parent.computed) return;
    if (parent.type === "ObjectPattern") return;

    path.replace(j.callExpression(j.identifier(helperName), [obj]));
    helpersUsed.add(helperName);
  });

  if (helpersUsed.size === 0) return null;

  // Ensure each used helper is value-imported from "@/types".
  const existingTypesValueImports = root
    .find(j.ImportDeclaration, { source: { value: "@/types" } })
    .filter((p) => p.node.importKind !== "type");

  for (const helperName of helpersUsed) {
    const alreadyImported = root
      .find(j.ImportDeclaration, { source: { value: "@/types" } })
      .filter((p) =>
        (p.node.specifiers || []).some(
          (s) => s.type === "ImportSpecifier" && s.imported.name === helperName
        )
      )
      .size() > 0;
    if (alreadyImported) continue;

    if (existingTypesValueImports.size() > 0) {
      const decl = existingTypesValueImports.get(0).node;
      decl.specifiers.push(j.importSpecifier(j.identifier(helperName)));
    } else {
      const newImport = j.importDeclaration(
        [j.importSpecifier(j.identifier(helperName))],
        j.literal("@/types")
      );
      root.get().node.program.body.unshift(newImport);
    }
  }

  return root.toSource();
};
