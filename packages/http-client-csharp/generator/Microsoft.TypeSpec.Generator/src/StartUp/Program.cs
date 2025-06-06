// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

using System;
using System.Diagnostics;
using System.Threading.Tasks;
using CommandLine;
using Microsoft.TypeSpec.Generator.EmitterRpc;

namespace Microsoft.TypeSpec.Generator
{
    internal static class Program
    {
        public static async Task<int> Main(string[] args)
        {
            GeneratorRunner runner = new GeneratorRunner();

            // If no arguments are passed, show help message
            if (args.Length == 0)
            {
                args = new[] { "--help" };
            }

            return await Parser.Default.ParseArguments<CommandLineOptions>(args)
                .MapResult(async (CommandLineOptions opts) =>
                {
                    return await Run(opts, runner);
                },
                errs => Task.FromResult(-1));
        }

        private static async Task<int> Run(CommandLineOptions options, GeneratorRunner runner)
        {
            if (options.ShouldDebug)
            {
                Console.Error.WriteLine("Attempting to attach debugger..");
                Debugger.Launch();
            }

            try
            {
                await runner.RunAsync(options);
            }
            catch (Exception e)
            {
                Console.Error.WriteLine(e.Message);
                Console.Error.WriteLine(e.StackTrace);
                return 1;
            }

            (CodeModelGenerator.Instance.Emitter as IDisposable)?.Dispose();

            return 0;
        }
    }
}
