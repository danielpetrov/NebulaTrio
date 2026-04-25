// @ts-ignore
const API_KEY = process.env.VITE_WEATHER_API_KEY || 'API_KEY';

export async function getWeather(lat: number, lon: number) {
    try {
        const currentRes = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
        );
        if (!currentRes.ok) throw new Error('API fail');
        const current = await currentRes.json();

        const forecastRes = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
        );
        const forecast = await forecastRes.json();

        return {
            weather: {
                rain: current.rain?.["1h"] || 0,
                humidity: current.main.humidity,
                temp: current.main.temp,
                wind_speed: current.wind.speed,
                wind_deg: current.wind.deg
            },
            forecast: {
                rain_next_3h: forecast.list[0]?.rain?.["3h"] || 0
            }
        };
    } catch (error) {
        // Mock data when API key is missing or request fails
        const isRaining = Math.random() > 0.6;
        return {
            weather: {
                rain: isRaining ? parseFloat((Math.random() * 5).toFixed(1)) : 0,
                humidity: 45 + Math.floor(Math.random() * 30),
                temp: 18 + Math.floor(Math.random() * 10),
                wind_speed: parseFloat((2 + Math.random() * 6).toFixed(1)),
                wind_deg: Math.floor(Math.random() * 360)
            },
            forecast: {
                rain_next_3h: isRaining || Math.random() > 0.5 ? 2 : 0
            }
        };
    }
}
