import type { ToolDefinition } from "@/types";

export const TEST_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current weather for a city",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City name, e.g. 'Tokyo'" },
          unit: { type: "string", enum: ["celsius", "fahrenheit"], default: "celsius" },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Perform a mathematical calculation",
      parameters: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["add", "subtract", "multiply", "divide"], description: "Math operation" },
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" },
        },
        required: ["operation", "a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          max_results: { type: "number", default: 5 },
        },
        required: ["query"],
      },
    },
  },
];
