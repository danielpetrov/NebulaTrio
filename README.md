# NebulaTrio – AWAREA

**Intelligent AI-Driven Marine & Water Quality Monitoring Dashboard.**

---

## 📌 Overview
**NebulaTrio (AWAREA)** is a state-of-the-art monitoring platform that transforms raw environmental telemetry into intelligent, actionable insights. By blending real-time buoy data, Sentinel-2 satellite imagery, and localized weather forecasts, the system uses **Google Gemini (Vertex AI)** to generate live summaries of water quality and predict marine life activity. Whether you are a swimmer looking for safe beach conditions or a professional fisherman heading offshore, AWAREA provides the context you need to act safely.

## ✨ Key Features
- **AI-Powered Insights:** Leveraging Gemini 2.5 Flash to generate context-aware summaries of water conditions and biological activity.
- **Marine Life Activity:** Predictive analysis of fish behavior (e.g., European Sprat, Turbot) based on deep-research data, current temperatures, and wave patterns.
- **Satellite Integration:** Real-time processing of Sentinel-2 data to derive Turbidity, Algae Risk (Chlorophyll-a), and Suspended Particulate Matter.
- **Buoy Telemetry:** Live streaming of significant wave height, surface currents, water temperature, and wind metrics.
- **Dynamic Glassmorphic UI:** A premium, interactive dashboard featuring:
  - **Offshore & Beach Modes:** Specialized views for different aquatic activities.
  - **Draggable Metrics:** Customizable layout allowing users to prioritize the data they care about.
  - **Ocean Background:** High-performance Three.js water simulation with animated foam particles and drift.
  - **AI Badges:** Visual indicators for real-time AI processing states and confidence.

## 🏗 Architecture
The system follows a modern decoupled architecture:
1. **Frontend (Vite/React/Three.js):** A responsive, high-performance PWA that handles complex state management, debounced AI fetching, and interactive 3D visuals.
2. **Backend (Node.js/Express):** A robust API layer that orchestrates data from MongoDB, handles AI prompt engineering with localized "Deep Research" context, and enforces structured JSON responses.
3. **AI Engine:** Powered by Google Vertex AI (Gemini), utilizing a RAG-style approach by injecting domain-specific markdown reports into the LLM context.
4. **Data Ingestion:** Python-based services and Node controllers that normalize data from satellite APIs and IoT buoy networks.

## 💻 Tech Stack
- **Frontend:** React 18, Vite, Three.js (for Ocean Background), Framer Motion, Vanilla CSS.
- **Backend:** Node.js, Express.js, Mongoose, Google Generative AI SDK.
- **AI:** Google Gemini 2.5 Flash (via Vertex AI).
- **Database:** MongoDB Atlas.
- **Deployment:** Netlify (PWA & Edge Functions).

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone <repository_url>
cd NebulaTrio
```

### 2. Setup Environment Variables
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```
Ensure you have a valid **VERTEX_API_KEY** for AI features.

### 3. Install & Run
```bash
# Setup Backend
cd backend
npm install
npm run dev

# Setup Frontend (in a new terminal)
cd frontend
npm install
npm run dev
```

---

## ⚙️ Key Environment Variables
```env
MONGO_URI=           # MongoDB connection string
VERTEX_API_KEY=      # Google Cloud Vertex API Key for Gemini
VITE_API_URL=        # Frontend reference to backend API
VITE_MAPBOX_TOKEN=   # For satellite map visualization
```

---

## 🔌 Advanced API Endpoints
- **`POST /api/ai/summary/marine`** — Generates a 3-4 sentence summary of offshore water quality.
- **`POST /api/ai/summary/beach`** — Analyzes swimming safety and beach conditions.
- **`POST /api/marine/activity`** — Predicts activity for 4 specific marine species using AI and local research files.
- **`GET /api/buoy/data`** — Fetches live sensor telemetry from coastal IoT stations.
- **`GET /api/sentinel/data`** — Retrieves processed satellite metrics (Turbidity, SPM, Chlorophyll).

---

## 🌊 Deep Research Integration
The AI model isn't just guessing. It ingests a curated `deep-research-report.md` at runtime, which contains specific biological data for Black Sea species, including:
- Optimal temperature ranges for spawning.
- Depth preferences and feeding habits.
- Sensitivity to turbidity and salinity changes.

## 📄 License
MIT License
