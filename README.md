# NebulaTrio Map Project

This is a full-stack map-based application.

## Structure
- `/frontend` - Vite (React) with Leaflet Map
- `/backend` - Node (Express) API with MongoDB
- `/python-service` - Background service that fetches data and stores in MongoDB

## Setup Instructions

1. **Environment Variables**
   Fill in the missing values in `.env` (it affects all 3 services).

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   npm start
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Python Service Setup**
   ```bash
   cd python-service
   pip install -r requirements.txt
   python main.py
   ```
