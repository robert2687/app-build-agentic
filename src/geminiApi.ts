// Gemini API utility for text generation
// Uses fetch to call Gemini Pro API

const GEMINI_API_KEY = "AIzaSyCpW5YPWKE0S_8Vwlr2Ceo2FT6d9tJIPH4";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

export async function generateGeminiContent(prompt) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  const res = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("Gemini API error: " + res.status);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
}
