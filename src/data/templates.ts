export interface PromptTemplate {
  name: string;
  content: string;
}

export interface TemplateCategory {
  name: string;
  prompts: PromptTemplate[];
}

export const TEMPLATES: TemplateCategory[] = [
  {
    name: "Short Q&A",
    prompts: [
      { name: "Simple fact", content: "What is the capital of France?" },
      { name: "Definition", content: "What is a neural network?" },
      { name: "Trivia", content: "Who wrote Romeo and Juliet?" },
      { name: "Translation", content: 'Translate "hello, how are you?" to Spanish.' },
      { name: "Calculation", content: "What is 15 × 37?" },
    ],
  },
  {
    name: "Reasoning",
    prompts: [
      { name: "Logic puzzle", content: "If all humans are mortal and Socrates is human, what can we conclude?" },
      { name: "Math word problem", content: "A farmer has 15 chickens and 7 rabbits. How many legs are there in total?" },
      { name: "Analogy", content: "Doctor is to hospital as teacher is to _____?" },
      { name: "Cause and effect", content: "Explain why ice floats on water." },
      { name: "Planning", content: "Plan a 3-day itinerary for a tourist visiting Tokyo." },
    ],
  },
  {
    name: "Code",
    prompts: [
      { name: "Write function", content: "Write a Python function that checks if a string is a palindrome." },
      { name: "Debug", content: "What's wrong with this code?\n```python\ndef add(a, b):\n   return a + b\n\nresult = add(5)\n```" },
      { name: "Refactor", content: "Refactor this to use list comprehension:\n```python\nresult = []\nfor i in range(10):\n    if i % 2 == 0:\n        result.append(i * 2)\n```" },
      { name: "Explain code", content: "Explain what this SQL query does:\n```sql\nSELECT department, COUNT(*) as count\nFROM employees\nGROUP BY department\nHAVING count > 5\n```" },
      { name: "Data structure", content: "Implement a stack with push, pop, and peek methods in JavaScript." },
    ],
  },
  {
    name: "Long Context",
    prompts: [
      { name: "Summarize", content: "The Industrial Revolution was a period of major industrialization that began in Great Britain in the mid-18th century and spread to other parts of the world. It marked a shift from hand production methods to machines, new chemical manufacturing and iron production processes, improved efficiency of water power, the increasing use of steam power, and the development of machine tools. The Industrial Revolution also led to unprecedented growth in population, urbanization, and living standards in many parts of the world, though it also brought about significant social and environmental challenges.\n\nIn a single sentence, summarize the main idea of this passage." },
      { name: "Bullet points", content: "List 5 key benefits of using version control systems in software development." },
      { name: "Compare and contrast", content: "Compare and contrast REST APIs and GraphQL. Include pros and cons of each." },
      { name: "Write email", content: "Write a professional email to a client informing them that their project will be delayed by one week due to unforeseen technical challenges. Be courteous and offer alternatives." },
      { name: "Step-by-step", content: "Explain how to bake a chocolate cake from scratch. List ingredients and step-by-step instructions." },
    ],
  },
  {
    name: "Roleplay / Creative",
    prompts: [
      { name: "Act as expert", content: "You are a senior software engineer interviewing a candidate. Ask them 3 technical questions about distributed systems." },
      { name: "Story starter", content: "Write the opening paragraph of a sci-fi story about a world where memories can be bought and sold." },
      { name: "Brainstorm", content: "Brainstorm 10 startup ideas in the AI education space." },
      { name: "Explain like I'm 5", content: "Explain how blockchain works as if I'm a 5-year-old." },
      { name: "Socratic tutor", content: "I want to learn about the French Revolution. Ask me questions to help me discover the key events and causes myself." },
    ],
  },
];
