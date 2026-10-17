export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if ((specifier.startsWith(".") || specifier.startsWith("/")) && !/\.\w+$/.test(specifier)) {
      return next(specifier + ".js", context);
    }
    throw e;
  }
}
export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".js") && !url.includes("node_modules")) {
    return { ...(await next(url, { ...context, format: "module" })), format: "module" };
  }
  return next(url, context);
}
