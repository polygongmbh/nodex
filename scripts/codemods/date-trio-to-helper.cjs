/**
 * Replace `<obj>.dueDate` / `<obj>.dueTime` / `<obj>.dateType` reads with
 * `getTaskPrimaryDate(<obj>)?.date|time|type` for known task identifiers.
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
  "intent",
  "draft",
  "entry",
  "item",
]);

const FIELD_TO_PROP = {
  dueDate: "date",
  dueTime: "time",
  dateType: "type",
};

module.exports = function transform(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let used = false;

  root.find(j.MemberExpression).forEach((path) => {
    const node = path.node;
    if (node.computed) return;
    if (node.property.type !== "Identifier") return;
    const fieldName = node.property.name;
    const targetProp = FIELD_TO_PROP[fieldName];
    if (!targetProp) return;
    const obj = node.object;
    if (obj.type !== "Identifier") return;
    if (!TASK_VAR_NAMES.has(obj.name)) return;

    const parent = path.parent.node;
    if (parent.type === "AssignmentExpression" && parent.left === node) return;
    if (parent.type === "Property" && parent.key === node && !parent.computed) return;
    if (parent.type === "ObjectPattern") return;

    // Replace with getTaskPrimaryDate(obj)?.<targetProp>
    const helperCall = j.callExpression(j.identifier("getTaskPrimaryDate"), [obj]);
    const optionalAccess = j.optionalMemberExpression(
      helperCall,
      j.identifier(targetProp),
      false,
      true
    );
    path.replace(optionalAccess);
    used = true;
  });

  if (!used) return null;

  // Ensure `getTaskPrimaryDate` is imported from "@/types".
  const hasImport = root
    .find(j.ImportDeclaration, { source: { value: "@/types" } })
    .filter((p) =>
      (p.node.specifiers || []).some(
        (s) => s.type === "ImportSpecifier" && s.imported.name === "getTaskPrimaryDate"
      )
    )
    .size() > 0;

  if (!hasImport) {
    const existingTypesImport = root.find(j.ImportDeclaration, {
      source: { value: "@/types" },
    });
    if (existingTypesImport.size() > 0) {
      // Find an existing value-import declaration (importKind !== "type") if any.
      let added = false;
      existingTypesImport.forEach((p) => {
        if (added) return;
        if (p.node.importKind === "type") return;
        p.node.specifiers.push(j.importSpecifier(j.identifier("getTaskPrimaryDate")));
        added = true;
      });
      if (!added) {
        const newImport = j.importDeclaration(
          [j.importSpecifier(j.identifier("getTaskPrimaryDate"))],
          j.literal("@/types")
        );
        root.get().node.program.body.unshift(newImport);
      }
    } else {
      const newImport = j.importDeclaration(
        [j.importSpecifier(j.identifier("getTaskPrimaryDate"))],
        j.literal("@/types")
      );
      root.get().node.program.body.unshift(newImport);
    }
  }

  return root.toSource();
};
