/**
 * Replace object-literal `state: { status: "X", description?: "..." }` properties
 * inside test files with `stateUpdates: [...]` synthesized via withTaskState
 * when the literal is `{ ...task, state: ... }`, otherwise inline a single
 * stateUpdate entry.
 *
 * Conservative — only rewrites when:
 *   - Property name is `state`
 *   - Value is an ObjectExpression with `status` (and optional `description`)
 */

module.exports = function transform(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let modified = false;

  root
    .find(j.Property, { key: { name: "state" } })
    .forEach((path) => {
      const node = path.node;
      if (node.computed) return;
      if (node.shorthand) return;
      if (node.value.type !== "ObjectExpression") return;
      const statusProp = node.value.properties.find(
        (p) =>
          p.type === "Property" &&
          p.key.type === "Identifier" &&
          p.key.name === "status"
      );
      if (!statusProp) return;
      const statusValue = statusProp.value;
      if (statusValue.type !== "Literal" && statusValue.type !== "StringLiteral") return;

      const parent = path.parent.node;
      if (parent.type !== "ObjectExpression") return;
      // Look for a SpreadElement before this in the parent.
      const propIndex = parent.properties.indexOf(node);
      let baseExpr = null;
      for (let i = propIndex - 1; i >= 0; i--) {
        const sibling = parent.properties[i];
        if (sibling.type === "SpreadElement") {
          baseExpr = sibling.argument;
          break;
        }
      }
      if (baseExpr) {
        // Replace `{ ...base, state: { ... } }` → `withTaskState(base, "<status>")`
        // Only safe when the literal has nothing else of substance besides the spread + state.
        // We mutate by removing the state prop and wrapping the parent.
        // Simpler: just replace state property with stateUpdates property using base.id/timestamp/author.
        const baseId = j.memberExpression(baseExpr, j.identifier("id"));
        const baseTimestamp = j.memberExpression(baseExpr, j.identifier("timestamp"));
        const baseAuthorPubkey = j.memberExpression(
          j.memberExpression(baseExpr, j.identifier("author")),
          j.identifier("pubkey")
        );
        const newProperty = j.property(
          "init",
          j.identifier("stateUpdates"),
          j.arrayExpression([
            j.objectExpression([
              j.property(
                "init",
                j.identifier("id"),
                j.templateLiteral(
                  [
                    j.templateElement({ raw: "synthetic-", cooked: "synthetic-" }, false),
                    j.templateElement({ raw: "", cooked: "" }, true),
                  ],
                  [baseId]
                )
              ),
              j.property("init", j.identifier("state"), node.value),
              j.property("init", j.identifier("timestamp"), baseTimestamp),
              j.property("init", j.identifier("authorPubkey"), baseAuthorPubkey),
            ]),
          ])
        );
        path.replace(newProperty);
        modified = true;
      }
    });

  if (!modified) return null;
  return root.toSource();
};
