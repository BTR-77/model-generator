# Model Generator

Describe an object or upload a picture of one, and get a textured 3D model you can turn around in the browser, share with your team and download. Models you already have can be imported too.

Inspired by https://meshy.ai

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Describe a model, pick a style and up to four concepts, then choose one to turn into a 3D model.
- Upload a PNG, JPG or WEBP picture and turn it into a 3D model.
- Keep a library of your models, search, filter, sort, rename, delete and import .glb files, and share models with the team.
- Orbit, zoom and pan a model in the browser and download it as GLB, OBJ or STL.
- Follow running jobs as they update, retry failed ones, with up to three running per person.

Left out: accounts and sign-in, which your Gateway handles; credits and billing; retexturing, remeshing and rigging; the chat assistant; a public gallery; printing services; the API and plugins; and the phone app.

## Setup

```sh
pnpm install
pnpm dev            # run locally
pnpm test           # unit tests
pnpm run deploy     # deploy behind your Gateway
```

The app has no secrets or settings of its own. Generation is an optional feature: add a Replicate API token to your Gateway with `everyapp provider add replicate` (create one at https://replicate.com/account/api-tokens). Until then the library, imports, viewer and downloads work, and the Create page says generation isn't set up.

The checks in `checks/` run against a packaged release with the oss.new runtime; the generation service is faked there, so real Replicate runs and a real deployment were not exercised.

## Limitations

- Generation runs on Replicate and is billed to the account whose token you add. Concepts come from FLUX Schnell and models from TRELLIS.
- Replicate reports finished runs to the app's own address, so jobs only complete on a deployed app it can reach. A job that hears nothing back for 30 minutes is marked failed and can be retried.
- Imports take .glb files up to 50 MB; uploaded pictures up to 10 MB.
