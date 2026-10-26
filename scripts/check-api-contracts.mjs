import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const specPath = process.argv[2];
if (!specPath) throw new Error("Usage: node check-api-contracts.mjs <openapi.json>");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = join(scriptDir, "../src/lib/api");
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const methods = new Set(["get", "post", "put", "patch", "delete", "options", "head"]);

function localInitializer(name, scope) {
  if (!scope) return undefined;
  let initializer;
  function visit(node) {
    if (node !== scope && ts.isFunctionLike(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      initializer = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(scope);
  if (!initializer) {
    const source = scope.getSourceFile();
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
          initializer = declaration.initializer;
        }
      }
    }
  }
  return initializer;
}

function evaluatePath(node, scope, seen = new Set()) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return evaluatePath(node.expression, scope, seen);
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      const value = evaluatePath(span.expression, scope, seen);
      result += value ?? "{}";
      result += span.literal.text;
    }
    return result;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = evaluatePath(node.left, scope, seen);
    const right = evaluatePath(node.right, scope, seen);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (ts.isConditionalExpression(node)) {
    const whenTrue = evaluatePath(node.whenTrue, scope, seen);
    const whenFalse = evaluatePath(node.whenFalse, scope, seen);
    if (whenTrue?.startsWith("?") || whenFalse?.startsWith("?")) return "?";
    return whenTrue ?? whenFalse;
  }
  if (ts.isCallExpression(node)) {
    const name = ts.isIdentifier(node.expression) ? node.expression.text : "";
    if (name === "withQuery") return evaluatePath(node.arguments[0], scope, seen);
    if (name === "encodeURIComponent") return "{}";
  }
  if (ts.isIdentifier(node)) {
    if (node.text === "API_BASE") return "";
    if (seen.has(node.text)) return undefined;
    const initializer = localInitializer(node.text, scope);
    if (!initializer) return undefined;
    const next = new Set(seen);
    next.add(node.text);
    return evaluatePath(initializer, scope, next);
  }
  return undefined;
}

function requestMethod(call, defaultMethod) {
  const init = call.arguments[1];
  if (!init || !ts.isObjectLiteralExpression(init)) return defaultMethod;
  const property = init.properties.find(
    (item) =>
      (ts.isPropertyAssignment(item) || ts.isShorthandPropertyAssignment(item)) &&
      item.name?.getText() === "method",
  );
  return property && ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)
    ? property.initializer.text.toLowerCase()
    : defaultMethod;
}

function normalizedPath(value) {
  const path = value.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
  if (!path.startsWith("/api/") && path !== "/health") return undefined;
  return path
    .split("/")
    .map((part) => (part.includes("{}") || /^\{[^}]+\}$/.test(part) ? "{}" : part))
    .join("/");
}

const frontendOperations = new Map();
const unresolved = [];
for (const fileName of readdirSync(apiDir).filter(
  (name) => name.endsWith(".ts") && name !== "client.ts",
)) {
  const sourcePath = join(apiDir, fileName);
  const source = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node, currentScope) {
    const scope = ts.isFunctionLike(node) ? node : currentScope;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      if (callee === "apiFetch" || callee === "fetch") {
        const rawPath = evaluatePath(node.arguments[0], scope);
        const path = rawPath && normalizedPath(rawPath);
        if (!path) {
          unresolved.push(
            `${fileName}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`,
          );
        } else {
          const operation = `${requestMethod(node, "get")} ${path}`;
          const location = `${fileName}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
          frontendOperations.set(operation, [
            ...(frontendOperations.get(operation) ?? []),
            location,
          ]);
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  }
  visit(source, undefined);
}

if (process.argv.includes("--frontend-json")) {
  console.log(JSON.stringify([...frontendOperations.keys()]));
  process.exit(0);
}

const backendOperations = new Set();
for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  const canonical = path
    .split("/")
    .map((part) => (/^\{[^}]+\}$/.test(part) ? "{}" : part))
    .join("/");
  for (const method of methods) {
    if (pathItem[method]) backendOperations.add(`${method} ${canonical}`);
  }
}

function operationMatches(frontendOperation, backendOperation) {
  const [frontendMethod, frontendPath] = frontendOperation.split(" ", 2);
  const [backendMethod, backendPath] = backendOperation.split(" ", 2);
  if (frontendMethod !== backendMethod) return false;
  const frontendSegments = frontendPath.split("/");
  const backendSegments = backendPath.split("/");
  return (
    frontendSegments.length === backendSegments.length &&
    frontendSegments.every(
      (segment, index) =>
        segment === "{}" || backendSegments[index] === "{}" || segment === backendSegments[index],
    )
  );
}

const missing = [...frontendOperations.keys()]
  .filter(
    (operation) =>
      ![...backendOperations].some((candidate) => operationMatches(operation, candidate)),
  )
  .sort();
console.log(`Frontend API operations checked: ${frontendOperations.size}`);
console.log(`Backend OpenAPI operations available: ${backendOperations.size}`);
if (unresolved.length) {
  console.error("Could not statically resolve frontend API calls:");
  for (const location of unresolved) console.error(`  ${location}`);
}
if (missing.length) {
  console.error("Frontend operations missing from backend OpenAPI:");
  for (const operation of missing) {
    console.error(`  ${operation} (${frontendOperations.get(operation).join(", ")})`);
  }
}
if (unresolved.length || missing.length) process.exitCode = 1;
