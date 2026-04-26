import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Ensure .env is loaded
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

let model = null;

export const getModel = () => {
    if (!model) {
        const apiKey = process.env.VERTEX_API_KEY;

        if (!apiKey) {
            throw new Error('VERTEX_API_KEY must be set in your .env file.');
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { maxOutputTokens: 2048, temperature: 0.7, topP: 1, topK: 1 },
        });
    }
    return model;
};
