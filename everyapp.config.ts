import { defineEveryApp } from "@every-app/sdk";

export default defineEveryApp({
  id: "model-generator",
  name: "Model Generator",
  description:
    "Turns a written description or a picture into a 3D model you can view, share with your team and download.",
  resources: {
    d1: ["DB"],
    r2: ["files"],
  },
  public: [
    // The generation service reports a finished run here; each job's URL
    // carries its own random token.
    { path: "/hooks/replicate/:token", methods: ["POST"] },
    // The generation service fetches the picture it turns into a model;
    // served only while that job is running.
    { path: "/hooks/input/:token" },
  ],
  capabilities: {
    replicate: {
      access: "read",
      why: "Makes concept images and 3D models.",
      docs: "https://replicate.com/account/api-tokens",
    },
  },
  features: {
    generation: {
      name: "Generation",
      why: "Makes new models from a description or a picture.",
      steps: [
        "Create an API token at https://replicate.com/account/api-tokens",
        "Run `everyapp provider add replicate` and paste it when asked.",
      ],
      capabilities: ["replicate"],
    },
  },
});
