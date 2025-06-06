// Copyright (c) Microsoft Corporation
// Licensed under the MIT license.

import { Operation, Type } from "@typespec/compiler";
import {
  HttpOperation,
  HttpService,
  HttpVerb,
  OperationContainer,
  getHeaderFieldName,
  getHttpOperation,
  isHeader,
} from "@typespec/http";
import {
  createOrGetModuleForNamespace,
  emitNamespaceInterfaceReference,
} from "../../common/namespace.js";
import { emitTypeReference } from "../../common/reference.js";
import { Module, createModule } from "../../ctx.js";
import { ReCase, parseCase } from "../../util/case.js";
import { bifilter, indent } from "../../util/iter.js";
import { keywordSafe } from "../../util/keywords.js";
import { HttpContext } from "../index.js";

import { module as headerHelpers } from "../../../generated-defs/helpers/header.js";
import { module as routerHelper } from "../../../generated-defs/helpers/router.js";
import { differentiateModelTypes, writeCodeTree } from "../../util/differentiate.js";
import { canonicalizeHttpOperation } from "../operation.js";

/**
 * Emit a router for the HTTP operations defined in a given service.
 *
 * The generated router will use optimal prefix matching to dispatch requests to the appropriate underlying
 * implementation using the raw server.
 *
 * @param ctx - The emitter context.
 * @param service - The HTTP service to emit a router for.
 * @param serverRawModule - The module that contains the raw server implementation.
 */
export function emitRouter(ctx: HttpContext, service: HttpService, serverRawModule: Module) {
  const routerModule = createModule("router", ctx.httpModule);

  const routeTree = createRouteTree(ctx, service);

  routerModule.imports.push({
    binder: "* as http",
    from: "node:http",
  });

  routerModule.imports.push({
    binder: "* as serverRaw",
    from: serverRawModule,
  });

  routerModule.imports.push({
    binder: ["parseHeaderValueParameters"],
    from: headerHelpers,
  });

  routerModule.declarations.push([...emitRouterDefinition(ctx, service, routeTree, routerModule)]);
}

/**
 * Writes the code for a router of a given service.
 *
 * @param ctx - The emitter context.
 * @param service - The HTTP service to emit a router for.
 * @param routeTree - The service's route tree.
 * @param module - The module we're writing to.
 */
