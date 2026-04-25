import os
import time
import schedule
from dotenv import load_dotenv
from pymongo import MongoClient
from datetime import datetime

# Load env variables from parent folder
load_dotenv(dotenv_path='../.env')

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("DB_NAME", "nebulatrio")

try:
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    measurements_collection = db["measurements"]
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")

def fetch_and_store_data():
    print(f"[{datetime.now()}] Fetching data...")
    # Mock external data fetching
    mock_data = [
        {"location": {"lat": 42.6977, "lng": 23.3219}, "value": 45.2, "type": "air_quality", "timestamp": datetime.utcnow()},
        {"location": {"lat": 42.1354, "lng": 24.7453}, "value": 31.8, "type": "air_quality", "timestamp": datetime.utcnow()}
    ]
    
    # Store in MongoDB
    try:
        measurements_collection.insert_many(mock_data)
        print(f"[{datetime.now()}] Successfully stored {len(mock_data)} records.")
    except Exception as e:
        print(f"[{datetime.now()}] Error storing data: {e}")

    # Optional: Send to Firebase (stub)
    firebase_creds = os.getenv("FIREBASE_CREDENTIALS")
    if firebase_creds:
        print(f"[{datetime.now()}] Firebase credentials found, simulating Firebase sync...")
        pass

def main():
    print("Starting background Python service...")
    fetch_and_store_data()
    schedule.every(30).minutes.do(fetch_and_store_data)

    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == "__main__":
    main()
