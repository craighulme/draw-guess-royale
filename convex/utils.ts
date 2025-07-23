import { DatabaseReader } from "./_generated/server";

export function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const DEFAULT_WORDS = [
  "cat", "dog", "house", "tree", "car", "sun", "moon", "star", "fish", "bird",
  "flower", "book", "cake", "pizza", "guitar", "piano", "rainbow", "castle",
  "elephant", "butterfly", "mountain", "ocean", "rocket", "bicycle", "dragon",
  "unicorn", "robot", "wizard", "princess", "pirate", "dinosaur", "spaceship"
];

export async function getRandomWord(ctx: { db: DatabaseReader }): Promise<string> {
  const words = await ctx.db.query("words").collect();
  
  if (words.length === 0) {
    // Return a random default word if no words in database
    return DEFAULT_WORDS[Math.floor(Math.random() * DEFAULT_WORDS.length)];
  }
  
  const randomWord = words[Math.floor(Math.random() * words.length)];
  return randomWord.word;
}

export function calculateGuessPoints(timeToGuess: number, roundDuration: number, isFirstCorrect: boolean): number {
  const basePoints = 100;
  const speedBonus = Math.max(0, Math.floor((roundDuration - timeToGuess) / 1000) * 2);
  const firstGuessBonus = isFirstCorrect ? 50 : 0;
  
  return basePoints + speedBonus + firstGuessBonus;
}