import { printIdentifier } from "@typespec/compiler";
import { OpenAPI3Schema, Refable } from "../../../../types.js";
import { getDecoratorsForSchema } from "../utils/decorators.js";
import { getScopeAndName } from "../utils/get-scope-and-name.js";
import { generateDecorators } from "./generate-decorators.js";

export class SchemaToExpressionGenerator {
  constructor(public rootNamespace: string) {}

  public generateTypeFromRefableSchema(
    schema: Refable<OpenAPI3Schema>,
    callingScope: string[],
  ): string {
    const hasRef = "$ref" in schema;
    return hasRef
      ? this.getRefName(schema.$ref, callingScope)
      : this.getTypeFromSchema(schema, callingScope);
  }

  public generateArrayType(schema: OpenAPI3Schema, callingScope: string[]): string {
    const items = schema.items;
    if (!items) {
      return "unknown[]";
    }

    if ("$ref" in items) {
      return `${this.getRefName(items.$ref, callingScope)}[]`;
    }

    // Prettier will get rid of the extra parenthesis for us
    return `(${this.getTypeFromSchema(items, callingScope)})[]`;
  }

  public getRefName(ref: string, callingScope: string[]): string {
    const { scope, name } = this.getRefScopeAndName(ref, callingScope);
    return [...scope, name].join(".");
  }

  private getRefScopeAndName(
    ref: string,
    callingScope: string[],
  ): ReturnType<typeof getScopeAndName> {
    const parts = ref.split("/");
    const name = parts.pop() ?? "";
    const componentType = parts.pop()?.toLowerCase() ?? "";
    const scopeAndName = getScopeAndName(name);

    switch (componentType) {
      case "schemas":
        if (callingScope.length) {
          /* 
            Since schemas are generated in the file namespace,
            need to reference them against the file namespace
            to prevent name collisions.
            Example:
              namespace Service;
              scalar Foo extends string;
              namespace Parameters {
                model Foo {
                  @query foo: Service.Foo
                }      
              }
          */
          scopeAndName.scope.unshift(this.rootNamespace);
        }
        break;
      case "parameters":
        scopeAndName.scope.unshift("Parameters");
        break;
    }

    return scopeAndName;
  }

  private getTypeFromSchema(schema: OpenAPI3Schema, callingScope: string[]): string {
    let type = "unknown";

    if (schema.enum) {
      type = getEnum(schema.enum);
    } else if (schema.anyOf) {
      type = this.getAnyOfType(schema, callingScope);
    } else if (schema.allOf) {
      type = this.getAllOfType(schema, callingScope);
    } else if (schema.type === "array") {
      type = this.generateArrayType(schema, callingScope);
    } else if (schema.type === "boolean") {
      type = "boolean";
    } else if (schema.type === "integer") {
      type = getIntegerType(schema);
    } else if (schema.type === "number") {
      type = getNumberType(schema);
    } else if (schema.type === "object") {
      type = this.getObjectType(schema, callingScope);
    } else if (schema.oneOf) {
      type = this.getOneOfType(schema, callingScope);
    } else if (schema.type === "string") {
      type = getStringType(schema);
    }

    if (schema.nullable) {
      type += ` | null`;
    }

    if (schema.default) {
      type += ` = ${JSON.stringify(schema.default)}`;
    }

    return type;
  }

  private getAllOfType(schema: OpenAPI3Schema, callingScope: string[]): string {
    const requiredProps: string[] = schema.required || [];
    let properties: Record<string, Refable<OpenAPI3Schema>> = {};
    const baseTypes: string[] = [];

    for (const member of schema.allOf || []) {
      if ("$ref" in member) {
        // If it's a $ref, process it as inheritance/extension and add to the list
        baseTypes.push(this.getRefName(member.$ref, callingScope));
      } else if (member.properties) {
        properties = { ...properties, ...member.properties };
        if (member.required) {
          requiredProps.push(...member.required);
        }
      }
    }

    const props: string[] = [];
    for (const name of Object.keys(properties)) {
      const isOptional = !requiredProps.includes(name) ? "?" : "";
      props.push(
        `${printIdentifier(name)}${isOptional}: ${this.generateTypeFromRefableSchema(properties[name], callingScope)}`,
      );
    }

    if (baseTypes.length > 0 && props.length > 0) {
      // When there are both inherited types and properties
      return `${baseTypes.join(" & ")} & {${props.join("; ")}}`;
    } else if (baseTypes.length > 0) {
      // When there are only inherited types
      return baseTypes.join(" & ");
    } else {
      // When there are only properties
      return `{${props.join("; ")}}`;
    }
  }

