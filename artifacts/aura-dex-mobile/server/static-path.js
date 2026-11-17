const path = require("path");

function resolveWithinRoot(root, requestPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(String(requestPath).split("?", 1)[0]);
  } catch {
    return null;
  }

  const normalizedPath = decodedPath.replace(/\\/g, "/");
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(
    resolvedRoot,
    `.${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`,
  );
  const relativePath = path.relative(resolvedRoot, resolvedFile);

  if (
    relativePath === ".."
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    return null;
  }
  return resolvedFile;
}

module.exports = { resolveWithinRoot };