function* emitRouterDefinition(
  ctx: HttpContext,
  service: HttpService,
  routeTree: RouteTree,
  module: Module,
): Iterable<string> {
  const routerName = parseCase(service.namespace.name).pascalCase + "Router";

  const uniqueContainers = new Set(service.operations.map((operation) => operation.container));

  const backends = new Map<OperationContainer, [ReCase, string]>();

  for (const container of uniqueContainers) {
    const param = parseCase(container.name);

    const traitConstraint =
      container.kind === "Namespace"
        ? emitNamespaceInterfaceReference(ctx, container, module)
        : emitTypeReference(ctx, container, container, module);

    module.imports.push({
      binder: [param.pascalCase],
      from: createOrGetModuleForNamespace(ctx, container.namespace!),
    });

    backends.set(container, [param, traitConstraint]);
  }

  module.imports.push({
    binder: ["RouterOptions", "createPolicyChain", "createPolicyChainForRoute", "HttpContext"],
    from: routerHelper,
  });

  yield `export interface ${routerName} {`;
  yield `  /**`;
  yield `   * Dispatches the request to the appropriate service based on the request path.`;
  yield `   *`;
  yield `   * This member function may be used directly as a handler for a Node HTTP server.`;
  yield `   *`;
  yield `   * @param request - The incoming HTTP request.`;
  yield `   * @param response - The outgoing HTTP response.`;
  yield `   */`;
  yield `  dispatch(request: http.IncomingMessage, response: http.ServerResponse): void;`;

  if (ctx.options.express) {
    yield "";
    yield `  /**`;
    yield `   * An Express middleware function that dispatches the request to the appropriate service based on the request path.`;
    yield `   *`;
    yield `   * This member function may be used directly as an application-level middleware function in an Express app.`;
    yield `   *`;
    yield `   * If the router does not match a route, it will call the \`next\` middleware registered with the application,`;
    yield `   * so it is sensible to insert this middleware at the beginning of the middleware stack.`;
    yield `   *`;
    yield `   * @param req - The incoming HTTP request.`;
    yield `   * @param res - The outgoing HTTP response.`;
    yield `   * @param next - The next middleware function in the stack.`;
    yield `   */`;
    yield `  expressMiddleware(req: http.IncomingMessage, res: http.ServerResponse, next: () => void): void;`;
  }

  yield "}";
  yield "";

  yield `export function create${routerName}(`;

  for (const [param] of backends.values()) {
    yield `  ${keywordSafe(param.camelCase)}: ${param.pascalCase},`;
  }

  yield `  options: RouterOptions<{`;
  for (const [param] of backends.values()) {
    yield `    ${keywordSafe(param.camelCase)}: ${param.pascalCase}<HttpContext>,`;
  }
  yield `  }> = {}`;
  yield `): ${routerName} {`;

  const [onRequestNotFound, onInvalidRequest, onInternalError] = [
    "onRequestNotFound",
    "onInvalidRequest",
    "onInternalError",
  ].map(ctx.gensym);

  // Router error case handlers
  yield `  const ${onRequestNotFound} = options.onRequestNotFound ?? ((ctx) => {`;
  yield `    ctx.response.statusCode = 404;`;
  yield `    ctx.response.setHeader("Content-Type", "text/plain");`;
  yield `    ctx.response.end("Not Found");`;
  yield `  });`;
  yield "";
  yield `  const ${onInvalidRequest} = options.onInvalidRequest ?? ((ctx, route, error) => {`;
  yield `    ctx.response.statusCode = 400;`;
  yield `    ctx.response.setHeader("Content-Type", "application/json");`;
  yield `    ctx.response.end(JSON.stringify({ error }));`;
  yield `  });`;
  yield "";
  yield `  const ${onInternalError} = options.onInternalError ?? ((ctx, error) => {`;
  yield `    ctx.response.statusCode = 500;`;
  yield `    ctx.response.setHeader("Content-Type", "text/plain");`;
  yield `    ctx.response.end("Internal server error.");`;
  yield `  });`;
  yield "";

  const routePolicies = ctx.gensym("routePolicies");
  const routeHandlers = ctx.gensym("routeHandlers");

  yield `  const ${routePolicies} = options.routePolicies ?? {};`;
  yield "";
  yield `  const ${routeHandlers} = {`;

  // Policy chains for each operation
  for (const operation of service.operations) {
    const operationName = parseCase(operation.operation.name);
    const containerName = parseCase(operation.container.name);

    yield `    ${containerName.snakeCase}_${operationName.snakeCase}: createPolicyChainForRoute(`;
    yield `      "${containerName.camelCase + operationName.pascalCase + "Dispatch"}",`;
    yield `      ${routePolicies},`;
    yield `      "${containerName.camelCase}",`;
    yield `      "${operationName.camelCase}",`;
    yield `      serverRaw.${containerName.snakeCase}_${operationName.snakeCase},`;
    yield `    ),`;
  }

  yield `  } as const;`;
  yield "";

  // Core routing function definition
  yield `  const dispatch = createPolicyChain("${routerName}Dispatch", options.policies ?? [], async function(ctx, request, response) {`;
  yield `    const url = new URL(request.url!, \`http://\${request.headers.host}\`);`;
  yield `    let path = url.pathname;`;
  yield "";

  yield* indent(indent(emitRouteHandler(ctx, routeHandlers, routeTree, backends, module)));

  yield "";

  yield `    return ctx.errorHandlers.onRequestNotFound(ctx);`;
  yield `  });`;
  yield "";

  const errorHandlers = ctx.gensym("errorHandlers");

  yield `  const ${errorHandlers} = {`;
  yield `    onRequestNotFound: ${onRequestNotFound},`;
  yield `    onInvalidRequest: ${onInvalidRequest},`;
  yield `    onInternalError: ${onInternalError},`;
  yield `  };`;

  yield `  return {`;
  yield `    dispatch(request, response) {`;
  yield `      const ctx = { request, response, errorHandlers: ${errorHandlers} };`;
  yield `      return dispatch(ctx, request, response).catch((e) => ${onInternalError}(ctx, e));`;
  yield `    },`;

  if (ctx.options.express) {
    yield `    expressMiddleware: function (request, response, next) {`;
    yield `      const ctx = { request, response, errorHandlers: ${errorHandlers} };`;
    yield `      void dispatch(`;
    yield `        { request, response, errorHandlers: {`;
    yield `          ...${errorHandlers},`;
    yield `          onRequestNotFound: function () { next() }`;
    yield `        }},`;
    yield `        request,`;
    yield `        response`;
    yield `      ).catch((e) => ${onInternalError}(ctx, e));`;
    yield `    },`;
  }

  yield "  }";
  yield "}";
}

