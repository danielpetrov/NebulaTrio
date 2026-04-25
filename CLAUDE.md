# NebulaTrio Developer Guide (for AI coding assistants)

## 🏗 Architecture & Stack
- **Monorepo Structure**: 
  - `/frontend` - Vite + React (Vanilla CSS for styling, Leaflet for maps)
  - `/backend` - Node (Express) + MongoDB (Mongoose) - configured with `serverless-http` to deploy as Netlify Functions.
  - `/python-service` - Python background cron job (`schedule` + `pymongo`).
- **Configs**: Single root level `.env`, orchestrated by `netlify.toml`.

## 💻 Commands
- **Frontend Dev**: `cd frontend && npm run dev`
- **Backend Dev**: `cd backend && npm run dev` (also listens on `server.js` standalone port locallly).
- **Python Script**: `cd python-service && python main.py`
- **Build**: Handled internally by Netlify (`npm install`, `npm run build` configured via `netlify.toml`).

## 📋 Conventions & Rules
- **Environment Context**: We load a central `.env` located at the project root for all three services (`envDir: '../'` in Vite, `dotenv.config({path: '../.env'})` in Node). 
- **Imports**: The Node backend strictly uses modern `import/export` (`type: "module"`) syntax.
- **Database**: Mongoose schemas are stored in `backend/models`, controllers orchestrate logic in `backend/controllers`. Do not mix heavy business logic inside the routers.
- **Netlify Environment**: The backend relies on `serverless-http` and is exported as `export const handler = serverless(app);` at the bottom of `backend/server.js`.
- **Styling**: Always employ modern, vibrant, and interactive user-interface philosophies. Rely exclusively on pure vanilla CSS (`src/index.css` inside `/frontend`). Use rich palettes and micro-animations.
- **Dependency Management**: Context-switch completely when adding dependencies. Execute commands strictly inside `/frontend`, `backend/`, and `python-service/` respectively.

## ⚡ Task Implementation Workflow
When performing requested actions:
1. Ensure the UI remains absolutely stunning and modern (premium gradients, seamless interactive components).
2. For API modifications, remember to cascade changes from the Mongoose model, right up to the respective controller.
3. Keep the code strictly minimalist and "Hackathon-friendly" — avoid extreme over-abstractions and unnecessary boilerplate. Focus on practical speed of iteration.
