import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './index.css';

// Fix Leaflet default icon paths in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function App() {
  const [data, setData] = useState([]);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${API_URL}/data`);
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    fetchData();
  }, [API_URL]);

  return (
    <div className="app-container">
      <header>
        <h1>NebulaTrio Explorer</h1>
        <p>Live Citizen Observations & Environmental Data</p>
      </header>

      <div className="map-card">
        <MapContainer center={[42.6977, 23.3219]} zoom={7} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {data.map((item, index) => (
            item.location && item.location.lat && item.location.lng ? (
              <Marker key={index} position={[item.location.lat, item.location.lng]}>
                <Popup>
                  <strong>{item.type}</strong><br />
                  Value: {item.value || 'N/A'}<br />
                  <small>{new Date(item.timestamp).toLocaleString()}</small>
                </Popup>
              </Marker>
            ) : null
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

export default App;
