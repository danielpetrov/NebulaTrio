import fs from 'fs';
import path from 'path';
import { getModel } from '../ai.js';

export const getMarineActivity = async (req, res) => {
    try {
        const { waterQuality, weatherData, activityMode } = req.body;

        if (activityMode !== 'offshore') {
            return res.json({ marineLifeActivity: [] });
        }

        const aiModel = getModel();

        // Read the deep research report
        const researchPath = path.resolve(process.cwd(), 'agent', 'deep-research-report.md');
        let researchData = '';
        if (fs.existsSync(researchPath)) {
            researchData = fs.readFileSync(researchPath, 'utf8');
        }

        const prompt = `
You are an expert marine biologist and oceanographer providing real-time analysis for an offshore fishing and marine monitoring dashboard.

Use the provided "Deep Research Data" about Black Sea fish species (temperature ranges, depths, spawning seasons) to analyze the current "Water Quality Metrics" and "Weather Data".

Your task is to generate a structured list of marine life activity, predicting the behavior of 4 key species based on the current water temperature, waves, and time of day.
For "activityClass", you MUST use exactly one of the following classes: "status-good", "status-moderate", or "status-warning".

You MUST return the output EXACTLY in the following JSON format. Do NOT include any comments or markdown, return ONLY valid JSON:

{
  "marineLifeActivity": [
    {
      "id": 1,
      "species": "European Sprat",
      "scientificName": "Sprattus sprattus",
      "activityClass": "status-good",
      "activity": "HIGH",
      "reason": "Short explanation based on water temp/time of day...",
      "seasonalNote": "Short note about spawning/season..."
    }
  ]
}

Deep Research Data:
${researchData}

Live Data:
- Water Quality Metrics: ${JSON.stringify(waterQuality)}
- Weather Data: ${JSON.stringify(weatherData)}
- Current Time: ${new Date().toISOString()}
`;

        const result = await aiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });

        let text = result.response.text();
        text = text.replace(/^```json/g, '').replace(/```$/g, '').trim();
        
        try {
            const data = JSON.parse(text);
            res.json(data);
        } catch (e) {
            console.error("Failed to parse JSON from AI marine activity:", text);
            throw new Error("Invalid AI JSON response");
        }
    } catch (error) {
        console.error('Marine Activity Error:', error);
        res.status(500).json({ error: 'Failed to generate marine activity' });
    }
};
