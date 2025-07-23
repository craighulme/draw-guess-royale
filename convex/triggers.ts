import { cronJobs } from "convex/server";

const crons = cronJobs();
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Check for rounds that have timed out
export const checkTimeoutRounds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    const timedOutRooms = await ctx.db
      .query("rooms")
      .filter((q) => 
        q.and(
          q.eq(q.field("status"), "playing"),
          q.lt(q.field("roundEndTime"), now)
        )
      )
      .collect();

    return timedOutRooms.map(room => room._id);
  },
});

export const handleRoundTimeout = internalMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "playing") return;

    // Clean up any live strokes - convert them to completed strokes
    const liveStrokes = await ctx.db
      .query("strokes")
      .withIndex("by_room_round", (q) => 
        q.eq("roomId", args.roomId).eq("round", room.currentRound)
      )
      .filter((q) => q.eq(q.field("isLive"), true))
      .collect();

    for (const liveStroke of liveStrokes) {
      await ctx.db.patch(liveStroke._id, {
        isLive: false,
      });
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    const guesses = await ctx.db
      .query("guesses")
      .withIndex("by_room_round", (q) => 
        q.eq("roomId", args.roomId).eq("round", room.currentRound)
      )
      .collect();

    const correctGuessers = guesses
      .filter(g => g.isCorrect)
      .map(g => ({ name: g.playerName, points: g.points }));

    const leaderboard = players
      .sort((a, b) => b.score - a.score)
      .map(p => ({ name: p.name, score: p.score }));

    const playerEmails = players
      .filter(p => p.email)
      .map(p => p.email!);

    // Send round results email
    if (playerEmails.length > 0) {
      await ctx.scheduler.runAfter(0, internal.resend.sendRoundResults, {
        playerEmails,
        roomName: room.name,
        roomId: args.roomId,
        round: room.currentRound,
        word: room.currentWord ?? "unknown",
        artistName: players.find(p => p.userId === room.currentArtist)?.name ?? "Unknown",
        correctGuessers,
        leaderboard,
      });
    }

    // Check if game should end
    if (room.currentRound >= room.maxRounds) {
      await ctx.db.patch(args.roomId, { status: "finished" });
      
      // Send game complete email
      if (playerEmails.length > 0 && leaderboard.length > 0) {
        await ctx.scheduler.runAfter(5000, internal.resend.sendGameComplete, {
          playerEmails,
          roomName: room.name,
          winner: leaderboard[0],
          finalLeaderboard: leaderboard,
          totalRounds: room.maxRounds,
        });
      }
    }
  },
});

// Trigger email when a player joins
export const onPlayerJoin = internalMutation({
  args: {
    roomId: v.id("rooms"),
    playerName: v.string(),
    playerEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return;

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Send notification to host about new player
    const host = players.find(p => p.userId === room.hostId);
    if (host?.email && args.playerEmail) {
      await ctx.scheduler.runAfter(0, internal.resend.sendPlayerJoinedNotification, {
        hostEmail: host.email,
        hostName: host.name,
        playerName: args.playerName,
        roomName: room.name,
        totalPlayers: players.length,
      });
    }
  },
});

// Send idle player reminders
export const sendIdleReminders = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoffTime = Date.now() - (5 * 60 * 1000); // 5 minutes ago
    
    const activeRooms = await ctx.db
      .query("rooms")
      .filter((q) => q.eq(q.field("status"), "playing"))
      .collect();

    const idlePlayers = [];

    for (const room of activeRooms) {
      const recentGuesses = await ctx.db
        .query("guesses")
        .withIndex("by_room_round", (q) => 
          q.eq("roomId", room._id).eq("round", room.currentRound)
        )
        .filter((q) => q.gt(q.field("timestamp"), cutoffTime))
        .collect();

      const players = await ctx.db
        .query("players")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();

      const activePlayerIds = new Set(recentGuesses.map(g => g.playerId));
      
      for (const player of players) {
        if (!activePlayerIds.has(player.userId) && 
            player.userId !== room.currentArtist && 
            player.email) {
          idlePlayers.push({
            email: player.email,
            name: player.name,
            roomName: room.name,
          });
        }
      }
    }

    return idlePlayers;
  },
});

// Cron job to check for timed out rounds every 30 seconds
export const roundTimeoutCheck: any = crons.interval(
  "round timeout check",
  { seconds: 30 },
  internal.triggers.processTimeouts,
);

export const processTimeouts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const timedOutRoomIds = await ctx.runQuery(internal.triggers.checkTimeoutRounds, {});
    
    for (const roomId of timedOutRoomIds) {
      await ctx.runMutation(internal.triggers.handleRoundTimeout, { roomId });
    }
  },
});

// Daily leaderboard digest
export const dailyLeaderboard: any = crons.daily(
  "daily leaderboard",
  { hourUTC: 18, minuteUTC: 0 }, // 6 PM UTC
  internal.triggers.sendDailyDigest,
);

export const sendDailyDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const yesterday = Date.now() - (24 * 60 * 60 * 1000);
    
    // Get all players who played in the last 24 hours
    const recentPlayers = await ctx.db
      .query("players")
      .filter((q) => q.gt(q.field("joinedAt"), yesterday))
      .collect();

    if (recentPlayers.length === 0) return;

    // Group by email and calculate total scores
    const playerStats = new Map();
    
    for (const player of recentPlayers) {
      if (!player.email) continue;
      
      const key = player.email;
      if (!playerStats.has(key)) {
        playerStats.set(key, {
          email: player.email,
          name: player.name,
          totalScore: 0,
          gamesPlayed: 0,
        });
      }
      
      const stats = playerStats.get(key);
      stats.totalScore += player.score;
      stats.gamesPlayed += 1;
    }

    const topPlayers = Array.from(playerStats.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);

    // Send digest to all players
    const emails = topPlayers.map(p => p.email);
    
    if (emails.length > 0) {
      await ctx.scheduler.runAfter(0, internal.resend.sendDailyDigest, {
        emails,
        topPlayers,
        totalGames: recentPlayers.length,
      });
    }
  },
});