/**
 * Writes handling code for a single route tree node.
 *
 * @param ctx - The emitter context.
 * @param routeTree - The route tree node to write handling code for.
 * @param backends - The map of backends for operations.
 * @param module - The module we're writing to.
 */
function* emitRouteHandler(
  ctx: HttpContext,
  routeHandlers: string,
  routeTree: RouteTree,
  backends: Map<OperationContainer, [ReCase, string]>,
  module: Module,
): Iterable<string> {
  const mustTerminate = routeTree.edges.length === 0 && !routeTree.bind;

  const onRouteNotFound = "ctx.errorHandlers.onRequestNotFound";

  yield `if (path.length === 0) {`;
  if (routeTree.operations.size > 0) {
    yield* indent(
      emitRouteOperationDispatch(ctx, routeHandlers, routeTree.operations, backends, module),
    );
  } else {
    // Not found
    yield `  return ${onRouteNotFound}(ctx);`;
  }
  yield `}`;

  if (mustTerminate) {
    // Not found
    yield "else {";
    yield `  return ${onRouteNotFound}(ctx);`;
    yield `}`;
    return;
  }

  for (const [edge, nextTree] of routeTree.edges) {
    const edgePattern = edge.length === 1 ? `'${edge}'` : JSON.stringify(edge);
    yield `else if (path.startsWith(${edgePattern})) {`;
    yield `  path = path.slice(${edge.length});`;
    yield* indent(emitRouteHandler(ctx, routeHandlers, nextTree, backends, module));
    yield "}";
  }

  if (routeTree.bind) {
    const [parameterSet, nextTree] = routeTree.bind;
    const parameters = [...parameterSet];

    yield `else {`;
    const paramName = parameters.length === 1 ? parameters[0] : "param";
    const idxName = `__${parseCase(paramName).snakeCase}_idx`;
    yield `  let ${idxName} = path.indexOf("/");`;
    yield `  ${idxName} = ${idxName} === -1 ? path.length : ${idxName};`;
    yield `  const ${paramName} = path.slice(0, ${idxName});`;
    yield `  path = path.slice(${idxName});`;
    if (parameters.length !== 1) {
      for (const p of parameters) {
        yield `  const ${parseCase(p).camelCase} = param;`;
      }
    }
    yield* indent(emitRouteHandler(ctx, routeHandlers, nextTree, backends, module));

    yield `}`;
  }
}

/**
 * Writes the dispatch code for a specific set of operations mapped to the same route.
 *
 * @param ctx - The emitter context.
 * @param operations - The operations mapped to the route.
 * @param backends - The map of backends for operations.
 */
function* emitRouteOperationDispatch(
  ctx: HttpContext,
  routeHandlers: string,
  operations: Map<HttpVerb, RouteOperation[]>,
  backends: Map<OperationContainer, [ReCase, string]>,
  module: Module,
): Iterable<string> {
  yield `switch (request.method) {`;
  for (const [verb, operationList] of operations.entries()) {
    if (operationList.length === 1) {
      const operation = operationList[0];
      const [backend] = backends.get(operation.container)!;
      const operationName = keywordSafe(
        backend.snakeCase + "_" + parseCase(operation.operation.name).snakeCase,
      );

      const backendMemberName = keywordSafe(backend.camelCase);

      const parameters =
        operation.parameters.length > 0
          ? ", " + operation.parameters.map((param) => parseCase(param.name).camelCase).join(", ")
          : "";

      yield `  case ${JSON.stringify(verb.toUpperCase())}:`;
      yield `    return ${routeHandlers}.${operationName}(ctx, ${backendMemberName}${parameters});`;
    } else {
      // Shared route
      yield `  case ${JSON.stringify(verb.toUpperCase())}:`;
      yield* indent(
        indent(
          emitRouteOperationDispatchMultiple(ctx, routeHandlers, operationList, backends, module),
        ),
      );
    }
  }

  yield `  default:`;
  yield `    return ctx.errorHandlers.onRequestNotFound(ctx);`;

  yield "}";
}

