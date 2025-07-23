import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rooms: defineTable({
    name: v.string(),
    hostId: v.string(),
    status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("finished"), v.literal("archived"), v.literal("restarted")),
    currentRound: v.number(),
    maxRounds: v.number(),
    currentArtist: v.optional(v.string()),
    currentWord: v.optional(v.string()),
    roundStartTime: v.optional(v.number()),
    roundEndTime: v.optional(v.number()),
    inviteCode: v.string(),
    maxPlayers: v.number(),
  }),

  players: defineTable({
    roomId: v.id("rooms"),
    userId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
    score: v.number(),
    isActive: v.boolean(),
    joinedAt: v.number(),
  }).index("by_room", ["roomId"]).index("by_user", ["userId"]),

  strokes: defineTable({
    roomId: v.id("rooms"),
    round: v.number(),
    artistId: v.string(),
    strokeData: v.array(v.object({
      x: v.number(),
      y: v.number(),
      pressure: v.optional(v.number()),
      timestamp: v.number(),
    })),
    color: v.string(),
    width: v.number(),
    timestamp: v.number(),
    isLive: v.optional(v.boolean()),
  }).index("by_room_round", ["roomId", "round"]),

  guesses: defineTable({
    roomId: v.id("rooms"),
    round: v.number(),
    playerId: v.string(),
    playerName: v.string(),
    guess: v.string(),
    isCorrect: v.boolean(),
    timestamp: v.number(),
    points: v.number(),
  }).index("by_room_round", ["roomId", "round"]),

  sketches: defineTable({
    roomId: v.id("rooms"),
    round: v.number(),
    artistId: v.string(),
    artistName: v.string(),
    word: v.string(),
    imageStorageId: v.id("_storage"),
    timestamp: v.number(),
  }).index("by_room", ["roomId"]),

  words: defineTable({
    word: v.string(),
    difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
    category: v.string(),
  }),

  invites: defineTable({
    roomId: v.id("rooms"),
    email: v.string(),
    invitedBy: v.string(), // host userId
    invitedAt: v.number(),
    status: v.union(
      v.literal("sending"),
      v.literal("sent"), 
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("joined"),
      v.literal("failed")
    ),
    emailId: v.optional(v.string()), // Resend email ID
    joinedAt: v.optional(v.number()),
    joinedPlayerName: v.optional(v.string()), // Name of player who joined
    lastUpdated: v.number(),
  }).index("by_room", ["roomId"]).index("by_email_id", ["emailId"]),
});