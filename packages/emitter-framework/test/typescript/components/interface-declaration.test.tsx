import { For, List } from "@alloy-js/core";
import { SourceFile } from "@alloy-js/typescript";
import type { Namespace } from "@typespec/compiler";
import { describe, expect, it } from "vitest";
import { Output } from "../../../src/core/components/output.jsx";
import { InterfaceDeclaration } from "../../../src/typescript/components/interface-declaration.js";
import { getProgram } from "../test-host.js";

describe("Typescript Interface", () => {
  describe("Interface bound to Typespec Types", () => {
    it("declares an interface with multi line docs, explicit docs passed", async () => {
      const program = await getProgram(`
          namespace DemoService;

          /**
           * This is a test
           * with multiple lines
           */
          model Foo {
            knownProp: string;
          }
          `);

      const [namespace] = program.resolveTypeReference("DemoService");
      const models = Array.from((namespace as Namespace).models.values());

      expect(
        <Output program={program}>
          <SourceFile path="test.ts">
            <List hardline>
              {models.map((model) => (
                <InterfaceDeclaration
                  export
                  type={model}
                  doc={["This is an overridden doc comment\nwith multiple lines"]}
                />
              ))}
            </List>
          </SourceFile>
        </Output>,
      ).toRenderTo(
        `
            /**
             * This is an overridden doc comment
             * with multiple lines
             */
            export interface Foo {
              knownProp: string;
            }
            `,
      );
    });
    it("declares an interface with multi line docs", async () => {
      const program = await getProgram(`
          namespace DemoService;

          /**
           * This is a test
           * with multiple lines
           */
          model Foo {
            knownProp: string;
          }
          `);

      const [namespace] = program.resolveTypeReference("DemoService");
      const models = Array.from((namespace as Namespace).models.values());

      expect(
        <Output program={program}>
          <SourceFile path="test.ts">
            <List hardline>
              {models.map((model) => (
                <InterfaceDeclaration export type={model} />
              ))}
            </List>
          </SourceFile>
        </Output>,
      ).toRenderTo(
        `
            /**
             * This is a test
             * with multiple lines
             */
            export interface Foo {
              knownProp: string;
            }
            `,
      );
    });
    it("declares an interface with @doc", async () => {
      const program = await getProgram(`
          namespace DemoService;

          @doc("This is a test")
          model Foo {
            knownProp: string;
          }
          `);

      const [namespace] = program.resolveTypeReference("DemoService");
      const models = Array.from((namespace as Namespace).models.values());

      expect(
        <Output program={program}>
          <SourceFile path="test.ts">
            <List hardline>
              {models.map((model) => (
                <InterfaceDeclaration export type={model} />
              ))}
            </List>
          </SourceFile>
        </Output>,
      ).toRenderTo(
        `
            /**
             * This is a test
             */
            export interface Foo {
              knownProp: string;
            }
            `,
      );
    });
    it("declares an interface with doc", async () => {
      const program = await getProgram(`
          namespace DemoService;

          /**
           * This is a test
           */
          model Foo {
            @doc("This is a known property")
            knownProp: string;
          }
          `);

      const [namespace] = program.resolveTypeReference("DemoService");
      const models = Array.from((namespace as Namespace).models.values());

      expect(
        <Output program={program}>
          <SourceFile path="test.ts">
            <List hardline>
              {models.map((model) => (
                <InterfaceDeclaration export type={model} />
              ))}
            </List>
          </SourceFile>
        </Output>,
      ).toRenderTo(
        `
            /**
             * This is a test
             */
            export interface Foo {
              /**
               * This is a known property
               */
              knownProp: string;
            }
            `,
      );
    });
    describe("Bound to Model", () => {
      it("creates an interface that extends a model for Record spread", async () => {
        const program = await getProgram(`
          namespace DemoService;

          model DifferentSpreadModelRecord {
            knownProp: string;
            ...Record<unknown>;
          }
          `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <List hardline>
                {models.map((model) => (
                  <InterfaceDeclaration export type={model} />
                ))}
              </List>
            </SourceFile>
          </Output>,
        ).toRenderTo(`
            export interface DifferentSpreadModelRecord {
              knownProp: string;
              additionalProperties?: Record<string, unknown>;
            }
            `);
      });

      it("creates an interface for a model that 'is' an array ", async () => {
        const program = await getProgram(`
          namespace DemoService;

          model Foo is Array<string>;
          `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = (namespace as Namespace).models;

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <For each={Array.from(models.values())} hardline>
                {(model) => <InterfaceDeclaration export type={model} />}
              </For>
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface Foo extends Array<string> {

          }`);
      });

      it("creates an interface for a model that 'is' a record ", async () => {
        const program = await getProgram(`
          namespace DemoService;

          model Foo is Record<string>;
          `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = (namespace as Namespace).models;

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <For each={Array.from(models.values())} hardline>
                {(model) => <InterfaceDeclaration export type={model} />}
              </For>
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface Foo {
            additionalProperties?: Record<string, string>;
          }`);
      });

      it("creates an interface of a model that spreads a Record", async () => {
        const program = await getProgram(`
          namespace DemoService;

          model Foo {
            ...Record<string>
          }
          `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = (namespace as Namespace).models;

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <For each={Array.from(models.values())} hardline>
                {(model) => <InterfaceDeclaration export type={model} />}
              </For>
            </SourceFile>
          </Output>,
        ).toRenderTo(`
            export interface Foo {
              additionalProperties?: Record<string, string>;
            }
            `);
      });

      it("creates an interface that extends an spread model", async () => {
        const program = await getProgram(`
          namespace DemoService;

          model ModelForRecord {
            state: string;
          }

          model DifferentSpreadModelRecord {
            knownProp: string;
            ...Record<ModelForRecord>;
          }

          model DifferentSpreadModelDerived extends DifferentSpreadModelRecord {
            derivedProp: ModelForRecord;
          }
          `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = (namespace as Namespace).models;

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <For each={Array.from(models.values())} hardline>
                {(model) => <InterfaceDeclaration export type={model} />}
              </For>
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface ModelForRecord {
            state: string;
          }
          export interface DifferentSpreadModelRecord {
            knownProp: string;
            additionalProperties?: Record<string, ModelForRecord>;
          }
          export interface DifferentSpreadModelDerived extends DifferentSpreadModelRecord {
            derivedProp: ModelForRecord;
            additionalProperties?: Record<string, ModelForRecord>;
          }`);
      });

      it("creates an interface that has additional properties", async () => {
        const program = await getProgram(`
          namespace DemoService;
          model Widget extends Record<unknown> {
            id: string;
            weight: int32;
            color: "blue" | "red";
          }
          `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              {models.map((model) => (
                <InterfaceDeclaration export type={model} />
              ))}
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface Widget {
            id: string;
            weight: number;
            color: "blue" | "red";
            additionalProperties?: Record<string, unknown>;
          }`);
      });

      it("handles a type reference to a union variant", async () => {
        const program = await getProgram(`
          namespace DemoService;

          union Color {
            red: "RED",
            blue: "BLUE"
          }
      
          model Widget{
            id: string;
            weight: int32;
            color: Color.blue
          }
          `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration type={models[0]} />
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          interface Widget {
            id: string;
            weight: number;
            color: "BLUE";
          }`);
      });
      it("creates an interface", async () => {
        const program = await getProgram(`
        namespace DemoService;
    
        model Widget{
          id: string;
          weight: int32;
          color: "blue" | "red";
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration type={models[0]} />
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          interface Widget {
            id: string;
            weight: number;
            color: "blue" | "red";
          }`);
      });

      it("renders an empty interface with a never-typed member", async () => {
        const program = await getProgram(`
        namespace DemoService;
    
        model Widget{
          property: never;
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration export type={models[0]} />
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface Widget {

          }`);
      });

      it("can override interface name", async () => {
        const program = await getProgram(`
        namespace DemoService;
    
        model Widget{
          id: string;
          weight: int32;
          color: "blue" | "red";
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration export name="MyOperations" type={models[0]} />
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface MyOperations {
            id: string;
            weight: number;
            color: "blue" | "red";
          }`);
      });

      it("can add a members to the interface", async () => {
        const program = await getProgram(`
        namespace DemoService;
    
        model Widget{
          id: string;
          weight: int32;
          color: "blue" | "red";
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration export name="MyOperations" type={models[0]}>
                <hbr />
                <List>
                  <>customProperty: string;</>
                  <>customMethod(): void;</>
                </List>
              </InterfaceDeclaration>
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface MyOperations {
            id: string;
            weight: number;
            color: "blue" | "red";
            customProperty: string;
            customMethod(): void;
          }`);
      });

      it("interface name can be customized", async () => {
        const program = await getProgram(`
        namespace DemoService;
    
        model Widget{
          id: string;
          weight: int32;
          color: "blue" | "red";
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration export name="MyModel" type={models[0]} />
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface MyModel {
            id: string;
            weight: number;
            color: "blue" | "red";
          }`);
      });

      it("interface with extends", async () => {
        const program = await getProgram(`
        namespace DemoService;
    
        model Widget{
          id: string;
          weight: int32;
          color: "blue" | "red";
        }
        
        model ErrorWidget extends Widget {
          code: int32;
          message: string;
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <For each={models}>{(model) => <InterfaceDeclaration export type={model} />}</For>
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface Widget {
            id: string;
            weight: number;
            color: "blue" | "red";
          }
          export interface ErrorWidget extends Widget {
            code: number;
            message: string;
          }`);
      });
    });

    describe("Bound to Interface", () => {
      it("creates an interface", async () => {
        const program = await getProgram(`
        namespace DemoService;
    
        interface WidgetOperations {
          op getName(id: string): string;
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const interfaces = Array.from((namespace as Namespace).interfaces.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration export type={interfaces[0]} />
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface WidgetOperations {
            getName(id: string): string;
          }`);
      });

      it("should handle spread and non spread model parameters", async () => {
        const program = await getProgram(`
        namespace DemoService;

        model Foo {
          name: string
        }
    
        interface WidgetOperations {
          op getName(foo: Foo): string;
          op getOtherName(...Foo): string
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const interfaces = Array.from((namespace as Namespace).interfaces.values());
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration export type={interfaces[0]} />
              <hbr />
              <InterfaceDeclaration export type={models[0]} />
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface WidgetOperations {
            getName(foo: Foo): string;
            getOtherName(name: string): string;
          }
          export interface Foo {
            name: string;
          }`);
      });

      it("creates an interface with Model references", async () => {
        const program = await getProgram(`
        namespace DemoService;
    
        /**
         * Operations for Widget
         */
        interface WidgetOperations {
          /**
           * Get the name of the widget
           */
          op getName(
            /**
             * The id of the widget
             */
             id: string
          ): Widget;
        }

        model Widget {
          id: string;
          weight: int32;
          color: "blue" | "red";
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const interfaces = Array.from((namespace as Namespace).interfaces.values());
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration export type={interfaces[0]} />
              <hbr />
              <For each={models}>{(model) => <InterfaceDeclaration export type={model} />}</For>
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          /**
           * Operations for Widget
           */
          export interface WidgetOperations {
            /**
             * Get the name of the widget
             *
             * @param {string} id - The id of the widget
             */
            getName(id: string): Widget;
          }
          export interface Widget {
            id: string;
            weight: number;
            color: "blue" | "red";
          }`);
      });

      it("creates an interface that extends another", async () => {
        const program = await getProgram(`
        namespace DemoService;
    
        interface WidgetOperations {
          op getName(id: string): Widget;
        }

        interface WidgetOperationsExtended extends WidgetOperations{
          op delete(id: string): void;
        }

        model Widget {
          id: string;
          weight: int32;
          color: "blue" | "red";
        }
        `);

        const [namespace] = program.resolveTypeReference("DemoService");
        const interfaces = Array.from((namespace as Namespace).interfaces.values());
        const models = Array.from((namespace as Namespace).models.values());

        expect(
          <Output program={program}>
            <SourceFile path="test.ts">
              <InterfaceDeclaration export type={interfaces[1]} />
              <hbr />
              <For each={models}>{(model) => <InterfaceDeclaration export type={model} />}</For>
            </SourceFile>
          </Output>,
        ).toRenderTo(`
          export interface WidgetOperationsExtended {
            getName(id: string): Widget;
            delete(id: string): void;
          }
          export interface Widget {
            id: string;
            weight: number;
            color: "blue" | "red";
          }`);
      });
    });
  });
});