/**
 * Writes the dispatch code for a specific set of operations mapped to the same route.
 *
 * @param ctx - The emitter context.
 * @param operations - The operations mapped to the route.
 * @param backends - The map of backends for operations.
 */
function* emitRouteOperationDispatchMultiple(
  ctx: HttpContext,
  routeHandlers: string,
  operations: RouteOperation[],
  backends: Map<OperationContainer, [ReCase, string]>,
  module: Module,
): Iterable<string> {
  const differentiated = differentiateModelTypes(
    ctx,
    module,
    new Set(operations.map((op) => op.operation.parameters)),
    {
      renderPropertyName(prop): string {
        return getHeaderFieldName(ctx.program, prop);
      },
      filter(prop): boolean {
        return isHeader(ctx.program, prop);
      },
      else: {
        kind: "verbatim",
        body: [`return ctx.errorHandlers.onRequestNotFound(ctx);`],
      },
    },
  );

  yield* writeCodeTree(ctx, differentiated, {
    referenceModelProperty(p) {
      const headerName = getHeaderFieldName(ctx.program, p);
      return `request.headers["${headerName}"]`;
    },
    *renderResult(type) {
      const operation = operations.find((op) => op.operation.parameters === type)!;
      const [backend] = backends.get(operation.container)!;
      const operationName = keywordSafe(
        backend.snakeCase + "_" + parseCase(operation.operation.name).snakeCase,
      );

      const backendMemberName = keywordSafe(backend.camelCase);

      const parameters =
        operation.parameters.length > 0
          ? ", " + operation.parameters.map((param) => parseCase(param.name).camelCase).join(", ")
          : "";

      yield `return ${routeHandlers}.${operationName}(ctx, ${backendMemberName}${parameters});`;
    },
    subject: "(request.headers)",
  });
}

/**
 * A tree of routes in an HTTP router domain.
 */
interface RouteTree {
  /**
   * A list of operations that can be dispatched at this node.
   */
  operations: Map<HttpVerb, RouteOperation[]>;
  /**
   * A set of parameters that are bound in this position before proceeding along the subsequent tree.
   */
  bind?: [Set<string>, RouteTree];
  /**
   * A list of static edges that can be taken from this node.
   */
  edges: RouteTreeEdge[];
}

/**
 * An edge in the route tree. The edge contains a literal string prefix that must match before the next node is visited.
 */
type RouteTreeEdge = readonly [string, RouteTree];

/**
 * An operation that may be dispatched at a given tree node.
 */
interface RouteOperation {
  /**
   * The HTTP operation corresponding to this route operation.
   */
  operation: Operation;
  /**
   * The operation's container.
   */
  container: OperationContainer;
  /**
   * The path parameters that the route template for this operation binds.
   */
  parameters: RouteParameter[];
  /**
   * The HTTP verb (GET, PUT, etc.) that this operation requires.
   */
  verb: HttpVerb;
}

/**
 * A single route split into segments of strings and parameters.
 */
interface Route extends RouteOperation {
  segments: RouteSegment[];
}

/**
 * A segment of a single route.
 */
type RouteSegment = string | RouteParameter;

/**
 * A parameter in the route segment with its expected type.
 */
interface RouteParameter {
  name: string;
  type: Type;
}

/**
 * Create a route tree for a given service.
 */
function createRouteTree(ctx: HttpContext, service: HttpService): RouteTree {
  // First get the Route for each operation in the service.
  const routes = service.operations.map(function (operation) {
    const canonicalOperation = canonicalizeHttpOperation(ctx, operation.operation);
    const [httpOperation] = getHttpOperation(ctx.program, canonicalOperation);
    const segments = getRouteSegments(ctx, httpOperation);
    return {
      operation: canonicalOperation,
      container: operation.container,
      verb: httpOperation.verb,
      parameters: segments.filter((segment) => typeof segment !== "string"),
      segments,
    } as Route;
  });

  // Build the tree by iteratively removing common prefixes from the text segments.

  const tree = intoRouteTree(routes);

  return tree;
}

/**
 * Build a route tree from a list of routes.
 *
 * This iteratively removes common segments from the routes and then for all routes matching a given common prefix,
 * builds a nested tree from their subsequent segments.
 *
 * @param routes - the routes to build the tree from
 */
