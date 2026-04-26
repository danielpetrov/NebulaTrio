import fs from 'fs';
import path from 'path';
import { getModel } from '../ai.js';

export const getMarineSummary = async (req, res) => {
    try {
        const { waterQuality, marineLife } = req.body;
        const aiModel = getModel();

        const prompt = `
You are an expert marine biologist and oceanographer providing real-time analysis for an offshore fishing and marine monitoring dashboard.
Based on the provided telemetry data, write a highly professional, engaging, and concise summary (max 3-4 sentences).

Guidelines:
1. Lead with the current water quality status — turbidity, chlorophyll, sediment, oxygen, and temperature — and what they collectively indicate about the offshore conditions.
2. Follow with how those water quality conditions are influencing marine life activity and ecosystem health.
3. End with a brief note on marine activity levels and any implications for offshore or fishing operations.
4. Maintain an objective but insightful tone. Do not use markdown formatting, bolding, or lists. Return only the plain text summary.

Data:
- Water Quality Metrics: ${JSON.stringify(waterQuality)}
- Marine Life: ${JSON.stringify(marineLife)}
`;

        const result = await aiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const text = result.response.text();
        res.json({ waterQualitySummary: text });
    } catch (error) {
        console.error('AI Marine Summary Error:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
};


export const getBeachSummary = async (req, res) => {
    try {
        const { waterQuality, beachConditions } = req.body;
        const aiModel = getModel();

        const prompt = `
You are an expert coastal safety officer and oceanographer providing real-time analysis for a public beach dashboard.
Based on the provided telemetry data (Water Quality Metrics & Beach/Swimming Conditions), write a highly professional, engaging, and concise summary (max 3-4 sentences).

Guidelines:
1. Clearly state the current swimming conditions (safe, elevated risk, etc.) based on wave height, wind, and water quality.
2. Mention the current water temperature and whether it is pleasant for swimming.
3. Highlight any specific warnings or positive notes (e.g., excellent clarity, ideal pH, or caution due to waves/algae).
4. Maintain an objective, reassuring, but authoritative tone. Do not use markdown formatting, bolding, or lists. Return only the plain text summary.

Data:
- Water Quality Metrics: ${JSON.stringify(waterQuality)}
- Beach/Swimming Conditions (Weather & Waves): ${JSON.stringify(beachConditions)}
`;

        const result = await aiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const text = result.response.text();
        res.json({ waterQualitySummary: text });
    } catch (error) {
        console.error('AI Beach Summary Error:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
};
