/**
 * Replace `<obj>.state` reads with `getTaskState(<obj>)` for known task identifiers.
 * Skips writes (object literal property keys, assignment LHS).
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
]);

module.exports = function transform(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let used = false;

  root
    .find(j.MemberExpression, { property: { name: "state" } })
    .forEach((path) => {
      const node = path.node;
      if (node.computed) return;
      const obj = node.object;
      if (obj.type !== "Identifier") return;
      if (!TASK_VAR_NAMES.has(obj.name)) return;

      const parent = path.parent.node;
      // Skip if this MemberExpression is the LHS of an assignment.
      if (parent.type === "AssignmentExpression" && parent.left === node) return;
      // Skip if this is itself a property key (handled by Property node, but safe-guard).
      if (parent.type === "Property" && parent.key === node && !parent.computed) return;
      // Skip if it's part of a destructuring pattern.
      if (parent.type === "ObjectPattern") return;

      path.replace(j.callExpression(j.identifier("getTaskState"), [obj]));
      used = true;
    });

  if (!used) return null;

  // Ensure `getTaskState` is imported from "@/types".
  const hasImport = root
    .find(j.ImportDeclaration, { source: { value: "@/types" } })
    .filter((p) =>
      (p.node.specifiers || []).some(
        (s) => s.type === "ImportSpecifier" && s.imported.name === "getTaskState"
      )
    )
    .size() > 0;

  if (!hasImport) {
    const existingTypesImport = root.find(j.ImportDeclaration, { source: { value: "@/types" } });
    if (existingTypesImport.size() > 0) {
      const decl = existingTypesImport.get(0).node;
      decl.specifiers.push(j.importSpecifier(j.identifier("getTaskState")));
    } else {
      const newImport = j.importDeclaration(
        [j.importSpecifier(j.identifier("getTaskState"))],
        j.literal("@/types")
      );
      root.get().node.program.body.unshift(newImport);
    }
  }

  return root.toSource();
};