  private getAnyOfType(schema: OpenAPI3Schema, callingScope: string[]): string {
    const definitions: string[] = [];

    for (const item of schema.anyOf ?? []) {
      definitions.push(this.generateTypeFromRefableSchema(item, callingScope));
    }

    return definitions.join(" | ");
  }

  private getOneOfType(schema: OpenAPI3Schema, callingScope: string[]): string {
    const definitions: string[] = [];

    for (const item of schema.oneOf ?? []) {
      definitions.push(this.generateTypeFromRefableSchema(item, callingScope));
    }

    return definitions.join(" | ");
  }

  private getObjectType(schema: OpenAPI3Schema, callingScope: string[]): string {
    // If we have `additionalProperties`, treat that as an 'indexer' and convert to a record.
    const recordType =
      typeof schema.additionalProperties === "object"
        ? `Record<${this.generateTypeFromRefableSchema(schema.additionalProperties, callingScope)}>`
        : "";

    const requiredProps = schema.required ?? [];

    const props: string[] = [];
    if (schema.properties) {
      for (const name of Object.keys(schema.properties)) {
        const originalPropSchema = schema.properties[name];
        const propType = this.generateTypeFromRefableSchema(originalPropSchema, callingScope);

        const decorators = generateDecorators(getDecoratorsForSchema(originalPropSchema))
          .map((d) => `${d}\n`)
          .join("");
        const isOptional = !requiredProps.includes(name) ? "?" : "";
        props.push(`${decorators}${printIdentifier(name)}${isOptional}: ${propType}`);
      }
    }

    let objectBody = "unknown";
    if (props.length > 0) {
      objectBody = `{${props.join("; ")}}`;
    }

    if (recordType) {
      if (props.length > 0) {
        objectBody = `{${props.join("; ")}; ...${recordType}}`;
      } else {
        objectBody = recordType;
      }
    } else {
      if (props.length === 0) {
        objectBody = "{}";
      }
    }
    return objectBody;
  }
}

export function getTypeSpecPrimitiveFromSchema(schema: OpenAPI3Schema): string | undefined {
  if (schema.type === "boolean") {
    return "boolean";
  } else if (schema.type === "integer") {
    return getIntegerType(schema);
  } else if (schema.type === "number") {
    return getNumberType(schema);
  } else if (schema.type === "string") {
    return getStringType(schema);
  }
  return;
}

function getIntegerType(schema: OpenAPI3Schema): string {
  const format = schema.format ?? "";
  switch (format) {
    case "int8":
    case "int16":
    case "int32":
    case "int64":
    case "uint8":
    case "uint16":
    case "uint32":
    case "uint64":
      return format;
    case "double-int":
      return "safeint";
    default:
      return "integer";
  }
}

function getNumberType(schema: OpenAPI3Schema): string {
  const format = schema.format ?? "";
  switch (format) {
    case "decimal":
    case "decimal128":
      return format;
    case "double":
      return "float64";
    case "float":
      return "float32";
    default:
      // Could be either 'float' or 'numeric' - add FIXME?
      return "numeric";
  }
}

function getStringType(schema: OpenAPI3Schema): string {
  const format = schema.format ?? "";
  let type = "string";
  switch (format) {
    case "binary":
    case "byte":
      type = "bytes";
      break;
    case "date":
      type = "plainDate";
      break;
    case "date-time":
      // Can be 'offsetDateTime' or 'utcDateTime' - needs FIXME or union?
      type = "utcDateTime";
      break;
    case "time":
      type = "plainTime";
      break;
    case "duration":
      type = "duration";
      break;
    case "uri":
      type = "url";
      break;
  }

  return type;
}

function getEnum(schemaEnum: (string | number | boolean)[]): string {
  return schemaEnum.map((e) => JSON.stringify(e)).join(" | ");
}
