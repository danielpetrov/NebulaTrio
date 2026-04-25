# NebulaTrio

**Intelligent monitoring and alert platform for water-related risks.**

---

## 📌 Overview
Water anomalies such as floods, pipeline leaks, and excessive pollution are rising threats to communities. **NebulaTrio** addresses this by blending crowdsourced citizen reports with external sensor and satellite data. By leveraging AI-driven risk prioritization, we distill raw signals into actionable, real-time alerts. It's a proactive community-driven approach that not only protects neighborhoods but also rewards continuous civic participation.

## ✨ Features
- **Citizen Reporting:** Easily report water leaks, localized flooding, or contamination events with pinpoint geolocation.
- **Real-Time Alerts:** Live subscriptions to high-priority anomalies ensure locals and authorities act instantly.
- **Risk Prioritization:** Simple AI logic assesses the severity of incoming reports contextually against existing environmental metadata.
- **Interactive Map Visualization:** A clean, glassmorphic UI displaying a heat/marker map of active incidents.
- **Incentive System:** Earn points and actionable partner vouchers for verified crowdsourced observations.

## 🏗 Architecture
Our system decouples visual data interaction, stateless API logic, and active ingestion:
1. **Frontend (Vite/React):** Delivers a fast, interactive Leaflet map experience to end users.
2. **Backend (Node.js/Express):** Serves JSON endpoints, securely writes and reads from MongoDB, and is deployed entirely as serverless (`serverless-http`).
3. **Python Service:** A standalone cron job executing in the background to repetitively fetch external mock data, normalize it, and ingest it into MongoDB/Firebase.

## 💻 Tech Stack
- **Frontend:** React, Vite, Leaflet, Axios/Fetch, Premium Vanilla CSS
- **Backend:** Node.js, Express.js, Mongoose, Serverless-HTTP
- **Background Cron:** Python 3, Schedule, PyMongo, python-dotenv
- **Database:** MongoDB
- **Deployment:** Netlify (Frontend & Serverless Backend) / Render (for Python Cron)

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone <repository_url>
cd NebulaTrio
```

### 2. Setup Environment Variables
Copy the template to instantiate your configuration:
```bash
cp .env.example .env
```
*(Fill in your MongoDB credentials and URLs. **Never** commit your local `.env`!)*

### 3. Run the Backend API
Navigate to the backend side, install dependencies, and run locally.
```bash
cd backend
npm install
npm run dev
```

### 4. Run the Frontend App
Open a split terminal and fire up the Vite development server.
```bash
cd frontend
npm install
npm run dev
```

### 5. Run the Python Ingestion Service
Open a third terminal for the background script.
```bash
cd python-service
pip install -r requirements.txt
python main.py
```

---

## ⚙️ Environment Variables
List of variables loaded seamlessly from the root `.env`:
```env
MONGO_URI=
PORT=
VITE_API_URL=
API_BASE_URL=
FIREBASE_CREDENTIALS=
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
```

---

## 🔌 API Endpoints
All routes are exposed under `/api` implicitly.

- **`GET /api/data`** — Yields current automated sensor measurements.
  ```json
  [
    {
      "location": { "lat": 42.6977, "lng": 23.3219 },
      "value": 45.2,
      "type": "node_sensor_data",
      "timestamp": "2026-04-25T14:00:00.000Z"
    }
  ]
  ```

- **`POST /api/report`** — Creates a crowdsourced citizen observation.
  ```json
  {
    "location": { "lat": 42.1354, "lng": 24.7453 },
    "type": "flood",
    "description": "Rising water levels near the residential bridge."
  }
  ```

- **`GET /api/reports`** — Lists all recent community-sourced reports.

---

## 🎬 Demo Flow
1. **Report Issue:** A user spots a broken municipal pipe and submits a report through the sleek React app.
2. **Data Processed:** The Node.js Serverless API validates the payload and logs it directly in MongoDB. Concurrently, the Python cron job introduces surrounding baseline sensor data to enrich the payload.
3. **Alert Generated:** The risk engine flags it as a priority emergency, triggering notification relays and allocating reward points to the helpful citizen.
4. **Map View:** The event ripples to the map instantly to alert geographically proximity audiences.

---

## 🌐 Deployment
- **Frontend & Backends:** Ready for one-click deployment on **Netlify** using our configured `netlify.toml` which natively builds the Vite distribution and provisions `backend/server.js` seamlessly as an edge function.
- **Python Cron:** Best suited for as an always-on Background Worker on Render, Heroku or EC2.

---

## 🚀 Future Improvements
- **Advanced AI Models:** Utilizing PyTorch pipelines for live computer vision (calculating flood depth / severity from images directly).
- **Expanded Hardware Integrations:** Hooking reliably into physical ESP32 or official IoT water station networks continuously.
- **Scaling Strategies:** Transitioning from passive loops to robust streaming pipelines (Apache Kafka) for large-scale municipal telemetry.

## 📄 License
MIT License
