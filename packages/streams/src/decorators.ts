import type { Model, Program, Type } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import type { StreamOfDecorator } from "../generated-defs/TypeSpec.Streams.js";
import { StreamStateKeys } from "./lib.js";

const [getStreamOf, setStreamOf] = useStateMap<Model, Type>(StreamStateKeys.streamOf);

export const $streamOfDecorator: StreamOfDecorator = (context, target, type) => {
  setStreamOf(context.program, target, type);
};

export function isStream(program: Program, target: Model): boolean {
  return getStreamOf(program, target) !== undefined;
}

export { getStreamOf };