function intoRouteTree(routes: Route[]): RouteTree {
  const [operations, rest] = bifilter(routes, (route) => route.segments.length === 0);
  const [literal, parameterized] = bifilter(
    rest,
    (route) => typeof route.segments[0]! === "string",
  );

  const edgeMap = new Map<string, Route[]>();

  // Group the routes by common prefix

  outer: for (const literalRoute of literal) {
    const segment = literalRoute.segments[0] as string;

    for (const edge of [...edgeMap.keys()]) {
      const prefix = commonPrefix(segment, edge);

      if (prefix.length > 0) {
        const existing = edgeMap.get(edge)!;
        edgeMap.delete(edge);
        edgeMap.set(prefix, [...existing, literalRoute]);
        continue outer;
      }
    }

    edgeMap.set(segment, [literalRoute]);
  }

  const edges = [...edgeMap.entries()].map(
    ([edge, routes]) =>
      [
        edge,
        intoRouteTree(
          routes.map(function removePrefix(route) {
            const [prefix, ...rest] = route.segments as [string, ...RouteSegment[]];

            if (prefix === edge) {
              return { ...route, segments: rest };
            } else {
              return {
                ...route,
                segments: [prefix.substring(edge.length), ...rest],
              };
            }
          }),
        ),
      ] as const,
  );

  let bind: [Set<string>, RouteTree] | undefined;

  if (parameterized.length > 0) {
    const parameters = new Set<string>();
    const nextRoutes: Route[] = [];
    for (const parameterizedRoute of parameterized) {
      const [{ name }, ...rest] = parameterizedRoute.segments as [
        RouteParameter,
        ...RouteSegment[],
      ];

      parameters.add(name);
      nextRoutes.push({ ...parameterizedRoute, segments: rest });
    }

    bind = [parameters, intoRouteTree(nextRoutes)];
  }

  const operationMap = new Map<HttpVerb, RouteOperation[]>();

  for (const operation of operations) {
    let operations = operationMap.get(operation.verb);
    if (!operations) {
      operations = [];
      operationMap.set(operation.verb, operations);
    }

    operations.push(operation);
  }

  return {
    operations: operationMap,
    bind,
    edges,
  };

  function commonPrefix(a: string, b: string): string {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
      i++;
    }
    return a.substring(0, i);
  }
}

function getRouteSegments(ctx: HttpContext, operation: HttpOperation): RouteSegment[] {
  // Parse the route template into segments of "prefixes" (i.e. literal strings)
  // and parameters (names enclosed in curly braces). The "/" character does not
  // actually matter for this. We just want to know what the segments of the route
  // are.
  //
  // Examples:
  //  "" => []
  //  "/users" => ["/users"]
  //  "/users/{userId}" => ["/users/", {name: "userId"}]
  //  "/users/{userId}/posts/{postId}" => ["/users/", {name: "userId"}, "/posts/", {name: "postId"}]

  const segments: RouteSegment[] = [];

  const parameterTypeMap = new Map<string, Type>(
    [...operation.parameters.parameters.values()].map(
      (p) =>
        [
          p.param.name,
          p.param.type.kind === "ModelProperty" ? p.param.type.type : p.param.type,
        ] as const,
    ),
  );

  let remainingTemplate = operation.path;

  while (remainingTemplate.length > 0) {
    // Scan for next `{` character
    const openBraceIndex = remainingTemplate.indexOf("{");

    if (openBraceIndex === -1) {
      // No more parameters, just add the remaining string as a segment
      segments.push(remainingTemplate);
      break;
    }

    // Add the prefix before the parameter, if there is one
    if (openBraceIndex > 0) {
      segments.push(remainingTemplate.substring(0, openBraceIndex));
    }

    // Scan for next `}` character
    const closeBraceIndex = remainingTemplate.indexOf("}", openBraceIndex);

    if (closeBraceIndex === -1) {
      // This is an error in the HTTP layer, so we'll just treat it as if the parameter ends here
      // and captures the rest of the string as its name.
      segments.push({
        name: remainingTemplate.substring(openBraceIndex + 1),
        type: undefined as any,
      });
      break;
    }

    // Extract the parameter name
    const parameterName = remainingTemplate.substring(openBraceIndex + 1, closeBraceIndex);

    segments.push({
      name: parameterName,
      type: parameterTypeMap.get(parameterName)!,
    });

    // Move to the next segment
    remainingTemplate = remainingTemplate.substring(closeBraceIndex + 1);
  }

  return segments;
}
